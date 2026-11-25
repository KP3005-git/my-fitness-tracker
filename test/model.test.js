import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  today,
  validDate,
  validDocument,
  blocksFor,
  toLocalRow,
  mergeHistory,
  volume,
  compact,
  csvText,
  lookup,
  exportedLift,
} from '../src/model.js';

const json = async (p) => JSON.parse(await readFile(new URL('../data/' + p, import.meta.url), 'utf8'));
const program = await json('workouts/2000-01-01.json'),
  catalog = await json('exercises.json');
const entries = [{date:program.date,exerciseId:'deadlift',exercise:'Barbell deadlift',weightLb:null,reps:[8,8,8],hitTopOfRange:true,pr:'rep'}];
const lifts = blocksFor(program, catalog).flatMap((b) => b.items);
const draft = (i, slots, extra = {}) =>
  toLocalRow(program.date, program.split, { meta: lifts[i], slots, ...extra });

test('Indianapolis dates roll over at local midnight through daylight saving changes', () => {
  assert.equal(today(new Date('2026-11-24T04:59:59Z')), '2026-11-23');
  assert.equal(today(new Date('2026-07-01T04:00:00Z')), '2026-07-01');
  assert.equal(validDate('2026-02-30'), false);
});
test('versioned examples validate and malformed updates cannot replace valid programming', async () => {
  for (const [k, d] of [
    ['workout', program],
    ['log', { schemaVersion: 1, entries }],
    ['exercises', catalog],
    ['targets', await json('targets.json')],
    ['meta', await json('meta.json')],
  ])
    assert.equal(validDocument(k, d, program.date), true, k);
  assert.equal(
    validDocument('workout', { ...program, schemaVersion: 2, newField: 'ok' }, program.date),
    true,
  );
  assert.equal(validDocument('workout', { ...program, schemaVersion: '1' }, program.date), false);
  assert.equal(
    validDocument('log', { schemaVersion: 1, entries: [{ ...entries[0], reps: [8, '8'] }] }),
    false,
  );
});
test('group items inherit round counts and rest; normalized aliases resolve a missing ID', () => {
  assert.equal(lifts[2].sets, 3);
  assert.equal(lifts[2].restSec, 75);
  assert.equal(lookup({ name: ' LAT--Pulldown! ', exerciseId: 'unknown' }, catalog).id, 'lat-pull-down');
});
test('empty slots stay empty and only a full prescription hits the top', () => {
  assert.equal(draft(0, { 0: { weight: '10' } }), null);
  assert.equal(draft(0, { 0: { reps: '8' } }).hitTopOfRange, false);
  const full = draft(0, { 0: { reps: '8' }, 1: { reps: '8' }, 2: { reps: '8' } });
  assert.equal(full.hitTopOfRange, true);
  const matched = mergeHistory(entries, [full]).filter((e) => e.exerciseId === 'deadlift');
  assert.equal(matched.length, 1);
  assert.equal(matched[0].synced, true);
  assert.equal(matched[0].source, 'TITAN');
  assert.equal(draft(0, { 0: { reps: '6' } }, { manualTop: 'yes' }).hitTopOfRange, true);
});
test('mixed loads, side notes and partially entered sides survive export', () => {
  const row = draft(1, {
    0: { weight:'20', right: '12', left: '10', rightNote: 'side note' },
    1: { right: '12', weight: '25' },
  });
  assert.equal(row.hitTopOfRange, false);
  assert.equal(volume(row), 20 * 22 + 25 * 12);
  assert.equal(row.weightLb, null);
  assert.deepEqual(row.reps, { right: [12, 12], left: [10] });
  const csv = csvText([row]);
  assert.match(csv, /20\/25/);
  assert.match(csv, /R: 12,12 \/ L: 10/);
  assert.match(csv, /Set 1 right: side note/);
  const text = compact({
    split: 'legs',
    workoutDate: program.date,
    lifts: [exportedLift(row)],
    soreness: [],
  });
  assert.match(text, /Leg extension 20\/25: R 12,12 \/ L 10/);
  assert.doesNotMatch(text, /BW:|Abs:|Soreness:/);
  assert.equal(volume(draft(2, { 0: { reps: '10' } })), null);
});
test('PR comparisons use earlier sessions and distinguish equal-weight reps from load records', () => {
  const old = { ...entries[0], date: '2000-01-01', weightLb: 10, reps: [8, 6, 6], pr: null, hitTopOfRange: false };
  const more = { ...old, date: '2000-01-02', reps: [8, 7, 6] };
  const heavy = { ...old, date: '2000-01-03', weightLb: 15 };
  const rows = mergeHistory([heavy, old, more], []);
  assert.deepEqual(
    rows.map((e) => e.pr),
    [null, 'rep', 'weight'],
  );
  assert.equal(entries[0].pr, 'rep');
});
