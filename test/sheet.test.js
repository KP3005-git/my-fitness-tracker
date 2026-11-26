import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTab } from '../src/sheet.js';

test('documented workout rows form an ordered workout, superset and abs block', async () => {
  const csv = await readFile(new URL('../docs/workouts-example.csv', import.meta.url), 'utf8');
  const day = parseTab('workouts', csv, {})['2030-04-02'];
  assert.equal(day.title, 'Pull day');
  assert.deepEqual(day.blocks.map(b => b.type), ['exercise', 'superset']);
  assert.equal(day.blocks[1].rounds, 3);
  assert.equal(day.blocks[1].items[1].weightLb, null);
  assert.equal(day.abs.items[0].reps, '30 sec');
  assert.throws(() => parseTab('workouts', csv.replace(',3,pair,',',2,pair,'), {}));
  assert.throws(() => parseTab('workouts', '<html>Sign in</html>', {}));
});

test('updated targets supersede old rows even when the sheet is reordered', () => {
  const csv = 'Exercise,Next Weight,Target Sets x Reps,Rule\nCurl (updated Nov 11),25 lb,3x10,"Increase, then repeat"\nCurl,20 lb,3x8,Old';
  const rows = parseTab('targets',csv,{}).targets;
  assert.equal(rows.length,1);
  assert.equal(rows[0].nextWeightLb,25);
  assert.equal(rows[0].rule,'Increase, then repeat');
});
