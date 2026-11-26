import { lookup, validDate, validDocument } from './model.js';
import { cached, remember } from './storage.js';

const sheet = '19g00bi2iWNW5839rfUSRChroWvTohMUhAPt_TzBrm8w';
const tabs = { workouts: 261126, log: 1048944897, targets: 867416185 };
const required = {
  workouts: ['Date', 'Order', 'Exercise', 'Block ID', 'Block Type'],
  log: ['Date', 'Day', 'Exercise', 'Weight', 'Weight Note', 'Sets', 'Reps (per set)', 'Hit Top of Range?', 'PR?', 'Notes'],
  targets: ['Exercise', 'Next Weight', 'Target Sets x Reps', 'Rule'],
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCSV(text, kind) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.trim());
      cell = '';
      if (c === '\n') { rows.push(row); row = []; }
    } else cell += c;
  }
  check(!quoted, 'Incomplete CSV');
  row.push(cell.trim());
  rows.push(row);
  const head = rows.shift();
  check(required[kind].every(name => head.includes(name)), 'Wrong tab or missing headers');
  return rows.filter(r => r.some(Boolean)).map(r => {
    check(r.length <= head.length, 'Too many columns');
    return Object.fromEntries(head.map((name, i) => [name, r[i] || '']));
  });
}

function num(s) {
  if (s == null || s === '') return null;
  check(/^\d+(?:\.\d+)?$/.test(s), 'Expected a nonnegative number');
  return Number(s);
}
function dateOf(value) {
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const date = us ? [us[3], us[1].padStart(2, '0'), us[2].padStart(2, '0')].join('-') : value;
  check(validDate(date), 'Invalid workout date');
  return date;
}
function exerciseId(name, catalog) {
  check(name.trim(), 'Missing exercise');
  return lookup({name}, catalog).id;
}
function logEntry(r, catalog) {
  const name = r.Exercise, note = r['Weight Note'], raw = r['Reps (per set)'];
  const counts = s => {
    if (!s) return [];
    return s.split(',').map(v => num(v.trim()));
  };
  const sides = /^R(?:ight)?\s*:?\s*([\d ,]+)\/\s*L(?:eft)?\s*:?\s*([\d ,]+)$/i.exec(raw);
  let reps = sides ? {right:counts(sides[1]),left:counts(sides[2])} :
    counts(raw.replace('(not reported)', '').replace(/ (?:each arm|\(assumed\))$/, ''));
  if (/each arm$/.test(raw)) reps = {right:reps,left:reps};
  if (/^Single-leg extension \((RIGHT|LEFT)/i.test(name)) {
    reps = /RIGHT/i.test(name) ? {right:reps,left:[]} : {right:[],left:reps};
  }
  let loads = r.Weight.split('/').map(v => num(v.trim().replace(/\s*lbs?(?: per side)?$/i, '')));
  const top = r['Hit Top of Range?'], pr = r['PR?'].toLowerCase();
  const entry = {date:dateOf(r.Date), day:r.Day, exercise:name, exerciseId:exerciseId(name,catalog),
    sets:num(r.Sets), reps, weightLb:loads[0], weightNote:note,
    hitTopOfRange:top ? /^(yes|true|1|y)\b/i.test(top) : null,
    pr:!pr || /^(no|false|baseline|0|n)$/.test(pr) ? null : /weight\+rep/.test(pr) ? 'weight+rep' :
      /weight/.test(pr) ? 'weight' : /^rep/.test(pr) ? 'rep' : 'yes',
    notes:[r.Notes,raw.includes('(assumed)') && 'Reps assumed in source.'].filter(Boolean).join(' | ')};
  const third = /set 3 at (\d+)\/side/i.exec(note);
  if (third) loads = [loads[0], loads[0], Number(third[1])];
  if (loads.length > 1) {
    if (loads.length === 2 && /last set/i.test(note) && Array.isArray(reps) && reps.length >= 2)
      loads = [...Array(reps.length-1).fill(loads[0]), loads[1]];
    check(Array.isArray(reps) && reps.length === loads.length, 'Missing per-set loads');
    entry.setDetails = loads.map((weightLb,i) => ({set:i+1,weightLb,reps:reps[i]}));
  }
  return entry;
}

function targets(rows, catalog) {
  const byId = new Map(), revised = new Set();
  for (const r of rows) {
    const name = r.Exercise.replace(/\s*\(updated [^)]+\)$/i, '');
    const id = exerciseId(name,catalog);
    if (name !== r.Exercise) revised.add(id);
    else if (revised.has(id)) continue;
    const text = r['Next Weight'], scalar = /^(\d+(?:\.\d+)?)(?:\s*lb\b|$)/i.exec(text);
    const rx = /^(\d+)\s*[x×]\s*(.+)$/i.exec(r['Target Sets x Reps']);
    byId.set(id,{exerciseId:id,name,nextWeightText:text,nextWeightLb:num(scalar?.[1]),
      targetSets:num(rx?.[1]),targetReps:rx?.[2] || r['Target Sets x Reps'] || null,rule:r.Rule});
  }
  return [...byId.values()];
}

