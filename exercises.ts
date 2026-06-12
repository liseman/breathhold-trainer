export type Exercise = {
  slug: string;
  name: string;
  speech: string;
  tip: string;
};

// UC Berkeley UHS "7 Minute Workout" handout — the 12-exercise ACSM
// high-intensity circuit. Order alternates total body / lower / upper / core.
export const EXERCISES: Exercise[] = [
  { slug: 'jumping-jacks', name: 'JUMPING JACKS', speech: 'Jumping jacks', tip: 'Land soft. Full arm swing.' },
  { slug: 'wall-sit', name: 'WALL SIT', speech: 'Wall sit', tip: 'Knees at 90. Back flat on the wall.' },
  { slug: 'push-ups', name: 'PUSH-UPS', speech: 'Push ups', tip: 'Straight line, head to heels.' },
  { slug: 'crunches', name: 'CRUNCHES', speech: 'Abdominal crunches', tip: 'Chin off chest. Slow up, slow down.' },
  { slug: 'step-ups', name: 'STEP-UPS', speech: 'Step ups onto a chair', tip: 'Whole foot on the chair. Alternate legs.' },
  { slug: 'squats', name: 'SQUATS', speech: 'Squats', tip: 'Hips back. Weight in your heels.' },
  { slug: 'dips', name: 'TRICEPS DIPS', speech: 'Triceps dips on a chair', tip: 'Elbows point straight back.' },
  { slug: 'plank', name: 'PLANK', speech: 'Plank', tip: 'Squeeze glutes. Do not sag.' },
  { slug: 'high-knees', name: 'HIGH KNEES', speech: 'High knees, running in place', tip: 'Knees above your hips. Fast.' },
  { slug: 'lunges', name: 'LUNGES', speech: 'Lunges', tip: 'Front knee over ankle. Alternate.' },
  { slug: 'pushup-rotations', name: 'PUSH-UP + ROTATION', speech: 'Push up and rotation', tip: 'Push up, then reach for the sky.' },
  { slug: 'side-plank', name: 'SIDE PLANK', speech: 'Side plank', tip: 'Hips high. Switch sides at fifteen.' },
];

export const WORK_SEC = 30;
export const BUFFER_SEC = 10;
export const TOTAL_SEC = EXERCISES.length * (WORK_SEC + BUFFER_SEC);

export type Phase = {
  kind: 'buffer' | 'work';
  exIndex: number;
  startSec: number;
  endSec: number;
};

export function buildPhases(): Phase[] {
  const phases: Phase[] = [];
  let cursor = 0;
  EXERCISES.forEach((_, exIndex) => {
    phases.push({ kind: 'buffer', exIndex, startSec: cursor, endSec: cursor + BUFFER_SEC });
    cursor += BUFFER_SEC;
    phases.push({ kind: 'work', exIndex, startSec: cursor, endSec: cursor + WORK_SEC });
    cursor += WORK_SEC;
  });
  return phases;
}
