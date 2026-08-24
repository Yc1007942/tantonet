
'use strict';

const UPSTREAM = 'https://sync.tantooffice.com/api/tcm/';
const ALLOWED_PATHS = new Set([
  'container_tracking',
  'get_city_schedule',
  'get_schedule_multi'
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  const pathValue = req.query && req.query.path;
  const endpoint = Array.isArray(pathValue) ? pathValue.join('/') : String(pathValue || '');

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
      body: body
    });
    const text = await upstream.text();
    res.status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      .setHeader('Cache-Control', 'no-store')
      .end(text);
  } catch (err) {
    res.status(502).json({ status: false, msg: 'Upstream API unavailable' });
  }
};

module.exports.config = { api: { bodyParser: false } };
