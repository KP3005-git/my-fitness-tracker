import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.md': 'text/plain',
};
await stat(path.join(root, 'index.html')).catch(() => {
  throw new Error('Build the app first with npm run build.');
});
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/my-fitness-tracker') {
        res.writeHead(301, { Location: '/my-fitness-tracker/' }).end();
        return;
      }
      const relative = pathname.replace(/^\/my-fitness-tracker\//, '/').replace(/^\/+/, '');
      const file = path.resolve(root, relative || 'index.html');
      if (!file.startsWith(path.resolve(root) + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res
        .writeHead(200, {
          'Content-Type': types[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        })
        .end(body);
    } catch {
      res.writeHead(404).end('Missing file');
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log('My Fitness Tracker at http://127.0.0.1:' + port + '/my-fitness-tracker/'),
  );
