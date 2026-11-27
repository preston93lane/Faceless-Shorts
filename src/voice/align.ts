/**
 * Word-level caption timing for narration audio, using whisper.cpp on CPU.
 *
 * Whisper transcribes the narration we synthesized; we then map its word timings
 * back onto the *script's* words (so captions always spell things exactly as written,
 * even if whisper mishears a word).
 *
 * Usage:
 *   npx tsx src/voice/align.ts --audio public/generated/x/voice.wav --text "..." --out public/generated/x/captions.json
 */
import type { Caption } from "@remotion/captions";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
  type WhisperModel,
} from "@remotion/install-whisper-cpp";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const WHISPER_VERSION = "1.7.6";
const WHISPER_DIR = resolve(".cache/whisper.cpp");
const MODEL: WhisperModel = "base.en";

export async function ensureWhisper(): Promise<void> {
  await installWhisperCpp({ version: WHISPER_VERSION, to: WHISPER_DIR, printOutput: false });
  await downloadWhisperModel({ model: MODEL, folder: WHISPER_DIR, printOutput: false });
}

/** Lowercase, strip punctuation, for fuzzy word matching. */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
}

export type TimedWord = { text: string; startMs: number; endMs: number };

/**
 * Map whisper word timings onto script words with an edit-distance alignment.
 * Script words that whisper missed get times interpolated from their neighbours.
 */
export function alignScriptToTranscript(scriptText: string, heard: TimedWord[]): TimedWord[] {
  const script = scriptText.split(/\s+/).filter(Boolean);
  const a = script.map(normalizeWord);
  const b = heard.map((h) => normalizeWord(h.text));
  const n = a.length;
  const m = b.length;
  // DP edit distance
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j - 1] + sub, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  // Backtrack: record which heard word each script word maps to.
  const match: (number | null)[] = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const sub = a[i - 1] === b[j - 1] ? 0 : 1;
    if (dp[i][j] === dp[i - 1][j - 1] + sub) {
      match[i - 1] = j - 1;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }

  const out: TimedWord[] = script.map((text, k) => {
    const h = match[k] !== null ? heard[match[k]!] : null;
    return { text, startMs: h ? h.startMs : NaN, endMs: h ? h.endMs : NaN };
  });
  // Interpolate gaps for unmatched words.
  for (let k = 0; k < out.length; k++) {
    if (!Number.isNaN(out[k].startMs)) continue;
    let p = k - 1;
    while (p >= 0 && Number.isNaN(out[p].endMs)) p--;
    let q = k + 1;
    while (q < out.length && Number.isNaN(out[q].startMs)) q++;
    const from = p >= 0 ? out[p].endMs : 0;
    const to = q < out.length ? out[q].startMs : from + 400 * (q - p - 1);
    const span = (to - from) / (q - p - 1);
    for (let r = p + 1; r < q; r++) {
      out[r].startMs = from + span * (r - p - 1);
      out[r].endMs = from + span * (r - p);
    }
    k = q - 1;
  }
  return out;
}

/**
 * Whisper's DTW timestamps drift by a few hundred ms, but Kokoro tells us exactly where
 * each sentence starts and ends (we synthesize sentence by sentence). Keep whisper's
 * relative word rhythm inside each sentence, and pin each sentence to Kokoro's exact span.
 */
export function anchorToSentences(words: TimedWord[], sentences: { text: string; startMs: number; endMs: number }[]): TimedWord[] {
  const out: TimedWord[] = [];
  let cursor = 0;
  for (const s of sentences) {
    const count = s.text.split(/\s+/).filter(Boolean).length;
    const group = words.slice(cursor, cursor + count);
    cursor += count;
    if (group.length === 0) continue;
    const srcStart = group[0].startMs;
    const srcEnd = group[group.length - 1].endMs;
    const scale = srcEnd > srcStart ? (s.endMs - s.startMs) / (srcEnd - srcStart) : 1;
    for (const w of group) {
      out.push({
        text: w.text,
        startMs: s.startMs + (w.startMs - srcStart) * scale,
        endMs: s.startMs + (w.endMs - srcStart) * scale,
      });
    }
  }
  // Any words beyond the sentence list (shouldn't happen) keep their raw timing.
  return out.concat(words.slice(cursor));
}

export async function alignNarration(opts: {
  audioPath: string;
  text: string;
  outPath: string;
  sentences?: { text: string; startMs: number; endMs: number }[];
}): Promise<Caption[]> {
  await ensureWhisper();
  const wav16k = resolve(opts.audioPath.replace(/\.wav$/, ".16k.wav"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", opts.audioPath, "-ar", "16000", "-ac", "1", wav16k]);
  const json = await transcribe({
    inputPath: wav16k,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model: MODEL,
    tokenLevelTimestamps: true,
    printOutput: false,
  });
  const { captions } = toCaptions({ whisperCppOutput: json });
  const heard: TimedWord[] = captions
    .map((c) => ({ text: c.text.trim(), startMs: c.startMs, endMs: c.endMs }))
    .filter((c) => c.text.length > 0);
  const raw = alignScriptToTranscript(opts.text, heard);
  const aligned = opts.sentences ? anchorToSentences(raw, opts.sentences) : raw;
  const result: Caption[] = aligned.map((w, idx) => ({
    text: (idx === 0 ? "" : " ") + w.text,
    startMs: Math.round(w.startMs),
    endMs: Math.round(w.endMs),
    timestampMs: Math.round((w.startMs + w.endMs) / 2),
    confidence: null,
  }));
  await mkdir(dirname(opts.outPath), { recursive: true });
  await writeFile(opts.outPath, JSON.stringify(result, null, 2));
  return result;
}

const isMain = process.argv[1]?.endsWith("align.ts");
if (isMain) {
  const { values } = parseArgs({
    options: { audio: { type: "string" }, text: { type: "string" }, out: { type: "string" } },
  });
  if (!values.audio || !values.text || !values.out) {
    console.error("Usage: --audio <wav> --text <script text> --out <captions.json>");
    process.exit(1);
  }
  // Use the Kokoro sidecar (voice.json) for exact sentence anchors when it exists.
  const sidecar = values.audio.replace(/\.wav$/, ".json");
  const sentences = existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, "utf8")).sentences : undefined;
  const caps = await alignNarration({ audioPath: values.audio, text: values.text, outPath: values.out, sentences });
  console.log(`Wrote ${values.out} (${caps.length} words)`);
}
