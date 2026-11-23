#!/usr/bin/env node
// Serves dist/web-component (the bundle and the host test page) on http://localhost:4300 and passes /api/stork
// and /tableau to the agent on :8050, the same way `npm start` does for the standalone app.
//   npm run build:element && npm run serve:element
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/web-component');
const port = Number(process.env.PORT ?? 4300);
const agent = new URL(process.env.AGENT_URL ?? 'http://127.0.0.1:8050');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.sha256': 'text/plain' };

if (!existsSync(join(root, 'hk-eli-chatbot.js'))) {
  console.error('No bundle yet. Run: npm run build:element');
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/stork') || url.pathname.startsWith('/tableau')) {
    const path = url.pathname.replace(/^\/api\/stork/, '/api') + url.search;
    const upstream = request({ host: agent.hostname, port: agent.port, path, method: req.method, headers: { ...req.headers, host: agent.host } }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Agent not reachable');
    });
    req.pipe(upstream);
    return;
  }
  const file = normalize(join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Host test page: http://localhost:${port}  (agent: ${agent.origin})`));