function workouts(rows, catalog) {
  const dates = Object.create(null);
  for (const r of rows) (dates[dateOf(r.Date)] ??= []).push(r);
  for (const [date, day] of Object.entries(dates)) {
    const workout = {schemaVersion:1,date,blocks:[]}, groups = new Map(), orders = new Set();
    for (const r of day.sort((a,b) => num(a.Order) - num(b.Order))) {
      const order = num(r.Order);
      check(Number.isInteger(order) && !orders.has(order), 'Missing or duplicate Order');
      orders.add(order);
      for (const [key,col] of [['title','Title'],['split','Split'],['coachNote','Coach Note'],['progressionRule','Progression Rule']])
        if (r[col]) workout[key] = r[col];
      if (r.Minutes) workout.estimatedMinutes = num(r.Minutes);
      if (r['Warm-up'] || r['Warm-up Min']) workout.warmup = {instructions:r['Warm-up'],durationMin:num(r['Warm-up Min'])};
      if (r.Abs) workout.abs = JSON.parse(r.Abs);
      const id = r['Block ID'], type = r['Block Type'].toLowerCase();
      check(id && ['exercise','superset','circuit'].includes(type), 'Invalid block');
      const item = {id:r['Item ID'] || (type==='exercise' ? id : r['Exercise ID'] || exerciseId(r.Exercise,catalog)),
        exerciseId:r['Exercise ID'] || exerciseId(r.Exercise,catalog),name:r.Exercise,
        sets:num(r.Sets),repMin:num(r['Rep Min']),repMax:num(r['Rep Max']),weightLb:num(r['Weight lb'])};
      for (const [key,col] of [['weightNote','Weight Note'],['laterality','Laterality'],['rir','RIR'],['cues','Cues'],['swap','Swap'],['lastSession','Last Session'],['goal','Goal']])
        if (r[col]) item[key] = r[col];
      const restSec = num(r['Rest Sec']);
      if (type === 'exercise') {
        check(!groups.has(id), 'Duplicate block');
        groups.set(id,item);
        workout.blocks.push({...item,type,restSec});
      } else {
        if (!groups.has(id)) {
          const block = {id,type,rounds:num(r.Rounds),restSec,items:[]};
          groups.set(id,block); workout.blocks.push(block);
        }
        const block = groups.get(id);
        check(block.type === type && !block.items.some(x => x.id === item.id), 'Conflicting group items');
        block.items.push(item);
      }
    }
    check(validDocument('workout',workout,date), 'Invalid workout');
    dates[date] = workout;
  }
  return dates;
}

export function parseTab(kind, text, catalog) {
  const rows = parseCSV(text,kind);
  if (kind === 'workouts') return workouts(rows,catalog);
  const data = {schemaVersion:1};
  if (kind === 'log') {
    const entries = rows.map(r => logEntry(r,catalog));
    data.entries = [...new Map(entries.map(e => [JSON.stringify(e),e])).values()];
  } else data.targets = targets(rows,catalog);
  check(validDocument(kind,data), 'Invalid ' + kind);
  return data;
}

export async function sheetFeed(kind, catalog) {
  const key = 'sheet/' + sheet + '/' + kind;
  try {
    const base = 'https://docs.google.com/spreadsheets/d/' + sheet;
    const gid = tabs[kind];
    const options = {credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5500)};
    // The export endpoint preserves mixed numeric/text columns such as "Weight".
    // Some browsers cannot follow its cross-origin download redirect.
    let response;
    try { response = await fetch(base + '/export?format=csv&gid=' + gid, options); } catch {}
    if (!response?.ok || response.headers.get('content-type')?.includes('text/html'))
      response = await fetch(base + '/gviz/tq?tqx=out:csv&headers=1&gid=' + gid, options);
    check(response.ok, 'Sheet unavailable');
    const value = {data:parseTab(kind,await response.text(),catalog),at:Date.now()};
    await remember(key,value);
    return {...value,live:true};
  } catch {
    return (await cached(key)) || null;
  }
}
