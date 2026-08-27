const UPSTREAM = 'https://sync.tantooffice.com/api/tcm/';
const ALLOWED_PATHS = new Set([
  'container_tracking',
  'get_city_schedule',
  'get_schedule_multi'
]);

function readBody(req) {
  // Vercel normally gives us the raw IncomingMessage because body parsing is
  // disabled below. Keep a fallback for runtimes/adapters that have already
  // parsed the body, so the proxy remains portable across deployments.
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
    if (typeof req.body === 'object') {
      return Promise.resolve(Buffer.from(new URLSearchParams(req.body).toString()));
    }
  }
  if (req.readableEnded) return Promise.resolve(Buffer.alloc(0));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Vercel exposes catch-all parameters differently between the Node and
  // Web-handler runtimes. Resolve from the request URL first so the proxy is
  // stable on both preview and production deployments.
  const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  const endpoint = requestUrl.pathname.replace(/^\/api\/tcm\//, '').replace(/\/+$/, '');

  if (req.method === 'OPTIONS') {
    res.status(204)
      .setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type')
      .end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST, OPTIONS').json({ status: false, msg: 'Method not allowed' });
    return;
  }
  if (!ALLOWED_PATHS.has(endpoint)) {
    res.status(404).json({ status: false, msg: 'Unknown API endpoint' });
    return;
  }

  try {
    const body = await readBody(req);
    const upstream = await fetch(UPSTREAM + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://www.tantonet.com',
        'Referer': 'https://www.tantonet.com/'
      },
      body,
      signal: AbortSignal.timeout(15000)
    });
    const text = await upstream.text();
    res.status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      .setHeader('Cache-Control', 'no-store')
      .end(text);
  } catch (err) {
    res.status(502).json({ status: false, msg: 'Upstream API unavailable' });
  }
}

export const config = { api: { bodyParser: false } };
