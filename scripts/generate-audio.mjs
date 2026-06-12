// Regenerates all voice cues with ElevenLabs.
// Usage: ELEVENLABS_API_KEY=... [ELEVENLABS_VOICE_ID=... | ELEVENLABS_VOICE_NAME=luke1] node scripts/generate-audio.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCueTexts } from './cue-texts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cuesDir = path.join(__dirname, '..', 'assets', 'audio', 'cues');

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceName = process.env.ELEVENLABS_VOICE_NAME ?? 'luke1';
const modelId = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_flash_v2';
const seed = Number.parseInt(process.env.ELEVENLABS_SEED ?? '42', 10);

if (!apiKey) {
  throw new Error('Set ELEVENLABS_API_KEY before running audio generation.');
}

async function resolveVoiceId() {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs voices ${response.status}: ${await response.text().catch(() => '')}`);
  }
  const data = await response.json();
  const voice = (data.voices ?? []).find(
    (v) => v.name?.toLowerCase() === voiceName.toLowerCase(),
  );
  if (!voice) {
    const names = (data.voices ?? []).map((v) => v.name).join(', ');
    throw new Error(`Voice "${voiceName}" not found. Available: ${names}`);
  }
  return voice.voice_id;
}

async function synthesize(voiceId, text, outputPath) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: 'en',
      seed: Number.isFinite(seed) ? seed : 42,
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
    throw new Error(`ElevenLabs tts ${response.status}: ${await response.text().catch(() => '')}`);
  }
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const voiceId = await resolveVoiceId();
  console.log(`voice ${voiceName} (${voiceId}), model ${modelId}`);
  await fs.mkdir(cuesDir, { recursive: true });
  for (const [file, text] of Object.entries(buildCueTexts())) {
    console.log(`${file}  <-  "${text}"`);
    await synthesize(voiceId, text, path.join(cuesDir, file));
  }
  console.log('done');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
