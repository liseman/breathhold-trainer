import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(projectRoot, 'assets', 'audio');
const elapsedManifestPath = path.join(projectRoot, 'elapsedCues.ts');
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const apiKey = process.env.ELEVENLABS_API_KEY;
const maxElapsedSec = 30 * 60;

if (!voiceId || !apiKey) {
  throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID before running audio regeneration.');
}

const promptTexts = {
  'breathe.mp3': 'Breathe.',
  'hold.mp3': 'Hold.',
  'halfway.mp3': 'Halfway there. Stay loose.',
  'prompts/1.mp3': '1.',
  'prompts/2.mp3': '2.',
  'prompts/3.mp3': '3.',
  'prompts/4.mp3': '4.',
  'prompts/5.mp3': '5.',
  'prompts/10.mp3': '10.',
  'prompts/20.mp3': '20.',
  'prompts/30.mp3': '30.',
  'prompts/done.mp3': 'Done.',
  'prompts/hold.mp3': 'Hold.',
  'prompts/one-minute.mp3': 'One minute.',
  'prompts/one-minute-left.mp3': 'One minute left.',
  'prompts/30-left.mp3': '30 seconds left.',
};

const halfwayStarts = [
  'Stay smooth',
  'Keep the jaw loose',
  'Nice and steady',
  'You are right on it',
  'Calm body',
  'Easy face',
  'Soft shoulders',
  'Hold that stillness',
  'Beautiful control',
  'Stay relaxed',
];

const halfwayEnds = [
  'You are doing great.',
  'Keep it easy.',
  'Right where you need to be.',
  'Let the urge pass.',
  'Stay with the calm.',
  'Nice and patient.',
  'Keep that rhythm.',
  'Nothing to force.',
  'Just keep settling.',
  'Smooth all the way.',
];

function formatElapsedText(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${seconds} seconds.`;
  if (!remainder) return minutes === 1 ? '1 minute.' : `${minutes} minutes.`;
  return `${minutes} minute${minutes === 1 ? '' : 's'} ${remainder} seconds.`;
}

function buildHalfwayPrompts() {
  const prompts = [];
  for (const start of halfwayStarts) {
    for (const end of halfwayEnds) {
      prompts.push(`${start}. ${end}`);
    }
  }
  return prompts.slice(0, 100);
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function synthesizeToFile(text, outputPath) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.25,
        use_speaker_boost: true,
      },
      output_format: 'mp3_22050_32',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs ${response.status}: ${body}`);
  }

  await ensureDir(outputPath);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function rewriteElapsedManifest() {
  const lines = [];
  for (let seconds = 30; seconds <= maxElapsedSec; seconds += 30) {
    lines.push(`  ${seconds}: require('./assets/audio/elapsed/${String(seconds).padStart(3, '0')}.mp3'),`);
  }
  const contents = `export const ELAPSED_CUE_ASSETS = {\n${lines.join('\n')}\n} as const;\n`;
  await fs.writeFile(elapsedManifestPath, contents);
}

async function main() {
  await rewriteElapsedManifest();

  for (const [relativePath, text] of Object.entries(promptTexts)) {
    const outputPath = path.join(assetsRoot, relativePath);
    console.log(`prompt ${relativePath}`);
    await synthesizeToFile(text, outputPath);
  }

  for (let seconds = 30; seconds <= maxElapsedSec; seconds += 30) {
    const relativePath = path.join('elapsed', `${String(seconds).padStart(3, '0')}.mp3`);
    console.log(`elapsed ${relativePath}`);
    await synthesizeToFile(formatElapsedText(seconds), path.join(assetsRoot, relativePath));
  }

  const halfwayPrompts = buildHalfwayPrompts();
  for (let index = 0; index < halfwayPrompts.length; index += 1) {
    const filename = `${String(index + 1).padStart(3, '0')}.mp3`;
    const relativePath = path.join('halfway', filename);
    console.log(`halfway ${relativePath}`);
    await synthesizeToFile(halfwayPrompts[index], path.join(assetsRoot, relativePath));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
