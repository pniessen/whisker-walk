// A tiny static server for the built dist, under the game's /whisker-walk/ base.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

export const BASE = '/whisker-walk/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

// URL path -> a file path inside root, or null (outside the base, or trying to leave root).
export function resolveRequest(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (!p.startsWith(BASE)) return null;
  let rel = p.slice(BASE.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const full = resolve(root, normalize(rel));
  if (full !== resolve(root) && !full.startsWith(resolve(root) + sep)) return null;
  return full;
}

export function startServer(root) {
  const server = createServer(async (req, res) => {
    const file = resolveRequest(root, req.url ?? '/');
    if (!file) { res.writeHead(404).end('not found'); return; }
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}${BASE}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) }));
  });
}
