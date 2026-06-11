// Generates the HoldMore app logo + icon assets from an inline SVG design.
// Run: node scripts/generate-logo.mjs
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

// Brand palette (pulled from App.tsx)
const NAVY_DEEP = '#08111f';
const NAVY = '#0d1728';
const CYAN = '#38bdf8';
const CYAN_LIGHT = '#7dd3fc';

// The mark: a breath held in suspension.
// A diver descends through a calm "hold" ring; a rising column of breath
// is paused mid-rise — three stacked arcs (a lung/wave) inside a circle,
// with a single bright held bubble at the apex. Deep-dive navy gradient
// background, luminous cyan stroke.
//
// `bg`  -> draw the rounded background (for the full app icon / splash)
// `pad` -> fraction of the canvas left as breathing room around the mark
function buildSvg({ size = 1024, bg = true, pad = 0.16 } = {}) {
  const s = size;
  const c = s / 2;
  const m = s * pad;            // margin
  const r = c - m;              // mark radius

  // Ring geometry
  const ringW = s * 0.052;

  // Concentric "breath" wave arcs inside the ring, rising toward a held bubble.
  // Each arc is a shallow upward curve; they shrink and brighten toward the top.
  const waves = [];
  const waveColors = [CYAN, CYAN, CYAN_LIGHT];
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    const wr = r * (0.62 - i * 0.16);        // arc half-width
    const yBase = c + r * 0.22 - i * r * 0.30; // vertical position, rising
    const dip = wr * 0.55;                    // curve depth
    const x0 = c - wr;
    const x1 = c + wr;
    const cx = c;
    const cy = yBase - dip;
    waves.push(
      `<path d="M ${x0} ${yBase} Q ${cx} ${cy} ${x1} ${yBase}" fill="none" stroke="${waveColors[i]}" stroke-width="${ringW * (0.92 - i * 0.12)}" stroke-linecap="round" opacity="${0.55 + t * 0.45}"/>`
    );
  }

  // The held breath: a luminous bubble paused at the apex.
  const bubbleR = r * 0.13;
  const bubbleY = c - r * 0.52;

  const bgRect = bg
    ? `<rect x="0" y="0" width="${s}" height="${s}" rx="${s * 0.2237}" fill="url(#bgGrad)"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.32" r="0.75">
      <stop offset="0" stop-color="${CYAN}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bubbleGrad" cx="0.38" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="${CYAN_LIGHT}"/>
      <stop offset="1" stop-color="${CYAN}"/>
    </radialGradient>
  </defs>
  ${bgRect}
  <circle cx="${c}" cy="${c}" r="${r * 0.95}" fill="url(#glow)"/>
  <!-- hold ring (open at the top where the breath escapes/pauses) -->
  <circle cx="${c}" cy="${c}" r="${r * 0.82}" fill="none" stroke="${CYAN}" stroke-width="${ringW}" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * r * 0.82 * 0.86} ${2 * Math.PI * r * 0.82}" transform="rotate(-115 ${c} ${c})" opacity="0.9"/>
  ${waves.join('\n  ')}
  <circle cx="${c}" cy="${bubbleY}" r="${bubbleR}" fill="url(#bubbleGrad)"/>
  <circle cx="${c}" cy="${bubbleY}" r="${bubbleR * 1.9}" fill="none" stroke="${CYAN_LIGHT}" stroke-width="${ringW * 0.25}" opacity="0.35"/>
</svg>`;
}

async function render(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}

const targets = [
  // Full app icon: rounded navy background + mark.
  { file: 'icon.png', size: 1024, opts: { bg: true, pad: 0.18 } },
  // Adaptive icon foreground: Android masks it, so keep the mark inside the
  // safe zone (more padding) and let the launcher supply the background color.
  { file: 'adaptive-icon.png', size: 1024, opts: { bg: false, pad: 0.27 } },
  // Splash: mark on transparent, shown over backgroundColor #08111f.
  { file: 'splash-icon.png', size: 1024, opts: { bg: false, pad: 0.22 } },
  // Web favicon.
  { file: 'favicon.png', size: 48, opts: { bg: true, pad: 0.12 } },
];

for (const t of targets) {
  const svg = buildSvg({ size: 1024, ...t.opts });
  await render(svg, t.size, join(ASSETS, t.file));
}

// Also keep the source SVG (full icon) for future edits / marketing use.
await writeFile(join(ASSETS, 'logo.svg'), buildSvg({ size: 1024, bg: true, pad: 0.18 }));
console.log('wrote', join(ASSETS, 'logo.svg'));
