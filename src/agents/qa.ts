/**
 * QA Reviewer. Three layers, cheapest first:
 *   1. Technical checks in code (ffprobe/ffmpeg): size, frame rate, duration, audio, loudness, black frames,
 *      timing of shots and captions.
 *   2. Variety: the shot-template sequence against recent uploads (the "templated content" risk).
 *   3. Claude vision (Opus 5.5): one frame per shot plus every new illustration, checked against the
 *      narration for accuracy, readability, overlaps, made-for-kids signals and anything off-brand.
 * A failed review names the illustrations to redraw; the orchestrator redraws them and renders again.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { measureLoudness } from "../pipeline/render";
import type { VideoSpec } from "../video/types";
import type { Llm } from "./llm";
import type { Script } from "./schemas";
import type { Storyboard } from "./storyboard";

export const SHORT_LIMITS = { minS: 20, maxS: 60 };

export type Check = { name: string; ok: boolean; severity: "fail" | "warn"; detail: string };

export type Probe = { width: number; height: number; fps: number; durationS: number; hasAudio: boolean };

export function probe(file: string): Probe {
  const out = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }),
  ) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[]; format: { duration: string } };
  const v = out.streams.find((s) => s.codec_type === "video");
  const [n, d] = (v?.r_frame_rate ?? "0/1").split("/").map(Number);
  return { width: v?.width ?? 0, height: v?.height ?? 0, fps: d ? n / d : 0, durationS: Number(out.format.duration), hasAudio: out.streams.some((s) => s.codec_type === "audio") };
}

/** Black stretches longer than half a second (a missing scene renders black). */
export function blackSegments(file: string): { startS: number; endS: number }[] {
  const out = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vf", "blackdetect=d=0.5:pic_th=0.95", "-an", "-f", "null", "-"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return parseBlack(out);
}

export function parseBlack(text: string): { startS: number; endS: number }[] {
  return [...text.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => ({ startS: Number(m[1]), endS: Number(m[2]) }));
}

/** Code checks on the rendered file and its spec. */
export function technicalChecks(p: Probe, spec: VideoSpec, loudness: number | null, black: { startS: number; endS: number }[]): Check[] {
  const c: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, severity: "fail" | "warn" = "fail") => c.push({ name, ok, severity, detail });
  add("resolution", p.width === 1080 && p.height === 1920, `${p.width}x${p.height}`);
  add("frame rate", Math.abs(p.fps - 30) < 0.5, `${p.fps.toFixed(2)} fps`);
  add("duration", p.durationS >= SHORT_LIMITS.minS && p.durationS <= SHORT_LIMITS.maxS, `${p.durationS.toFixed(1)} s (Short limit ${SHORT_LIMITS.minS}-${SHORT_LIMITS.maxS} s)`);
  add("audio", p.hasAudio, p.hasAudio ? "present" : "no audio stream");
  if (loudness !== null) add("loudness", Math.abs(loudness + 14) <= 1, `${loudness.toFixed(1)} LUFS (target -14)`);
  add("black frames", black.length === 0, black.length ? black.map((b) => `${b.startS.toFixed(1)}-${b.endS.toFixed(1)} s`).join(", ") : "none");
  const short = spec.scenes.filter((s) => s.endMs - s.startMs < 1200);
  add("shot length", short.length === 0, short.length ? `${short.length} shot(s) under 1.2 s` : "all shots 1.2 s or longer", "warn");
  const long = spec.scenes.filter((s) => s.endMs - s.startMs > 8000);
  add("shot pacing", long.length === 0, long.length ? `${long.length} shot(s) over 8 s` : "no shot over 8 s", "warn");
  const lastCaption = spec.captions.at(-1)?.endMs ?? 0;
  add("captions in time", lastCaption <= spec.durationMs + 300, `last caption ends at ${(lastCaption / 1000).toFixed(1)} s of ${(spec.durationMs / 1000).toFixed(1)} s`);
  const ordered = spec.captions.every((x, i) => i === 0 || x.startMs >= spec.captions[i - 1].startMs);
  add("caption order", ordered, ordered ? "monotonic" : "captions out of order");
  return c;
}

/** How alike two template sequences are (share of positions with the same template). */
export function sequenceSimilarity(a: string[], b: string[]): number {
  const n = Math.max(a.length, b.length);
  if (!n) return 0;
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
  return same / n;
}

export function varietyCheck(seq: string[], recent: string[][]): Check {
  const worst = recent.reduce((m, r) => Math.max(m, sequenceSimilarity(seq, r)), 0);
  return { name: "variety vs recent uploads", ok: worst < 0.6, severity: "warn", detail: `closest recent video shares ${(worst * 100).toFixed(0)}% of shot positions` };
}

// ---------------------------------------------------------------------------
// Vision review
// ---------------------------------------------------------------------------

export const VisionReviewSchema = z.object({
  shots: z.array(
    z.object({
      shot: z.number().int().describe("1-based shot number."),
      ok: z.boolean(),
      issues: z.array(z.string()).describe("Concrete problems: wrong or inaccurate illustration, unreadable or overlapping text, a number that disagrees with the narration, something off-brand or unsafe."),
    }),
  ),
  redrawImages: z.array(z.object({ key: z.string(), reason: z.string(), betterDescription: z.string() })).describe("Illustrations that are wrong or misleading and must be redrawn, with a corrected description (shape, parts, colors; no nicknames)."),
  policy: z.object({
    madeForKidsRisk: z.boolean().describe("True if anything targets young children (nursery style, toddler characters, 'for kids' wording)."),
    misleading: z.boolean().describe("True if the title or visuals promise something the video does not deliver, or show false science."),
    unsafe: z.boolean().describe("Gore, fear-bait, dangerous imitation, or real brand logos / game characters."),
    notes: z.string(),
  }),
  pass: z.boolean().describe("True only if there are no blocking problems."),
  summary: z.string(),
});
export type VisionReview = z.infer<typeof VisionReviewSchema>;

