import { validDocument, SCHEMA_VERSION } from './model.js';

const namespace = 'mft:' + new URL('../', import.meta.url).pathname;
const fallbackKey = namespace + ':recovery';
let db = null,
  report = () => {};
export const records = new Map();
let channel;
const changed = (key, value) => records.set(key, value);
function storedFallback() {
  try {
    return JSON.parse(localStorage.getItem(fallbackKey) || '{}');
  } catch {
    return {};
  }
}
function fallback(pairs, notify = true) {
  try {
    const journal = Object.assign(Object.create(null), storedFallback(), Object.fromEntries(pairs));
    const raw = JSON.stringify(journal);
    if (raw.length > 100000) throw new Error('Full');
    localStorage.setItem(fallbackKey, raw);
    if (notify) report('Using limited device storage. Export this session as a backup.');
    return true;
  } catch {
    if (notify) report('Device storage is unavailable. Keep this page open and export your session now.');
    return false;
  }
}
export async function openStore(notice, remoteChange) {
  report = notice;
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(namespace, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('fields');
        req.result.createObjectStore('feeds');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => report('Close another tracker tab to finish opening device storage.');
    });
    db.onversionchange = () => {
      db.close();
      db = null;
      report('Reload to update device storage.');
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction('fields', 'readonly'),
        req = tx.objectStore('fields').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          changed(cur.key, cur.value);
          cur.continue();
        }
      };
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    report('Using limited device storage. Export this session as a backup.');
  }
  const recovery = storedFallback();
  const pairs = Object.entries(recovery);
  for (const [key, v] of pairs) changed(key, v);
  if (db && pairs.length) {
    await new Promise((resolve) => {
      const tx = db.transaction('fields', 'readwrite');
      for (const [k, v] of pairs) tx.objectStore('fields').put(v, k);
      tx.oncomplete = () => {
        try {
          const remaining = storedFallback();
          for (const [k, v] of pairs)
            if (JSON.stringify(remaining[k]) === JSON.stringify(v)) delete remaining[k];
          localStorage.setItem(fallbackKey, JSON.stringify(remaining));
        } catch {}
        resolve();
      };
      tx.onabort = resolve;
    });
  }
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(namespace);
    channel.onmessage = ({ data }) => {
      if (!Array.isArray(data)) return;
      const journal = storedFallback();
      if (!db) {
        for (const [key, value] of data) changed(key, journal[key] ?? value);
        remoteChange();
        return;
      }
      // Read the committed value if two tabs edit the same field concurrently.
      const tx = db.transaction('fields', 'readonly');
      for (const [key] of data) {
        const before = records.get(key),
          req = tx.objectStore('fields').get(key);
        req.onsuccess = () => {
          if (records.get(key) === before) changed(key, journal[key] ?? req.result);
        };
      }
      tx.oncomplete = remoteChange;
    };
  }
}
// Each input starts its transaction immediately. Fields touched in another tab are independent.
export function save(pairs) {
  for (const [k, v] of pairs) changed(k, v);
  const broadcast = () => channel?.postMessage(pairs.filter(([k, v]) => records.get(k) === v));
  if (!db) {
    if (fallback(pairs)) broadcast();
    return;
  }
  // Safari may cancel an in-flight transaction during a navigation. Keep only
  // its pending fields in a small synchronous journal until IDB confirms commit.
  fallback(pairs, false);
  try {
    let tx;
    try {
      tx = db.transaction('fields', 'readwrite', { durability: 'strict' });
    } catch {
      tx = db.transaction('fields', 'readwrite');
    }
    for (const [k, v] of pairs) tx.objectStore('fields').put(v, k);
    tx.oncomplete = () => {
      // Clear exactly the values that committed, preserving newer input from any tab.
      try {
        const journal = storedFallback();
        let edited = false;
        for (const [k, v] of pairs)
          if (Object.hasOwn(journal, k) && records.get(k) === v && JSON.stringify(journal[k]) === JSON.stringify(v)) {
            delete journal[k];
            edited = true;
          }
        if (edited) localStorage.setItem(fallbackKey, JSON.stringify(journal));
      } catch {}
      broadcast();
    };
    tx.onabort = () => {
      if (fallback(pairs.filter(([k, v]) => records.get(k) === v))) broadcast();
    };
  } catch {
    if (fallback(pairs)) broadcast();
  }
}
export const fieldKey = (...parts) => JSON.stringify(parts);
export function readSessions() {
  const sessions = new Map();
  for (const [key, value] of records) {
    const [date, group, lift, field, slot] = JSON.parse(key);
    if (!sessions.has(date)) sessions.set(date, { lifts: new Map(), check: {}, soreness: new Map() });
    const s = sessions.get(date);
    if (group === 'check') {
      s.check[lift] = value;
      continue;
    }
    if (group === 'sore') {
      if (!s.soreness.has(lift)) s.soreness.set(lift, {});
      s.soreness.get(lift)[field] = value;
      continue;
    }
    if (group !== 'lift') continue;
    if (!s.lifts.has(lift)) s.lifts.set(lift, { slots: {} });
    const ex = s.lifts.get(lift);
    if (slot == null) ex[field] = value;
    else {
      ex.slots[slot] ??= {};
      ex.slots[slot][field] = value;
    }
  }
  return sessions;
}
const volatile = new Map();
export async function cached(path) {
  if (!db) return volatile.get(path);
  return new Promise((resolve) => {
    const req = db.transaction('feeds').objectStore('feeds').get(path);
    req.onsuccess = () => resolve(req.result || volatile.get(path));
    req.onerror = () => resolve(volatile.get(path));
  });
}
export async function remember(path, value) {
  volatile.set(path, value);
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction('feeds', 'readwrite');
    tx.objectStore('feeds').put(value, path);
    tx.oncomplete = resolve;
    tx.onabort = () => {
      report('Could not cache the latest programming for offline use.');
      resolve();
    };
  });
}
export async function fetchFeed(kind, path, date) {
  let failure = '',
    newer = false,
    missing = false;
  const ctrl = new AbortController(),
    timeout = setTimeout(() => ctrl.abort(), 5500);
  try {
    const response = await fetch(new URL(path, document.baseURI), {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!response.ok) {
      missing = response.status === 404;
      throw new Error('network');
    }
    const data = await response.json().catch(() => {
      throw new Error('format');
    });
    newer = data?.schemaVersion > SCHEMA_VERSION;
    if (!validDocument(kind, data, date)) throw new Error('format');
    const warning = newer ? 'App update needed for the latest workout format.' : '';
    if (!newer || !(await cached(path))) await remember(path, { data, at: Date.now() });
    return { data, notice: warning };
  } catch (error) {
    if (newer) failure = 'App update needed for the latest workout format.';
    else if (error.message === 'format') failure = 'Couldn’t apply today’s update.';
    let old;
    try {
      old = await cached(path);
    } catch {}
    if (old) {
      const time = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Indianapolis',
      }).format(old.at);
      return {
        data: old.data,
        notice: [
          failure,
          'Showing cached data from ' + time + ' ET.',
          old.data.schemaVersion > SCHEMA_VERSION ? 'App update needed for the latest workout format.' : '',
        ]
          .filter(Boolean)
          .join(' '),
      };
    }
    if (missing && (kind === 'meta' || kind === 'workout'))
      return { data: null, notice: '', missing: true };
    return {
      data: null,
      notice: failure || 'No cached ' + (kind === 'dates' ? 'workout calendar' : kind) + ' available.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
