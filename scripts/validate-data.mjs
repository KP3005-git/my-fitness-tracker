import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION, validDocument } from '../src/model.js';

const defaultData = fileURLToPath(new URL('../data/', import.meta.url));

function check(file, data) {
  const workout = /^workouts\/(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
  const week = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const day = week.findIndex(key => file === 'weekly/' + key + '.json');
  const date = day >= 0 ? '2000-01-0' + (day + 3) : workout?.[1];
  const kind = date ? 'workout' : /^(exercises|log|targets|meta|dates)\.json$/.exec(file)?.[1];
  if (file === 'demos.json') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid demo mapping');
    for (const [id, item] of Object.entries(data)) {
      if (!/^[a-z0-9-]+$/.test(id) || !/^demos\/(?:[\w-]+\/)*[\w-]+\.(?:gif|webp|png|jpe?g|avif)$/i.test(item?.src) ||
          ![item.credit,item.license].every(value => typeof value === 'string' && value.trim()))
        throw new Error('invalid demo mapping for ' + id);
    }
    return;
  }
  if (!kind) throw new Error('unexpected file in data');
  if (data?.schemaVersion !== SCHEMA_VERSION || !validDocument(kind, data, date)) {
    throw new Error('invalid v1 ' + kind + ' document');
  }
  if (kind === 'log' && data.entries.some(row => row.sets != null &&
      (!Number.isInteger(row.sets) || row.sets < 0))) throw new Error('invalid set count');
  if (kind === 'exercises') {
    for (const [id, exercise] of Object.entries(data.exercises)) {
      if (exercise.id != null && exercise.id !== id) throw new Error('catalog ID mismatch');
    }
    if (Object.values(data.lookup || {}).some(id => !Object.hasOwn(data.exercises, id))) {
      throw new Error('unknown catalog ID in lookup');
    }
  }
}

async function walk(root, relative = '') {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      await walk(root, file);
    } else {
      try {
        if (!entry.isFile()) throw new Error('expected regular file');
        check(file.replace(/^sample\//, ''), JSON.parse(await readFile(path.join(root, file), 'utf8')));
      } catch (error) {
        throw new Error(file + ': ' + error.message);
      }
    }
  }
}

try {
  if (process.argv[2] === '--stdin') {
    let input = '';
    for await (const chunk of process.stdin.setEncoding('utf8')) input += chunk;
    check(process.argv[3], JSON.parse(input));
  } else {
    const root = process.argv[2] || defaultData;
    await walk(root);
    const map = JSON.parse(await readFile(path.join(root,'demos.json'),'utf8'));
    const catalog = JSON.parse(await readFile(path.join(root,'exercises.json'),'utf8'));
    for (const id of Object.keys(catalog.exercises)) {
      if (!Object.hasOwn(map,id)) console.warn('Unmapped demo: ' + id);
    }
    for (const [id,item] of Object.entries(map)) {
      if (!Object.hasOwn(catalog.exercises,id)) throw new Error('Unknown demo ID: ' + id);
      await readFile(path.resolve(defaultData,'..',item.src));
    }
    console.log('All data files passed v1 validation.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
