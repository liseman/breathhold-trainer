// Generates offline beep placeholders for every voice cue so the app can
// build and run before (or without) ElevenLabs voice generation.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { buildCueTexts } from './cue-texts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cuesDir = path.join(__dirname, '..', 'assets', 'audio', 'cues');

function tone(file) {
  if (file === 'go.mp3') return { freq: 1320, dur: 0.35 };
  if (file === 'done.mp3') return { freq: 1320, dur: 0.7 };
  if (/^[123]\.mp3$/.test(file)) return { freq: 880, dur: 0.15 };
  if (file === 'halfway.mp3') return { freq: 990, dur: 0.2 };
  return { freq: 660, dur: 0.25 };
}

fs.mkdirSync(cuesDir, { recursive: true });
for (const file of Object.keys(buildCueTexts())) {
  const { freq, dur } = tone(file);
  execFileSync(ffmpeg.path, [
    '-y',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', `sine=frequency=${freq}:duration=${dur}`,
    '-af', 'afade=t=out:st=' + Math.max(0, dur - 0.05) + ':d=0.05',
    '-ar', '22050',
    '-b:a', '32k',
    path.join(cuesDir, file),
  ]);
  console.log(`placeholder ${file}`);
}
console.log('done');
