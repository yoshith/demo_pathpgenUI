import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNoaaService, STATION } from './src/noaa.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const noaa = createNoaaService();
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.basemaps.cartocdn.com https://tile.openstreetmap.org; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

export function makeServer() {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    try {
      const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (route === '/api/health') {
        res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, application: 'battery-flow', version: '0.1.0', station: STATION.id })); return;
      }
      if (route === '/api/station') {
        const data = await noaa.read();
        res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data)); return;
      }
      const filename = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
      const target = path.resolve(PUBLIC, filename);
      if (!target.startsWith(PUBLIC + path.sep) || filename.split('/').some(x => x.startsWith('.'))) { res.writeHead(403); res.end('Forbidden'); return; }
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': filename.startsWith('vendor/') ? 'public, max-age=604800' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : error instanceof URIError ? 400 : 500;
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(status === 404 ? 'Not found' : status === 400 ? 'Invalid request' : 'Unable to complete request');
      if (status === 500) console.error(error.message);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = makeServer();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Battery Flow listening on port ${port}`));
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
