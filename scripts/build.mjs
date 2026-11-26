import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
for (const name of ['index.html', 'manifest.json', 'src', 'assets', 'demos', 'data']) {
  await cp(path.join(root, name), path.join(dist, name), {
    recursive: true,
    filter: (file) => !path.basename(file).startsWith('.'),
  });
}
const dates = (await readdir(path.join(dist, 'data/workouts')))
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .map((name) => name.slice(0, 10))
  .sort()
  .reverse();
await writeFile(path.join(dist, 'data/dates.json'), JSON.stringify({ schemaVersion: 1, dates }));
await writeFile(
  path.join(dist, '404.html'),
  `<!doctype html><meta charset="utf-8"><title>My Fitness Tracker</title><script>const p=location.pathname;const project='/my-fitness-tracker/';location.replace((p.includes(project)?p.slice(0,p.indexOf(project))+project:'/')+'index.html'+location.hash);</script><a href="./">Open My Fitness Tracker</a>`,
);
async function filesIn(folder) {
  const children = await readdir(folder, { withFileTypes: true });
  const paths = await Promise.all(
    children.map((e) => (e.isDirectory() ? filesIn(path.join(folder, e.name)) : path.join(folder, e.name))),
  );
  return paths.flat();
}
const files = (await filesIn(dist))
  .map((file) => path.relative(dist, file).split(path.sep).join('/'))
  .sort();
const demos = files.filter((name) => /^demos\/.*\.(gif|webp|png|jpe?g|avif)$/i.test(name));
await writeFile(
  path.join(dist, 'src/demo-files.js'),
  'export const demoFiles = ' + JSON.stringify(demos) + ';\nexport const demoMap = ' +
    await readFile(path.join(root, 'data/demos.json'), 'utf8') + ';\n',
);
const shell = files.filter((name) => (!name.startsWith('data/') || name.startsWith('data/weekly/')) && !demos.includes(name));
const template = await readFile(path.join(root, 'scripts/sw-template.js'), 'utf8');
const hash = createHash('sha256').update(template);
for (const file of files) hash.update(file).update(await readFile(path.join(dist, file)));
await writeFile(
  path.join(dist, 'sw.js'),
  template
    .replace('__VERSION__', hash.digest('hex').slice(0, 16))
    .replace('/* SHELL_FILES */ []', JSON.stringify(shell)),
);
console.log('Built static PWA in dist with ' + dates.length + ' programmed date(s).');
