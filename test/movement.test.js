import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { movementFor } from '../src/movement.js';
import { parseTab } from '../src/sheet.js';
import { blocksFor } from '../src/model.js';

test('sheet override reaches the card; variants use exact mappings or the placeholder', async () => {
  const json = async path => JSON.parse(await readFile(new URL('../data/' + path, import.meta.url)));
  const catalog = await json('exercises.json'), map = await json('demos.json');
  const files = new Set(Object.values(map).map(d => d.src));
  const csv = await readFile(new URL('../docs/workouts-example.csv', import.meta.url), 'utf8');
  const program = parseTab('workouts', csv.replace(/,deadlift\n/, ',https://example.org/demo.gif\n'), catalog)['2030-04-02'];
  const ex = blocksFor(program,catalog)[0].items[0];
  const demo = (exercise, demoOverride) => movementFor({...exercise,demoOverride},catalog,map,files).src;
  assert.equal(demo(ex,ex.demoOverride), 'https://example.org/demo.gif');
  assert.equal(demo(ex,'leg-extension'),map['leg-extension'].src);
  assert.equal(demo(ex,'/' + map['leg-extension'].src),map['leg-extension'].src);
  assert.equal(demo(ex,'javascript:invalid'),map.deadlift.src);
  assert.equal(demo({name:'Seated straight-arm DB lateral raise',exerciseId:'dumbbell-lateral-raise'}),map['seated-dumbbell-lateral-raise'].src);
  assert.match(demo({name:'Seated DB shrugs',exerciseId:'dumbbell-shrug'}),/placeholders/);
});
