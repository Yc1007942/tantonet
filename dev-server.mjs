/* ============================================================
   TANTO — local development server
   Usage:  node dev-server.mjs  →  http://localhost:4173

   Serves the static site and proxies /api/tcm/* to the
   production Tanto API (https://sync.tantooffice.com/api/tcm/*)
   with the Origin the production API accepts. This is needed
   because the live API rejects requests whose Origin is not
   www.tantonet.com ("Access denied").
   In production (deployed at tantonet.com) no proxy is needed.
   ============================================================ */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SITE_ROOT = process.env.SITE_ROOT ? resolve(ROOT, process.env.SITE_ROOT) : ROOT;
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;
const API_BASE = 'https://sync.tantooffice.com/api/tcm/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function safePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (p === '/') p = '/index.html';
  const full = normalize(join(SITE_ROOT, p));
  // Keep the root itself valid too (SITE_ROOT may be `/` when a shell or IDE
  // supplies that environment value). The previous `SITE_ROOT + '/'` check
  // produced `//` for that case and incorrectly returned 400 for `/`.
  const rootPrefix = SITE_ROOT.endsWith(sep) ? SITE_ROOT : SITE_ROOT + sep;
  if (full !== SITE_ROOT && !full.startsWith(rootPrefix)) return null;
  return full;
}

async function tryFile(req, res, urlPath) {
  let file = safePath(urlPath);
  if (!file) {
    if (!res.headersSent) { res.writeHead(400); res.end('Bad request'); }
    return true;
  }
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = join(file, 'index.html');
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    // Range support (video seeking, resumable downloads)
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (start <= end && end < st.size) {
          if (!res.headersSent) res.writeHead(206, {
            'Content-Type': type,
            'Content-Range': `bytes ${start}-${end}/${st.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Cache-Control': 'public, max-age=3600'
          });
          createReadStream(file, { start, end }).pipe(res);
          return true;
        }
      }
    }
    const data = await readFile(file);
    if (!res.headersSent) res.writeHead(200, {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      // Code must never go stale during local iteration; media/fonts may cache.
      'Cache-Control': ['.html', '.js', '.css'].includes(extname(file))
        ? 'no-cache'
        : 'public, max-age=3600'
    });
    res.end(data);
  } catch {
    if (res.headersSent) return true; // already responded (or client gone)
    return false;
  }
  return true;
}

const server = createServer(async (req, res) => {
  const urlPath = req.url || '/';

  // 1. MUST BE FIRST: Handle CORS Preflight before proxying
  if (req.method === 'OPTIONS' && urlPath.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // 2. API proxy
  if (urlPath.startsWith('/api/tcm/')) {
    const target = API_BASE + urlPath.slice('/api/tcm/'.length);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const upstream = await fetch(target, {
          method: req.method === 'GET' ? 'GET' : 'POST',
          headers: {
            // Dynamically inherit Content-Type so FormData boundaries don't break
            'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://www.tantonet.com',
            'Referer': 'https://www.tantonet.com/'
          },
          body: req.method === 'GET' ? undefined : Buffer.concat(chunks)
        });
        const body = await upstream.arrayBuffer();
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(Buffer.from(body));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: false, msg: 'proxy error: ' + e.message }));
      }
    });
    return;
  }

  // Static
  const served = await tryFile(req, res, urlPath);
  if (!served && !res.headersSent) {
    const nf = safePath('/404.html');
    try {
      const body = await readFile(nf);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  }
});

// Never let a bad request kill the dev server
process.on('uncaughtException', (e) => {
  console.error('uncaught (ignored):', e.message);
});

server.listen(PORT, () => {
  console.log(`Tanto dev server → http://localhost:${PORT}${process.env.SITE_ROOT ? ` (${process.env.SITE_ROOT})` : ''}`);
  console.log(`Site root       → ${SITE_ROOT}`);
  console.log(`API proxy       → /api/tcm/* → ${API_BASE}(origin: www.tantonet.com)`);
});
