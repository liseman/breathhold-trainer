// Renders a contact sheet of animation frames to PNG for visual review.
// Usage: node scripts/preview-anims.mjs [outPath]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sampleScene, keyTimes, ANIM_NAMES, VIEW, PAPER, INK } from '../figure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] ?? path.join(__dirname, '..', 'preview.png');

export function partsToSvg(parts, label) {
  const shapes = parts
    .map((p) => {
      const opacity = p.o != null ? ` opacity="${p.o.toFixed(2)}"` : '';
      if (p.k === 'line') {
        return `<line x1="${p.x1.toFixed(1)}" y1="${p.y1.toFixed(1)}" x2="${p.x2.toFixed(1)}" y2="${p.y2.toFixed(1)}" stroke="${p.c}" stroke-width="${p.w}" stroke-linecap="round"${opacity}/>`;
      }
      if (p.k === 'circle') {
        const stroke = p.sc ? ` stroke="${p.sc}" stroke-width="${p.sw}"` : '';
        return `<circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="${p.r}" fill="${p.f}"${stroke}${opacity}/>`;
      }
      if (p.k === 'path') {
        const stroke = p.sc ? ` stroke="${p.sc}" stroke-width="${p.sw}" stroke-linejoin="round"` : '';
        return `<path d="${p.d}" fill="${p.f}"${stroke}${opacity}/>`;
      }
      return '';
    })
    .join('\n');
  const caption = label
    ? `<text x="8" y="20" font-family="monospace" font-size="13" font-weight="bold" fill="${INK}">${label}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${VIEW}" height="${VIEW}"><rect width="${VIEW}" height="${VIEW}" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>${caption}${shapes}</svg>`;
}

async function main() {
  const names = ANIM_NAMES;
  const cols = Math.max(...names.map((n) => keyTimes(n).length));
  const tiles = [];
  for (let row = 0; row < names.length; row += 1) {
    const anim = names[row];
    const times = keyTimes(anim);
    for (let col = 0; col < times.length; col += 1) {
      const svg = partsToSvg(sampleScene(anim, times[col]), `${anim} k${col}`);
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      tiles.push({ input: png, left: col * VIEW, top: row * VIEW });
    }
  }
  await sharp({
    create: { width: cols * VIEW, height: names.length * VIEW, channels: 3, background: PAPER },
  })
    .composite(tiles)
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
