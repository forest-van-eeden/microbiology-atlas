// Local stand-in for Cloudflare Pages: serves dist/ with clean URLs, applies
// dist/_headers, returns dist/404.html for unknown paths, and routes /api/* to
// the same Function handlers that run in production.
//
//   node scripts/dev-server.mjs [port]
//
// With no AGENTMAIL_API_KEY in the environment, sharing reports as disabled,
// which is exactly how production behaves before it is configured.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleConfig, handleShare, handleStatus } from '../functions/_lib/share.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.xml': 'application/xml',
};

function parseHeaders(dist) {
  const file = path.join(dist, '_headers');
  if (!fs.existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { current = { pattern: line.trim(), headers: {} }; rules.push(current); continue; }
    const i = line.indexOf(':');
    if (current && i > 0) current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}

function matches(pattern, p) {
  const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return re.test(p);
}

async function toRequest(req, base) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  headers.set('cf-connecting-ip', req.socket.remoteAddress || '');
  return new Request(new URL(req.url, base), { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}

export function createDevServer({ dist = path.join(ROOT, 'dist'), env = process.env, fetchImpl, now } = {}) {
  const rules = parseHeaders(dist);
  const deps = { ...(fetchImpl ? { fetch: fetchImpl } : {}), ...(now ? { now } : {}) };
  return http.createServer(async (req, res) => {
    const base = 'http://' + req.headers.host;
    const url = new URL(req.url, base);
    try {
      if (url.pathname.startsWith('/api/')) {
        const request = await toRequest(req, base);
        let response;
        if (url.pathname === '/api/config' && req.method === 'GET') response = handleConfig(env);
        else if (url.pathname === '/api/reports/share' && req.method === 'POST') response = await handleShare(request, env, deps);
        else if (url.pathname === '/api/reports/status' && req.method === 'GET') response = await handleStatus(request, env, deps);
        else response = new Response('Method or route not allowed', { status: 405 });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      let rel = decodeURIComponent(url.pathname);
      let file = path.join(dist, rel);
      if (rel.endsWith('/')) file = path.join(file, 'index.html');
      else if (!path.extname(rel) && fs.existsSync(file + '.html')) file += '.html';
      let status = 200;
      if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || path.basename(file).startsWith('_')) {
        file = path.join(dist, '404.html');
        status = 404;
      }
      const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
      for (const r of rules) if (matches(r.pattern, url.pathname)) Object.assign(headers, r.headers);
      res.writeHead(status, headers);
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end('dev server error');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 8765);
  createDevServer().listen(port, '127.0.0.1', () => console.log('Microbiology Atlas on http://127.0.0.1:' + port + '/'));
}
