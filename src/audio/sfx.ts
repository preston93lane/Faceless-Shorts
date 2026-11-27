/**
 * Sound effects, synthesized in code so the channel owns them outright (no licensing, no Content ID claims).
 * Soft and short, to match the calm paper style:
 *   - paper: a brushed-paper swish for shot changes (filtered noise with a quick swell and fade)
 *   - pop: a soft wooden "tok" when a card or number lands (a decaying low sine with a tiny click)
 *   - tick: a light tick for counters
 *
 *   npx tsx src/audio/sfx.ts     # (re)writes public/sfx/*.wav
 */
import { mkdirSync, writeFileSync } from "node:fs";

const RATE = 44100;
export const SFX_FILES = { paper: "sfx/paper.wav", pop: "sfx/pop.wav", tick: "sfx/tick.wav" } as const;
export type SfxKind = keyof typeof SFX_FILES;

function wav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

/** Deterministic noise so the files are identical on every machine. */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

export function paperSwish(): Float32Array {
  const n = Math.round(RATE * 0.32);
  const out = new Float32Array(n);
  const rnd = noise(7);
  let lp = 0;
  let bp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Band-limited noise whose brightness rises then falls, like a sheet of paper sliding.
    const cutoff = 0.04 + 0.18 * Math.sin(Math.PI * t);
    lp += cutoff * (rnd() - lp);
    bp += 0.5 * (lp - bp);
    const env = Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 2 * (1 - t) ** 0.6;
    out[i] = (lp - bp) * env * 2.4;
  }
  return out;
}

export function softPop(): Float32Array {
  const n = Math.round(RATE * 0.16);
  const out = new Float32Array(n);
  const rnd = noise(11);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 420 - 180 * Math.min(1, t / 0.08);
    const tone = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 32);
    const click = i < 60 ? rnd() * (1 - i / 60) * 0.25 : 0;
    out[i] = (tone * 0.55 + click) * Math.min(1, i / 40);
  }
  return out;
}

export function tick(): Float32Array {
  const n = Math.round(RATE * 0.05);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 140) * 0.35;
  }
  return out;
}

const isMain = process.argv[1]?.endsWith("sfx.ts");
if (isMain) {
  mkdirSync("public/sfx", { recursive: true });
  writeFileSync(`public/${SFX_FILES.paper}`, wav(paperSwish()));
  writeFileSync(`public/${SFX_FILES.pop}`, wav(softPop()));
  writeFileSync(`public/${SFX_FILES.tick}`, wav(tick()));
  console.log("wrote public/sfx/{paper,pop,tick}.wav");
}
