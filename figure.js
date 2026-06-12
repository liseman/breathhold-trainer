// Anime-Luke stick figure: pose math, per-exercise keyframe animations, and
// scene composition. Pure JS with no rendering dependencies so the same code
// drives react-native-svg in the app and static SVG rendering in scripts.

export const VIEW = 240;
const FLOOR_Y = 214;

const TORSO = 44;
const NECK = 8;
const HEAD_R = 16;
const UARM = 24;
const FARM = 22;
const ULEG = 28;
const LLEG = 28;

export const INK = '#101010';
export const ORANGE = '#FF5A00';
export const BLUE = '#1B3BFF';
export const PAPER = '#F4EFE6';
const SKIN = '#E8B289';
const SKIN_FAR = '#CE9A6E';
const SHIRT = ORANGE;
const SHIRT_FAR = '#D94D00';
const SHORTS = BLUE;
const SHORTS_FAR = '#1530C2';
const HAIR = '#241A12';

const D2R = Math.PI / 180;
// Limb angles are absolute screen angles: 0 points down, positive swings
// toward screen-right, +-180 points up. Torso angle: 0 points up, positive
// leans toward screen-right.
const down = (deg) => [Math.sin(deg * D2R), Math.cos(deg * D2R)];
const up = (deg) => [Math.sin(deg * D2R), -Math.cos(deg * D2R)];
const add = (p, dir, len) => [p[0] + dir[0] * len, p[1] + dir[1] * len];
const rot = (v, deg) => {
  const c = Math.cos(deg * D2R);
  const s = Math.sin(deg * D2R);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};

