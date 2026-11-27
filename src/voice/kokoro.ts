/**
 * Kokoro TTS narration (free, local, Apache-2.0 model weights).
 *
 * Usage:
 *   npx tsx src/voice/kokoro.ts --text "Hello there" --voice af_heart --out public/generated/voice.wav
 *
 * Writes the WAV file plus a sidecar `<out>.json` with per-sentence timings.
 * Word-level timings come later from whisper alignment (src/voice/align.ts).
 */
import { Tensor } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
  ttsPromise ??= KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" }).then(enableBlends);
  return ttsPromise;
}

// ---------------------------------------------------------------------------
// Voice blends: "am_michael:0.7+am_puck:0.3"
// A Kokoro voice is a table of style vectors, so a weighted average of two voices is a
// new, stable voice. kokoro-js only accepts its built-in names, so blends are handled by
// wrapping two of its methods: voice validation and the style lookup before inference.
// ---------------------------------------------------------------------------

export type BlendPart = { voice: string; weight: number };

/** Parses "am_michael:0.7+am_puck:0.3" into normalized weights. Plain names return one part. */
export function parseVoiceSpec(spec: string): BlendPart[] {
  const parts = spec.split("+").map((p) => {
    const [voice, w] = p.trim().split(":");
    const weight = w === undefined ? 1 : Number(w);
    if (!/^[a-z]{2}_[a-z]+$/.test(voice) || !(weight > 0)) throw new Error(`Bad voice spec part: "${p}"`);
    return { voice, weight };
  });
  const total = parts.reduce((a, p) => a + p.weight, 0);
  return parts.map((p) => ({ voice: p.voice, weight: p.weight / total }));
}

const isBlend = (spec: string) => spec.includes("+") || spec.includes(":");
const STYLE_DIM = 256;
const voiceDir = () => join(dirname(createRequire(import.meta.url).resolve("kokoro-js")), "..", "voices");
const blendCache = new Map<string, Float32Array>();

function blendStyles(spec: string): Float32Array {
  const cached = blendCache.get(spec);
  if (cached) return cached;
  let out: Float32Array | null = null;
  for (const { voice, weight } of parseVoiceSpec(spec)) {
    const buf = readFileSync(join(voiceDir(), `${voice}.bin`));
    const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    out ??= new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] += v[i] * weight;
  }
  blendCache.set(spec, out!);
  return out!;
}

function enableBlends(tts: KokoroTTS): KokoroTTS {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tts as any;
  const validate = t._validate_voice.bind(t);
  const fromIds = t.generate_from_ids.bind(t);
  t._validate_voice = (v: string) => (isBlend(v) ? parseVoiceSpec(v)[0].voice.at(0) : validate(v));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t.generate_from_ids = async (ids: any, opts: { voice: string; speed?: number }) => {
    if (!isBlend(opts.voice)) return fromIds(ids, opts);
    // Same style-row selection as kokoro-js: one 256-d row per input length.
    const row = Math.min(Math.max(ids.dims.at(-1) - 2, 0), 509);
    const style = blendStyles(opts.voice).slice(row * STYLE_DIM, (row + 1) * STYLE_DIM);
    const { waveform } = await t.model({
      input_ids: ids,
      style: new Tensor("float32", style, [1, STYLE_DIM]),
      speed: new Tensor("float32", [opts.speed ?? 1], [1]),
    });
    return { audio: waveform.data as Float32Array, sampling_rate: 24000 };
  };
  return tts;
}

import { splitSentences } from "./sentences";
export { splitSentences };

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
