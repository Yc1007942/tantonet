/*
 * Artwork-space map calibration check.
 *
 * The Indonesia silhouette is intentionally stylized, so geographic
 * latitude/longitude projection cannot be used for the visible port layer.
 * This check rasterizes the exact SVG used by the site and confirms that
 * every calibrated port centre intersects rendered land. Pass
 * `--overlay <path>` to export a labelled diagnostic layer.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const network = JSON.parse(await readFile(resolve(ROOT, 'data/network.json'), 'utf8'));
const landSource = await readFile(resolve(ROOT, 'assets/map/indonesia-land.svg'), 'utf8');
const pathMatch = landSource.match(/<path[^>]*\sd="([^"]+)"/i);

if (!pathMatch) throw new Error('Could not find the Indonesia land path.');

const [minX, minY, width, height] = network.meta?.map?.viewBox || [0, 0, 1920, 764];
const landSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#000"/>
  <path d="${pathMatch[1]}" fill="#fff" fill-rule="evenodd"/>
</svg>`;
const { data: mask } = await sharp(Buffer.from(landSvg)).greyscale().raw().toBuffer({ resolveWithObject: true });

function isLand(x, y) {
  const px = Math.round(x - minX);
  const py = Math.round(y - minY);
  return px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px] > 128;
}

const invalid = (network.ports || []).filter((port) => !isLand(port.x, port.y));
if (invalid.length) {
  console.error(invalid.map((port) =>
    `✗ Map dot is off the rendered land layer: ${port.id} (${port.x}, ${port.y})`
  ).join('\n'));
  process.exitCode = 1;
}

const overlayIndex = process.argv.indexOf('--overlay');
if (overlayIndex !== -1) {
  const output = process.argv[overlayIndex + 1];
  if (!output) throw new Error('Pass an output path after --overlay.');
  const escapeXml = (value) => String(value).replace(/[&<>"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[char]);
  const markers = (network.ports || []).map((port) => {
    const good = isLand(port.x, port.y);
    return `<g transform="translate(${port.x} ${port.y})">
      <circle r="8" fill="${good ? '#18c98f' : '#ff334c'}" stroke="#fff" stroke-width="2"/>
      <text y="-12" fill="#fff" stroke="#06101f" stroke-width="3" paint-order="stroke" text-anchor="middle" font-family="Arial,sans-serif" font-size="12">${escapeXml(port.id)}</text>
    </g>`;
  }).join('');
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
    <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#06101f"/>
    <path d="${pathMatch[1]}" fill="#203858" fill-rule="evenodd"/>
    ${markers}
  </svg>`;
  await sharp(Buffer.from(overlaySvg)).png().toFile(resolve(output));
  console.log(`Map calibration overlay written to ${resolve(output)}`);
}

if (!invalid.length) console.log(`Map calibration check passed (${network.ports.length} dots on land).`);
