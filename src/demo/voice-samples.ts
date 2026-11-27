import { execFileSync } from "node:child_process";
import { synthesize } from "../voice/kokoro";
const out = "public/generated/voice-samples";
const text =
  "What if you jumped into a hole that went straight through the Earth? You'd fall for thirty-eight minutes! And here's the crazy part: the whole planet would be pulling on you from every side at once.";
const variants: [string, string, number][] = [
  ["A_current", "am_michael", 1.08],
  ["B_faster", "am_michael", 1.14],
  ["C_blend_puck", "am_michael:0.7+am_puck:0.3", 1.12],
  ["D_blend_fenrir", "am_michael:0.7+am_fenrir:0.3", 1.12],
];
for (const [name, voice, speed] of variants) {
  const r = await synthesize({ text, voice, speed, outPath: `${out}/${name}.wav` });
  console.log(name, (r.durationMs / 1000).toFixed(2) + "s");
}
// E: C plus a small pitch lift (+0.7 semitone, formants preserved) for brightness.
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${out}/C_blend_puck.wav`, "-af", "rubberband=pitch=1.0413:formant=preserved", `${out}/E_blend_puck_pitch.wav`]);
console.log("E done");
