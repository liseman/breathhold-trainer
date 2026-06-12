// Renders the brutalist app icon set (icon, adaptive icon, splash, favicon)
// from vector definitions. Usage: node scripts/render-icons.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, '..', 'assets');

const PAPER = '#F4EFE6';
const INK = '#101010';
const ORANGE = '#FF5A00';
const BLUE = '#1B3BFF';

// Blocky "7" drawn as a stroked polyline: top bar, then the diagonal.
const seven = (stroke, color, dx = 0, dy = 0) =>
  `<path d="M${300 + dx} ${300 + dy} L${715 + dx} ${300 + dy} L${455 + dx} ${790 + dy}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="square" stroke-linejoin="miter"/>`;

// "MW" as stroked polylines inside a blue chip.
const mw = (color, stroke) =>
  `<path d="M382 916 L382 844 L424 898 L466 844 L466 916" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="square"/>` +
  `<path d="M524 844 L548 916 L578 862 L608 916 L632 844" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="square"/>`;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${ORANGE}"/>
  <rect x="58" y="58" width="908" height="908" fill="none" stroke="${INK}" stroke-width="36"/>
  ${seven(150, INK, 30, 30)}
  ${seven(150, PAPER)}
  ${seven(44, INK, -53, 0)}
  <rect x="330" y="812" width="364" height="136" fill="${BLUE}" stroke="${INK}" stroke-width="14"/>
  ${mw(PAPER, 22)}
</svg>`;

// Adaptive foreground: transparent background (app.json supplies the orange),
// motif shrunk into the 66% safe zone.
const adaptiveSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <g transform="translate(512 470) scale(0.62) translate(-512 -512)">
    ${seven(150, INK, 30, 30)}
    ${seven(150, PAPER)}
    ${seven(44, INK, -53, 0)}
  </g>
  <g transform="translate(512 700) scale(0.62) translate(-512 -880)">
    <rect x="330" y="812" width="364" height="136" fill="${BLUE}" stroke="${INK}" stroke-width="14"/>
    ${mw(PAPER, 22)}
  </g>
</svg>`;

const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <g transform="translate(512 512) scale(0.7) translate(-512 -512)">
    <rect x="112" y="112" width="800" height="800" fill="${ORANGE}" stroke="${INK}" stroke-width="30"/>
    <g transform="translate(512 512) scale(0.78) translate(-512 -512)">
      ${seven(150, INK, 30, 30)}
      ${seven(150, PAPER)}
      ${seven(44, INK, -53, 0)}
      <rect x="330" y="812" width="364" height="136" fill="${BLUE}" stroke="${INK}" stroke-width="14"/>
      ${mw(PAPER, 22)}
    </g>
  </g>
</svg>`;

async function render(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(assets, file));
  console.log(file);
}

await render(iconSvg, 1024, 'icon.png');
await render(adaptiveSvg, 1024, 'adaptive-icon.png');
await render(splashSvg, 1024, 'splash-icon.png');
await render(iconSvg, 48, 'favicon.png');
