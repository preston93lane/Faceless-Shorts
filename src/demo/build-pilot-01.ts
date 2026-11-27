/**
 * Pilot 01 ("What if you jumped into a hole through the Earth?"): narration -> captions -> render spec.
 *
 *   npx tsx src/demo/build-pilot-01.ts            # voice + captions (cached) + spec
 *   npx remotion render src/video/index.ts Short out/pilot-01-short.mp4 --props=public/generated/pilot-01/spec-short.json
 *
 * Narration comes from the spoken (numbers spelled out) version of the script, in the brand voice.
 * Scene boundaries come from Kokoro's sentence timings; in-scene cues come from word timings.
 */
import type { Caption } from "@remotion/captions";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ScriptSchema, type Spoken } from "../agents/schemas";
import { BRAND } from "../brand";
import type { SceneSpec, VideoSpec } from "../video/types";
import { alignNarration } from "../voice/align";
import { splitSentences, synthesize } from "../voice/kokoro";

const SCRIPT = "scripts/pilot-01-hole-through-earth.json";
const SPOKEN = "scripts/pilot-01-hole-through-earth.spoken.json";
const DIR = "public/generated/pilot-01";

const script = ScriptSchema.parse(JSON.parse(readFileSync(SCRIPT, "utf8")));
const spoken = JSON.parse(readFileSync(SPOKEN, "utf8")) as Spoken;
const said = new Map(spoken.beats.map((b) => [b.id, b.spoken]));
const beatText = script.beats.map((b) => {
  const s = said.get(b.id);
  if (!s) throw new Error(`no spoken text for ${b.id}`);
  return { id: b.id, text: s };
});
const text = beatText.map((b) => b.text).join(" ");

// 1. Voice (cached; delete the wav to regenerate)
const wav = `${DIR}/voice-short.wav`;
if (!existsSync(wav)) {
  const r = await synthesize({ text, voice: BRAND.voice.id, speed: BRAND.voice.speed, outPath: wav });
  console.log(`voice: ${(r.durationMs / 1000).toFixed(1)}s`);
}
const narration = JSON.parse(readFileSync(wav.replace(/\.wav$/, ".json"), "utf8")) as {
  durationMs: number;
  sentences: { text: string; startMs: number; endMs: number }[];
};

// 2. Captions (cached)
const capsPath = `${DIR}/captions-short.json`;
if (!existsSync(capsPath)) {
  await alignNarration({ audioPath: wav, text, outPath: capsPath, sentences: narration.sentences });
}
const captions = JSON.parse(readFileSync(capsPath, "utf8")) as Caption[];

// 3. Spec
const S = narration.sentences;
/** Index of the first sentence of each beat. */
const firstSentence: Record<string, number> = {};
let n = 0;
for (const b of beatText) {
  firstSentence[b.id] = n;
  n += splitSentences(b.text).length;
}
if (n !== S.length) throw new Error(`sentence count mismatch: script ${n}, audio ${S.length}`);
const at = (beat: string, sentence = 0) => S[firstSentence[beat] + sentence].startMs;

const norm = (w: string) => w.trim().toLowerCase().replace(/[^a-z'-]/g, "");
/** Start time of the first occurrence of `word` at or after `afterMs`. */
const wordAt = (word: string, afterMs = 0): number => {
  const c = captions.find((x) => x.startMs >= afterMs - 50 && norm(x.text) === word);
  if (!c) throw new Error(`word not found in captions: ${word}`);
  return c.startMs;
};

const scenes: SceneSpec[] = [];
const push = (kind: string, startMs: number, props: Record<string, number> = {}) => {
  // cue times are stored relative to the scene start
  const rel = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, Math.max(0, Math.round(v - startMs))]));
  scenes.push({ kind, startMs: Math.round(startMs), endMs: 0, props: rel });
};

push("hole-hook", 0, { jumpAtMs: wordAt("jumped"), throughAtMs: wordAt("through") });
push("stopwatch", at("b2"), { sweepAtMs: wordAt("thirty-eight", at("b2")), popAtMs: wordAt("pop", at("b2")) });
push("fall-speed", at("b3"), { dropAtMs: at("b3", 1), fiveAtMs: wordAt("five", at("b3")) });
push("usa-dash", at("b3", 2), { dashAtMs: wordAt("across", at("b3", 2)), tenAtMs: wordAt("ten", at("b3", 2)) });
push("zero-g", at("b4"), { zeroAtMs: wordAt("zero", at("b4")), pullAtMs: wordAt("pulls", at("b4")), cancelAtMs: wordAt("cancels", at("b4")) });
push("other-side", at("b5"), { slowAtMs: wordAt("slowing", at("b5")), stopAtMs: wordAt("stop", at("b5")) });
push("gravity-train", at("b6"), {
  tunnelAtMs: wordAt("slide", at("b6")),
  citiesAtMs: wordAt("new", at("b6")),
  sameAtMs: wordAt("same", at("b6")),
  fortyAtMs: wordAt("forty", at("b6")),
});
push("fall-again", at("b7"), { slipAtMs: wordAt("fall", at("b7")) });
scenes.forEach((s, i) => (s.endMs = scenes[i + 1]?.startMs ?? Math.round(narration.durationMs)));

const spec: VideoSpec = {
  id: "pilot-01-short",
  theme: BRAND.theme,
  series: script.series,
  audio: `generated/pilot-01/voice-short.wav`,
  durationMs: narration.durationMs,
  captions,
  scenes,
};
writeFileSync(`${DIR}/spec-short.json`, JSON.stringify({ spec }, null, 2));
console.log(`wrote ${DIR}/spec-short.json (${(narration.durationMs / 1000).toFixed(1)}s, ${scenes.length} scenes)`);