const BASE_POSE = {
  hx: 120, hy: 152, torso: 0, head: 0, face: 1,
  lsh: -8, lel: -8, rsh: 8, rel: 8,
  lhip: -3, lknee: -3, rhip: 3, rknee: 3,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function ease(t) {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function mixPose(a, b, t) {
  const out = {};
  for (const key of Object.keys(BASE_POSE)) {
    const av = a[key] ?? BASE_POSE[key];
    const bv = b[key] ?? BASE_POSE[key];
    out[key] = typeof av === 'number' ? lerp(av, bv, t) : av;
  }
  return out;
}

function line(x1, y1, x2, y2, c, w) {
  return { k: 'line', x1, y1, x2, y2, c, w };
}

function seg(parts, a, b, color, width) {
  parts.push(line(a[0], a[1], b[0], b[1], INK, width + 5));
  parts.push(line(a[0], a[1], b[0], b[1], color, width));
}

function limb(parts, start, angle1, len1, angle2, len2, c1, c2, width, tip) {
  const mid = add(start, down(angle1), len1);
  const end = add(mid, down(angle2), len2);
  seg(parts, start, mid, c1, width);
  seg(parts, mid, end, c2, width);
  if (tip === 'hand') {
    parts.push({ k: 'circle', cx: end[0], cy: end[1], r: 4.5, f: c2, sc: INK, sw: 2.5 });
  } else if (tip === 'shoe') {
    const dir = down(angle2 + 90);
    const toe = add(end, dir, 9);
    parts.push(line(end[0], end[1], toe[0], toe[1], INK, width + 4));
  }
  return end;
}

const poly = (pts) =>
  `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} Z`;

function headParts(parts, center, tilt, face) {
  const local = (deg, radius) => add(center, up(deg + tilt), radius);

  parts.push({ k: 'circle', cx: center[0], cy: center[1], r: HEAD_R, f: SKIN, sc: INK, sw: 3 });

  // Spiky anime hair: zigzag band hugging the top rim of the head, closed
  // along an inner arc so the fill never crosses the face.
  const spikes = [];
  for (let i = 0, a = -100; a <= 100; a += 20, i += 1) {
    const outer = i % 2 === 0 ? HEAD_R + 9 : HEAD_R + 2;
    spikes.push(local(a + face * 6, outer));
  }
  for (let a = 100; a >= -100; a -= 25) {
    spikes.push(local(a + face * 6, HEAD_R - 4));
  }
  parts.push({ k: 'path', d: poly(spikes), f: HAIR, sc: INK, sw: 2 });

  // Full beard: a band along the jaw rim, also closed along an inner arc.
  const beard = [];
  for (let i = 0, a = 112; a <= 248; a += 17, i += 1) {
    const outer = i % 2 === 0 ? HEAD_R + 4 : HEAD_R + 8;
    beard.push(local(a + face * 6, outer));
  }
  for (let a = 248; a >= 112; a -= 17) {
    beard.push(local(a + face * 6, HEAD_R - 4));
  }
  parts.push({ k: 'path', d: poly(beard), f: HAIR, sc: INK, sw: 2 });

  // Mouth.
  const mouthA = add(center, rot([face * 3 - 2.5, 8.5], tilt), 1);
  const mouthB = add(center, rot([face * 3 + 2.5, 9], tilt), 1);
  parts.push(line(mouthA[0], mouthA[1], mouthB[0], mouthB[1], INK, 2));

  // Big anime eyes, shifted toward the facing direction.
  const eyeOffsets = face === 0 ? [-6.5, 6.5] : [face * 3, face * 11];
  for (const off of eyeOffsets) {
    const eye = add(center, rot([off, -1.5], tilt), 1);
    parts.push({ k: 'circle', cx: eye[0], cy: eye[1], r: 4.2, f: '#FFFFFF', sc: INK, sw: 2 });
    const pupil = add(eye, rot([face * 1.2, 0.4], tilt), 1);
    parts.push({ k: 'circle', cx: pupil[0], cy: pupil[1], r: 2, f: INK });
    const spark = add(pupil, [0.9, -1], 1);
    parts.push({ k: 'circle', cx: spark[0], cy: spark[1], r: 0.7, f: '#FFFFFF' });
    const browA = add(eye, rot([-3.5, -6.5], tilt), 1);
    const browB = add(eye, rot([3.5, -7.5], tilt), 1);
    parts.push(line(browA[0], browA[1], browB[0], browB[1], INK, 2.5));
  }
}

export function figureParts(pose) {
  const p = { ...BASE_POSE, ...pose };
  const parts = [];
  const hip = [p.hx, p.hy];
  const chest = add(hip, up(p.torso), TORSO);

  // Far-side limbs render first, in darker tones.
  limb(parts, chest, p.lsh, UARM, p.lel, FARM, SKIN_FAR, SKIN_FAR, 7, 'hand');
  limb(parts, hip, p.lhip, ULEG, p.lknee, LLEG, SHORTS_FAR, SKIN_FAR, 8, 'shoe');

  // Torso: orange tank.
  seg(parts, hip, chest, SHIRT, 17);
  seg(parts, add(hip, up(p.torso), 6), add(hip, up(p.torso), 16), SHIRT_FAR, 17);

  // Near-side limbs.
  limb(parts, hip, p.rhip, ULEG, p.rknee, LLEG, SHORTS, SKIN, 8, 'shoe');
  limb(parts, chest, p.rsh, UARM, p.rel, FARM, SKIN, SKIN, 7, 'hand');

  // Neck + head.
  const tilt = p.torso + p.head;
  const headC = add(add(chest, up(tilt), NECK), up(tilt), HEAD_R - 2);
  seg(parts, chest, add(chest, up(tilt), NECK + 4), SKIN, 8);
  headParts(parts, headC, tilt, p.face);

  return { parts, headC };
}

const STAND = BASE_POSE;

const ANIMS = {
  idle: {
    frames: [
      { ms: 900, pose: { ...STAND } },
      { ms: 900, pose: { ...STAND, hy: 154, lsh: -12, lel: -12, rsh: 12, rel: 12 } },
    ],
  },
  wave: {
    frames: [
      { ms: 350, pose: { ...STAND, rsh: 175, rel: -160 } },
      { ms: 350, pose: { ...STAND, rsh: 165, rel: -130 } },
    ],
  },
  victory: {
    frames: [
      { ms: 350, pose: { ...STAND, hy: 146, lsh: -165, lel: -170, rsh: 165, rel: 170 } },
      { ms: 350, pose: { ...STAND, hy: 154, lsh: -140, lel: -120, rsh: 140, rel: 120 } },
    ],
  },
  'jumping-jacks': {
    frames: [
      { ms: 330, pose: { ...STAND, face: 0, lsh: -14, lel: -14, rsh: 14, rel: 14, lhip: -4, lknee: -4, rhip: 4, rknee: 4 } },
      { ms: 330, pose: { ...STAND, face: 0, hy: 145, lsh: -152, lel: -166, rsh: 152, rel: 166, lhip: -21, lknee: -21, rhip: 21, rknee: 21 } },
    ],
  },
  'wall-sit': {
    sweat: true,
    props: ['wall'],
    frames: [
      { ms: 260, pose: { hx: 98, hy: 176, torso: 2, lsh: 28, lel: 38, rsh: 32, rel: 42, lhip: 86, lknee: 0, rhip: 90, rknee: 4, face: 1 } },
      { ms: 260, pose: { hx: 98, hy: 177, torso: 4, lsh: 30, lel: 40, rsh: 34, rel: 44, lhip: 87, lknee: 1, rhip: 91, rknee: 5, face: 1 } },
    ],
  },
  'push-ups': {
    frames: [
      { ms: 600, pose: { hx: 96, hy: 166, torso: 94, head: -12, lsh: 14, lel: -4, rsh: 10, rel: -8, lhip: -64, lknee: -64, rhip: -60, rknee: -60, face: 1 } },
      { ms: 600, pose: { hx: 96, hy: 183, torso: 97, head: -14, lsh: 58, lel: -58, rsh: 54, rel: -54, lhip: -70, lknee: -70, rhip: -66, rknee: -66, face: 1 } },
    ],
  },
  crunches: {
    props: ['mat'],
    frames: [
      { ms: 650, pose: { hx: 130, hy: 197, torso: -82, head: -6, lsh: -150, lel: -100, rsh: -146, rel: -96, lhip: 116, lknee: 8, rhip: 112, rknee: 4, face: -1 } },
      { ms: 520, pose: { hx: 130, hy: 197, torso: -56, head: -16, lsh: -150, lel: -100, rsh: -146, rel: -96, lhip: 116, lknee: 8, rhip: 112, rknee: 4, face: -1 } },
    ],
  },
  'step-ups': {
    props: ['chair-right'],
    frames: [
      { ms: 480, pose: { ...STAND, hx: 86 } },
      { ms: 480, pose: { hx: 90, hy: 152, torso: 10, lsh: -20, lel: -24, rsh: 42, rel: 30, lhip: -2, lknee: -2, rhip: 56, rknee: 84, face: 1 } },
      { ms: 560, pose: { hx: 142, hy: 117, torso: 4, lsh: -10, lel: -12, rsh: 12, rel: 14, lhip: -3, lknee: -3, rhip: 3, rknee: 3, face: 1 } },
      { ms: 480, pose: { hx: 90, hy: 152, torso: 10, lsh: -20, lel: -24, rsh: 42, rel: 30, lhip: -2, lknee: -2, rhip: 56, rknee: 84, face: 1 } },
    ],
  },
  squats: {
    frames: [
      { ms: 560, pose: { ...STAND, lsh: 84, lel: 84, rsh: 88, rel: 88 } },
      { ms: 560, pose: { hx: 112, hy: 178, torso: 18, head: -8, lsh: 84, lel: 84, rsh: 88, rel: 88, lhip: 58, lknee: -45, rhip: 62, rknee: -41, face: 1 } },
    ],
  },
  dips: {
    props: ['chair-left'],
    frames: [
      { ms: 540, pose: { hx: 118, hy: 184, torso: -14, lsh: 32, lel: -36, rsh: 38, rel: -42, lhip: 68, lknee: 32, rhip: 72, rknee: 36, face: 1 } },
      { ms: 540, pose: { hx: 118, hy: 195, torso: -19, lsh: 52, lel: -56, rsh: 58, rel: -62, lhip: 74, lknee: 40, rhip: 78, rknee: 44, face: 1 } },
    ],
  },
  plank: {
    sweat: true,
    frames: [
      { ms: 900, pose: { hx: 100, hy: 180, torso: 95, head: -16, lsh: 14, lel: 99, rsh: 10, rel: 95, lhip: -62, lknee: -62, rhip: -58, rknee: -58, face: 1 } },
      { ms: 900, pose: { hx: 100, hy: 177, torso: 95, head: -14, lsh: 14, lel: 99, rsh: 10, rel: 95, lhip: -61, lknee: -61, rhip: -57, rknee: -57, face: 1 } },
    ],
  },
  'high-knees': {
    frames: [
      { ms: 210, pose: { hx: 120, hy: 149, torso: 8, lsh: 34, lel: 96, rsh: -42, rel: 14, lhip: 96, lknee: 24, rhip: -6, rknee: -6, face: 1 } },
      { ms: 210, pose: { hx: 120, hy: 145, torso: 8, lsh: -42, lel: 14, rsh: 34, rel: 96, lhip: -6, lknee: -6, rhip: 96, rknee: 24, face: 1 } },
    ],
  },
  lunges: {
    frames: [
      { ms: 520, pose: { ...STAND, lsh: 32, lel: -58, rsh: 36, rel: -62 } },
      { ms: 620, pose: { hx: 118, hy: 178, torso: 6, lsh: 32, lel: -58, rsh: 36, rel: -62, lhip: -36, lknee: -86, rhip: 84, rknee: 6, face: 1 } },
    ],
  },
  'pushup-rotations': {
    frames: [
      { ms: 520, pose: { hx: 96, hy: 166, torso: 94, head: -12, lsh: 14, lel: -4, rsh: 10, rel: -8, lhip: -64, lknee: -64, rhip: -60, rknee: -60, face: 1 } },
      { ms: 520, pose: { hx: 96, hy: 183, torso: 97, head: -14, lsh: 58, lel: -58, rsh: 54, rel: -54, lhip: -70, lknee: -70, rhip: -66, rknee: -66, face: 1 } },
      { ms: 420, pose: { hx: 96, hy: 166, torso: 94, head: -12, lsh: 14, lel: -4, rsh: 10, rel: -8, lhip: -64, lknee: -64, rhip: -60, rknee: -60, face: 1 } },
      { ms: 680, pose: { hx: 98, hy: 162, torso: 88, head: -30, lsh: 12, lel: -2, rsh: -172, rel: -176, lhip: -62, lknee: -62, rhip: -58, rknee: -58, face: 1 } },
    ],
  },
  'side-plank': {
    sweat: true,
    frames: [
      { ms: 900, pose: { hx: 110, hy: 196, torso: 73, head: -20, lsh: 18, lel: 95, rsh: -176, rel: -180, lhip: -107, lknee: -107, rhip: -103, rknee: -103, face: 1 } },
      { ms: 900, pose: { hx: 110, hy: 193, torso: 72, head: -18, lsh: 18, lel: 95, rsh: -172, rel: -176, lhip: -106, lknee: -106, rhip: -102, rknee: -102, face: 1 } },
    ],
  },
};

function propParts(name) {
  const parts = [];
  if (name === 'wall') {
    parts.push(line(86, 64, 86, FLOOR_Y, BLUE, 9));
    parts.push(line(86, 64, 86, FLOOR_Y, INK, 2));
  } else if (name === 'chair-right' || name === 'chair-left') {
    const [x1, x2] = name === 'chair-right' ? [128, 178] : [58, 108];
    parts.push(line(x1 + 4, 172, x1 + 4, FLOOR_Y, INK, 5));
    parts.push(line(x2 - 4, 172, x2 - 4, FLOOR_Y, INK, 5));
    parts.push(line(x1, 172, x2, 172, INK, 7));
    parts.push(line(x1, 174.5, x2, 174.5, ORANGE, 4));
  } else if (name === 'mat') {
    parts.push(line(46, 210, 198, 210, BLUE, 5));
  }
  return parts;
}

export function sampleScene(name, tMs) {
  const anim = ANIMS[name] ?? ANIMS.idle;
  const total = anim.frames.reduce((sum, f) => sum + f.ms, 0);
  let t = ((tMs % total) + total) % total;
  let index = 0;
  while (t >= anim.frames[index].ms) {
    t -= anim.frames[index].ms;
    index += 1;
  }
  const a = anim.frames[index].pose;
  const b = anim.frames[(index + 1) % anim.frames.length].pose;
  const pose = mixPose(a, b, ease(t / anim.frames[index].ms));

  const parts = [];
  for (const prop of anim.props ?? []) parts.push(...propParts(prop));
  parts.push(line(24, FLOOR_Y, 216, FLOOR_Y, INK, 5));
  const { parts: body, headC } = figureParts(pose);
  parts.push(...body);

  if (anim.sweat) {
    const phase = (tMs % 1300) / 1300;
    parts.push({
      k: 'circle',
      cx: headC[0] + 14,
      cy: headC[1] - 6 + phase * 26,
      r: 3,
      f: BLUE,
      o: 1 - phase * 0.8,
    });
  }

  return parts;
}

export const ANIM_NAMES = Object.keys(ANIMS);

// Start offsets of each keyframe, for tooling that wants exact poses.
export function keyTimes(name) {
  const anim = ANIMS[name] ?? ANIMS.idle;
  const times = [];
  let cursor = 0;
  for (const frame of anim.frames) {
    times.push(cursor);
    cursor += frame.ms;
  }
  return times;
}
