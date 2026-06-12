// Single source of truth for what each voice cue says. Exercise names are
// parsed out of exercises.ts so the audio can never drift from the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadExercises() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'exercises.ts'), 'utf8');
  const matches = [...source.matchAll(/slug:\s*'([^']+)'[^}]*?speech:\s*'([^']+)'/g)];
  if (matches.length !== 12) {
    throw new Error(`Expected 12 exercises in exercises.ts, found ${matches.length}`);
  }
  return matches.map(([, slug, speech]) => ({ slug, speech }));
}

export function buildCueTexts() {
  const exercises = loadExercises();
  const texts = {
    'ready.mp3': `Seven minute workout. Twelve exercises. First up: ${exercises[0].speech.toLowerCase()}. Get ready!`,
    'go.mp3': 'Go!',
    'halfway.mp3': 'Halfway!',
    'done.mp3': 'Done! Workout complete. Nice work — see you tomorrow.',
    '3.mp3': '3.',
    '2.mp3': '2.',
    '1.mp3': '1.',
  };
  for (const { slug, speech } of exercises) {
    texts[`next-${slug}.mp3`] = `Rest. Next up: ${speech.toLowerCase()}.`;
  }
  return texts;
}
