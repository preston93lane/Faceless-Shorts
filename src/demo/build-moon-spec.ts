/**
 * Builds the render specs for the animation-style demo ("What if the Moon disappeared?").
 * Scene boundaries come from Kokoro's sentence timings; in-scene beats come from word timings.
 *
 *   npx tsx src/demo/build-moon-spec.ts [voice]
 */
import type { Caption } from "@remotion/captions";
import { readFileSync, writeFileSync } from "node:fs";
import { BRAND } from "../brand";
import type { ThemeId, VideoSpec } from "../video/types";

const voice = process.argv[2] ?? BRAND.voice.id;
const dir = "public/generated/moon";
const narration = JSON.parse(readFileSync(`${dir}/voice_${voice}.json`, "utf8")) as {
  durationMs: number;
  sentences: { text: string; startMs: number; endMs: number }[];
};
const captions = JSON.parse(readFileSync(`${dir}/captions_${voice}.json`, "utf8")) as Caption[];

const wordAt = (word: string): number => {
  const c = captions.find((x) => x.text.trim().toLowerCase().replace(/[^a-z']/g, "") === word);
  if (!c) throw new Error(`word not found in captions: ${word}`);
  return c.startMs;
};

const s = narration.sentences;
const scenes = [
  { kind: "moon-vanish", startMs: 0, endMs: s[1].startMs, props: { vanishAtMs: wordAt("disappeared") } },
  { kind: "dark-night", startMs: s[1].startMs, endMs: s[2].startMs },
  {
    kind: "tides",
    startMs: s[2].startMs,
    endMs: s[3].startMs,
    props: { shrinkAtMs: wordAt("shrink") - s[2].startMs, thirdAtMs: wordAt("third") - s[2].startMs },
  },
  {
    kind: "tilt-wobble",
    startMs: s[3].startMs,
    endMs: narration.durationMs,
    props: { wobbleAtMs: wordAt("wobble") - s[3].startMs, scrambleAtMs: wordAt("scrambling") - s[3].startMs },
  },
];

for (const theme of ["neon", "paper", "chalk"] as ThemeId[]) {
  const spec: VideoSpec = {
    id: `moon-${theme}`,
    theme,
    series: theme === "chalk" ? "What if...?" : "WHAT IF?",
    audio: `generated/moon/voice_${voice}.wav`,
    durationMs: narration.durationMs,
    captions,
    scenes,
  };
  writeFileSync(`${dir}/spec-${theme}.json`, JSON.stringify({ spec }, null, 2));
  console.log(`wrote ${dir}/spec-${theme}.json`);
}
