/**
 * Script -> finished Short: voice, captions, storyboard, illustrations, render, loudness, QA, review notes.
 *
 *   npm run make:short -- --from out/scripts/<slug>          # a script that passed the script stage
 *   npm run make:short -- --research research/<slug>.json    # run the script stage first (from a pack)
 *   npm run make:short -- --topic "..." --series "WHAT IF?"  # run the script stage first (web research)
 *
 * Output: out/videos/<slug>/<slug>.mp4 and <slug>-review.md (plus storyboard, spec and cost logs).
 * Uploads both to the Dropbox review folder when the Dropbox app keys are set (src/publish/dropbox.ts).
 * Every step caches its result in out/videos/<slug>/, so a rerun only redoes what changed.
 */
import type { Caption } from "@remotion/captions";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ClaudeLlm } from "../agents/llm";
import { qaMarkdown, type QaReport, runQa } from "../agents/qa";
import { loadPack } from "../agents/research-pack";
import { type Script, ScriptSchema, type Series, type Spoken, SpokenSchema } from "../agents/schemas";
import { type Storyboard, StoryboardSchema, writeStoryboard } from "../agents/storyboard";
import { forgetImage, getImage, type LibraryEntry, loadLibrary } from "../assets/images";
import { BRAND } from "../brand";
import { dropboxConfigured, uploadForReview } from "../publish/dropbox";
import { alignNarration } from "../voice/align";
import { synthesize } from "../voice/kokoro";
import { renderSpec } from "./render";
import { runScriptStage } from "./script-stage";
import { buildSpec, type Narration } from "./spec";

const HISTORY = "data/history.json";
export type HistoryEntry = { id: string; title: string; series: string; date: string; templates: string[] };

export async function loadHistory(): Promise<HistoryEntry[]> {
  return existsSync(HISTORY) ? (JSON.parse(await readFile(HISTORY, "utf8")) as HistoryEntry[]) : [];
}

async function recordHistory(e: HistoryEntry) {
  const h = (await loadHistory()).filter((x) => x.id !== e.id);
  h.push(e);
  await mkdir("data", { recursive: true });
  await writeFile(HISTORY, `${JSON.stringify(h, null, 2)}\n`);
}

/** Music tracks the owner cleared (public/music). Rotates so consecutive videos differ; none means no music. */
export function pickMusic(n: number): { file: string; volume: number } | undefined {
  if (!existsSync("public/music")) return undefined;
  const tracks = readdirSync("public/music").filter((f) => /\.(mp3|wav|m4a)$/i.test(f)).sort();
  return tracks.length ? { file: `music/${tracks[n % tracks.length]}`, volume: 0.1 } : undefined;
}

const log = (l: string) => console.error(l);

