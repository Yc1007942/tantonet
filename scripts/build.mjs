/*
 * TANTO production build
 *
 * The repository remains source-first for local development. Vercel creates
 * the dist tree with responsive image derivatives, rewritten references and
 * minified CSS/JS. The original hero video is copied unchanged so local
 * development and production use the same media file.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, stat, rm, cp, open } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist');
const GENERATED = join(OUT, 'assets', 'generated');

let sharp;
let esbuild;
try {
  sharp = (await import('sharp')).default;
  esbuild = await import('esbuild');
} catch (error) {
  console.error('Build dependencies are missing. Run npm install before building:', error.message);
  process.exit(1);
}

const imageInputs = [
  { source: 'assets/img/tanto-port.jpg', stem: 'tanto-port' },
  { source: 'assets/img/bg-tracking.png', stem: 'bg-tracking' },
  { source: 'assets/img/service-routes-map.png', stem: 'service-routes-map' },
  { source: 'assets/img/heritage-routes-map.webp', stem: 'heritage-routes-map' }
];

const copySkip = new Set([
  '.git', '.github', 'node_modules', 'dist', '.vercel', '.tanto-media-cache', 'scripts', 'api'
]);
const fileSkip = new Set(['package.json', 'package-lock.json', 'vercel.json', 'dev-server.mjs', 'README.md']);
const rawMediaSkip = new Set(['assets/img/tanto-port.jpg']);

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(ROOT, path).split(sep).join('/');
    if (entry.isDirectory()) {
      if (!copySkip.has(entry.name)) result.push(...await walk(path));
    } else if (!fileSkip.has(rel) && !rawMediaSkip.has(rel) && !(rel.startsWith('data/') && rel.endsWith('.json'))) {
      result.push(path);
    }
  }
  return result;
}

async function walkAll(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['.git', 'node_modules', 'dist', '.vercel', '.tanto-media-cache'].includes(entry.name)) result.push(...await walkAll(path));
    } else result.push(path);
  }
  return result;
}

async function ensureNoLfsPointers() {
  const files = await walkAll(ROOT);
  for (const file of files) {
    const handle = await stat(file);
    if (handle.size < 128) continue;
    const stream = await open(file, 'r');
    const buffer = Buffer.alloc(160);
    await stream.read(buffer, 0, buffer.length, 0);
    await stream.close();
    const head = buffer.toString('utf8');
    if (head.startsWith('version https://git-lfs.github.com/spec/v1')) {
      throw new Error(`Git LFS pointer found instead of media: ${relative(ROOT, file)}`);
    }
  }
}

async function copySourceTree() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const source of await walk(ROOT)) {
    const rel = relative(ROOT, source);
    const target = join(OUT, rel);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target);
  }
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

async function writeHashed(buffer, stem, extension) {
  const name = `${stem}.${hashBuffer(buffer)}.${extension}`;
  const target = join(GENERATED, name);
  await writeFile(target, buffer);
  return `/assets/generated/${name}`;
}

async function generateImages() {
  await mkdir(GENERATED, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), images: {} };
  for (const input of imageInputs) {
    const source = join(ROOT, input.source);
    if (!existsSync(source)) throw new Error(`Missing image input: ${input.source}`);
    const metadata = await sharp(source).metadata();
    const widths = [640, 960, 1440].filter((width) => !metadata.width || width <= metadata.width);
    if (!widths.length) widths.push(metadata.width || 640);
    const variants = [];
    for (const width of widths) {
      const webp = await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 76, effort: 4 }).toBuffer();
      const avif = await sharp(source).resize({ width, withoutEnlargement: true }).avif({ quality: 55, effort: 4 }).toBuffer();
      variants.push({ width, webp: await writeHashed(webp, `${input.stem}-${width}`, 'webp'), avif: await writeHashed(avif, `${input.stem}-${width}`, 'avif') });
    }
    manifest.images[input.source] = variants;
  }
  return manifest;
}

function rewriteText(text, manifest) {
  for (const [source, variants] of Object.entries(manifest.images)) {
    const preferred = variants[variants.length - 1];
    const relativeAsset = source.replace(/^assets\//, '');
    // Replace the most specific path first; otherwise a leading ../ or /
    // would be left behind when the shorter source string is replaced.
    [`../${source}`, `/${source}`, `../${relativeAsset}`, source].forEach((needle) => {
      text = text.replaceAll(needle, preferred.webp);
    });
  }
  return text;
}

function rewriteResponsiveImgSources(text, manifest) {
  for (const [source, variants] of Object.entries(manifest.images)) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const imagePattern = new RegExp(`(<img\\b[^>]*\\bsrc=["'])(?:\\.\\./|/)?${escaped}(["'][^>]*>)`, 'gi');
    const preferred = variants[variants.length - 1];
    const srcset = variants.map((variant) => `${variant.webp} ${variant.width}w`).join(', ');
    text = text.replace(imagePattern, function (all, prefix, suffix) {
      if (/\bsrcset\s*=/i.test(suffix)) return all;
      return prefix + preferred.webp + suffix.slice(0, -1) + ` srcset="${srcset}">`;
    });
  }
  return text;
}

async function rewriteAssets(manifest) {
  // Enumerate the copied tree independently of the source-root walker.
  async function outputFiles(dir) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) result.push(...await outputFiles(path));
      else result.push(path);
    }
    return result;
  }
  for (const file of await outputFiles(OUT)) {
    const extension = extname(file).toLowerCase();
    if (!['.html', '.css', '.js'].includes(extension)) continue;
    const original = await readFile(file, 'utf8');
    const responsive = extension === '.html' ? rewriteResponsiveImgSources(original, manifest) : original;
    const rewritten = rewriteText(responsive, manifest);
    if (rewritten !== original) await writeFile(file, rewritten);
  }
  // A build reference audit catches any missed rewrite before Vercel serves
  // dist. The hero video remains a regular source asset and is copied above.
}

async function minifyAssets() {
  async function outputFiles(dir) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) result.push(...await outputFiles(path));
      else result.push(path);
    }
    return result;
  }
  for (const file of await outputFiles(OUT)) {
    const extension = extname(file).toLowerCase();
    if (!['.css', '.js'].includes(extension) || file.includes(`${sep}vendor${sep}`)) continue;
    const source = await readFile(file, 'utf8');
    const result = await esbuild.transform(source, {
      loader: extension.slice(1),
      minifyWhitespace: true,
      minifySyntax: true,
      minifyIdentifiers: false,
      legalComments: 'none',
      sourcefile: relative(OUT, file)
    });
    await writeFile(file, result.code);
  }
}

async function validateDist() {
  async function outputFiles(dir) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) result.push(...await outputFiles(path));
      else result.push(path);
    }
    return result;
  }
  const output = await outputFiles(OUT);
  const known = new Set(output);
  for (const html of output.filter((file) => extname(file).toLowerCase() === '.html')) {
    const source = await readFile(html, 'utf8');
    for (const match of source.matchAll(/\b(?:src|href|poster|data-src)=["']([^"']+)["']/gi)) {
      const ref = match[1].split('#')[0].split('?')[0];
      if (!ref || ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('tel:') || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/api/')) continue;
      const target = ref.startsWith('/') ? join(OUT, ref.slice(1)) : resolve(dirname(html), ref);
      // Directory URLs are valid static references when index.html is present.
      const direct = known.has(target);
      const directoryIndex = existsSync(target) && (await stat(target)).isDirectory() && known.has(join(target, 'index.html'));
      if (!direct && !directoryIndex) throw new Error(`Unresolved output reference ${ref} in ${relative(OUT, html)}`);
    }
    for (const match of source.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
      for (const candidate of match[1].split(',')) {
        const ref = candidate.trim().split(/\s+/)[0];
        if (!ref || ref.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
        const target = ref.startsWith('/') ? join(OUT, ref.slice(1)) : resolve(dirname(html), ref);
        if (!known.has(target)) throw new Error(`Unresolved srcset reference ${ref} in ${relative(OUT, html)}`);
      }
    }
  }
  for (const css of output.filter((file) => extname(file).toLowerCase() === '.css')) {
    const source = await readFile(css, 'utf8');
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const ref = match[1].split('?')[0];
      if (!ref || ref.startsWith('#') || ref.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
      const target = ref.startsWith('/') ? join(OUT, ref.slice(1)) : resolve(dirname(css), ref);
      if (!existsSync(target)) throw new Error(`Unresolved CSS reference ${ref} in ${relative(OUT, css)}`);
    }
  }
  if (existsSync(join(OUT, 'assets', 'img', 'tanto-port.jpg'))) throw new Error('Raw 4.4MB journey image leaked into dist');
}

async function main() {
  await ensureNoLfsPointers();
  await copySourceTree();
  const manifest = await generateImages();
  await rewriteAssets(manifest);
  await minifyAssets();
  await validateDist();
  console.log(`Tanto production build ready: ${relative(ROOT, OUT)}`);
}

main().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
});
