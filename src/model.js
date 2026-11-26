export const SCHEMA_VERSION = 1;
export const ZONE = 'America/Indianapolis';
const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function today(now = new Date()) {
  const parts = Object.fromEntries(dateFormat.formatToParts(now).map((p) => [p.type, p.value]));
  return [parts.year, parts.month, parts.day].join('-');
}
export const showDate = (iso, options) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
export const validDate = (s) =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(Date.parse(s)) &&
  new Date(s + 'T12:00:00Z').toISOString().startsWith(s);
const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const number = (x) => Number.isFinite(x) && x >= 0;
const count = (x) => Number.isInteger(x) && x >= 0;
const optional = (v, test) => v == null || test(v);
const text = (v) => typeof v === 'string';
const list = (v, test) => Array.isArray(v) && v.every(test);
const validReps = (v) => list(v, count) || (obj(v) && list(v.right, count) && list(v.left, count));
const strings = (o, keys) => keys.every((k) => optional(o[k], text));
function exerciseValid(x) {
  return (
    obj(x) &&
    [x.name, x.exerciseId, x.id].some((v) => text(v) && v.length) &&
    optional(x.weightLb, number) &&
    ['sets', 'restSec', 'repMin', 'repMax'].every((k) => optional(x[k], count)) &&
    optional(x.rir, (v) => text(v) || number(v)) &&
    strings(x, [
      'id',
      'exerciseId',
      'name',
      'laterality',
      'weightNote',
      'swap',
      'cues',
      'lastSession',
      'goal',
      'sideNote',
      'demo',
    ])
  );
}
export function validDocument(kind, data, date) {
  if (!obj(data) || !Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) return false;
  switch (kind) {
    case 'workout':
      return (
        validDate(data.date) &&
        data.date === date &&
        strings(data, ['split', 'title', 'coachNote', 'progressionRule']) &&
        optional(data.estimatedMinutes, number) &&
        optional(
          data.warmup,
          (w) => obj(w) && strings(w, ['instructions']) && optional(w.durationMin, number),
        ) &&
        optional(
          data.abs,
          (a) =>
            obj(a) &&
            optional(a.rounds, count) &&
            optional(a.restSec, count) &&
            optional(a.items, (v) =>
              list(
                v,
                (i) =>
                  obj(i) &&
                  strings(i, ['exerciseId', 'name']) &&
                  optional(i.reps, (r) => text(r) || count(r)),
              ),
            ),
        ) &&
        list(
          data.blocks,
          (b) =>
            obj(b) &&
            (['circuit', 'superset'].includes(b.type)
              ? optional(b.rounds, count) && optional(b.restSec, count) && list(b.items, exerciseValid)
              : exerciseValid(b) || (data.schemaVersion > 1 && text(b.type))),
        )
      );
    case 'targets':
      return list(
        data.targets,
        (t) =>
          obj(t) &&
          text(t.exerciseId) &&
          optional(t.nextWeightLb, number) &&
          optional(t.targetSets, count) &&
          strings(t, ['name', 'rule']) &&
          optional(t.targetReps, (r) => text(r) || count(r)),
      );
    case 'log':
      return list(
        data.entries,
        (e) =>
          obj(e) &&
          validDate(e.date) &&
          text(e.exerciseId) &&
          optional(e.weightLb, number) &&
          validReps(e.reps) &&
          optional(e.hitTopOfRange, (v) => typeof v === 'boolean') &&
          strings(e, ['exercise', 'day', 'notes', 'weightNote', 'pr']),
      );
    case 'exercises':
      return (
        obj(data.exercises) &&
        Object.values(data.exercises).every(
          (e) =>
            obj(e) &&
            strings(e, ['demo', 'id', 'name', 'license', 'attribution', 'laterality']) &&
            optional(e.aliases, (v) => list(v, text)),
        ) &&
        optional(data.lookup, (v) => obj(v) && Object.values(v).every(text))
      );
    case 'dates':
      return list(data.dates, validDate);
    case 'meta':
      return optional(data.latestWorkoutDate, validDate) && strings(data, ['message', 'updated']);
    default:
      return false;
  }
}
export function normalize(s = '') {
  return String(s)
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s-]+/g, ' ')
    .trim();
}
export function lookup(ex, catalog = {}) {
  const all = catalog.exercises || {};
  const alias = normalize(ex.name);
  const id = [
    ex.exerciseId,
    catalog.lookup?.[alias],
    ...Object.keys(all).filter(
      (k) => all[k]?.aliases?.some((a) => normalize(a) === alias) || normalize(all[k]?.name) === alias,
    ),
  ].find((k) => k && Object.hasOwn(all, k));
  return { id: id || ex.exerciseId || ex.id || alias.replaceAll(' ', '-'), ...((id && all[id]) || {}) };
}
export function blocksFor(workout, catalog) {
  return (workout?.blocks || []).flatMap((block, bi) => {
    const group = ['superset', 'circuit'].includes(block.type);
    const items = (group ? block.items : [block])
      .filter((e) => e?.name || e?.exerciseId || e?.id)
      .map((ex, i) => {
        const ref = lookup(ex, catalog);
        const key = JSON.stringify([
          group ? block.id || 'group-' + bi : '',
          ex.id || ex.exerciseId || ex.name || i,
        ]);
        return {
          ...ref,
          ...ex,
          key,
          demoOverride: ex.demo,
          exerciseId: ref.id,
          name: ex.name || ref.name || ref.id,
          sets: ex.sets ?? block.rounds ?? null,
          restSec: ex.restSec ?? block.restSec ?? null,
          laterality: ex.laterality || ref.laterality || 'bilateral',
        };
      });
    return items.length ? [{ ...block, group, items }] : [];
  });
}
export const range = (e) =>
  e.repMin == null
    ? e.repMax == null
      ? '—'
      : String(e.repMax)
    : e.repMax == null || e.repMin === e.repMax
      ? String(e.repMin)
      : e.repMin + '–' + e.repMax;