const VISION_SYSTEM = `You are the QA reviewer for Wonderscraps, a paper-cutout curiosity-science channel for a general audience (never "made for kids"). You see one frame from each shot of a vertical Short (captions are burned in near the middle-bottom), then the new illustrations on their own.

Check each shot against the narration it plays under:
- Science: illustrations must be accurate (right shape, number of legs, colors, proportions where they matter). A cute style is fine; wrong anatomy or wrong objects are not.
- Numbers and text on screen must match the narration and be readable; nothing cut off, overlapping the caption card or the series badge.
- Brand: calm paper-cutout style, no real logos or game characters, nothing gory or scary.
- Policy: no signals that the video targets young children; no misleading title or visuals.
Minor taste issues are not blocking. Block (pass=false) for wrong science, unreadable or wrong numbers, broken layout, or any policy problem. Ask to redraw an illustration only when it is wrong or misleading, and give a corrected description.`;

export async function visionReview(
  llm: Llm,
  script: Script,
  storyboard: Storyboard,
  frames: { shot: number; jpeg: Buffer; narration: string }[],
  newImages: { key: string; description: string; png: Buffer }[],
): Promise<VisionReview> {
  const images = [
    ...frames.map((f) => ({ mediaType: "image/jpeg" as const, data: f.jpeg.toString("base64"), caption: `Shot ${f.shot} (${storyboard.shots[f.shot - 1]?.template}). Narration: "${f.narration}"` })),
    ...newImages.map((im) => ({ mediaType: "image/png" as const, data: im.png.toString("base64"), caption: `New illustration "${im.key}", meant to show: ${im.description}` })),
  ];
  return llm.structured({
    step: "qa-vision",
    model: "opus",
    effort: "high",
    system: VISION_SYSTEM,
    user: [`Title: ${script.title}`, `Series: ${script.series}`, `Description: ${script.description}`, `Review the ${frames.length} shot frames and ${newImages.length} illustrations above.`].join("\n"),
    images,
    schema: VisionReviewSchema,
  });
}

/** One frame per shot, 75% of the way through it (after its cue motion), scaled to 540 px wide. */
export function extractFrames(file: string, spec: VideoSpec): { shot: number; jpeg: Buffer; atMs: number }[] {
  return spec.scenes.map((s, i) => {
    const atMs = s.startMs + (s.endMs - s.startMs) * 0.75;
    const jpeg = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", (atMs / 1000).toFixed(3), "-i", file, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", "-f", "image2", "-c:v", "mjpeg", "-"], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return { shot: i + 1, jpeg, atMs };
  });
}

export type QaReport = { pass: boolean; checks: Check[]; vision: VisionReview | null };

export async function runQa(opts: {
  llm: Llm | null;
  file: string;
  spec: VideoSpec;
  script: Script;
  storyboard: Storyboard;
  recent: string[][];
  newImages: { key: string; description: string; file: string }[];
}): Promise<QaReport> {
  const p = probe(opts.file);
  let lufs: number | null = null;
  try {
    lufs = Number(measureLoudness(opts.file).input_i);
  } catch {
    lufs = null;
  }
  const checks = [...technicalChecks(p, opts.spec, lufs, blackSegments(opts.file)), varietyCheck(opts.storyboard.shots.map((s) => s.template), opts.recent)];
  let vision: VisionReview | null = null;
  if (opts.llm) {
    const frames = extractFrames(opts.file, opts.spec).map((f) => ({
      ...f,
      narration: opts.spec.captions.filter((c) => c.startMs >= opts.spec.scenes[f.shot - 1].startMs && c.startMs < opts.spec.scenes[f.shot - 1].endMs).map((c) => c.text.trim()).join(" "),
    }));
    const newImages = await Promise.all(opts.newImages.map(async (im) => ({ key: im.key, description: im.description, png: await readFile(`public/${im.file}`) })));
    vision = await visionReview(opts.llm, opts.script, opts.storyboard, frames, newImages);
  }
  const pass = checks.every((c) => c.ok || c.severity === "warn") && (vision?.pass ?? true) && !vision?.policy.madeForKidsRisk && !vision?.policy.unsafe && !vision?.policy.misleading;
  return { pass, checks, vision };
}

export function qaMarkdown(r: QaReport): string {
  const lines = [`## QA: ${r.pass ? "PASS" : "NEEDS HUMAN"}`, ``, `| Check | Result | Detail |`, `|---|---|---|`];
  for (const c of r.checks) lines.push(`| ${c.name} | ${c.ok ? "✅" : c.severity === "warn" ? "⚠️" : "❌"} | ${c.detail} |`);
  if (r.vision) {
    lines.push(``, `**Vision review:** ${r.vision.summary}`);
    const bad = r.vision.shots.filter((s) => !s.ok || s.issues.length);
    for (const s of bad) lines.push(`- Shot ${s.shot}: ${s.issues.join("; ")}`);
    for (const im of r.vision.redrawImages) lines.push(`- Redraw **${im.key}**: ${im.reason}`);
    const pol = r.vision.policy;
    lines.push(`- Policy: made-for-kids risk ${pol.madeForKidsRisk ? "YES" : "no"}, misleading ${pol.misleading ? "YES" : "no"}, unsafe ${pol.unsafe ? "YES" : "no"}${pol.notes ? `. ${pol.notes}` : ""}`);
  }
  return lines.join("\n");
}
