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