export const clockText = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
export const numeric = (v) => (v == null || v === '' || !number(Number(v)) ? null : Number(v));
export function toLocalRow(date, split, lift) {
  const { meta, slots = {}, manualTop = 'auto', notes = '' } = lift;
  if (!meta) return null;
  const unilateral = meta.laterality === 'unilateral';
  const details = Object.entries(slots)
    .map(([index, s]) => ({
      set: Number(index) + 1,
      weightLb: s.weight === undefined ? (meta.weightLb ?? null) : numeric(s.weight),
      reps: numeric(s.reps),
      right: numeric(s.right),
      left: numeric(s.left),
      rightNote: s.rightNote || '',
      leftNote: s.leftNote || '',
    }))
    .filter((s) => (unilateral ? s.right !== null || s.left !== null : s.reps !== null))
    .sort((a, b) => a.set - b.set);
  if (!details.length) return null;
  const reps = unilateral
    ? { right: details.map((s) => s.right).filter(count), left: details.map((s) => s.left).filter(count) }
    : details.map((s) => s.reps);
  const top =
    meta.sets > 0 &&
    meta.repMax != null &&
    details.length >= meta.sets &&
    details.every(
      (s, i) =>
        s.set === i + 1 &&
        (unilateral
          ? s.right !== null && s.left !== null && Math.min(s.right, s.left) >= meta.repMax
          : s.reps >= meta.repMax),
    );
  const loads = [...new Set(details.map((s) => s.weightLb))];
  return {
    date,
    day: meta.split || split,
    exerciseId: meta.exerciseId,
    exercise: meta.name,
    weightLb: loads.length === 1 ? loads[0] : null,
    weightNote: meta.weightNote || null,
    sets: details.length,
    reps,
    hitTopOfRange: manualTop === 'auto' ? top : manualTop === 'yes',
    pr: null,
    notes,
    setDetails: details,
    source: 'device',
    key: meta.key,
  };
}
export function detailsOf(e) {
  if (e.setDetails) return e.setDetails;
  const uni = !Array.isArray(e.reps);
  const n = uni ? Math.max(e.reps.right.length, e.reps.left.length) : e.reps.length;
  return Array.from({ length: n }, (_, i) => ({
    set: i + 1,
    weightLb: e.weightLb ?? null,
    reps: uni ? null : e.reps[i],
    right: uni ? (e.reps.right[i] ?? null) : null,
    left: uni ? (e.reps.left[i] ?? null) : null,
  }));
}
const total = (s) => s.reps ?? (s.right || 0) + (s.left || 0);
export function volume(e) {
  const details = detailsOf(e);
  return details.length && details.every((s) => s.weightLb != null)
    ? details.reduce((n, s) => n + s.weightLb * total(s), 0)
    : null;
}
export function peak(e) {
  const loads = detailsOf(e)
    .map((s) => s.weightLb)
    .filter(number);
  return loads.length ? Math.max(...loads) : null;
}
export function sameLift(a, b) {
  if (a.date !== b.date || a.exerciseId !== b.exerciseId || Array.isArray(a.reps) !== Array.isArray(b.reps))
    return false;
  const seq = (e) =>
    detailsOf(e).map((s) => [s.set, s.weightLb, s.reps ?? null, s.right ?? null, s.left ?? null]);
  return JSON.stringify(seq(a)) === JSON.stringify(seq(b));
}
export function mergeHistory(entries, local) {
  const rows = entries.map((e) => ({ ...e, source: 'TITAN' }));
  for (const draft of local) {
    const canon = rows.find((e) => e.source === 'TITAN' && !e.synced && sameLift(e, draft));
    if (canon) {
      canon.synced = true;
      canon.local = draft;
    } else rows.push({ ...draft });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const prior = new Map();
  for (const e of rows) {
    const others = (prior.get(e.exerciseId) || []).filter((p) => p.date < e.date);
    const load = peak(e),
      previousLoads = others.map(peak).filter(number);
    const weightPR =
      e.pr?.includes('weight') ||
      (load != null && previousLoads.length > 0 && load > Math.max(...previousLoads));
    const profile = (row) => {
      const byLoad = new Map();
      for (const s of detailsOf(row))
        if (s.weightLb != null) byLoad.set(s.weightLb, (byLoad.get(s.weightLb) || 0) + total(s));
      return byLoad;
    };
    const comparable = others.filter((p) => Array.isArray(p.reps) === Array.isArray(e.reps));
    const past = comparable.map(profile);
    const beatReps = [...profile(e)].some(([w, r]) => {
      const values = past.filter((p) => p.has(w)).map((p) => p.get(w));
      return values.length && r > Math.max(...values);
    });
    const firstTop =
      e.hitTopOfRange &&
      e.weightLb != null &&
      !comparable.some((p) => p.hitTopOfRange && p.weightLb === e.weightLb);
    const repPR = e.pr?.includes('rep') || beatReps || firstTop;
    e.pr = weightPR && repPR ? 'weight+rep' : weightPR ? 'weight' : repPR ? 'rep' : e.pr === 'yes' ? 'yes' : null;
    if (!prior.has(e.exerciseId)) prior.set(e.exerciseId, []);
    prior.get(e.exerciseId).push(e);
  }
  return rows;
}
export function repText(e, csv = false) {
  if (Array.isArray(e.reps)) return e.reps.join(',');
  return (
    (csv ? 'R: ' : 'R ') + e.reps.right.join(',') + ' / ' + (csv ? 'L: ' : 'L ') + e.reps.left.join(',')
  );
}
export function weightText(e) {
  const loads = [...new Set(detailsOf(e).map((s) => s.weightLb))];
  return loads.length > 1
    ? detailsOf(e)
        .map((s) => s.weightLb ?? '—')
        .join('/')
    : String(e.weightLb ?? '—');
}
export function exportedLift(row) {
  const { exerciseId, exercise, weightLb = null, reps, hitTopOfRange = false, pr = null, notes = '' } = row;
  const local = row.local || row;
  return {
    exerciseId,
    exercise: exercise || exerciseId,
    weightLb,
    reps,
    hitTopOfRange,
    pr,
    notes,
    weightNote: row.weightNote ?? null,
    ...(local.setDetails ? { setDetails: local.setDetails } : {}),
    ...(row.local?.notes && row.local.notes !== notes ? { deviceNotes: row.local.notes } : {}),
  };
}
export function compact(session) {
  const lines = [
    session.split.toUpperCase() +
      ' — ' +
      showDate(session.workoutDate, { weekday: 'short', month: 'short', day: 'numeric' }).replaceAll(
        ',',
        '',
      ),
  ];
  for (const e of session.lifts) {
    const flags = [
      e.pr?.includes('weight') && 'weight PR',
      e.pr?.includes('rep') && 'rep PR',
      e.hitTopOfRange && 'hit top',
    ].filter(Boolean);
    lines.push(
      (e.exercise || e.exerciseId) +
        ' ' +
        weightText(e) +
        ': ' +
        repText(e) +
        (flags.length ? '  (' + flags.join(', ') + ')' : ''),
    );
  }
  if (session.absDone != null) lines.push('Abs: ' + (session.absDone ? 'done' : 'not done'));
  if (session.bodyweightLb != null) lines.push('BW: ' + session.bodyweightLb);
  for (const s of session.soreness)
    lines.push(
      'Soreness: ' +
        [s.area, s.level == null ? '' : s.level + '/5'].filter(Boolean).join(' ') +
        (s.notes ? ', ' + s.notes : ''),
    );
  return lines.join('\n');
}
export function csvText(rows) {
  const quote = (v) => {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const lines = [
    [
      'Date',
      'Day',
      'Exercise',
      'Weight',
      'Weight Note',
      'Sets',
      'Reps',
      'Hit Top of Range?',
      'PR?',
      'Notes',
    ],
  ];
  for (const r of rows) {
    const e = exportedLift(r),
      notes = [e.notes, e.deviceNotes].filter(Boolean);
    for (const s of e.setDetails || [])
      for (const side of ['right', 'left'])
        if (s[side + 'Note']) notes.push('Set ' + s.set + ' ' + side + ': ' + s[side + 'Note']);
    lines.push([
      r.date,
      r.day,
      e.exercise,
      weightText(e),
      e.weightNote,
      detailsOf(e).length,
      repText(e, true),
      e.hitTopOfRange ? 'Yes' : 'No',
      e.pr,
      notes.join(' | '),
    ]);
  }
  return '\uFEFF' + lines.map((line) => line.map(quote).join(',')).join('\r\n');
}