export async function makeShort(llm: ClaudeLlm, script: Script, spoken: Spoken, opts: { scriptDir?: string; maxQaRounds?: number } = {}) {
  const slug = script.slug;
  const dir = join("out/videos", slug);
  const pub = join("public/generated", slug);
  await mkdir(dir, { recursive: true });
  await mkdir(pub, { recursive: true });
  await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));

  // 1. Voice + captions (cached).
  const text = script.beats.map((b) => spoken.beats.find((x) => x.id === b.id)?.spoken ?? "").join(" ");
  const wav = join(pub, "voice.wav");
  if (!existsSync(wav)) {
    log("voice: synthesizing");
    await synthesize({ text, voice: BRAND.voice.id, speed: BRAND.voice.speed, outPath: wav });
  }
  const narration = JSON.parse(await readFile(wav.replace(/\.wav$/, ".json"), "utf8")) as Narration;
  const capsPath = join(pub, "captions.json");
  if (!existsSync(capsPath)) {
    log("captions: aligning");
    await alignNarration({ audioPath: wav, text, outPath: capsPath, sentences: narration.sentences });
  }
  const captions = JSON.parse(await readFile(capsPath, "utf8")) as Caption[];

  // 2. Storyboard (cached).
  const history = await loadHistory();
  const recent = history.filter((h) => h.id !== slug).slice(-5).map((h) => h.templates);
  const sbPath = join(dir, "storyboard.json");
  let storyboard: Storyboard;
  if (existsSync(sbPath)) storyboard = StoryboardSchema.parse(JSON.parse(await readFile(sbPath, "utf8")));
  else {
    log("storyboard: writing");
    const lib = Object.values(await loadLibrary()).map((e) => ({ key: e.key, description: e.description }));
    const r = await writeStoryboard(llm, script, spoken, lib, recent);
    storyboard = r.storyboard;
    if (r.problems.length) log(`storyboard: ${r.problems.length} problem(s) left: ${r.problems.join(" | ")}`);
    await writeFile(sbPath, JSON.stringify(storyboard, null, 2));
  }

  // 3. Illustrations: library first, then fal.ai.
  const before = new Set(Object.keys(await loadLibrary()));
  const images = new Map<string, LibraryEntry | null>();
  for (const im of storyboard.images) images.set(im.key, await getImage(im, { ledger: llm.ledger, log }));
  const newImages = () => storyboard.images.filter((im) => !before.has(im.key) && images.get(im.key)).map((im) => ({ key: im.key, description: im.description, file: images.get(im.key)!.file }));

  // 4. Render + QA, redrawing illustrations QA flags (at most maxQaRounds renders).
  const out = join(dir, `${slug}.mp4`);
  const music = pickMusic(history.length);
  let qa: QaReport | null = null;
  // Up to two rounds of redraws (three renders) before a human looks at it.
  const rounds = opts.maxQaRounds ?? 3;
  for (let round = 1; round <= rounds; round++) {
    const spec = buildSpec({ id: slug, theme: BRAND.theme, script, spoken, storyboard, narration, captions, images, audio: `generated/${slug}/voice.wav`, music });
    await writeFile(join(dir, "spec.json"), JSON.stringify({ spec }, null, 2));
    log(`render: round ${round}`);
    renderSpec(spec, out);
    log("qa: reviewing");
    qa = await runQa({ llm, file: out, spec, script, storyboard, recent, newImages: newImages() });
    const redraw = qa.vision?.redrawImages ?? [];
    if (qa.pass || !redraw.length || round === rounds) break;
    for (const r of redraw) {
      const im = storyboard.images.find((x) => x.key === r.key);
      if (!im) continue;
      log(`image: redrawing ${r.key} (${r.reason})`);
      im.description = r.betterDescription;
      await forgetImage(r.key);
      before.delete(r.key);
      images.set(r.key, await getImage(im, { ledger: llm.ledger, log }));
    }
    await writeFile(sbPath, JSON.stringify(storyboard, null, 2));
  }

  // 5. Review notes, cost, history, upload.
  const scriptReview = opts.scriptDir && existsSync(join(opts.scriptDir, "review.md")) ? await readFile(join(opts.scriptDir, "review.md"), "utf8") : `# ${script.title}`;
  const cost = llm.ledger.totalUsd + (opts.scriptDir && existsSync(join(opts.scriptDir, "cost.json")) ? (JSON.parse(await readFile(join(opts.scriptDir, "cost.json"), "utf8")) as { totalUsd: number }).totalUsd : 0);
  const review = [
    scriptReview,
    ``,
    qa ? qaMarkdown(qa) : "",
    ``,
    `## Shots`,
    ...storyboard.shots.map((s, i) => `${i + 1}. ${s.template} (${s.beatId}) ${s.text ?? s.imageLabel ?? s.image ?? ""}`),
    ``,
    `**Total Claude + image cost for this video:** $${cost.toFixed(2)}`,
  ].join("\n");
  const reviewPath = join(dir, `${slug}-review.md`);
  await writeFile(reviewPath, review);
  await writeFile(join(dir, "video-cost.json"), JSON.stringify({ totalUsd: llm.ledger.totalUsd, calls: llm.ledger.calls }, null, 2));
  await recordHistory({ id: slug, title: script.title, series: script.series, date: new Date().toISOString().slice(0, 10), templates: storyboard.shots.map((s) => s.template) });
  if (dropboxConfigured()) {
    const paths = await uploadForReview([out, reviewPath]);
    log(`dropbox: uploaded ${paths.join(", ")}`);
  } else log("dropbox: app keys not set; files stay in out/videos (see src/publish/dropbox.ts)");
  return { out, review: reviewPath, qa, cost };
}

const isMain = process.argv[1]?.endsWith("make-short.ts");
if (isMain) {
  const { values } = parseArgs({
    options: { from: { type: "string" }, research: { type: "string" }, topic: { type: "string" }, series: { type: "string" }, notes: { type: "string" }, now: { type: "boolean", default: false } },
  });
  const llm = new ClaudeLlm(undefined, undefined, { batch: !values.now });
  let script: Script;
  let spoken: Spoken;
  let scriptDir: string | undefined = values.from;
  if (values.from) {
    script = ScriptSchema.parse(JSON.parse(await readFile(join(values.from, "script.json"), "utf8")));
    const sp = join(values.from, "spoken.json");
    if (!existsSync(sp)) {
      console.error(`${sp} is missing: the script has not passed the fact check yet. Fix it and run script:check first.`);
      process.exit(2);
    }
    spoken = SpokenSchema.parse(JSON.parse(await readFile(sp, "utf8")));
  } else {
    const pack = values.research ? await loadPack(values.research) : undefined;
    const topic = values.topic ?? pack?.topic;
    const series = (values.series ?? pack?.series) as Series | undefined;
    if (!topic || !series) {
      console.error("Usage: --from out/scripts/<slug> | --research <pack.json> | --topic \"...\" --series \"...\"");
      process.exit(1);
    }
    const r = await runScriptStage(llm, { brief: { topic, series, notes: values.notes } }, pack);
    if (!r.spoken) {
      console.error(`The script needs a human: ${r.problems.join("; ") || "fact check failed"}. Nothing was rendered.`);
      process.exit(2);
    }
    script = r.script;
    spoken = r.spoken;
    scriptDir = undefined;
  }
  const r = await makeShort(llm, script, spoken, { scriptDir });
  console.log(`${r.qa?.pass ? "READY FOR REVIEW" : "NEEDS HUMAN"}: ${r.out}  (${r.review}, cost $${r.cost.toFixed(2)})`);
  process.exit(r.qa?.pass ? 0 : 2);
}
