/* Fast, dependency-free source/dist integrity check used locally and in CI. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const errors = [];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['.git', 'node_modules', '.vercel', '.tanto-media-cache'].includes(entry.name)) out.push(...await walk(path));
    } else out.push(path);
  }
  return out;
}

function siteRootFor(file) {
  const distRoot = join(ROOT, 'dist');
  return file === distRoot || file.startsWith(distRoot + sep) ? distRoot : ROOT;
}

function localTarget(ref, htmlFile) {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('data:') || clean.startsWith('mailto:') || clean.startsWith('tel:') || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  if (clean.startsWith('/')) return join(siteRootFor(htmlFile), clean.slice(1));
  return resolve(dirname(htmlFile), clean);
}

const files = await walk(ROOT);
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const size = (await stat(file)).size;
  if (size < 256) {
    const head = await readFile(file, 'utf8').catch(() => '');
    if (head.startsWith('version https://git-lfs.github.com/spec/v1')) errors.push(`LFS pointer: ${rel}`);
  }
  if (extname(file).toLowerCase() === '.json') {
    try { JSON.parse(await readFile(file, 'utf8')); } catch (e) { errors.push(`Invalid JSON ${rel}: ${e.message}`); }
  }
  if (extname(file).toLowerCase() === '.js' && !rel.includes('/vendor/')) {
    try { await exec(process.execPath, ['--check', file]); } catch (e) { errors.push(`Invalid JavaScript ${rel}: ${e.stderr || e.message}`); }
  }
}

/* Basic coordinate/data validation. The separate check-map.mjs command
   rasterizes the actual stylized land artwork and verifies that every dot
   lands on its intended rendered shape. */
try {
  const network = JSON.parse(await readFile(join(ROOT, 'data', 'network.json'), 'utf8'));
  const viewBox = network.meta?.map?.viewBox || [0, 0, 1920, 764];
  const ids = new Set();
  for (const port of network.ports || []) {
    if (ids.has(port.id)) errors.push(`Duplicate network port id: ${port.id}`);
    ids.add(port.id);
    if (!Number.isFinite(port.x) || !Number.isFinite(port.y) ||
        port.x < viewBox[0] || port.x > viewBox[0] + viewBox[2] ||
        port.y < viewBox[1] || port.y > viewBox[1] + viewBox[3]) {
      errors.push(`Invalid network coordinate: ${port.id} (${port.x},${port.y})`);
    }
  }
  for (const [group, routes] of [
    ['published', network.routes || []],
    ['illustrative', network.illustrativeRoutes || []]
  ]) {
    const pairs = new Set();
    for (const route of routes) {
      if (!ids.has(route.from)) errors.push(`Unknown ${group} route origin: ${route.from}`);
      if (!ids.has(route.to)) errors.push(`Unknown ${group} route destination: ${route.to}`);
      if (route.via && !ids.has(route.via)) errors.push(`Unknown ${group} route waypoint: ${route.via}`);
      if (route.from === route.to) errors.push(`Invalid ${group} self-route: ${route.from}`);
      const pair = `${route.from}->${route.to}`;
      if (group === 'illustrative' && pairs.has(pair)) errors.push(`Duplicate ${group} route: ${pair}`);
      pairs.add(pair);
    }
  }
} catch (error) {
  errors.push(`Network coordinate audit failed: ${error.message}`);
}

for (const html of files.filter((file) => extname(file).toLowerCase() === '.html')) {
  const source = await readFile(html, 'utf8');
  const ids = [...source.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) errors.push(`Duplicate id="${duplicate}" in ${relative(ROOT, html)}`);
  for (const match of source.matchAll(/\b(?:src|href|poster|data-src)=["']([^"']+)["']/gi)) {
    const target = localTarget(match[1], html);
    if (target && !match[1].startsWith('#') && !existsSync(target)) errors.push(`Missing reference ${match[1]} in ${relative(ROOT, html)}`);
  }
  for (const match of source.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
    for (const candidate of match[1].split(',')) {
      const ref = candidate.trim().split(/\s+/)[0];
      const target = localTarget(ref, html);
      if (target && !existsSync(target)) errors.push(`Missing srcset reference ${ref} in ${relative(ROOT, html)}`);
    }
  }
}

for (const css of files.filter((file) => extname(file).toLowerCase() === '.css')) {
  const source = await readFile(css, 'utf8');
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const ref = match[1].split('?')[0];
    if (!ref || ref.startsWith('#') || ref.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
    const target = ref.startsWith('/') ? join(siteRootFor(css), ref.slice(1)) : resolve(dirname(css), ref);
    if (!existsSync(target)) errors.push(`Missing CSS reference ${ref} in ${relative(ROOT, css)}`);
  }
}

for (let i = 1; i <= 6; i += 1) {
  const portrait = join(ROOT, 'assets', 'img', `customer-portrait-0${i}.webp`);
  if (!existsSync(portrait)) errors.push(`Missing customer portrait: ${relative(ROOT, portrait)}`);
}

if (errors.length) {
  console.error(errors.map((error) => `✗ ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Tanto integrity check passed (${files.length} files).`);
}
