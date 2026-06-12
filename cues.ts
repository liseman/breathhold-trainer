// Voice cue assets. Regenerate with `npm run audio:regen` (ElevenLabs)
// or `npm run audio:placeholders` (offline beeps).
export const CUE_READY = require('./assets/audio/cues/ready.mp3');
export const CUE_GO = require('./assets/audio/cues/go.mp3');
export const CUE_HALFWAY = require('./assets/audio/cues/halfway.mp3');
export const CUE_DONE = require('./assets/audio/cues/done.mp3');

export const CUE_COUNT: Record<number, number> = {
  3: require('./assets/audio/cues/3.mp3'),
  2: require('./assets/audio/cues/2.mp3'),
  1: require('./assets/audio/cues/1.mp3'),
};

export const CUE_NEXT: Record<string, number> = {
  'jumping-jacks': require('./assets/audio/cues/next-jumping-jacks.mp3'),
  'wall-sit': require('./assets/audio/cues/next-wall-sit.mp3'),
  'push-ups': require('./assets/audio/cues/next-push-ups.mp3'),
  crunches: require('./assets/audio/cues/next-crunches.mp3'),
  'step-ups': require('./assets/audio/cues/next-step-ups.mp3'),
  squats: require('./assets/audio/cues/next-squats.mp3'),
  dips: require('./assets/audio/cues/next-dips.mp3'),
  plank: require('./assets/audio/cues/next-plank.mp3'),
  'high-knees': require('./assets/audio/cues/next-high-knees.mp3'),
  lunges: require('./assets/audio/cues/next-lunges.mp3'),
  'pushup-rotations': require('./assets/audio/cues/next-pushup-rotations.mp3'),
  'side-plank': require('./assets/audio/cues/next-side-plank.mp3'),
};
