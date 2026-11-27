/**
 * Renders a VideoSpec with Remotion, then normalizes loudness to the platform target (-14 LUFS integrated,
 * -1.5 dBTP) with ffmpeg's two-pass loudnorm. YouTube and TikTok turn louder videos down anyway; hitting the
 * target means quiet ones are not left too soft.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { VideoSpec } from "../video/types";

export const LOUDNESS = { lufs: -14, truePeak: -1.5, lra: 11 };

/** Chromium for Remotion: REMOTION_BROWSER_EXECUTABLE, else the preinstalled Playwright build when present. */
function browserEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!env.REMOTION_BROWSER_EXECUTABLE && existsSync("/opt/pw-browsers/chromium")) env.REMOTION_BROWSER_EXECUTABLE = "/opt/pw-browsers/chromium";
  return env;
}

export function renderSpec(spec: VideoSpec, outMp4: string, opts: { composition?: string } = {}): void {
  const propsPath = join(dirname(outMp4), `${spec.id}.props.json`);
  writeFileSync(propsPath, JSON.stringify({ spec }));
  const raw = outMp4.replace(/\.mp4$/, ".raw.mp4");
  execFileSync("npx", ["remotion", "render", "src/video/index.ts", opts.composition ?? "Short", raw, `--props=${propsPath}`, "--log=error"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: browserEnv(),
  });
  normalizeLoudness(raw, outMp4);
}

export type LoudnessMeasure = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };

export function measureLoudness(file: string): LoudnessMeasure {
  // ffmpeg prints the measurement on stderr.
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", `loudnorm=I=${LOUDNESS.lufs}:TP=${LOUDNESS.truePeak}:LRA=${LOUDNESS.lra}:print_format=json`, "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg loudness measurement failed: ${r.stderr.slice(-300)}`);
  return parseLoudnormJson(r.stderr);
}

export function parseLoudnormJson(text: string): LoudnessMeasure {
  const m = text.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!m) throw new Error("loudnorm printed no measurement");
  return JSON.parse(m[0]) as LoudnessMeasure;
}

/** Two-pass loudnorm on the audio; the video stream is copied untouched. */
export function normalizeLoudness(input: string, output: string): void {
  const measured = measureLoudness(input);
  const filter = `loudnorm=I=${LOUDNESS.lufs}:TP=${LOUDNESS.truePeak}:LRA=${LOUDNESS.lra}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-c:v", "copy", "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", output]);
  execFileSync("rm", ["-f", input]);
}
