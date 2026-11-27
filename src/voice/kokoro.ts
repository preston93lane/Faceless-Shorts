/**
 * Kokoro TTS narration (free, local, Apache-2.0 model weights).
 *
 * Usage:
 *   npx tsx src/voice/kokoro.ts --text "Hello there" --voice af_heart --out public/generated/voice.wav
 *
 * Writes the WAV file plus a sidecar `<out>.json` with per-sentence timings.
 * Word-level timings come later from whisper alignment (src/voice/align.ts).
 */
import { KokoroTTS } from "kokoro-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export type SentenceTiming = { text: string; startMs: number; endMs: number };

export type NarrationResult = {
  wavPath: string;
  durationMs: number;
  sampleRate: number;
  sentences: SentenceTiming[];
};

let ttsPromise: Promise<KokoroTTS> | null = null;

function loadTts(): Promise<KokoroTTS> {
  ttsPromise ??= KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" });
  return ttsPromise;
}

/** Split narration into sentences so each can be synthesized and timed separately. */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Gap inserted between sentences, in seconds. Short gaps keep Shorts pacing tight. */
const SENTENCE_GAP_S = 0.18;

export async function synthesize(opts: {
  text: string;
  voice: string;
  outPath: string;
  speed?: number;
}): Promise<NarrationResult> {
  const tts = await loadTts();
  const sentences = splitSentences(opts.text);
  const chunks: Float32Array[] = [];
  const timings: SentenceTiming[] = [];
  let sampleRate = 24000;
  let cursor = 0;

  for (const sentence of sentences) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audio: any = await tts.generate(sentence, { voice: opts.voice as any, speed: opts.speed ?? 1.0 });
    sampleRate = audio.sampling_rate;
    const samples: Float32Array = audio.audio;
    const gap = new Float32Array(Math.round(SENTENCE_GAP_S * sampleRate));
    timings.push({
      text: sentence,
      startMs: (cursor / sampleRate) * 1000,
      endMs: ((cursor + samples.length) / sampleRate) * 1000,
    });
    chunks.push(samples, gap);
    cursor += samples.length + gap.length;
  }

  const total = new Float32Array(cursor);
  let offset = 0;
  for (const c of chunks) {
    total.set(c, offset);
    offset += c.length;
  }

  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, encodeWav(total, sampleRate));
  const result: NarrationResult = {
    wavPath: opts.outPath,
    durationMs: (total.length / sampleRate) * 1000,
    sampleRate,
    sentences: timings,
  };
  await writeFile(opts.outPath.replace(/\.wav$/, ".json"), JSON.stringify(result, null, 2));
  return result;
}

/** 16-bit PCM mono WAV encoder. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""));
if (isMain) {
  const { values } = parseArgs({
    options: {
      text: { type: "string" },
      voice: { type: "string", default: "af_heart" },
      out: { type: "string" },
      speed: { type: "string" },
    },
  });
  if (!values.text || !values.out) {
    console.error("Usage: --text <text> --voice <voice> --out <file.wav>");
    process.exit(1);
  }
  const res = await synthesize({
    text: values.text,
    voice: values.voice!,
    outPath: values.out,
    speed: values.speed ? Number(values.speed) : undefined,
  });
  console.log(`Wrote ${res.wavPath} (${(res.durationMs / 1000).toFixed(2)}s, ${res.sentences.length} sentences)`);
}
