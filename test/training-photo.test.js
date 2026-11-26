import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { trainingPhoto } from '../src/training-photo.js';

test('every weekly workout resolves to its matching photo', async () => {
  const expected = { mon: 'chest', tue: 'back', wed: 'legs', thu: 'shoulders', fri: 'arms', sat: 'cardio', sun: 'cardio' };
  for (const [day, photo] of Object.entries(expected)) {
    const program = JSON.parse(await readFile(new URL('../data/weekly/' + day + '.json', import.meta.url)));
    assert.equal(trainingPhoto(program, []), photo);
    assert.ok((await stat(new URL('../assets/training/' + photo + '.webp', import.meta.url))).size);
  }
});

test('custom and unprogrammed dates use the available muscle information', () => {
  assert.equal(trainingPhoto({ title: 'Core day' }, []), 'core');
  assert.equal(trainingPhoto(null, [{primaryMuscle:'Delts'}]), 'shoulders');
  assert.equal(trainingPhoto(null, [{primaryMuscle:'Chest'}, {primaryMuscle:'Legs'}]), 'full-body');
  assert.equal(trainingPhoto(null, []), 'neon-wall');
});
