/**
 * Storyboard / Art Director agent (Opus 5.5). Turns a fact-checked script into a shot list: one template per
 * shot (src/video/scenes/templates.tsx), the words that trigger each shot's key motion, and the paper
 * cut-out images it needs. Code then times every shot from the narration audio (spec.ts).
 *
 * Variety: the agent sees the template sequences of recent videos and must not repeat them, so no two
 * uploads look templated (YouTube's 2026 inauthentic-content rules, docs/RESEARCH.md).
 */
import { z } from "zod";
import { splitSentences } from "../voice/sentences";
import type { Llm } from "./llm";
import type { Script, Spoken } from "./schemas";

export const TEMPLATES = ["title", "hero", "big-number", "compare", "scale", "list", "arrows", "progress", "fact", "count"] as const;
export const MOODS = ["night", "day", "warm", "mint", "coral", "deep", "lilac"] as const;

const ShotSchema = z.object({
  beatId: z.string().describe("The beat this shot starts in."),
  startSentence: z.number().int().describe("0-based index of the sentence within that beat's spoken text where this shot starts."),
  template: z.enum(TEMPLATES),
  mood: z.enum(MOODS).describe("Backdrop color. Vary it from shot to shot; night/deep for space, mint/coral/warm/lilac/day otherwise."),
  image: z.string().nullable().describe("Image key (kebab-case) for the main subject, from the images list. Null only for text-only shots."),
  image2: z.string().nullable().describe("Second image key: compare (right side) and scale (the small subject). Else null."),
  imageLabel: z.string().nullable().describe("2-4 word label for the main image (compare/scale cards). Else null."),
  image2Label: z.string().nullable(),
  text: z.string().nullable().describe("title: the hook question. fact: the fact (max 12 words). hero: the label card (max 7 words). big-number: the unit line (max 6 words). count: the label. Else null."),
  number: z
    .object({ value: z.number(), decimals: z.number().int(), prefix: z.string(), suffix: z.string() })
    .nullable()
    .describe('big-number only: the value the counter runs up to, e.g. {value: 17000, decimals: 0, prefix: "", suffix: " mph"}.'),
  items: z.array(z.object({ text: z.string(), cueWord: z.string() })).describe("list only: 2-4 cards of max 6 words, each with the spoken word that drops it in. Else []."),
  arrowLabels: z.array(z.string()).describe("arrows only: 2-4 one or two word labels. Else []."),
  direction: z.enum(["in", "out"]).nullable().describe("arrows only."),
  fromLabel: z.string().nullable().describe("progress only: start label."),
  toLabel: z.string().nullable().describe("progress only: end label."),
  ratio: z.string().nullable().describe("scale only: the ratio card, e.g. '109 Earths across'. progress: the value card. Else null."),
  shown: z.number().int().nullable().describe("count only: how many copies to draw (4-48)."),
  layout: z.enum(["side", "stacked"]).nullable().describe("compare only: side by side or stacked."),
  cueWord: z.string().nullable().describe("A word spoken in this shot (exactly as in the spoken text) that triggers its key motion: the card, the counter, the second image, the arrows."),
  cueWord2: z.string().nullable().describe("scale: when the ratio card appears; progress: when the subject arrives. Else null."),
});

export const StoryboardSchema = z.object({
  shots: z.array(ShotSchema),
  images: z.array(
    z.object({
      key: z.string().describe("kebab-case, reusable name, e.g. 'tardigrade', 'human-spine', 'grain-of-rice'. Reuse a library key when it fits."),
      description: z.string().describe("What to draw, by shape, color and parts only (see rules)."),
    }),
  ),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type Shot = Storyboard["shots"][number];

export const STORYBOARD_SYSTEM = `You are the art director for Wonderscraps, a paper-cutout curiosity-science channel (YouTube Shorts / TikTok, 1080x1920). You turn a narration script into a shot list built from fixed templates. Every illustration is a paper cut-out generated from your description.

Templates (pick by what the narration is saying at that moment):
- title: the hook question on a big card with the subject above. Use for the first shot.
- hero: one big subject with a short label card. Introductions, "meet X".
- big-number: a counter that runs up to one striking number, with a unit line and optional icon.
- compare: two subjects side by side (or stacked) with labels; the second arrives on the cue word.
- scale: a tiny subject next to a huge one, then a ratio card. Size comparisons.
- list: 2-4 short cards dropping in one by one. Steps, reasons, ingredients.
- arrows: a subject with arrows pointing in (forces, pressure, pull) or out (heat, light, outputs).
- progress: a subject moving along a track from one label to another. Change over time or distance.
- fact: one short statement on a card with a small subject. A surprising fact.
- count: many copies of a subject in a grid. "How many", piles, funny units.

Rules:
- One shot every 2-6 seconds of narration: about 8-14 shots for a 45-second Short. Every beat gets at least one shot. Shots are in narration order and the first shot starts at the first sentence of the first beat.
- Use at least 5 different templates. Never the same template twice in a row. Do not repeat the template sequence of a recent video (listed in the request).
- On-screen text supports the narration; it never just repeats a whole sentence. Short and readable: cards hold at most 12 words, labels 2-4.
- Numbers on screen must match the narration and the claims exactly (convert spelled-out words back to digits).
- Cue words must appear in the spoken text of that shot, spelled exactly as written there (the spoken text spells numbers out, so a cue is e.g. "thirty-eight", not "38").
- The last shot should echo the first (same subject) so the loop back to the hook feels seamless.

Image descriptions (they go straight to an image model, which takes words literally):
- Describe the subject by its visible shape, parts, colors and pose. Never use nicknames or metaphors that name another thing: say "a chubby segmented sausage-shaped body with eight stubby clawed legs", not "water bear".
- One subject per image, no background scene, no text, numbers or labels in the image.
- Accurate anatomy and science: the right number of legs, the right shape, the right colors.
- Branded things are generic stand-ins: "a sleek red sports car", never a brand or logo; "a blocky green pixel-art monster", never a game character.
- Keep keys generic and reusable ("human-heart", "grain-of-rice") and reuse a library key whenever its description fits, to save money.
- Nothing scary or gory; calm and friendly.`;

export function storyboardPrompt(script: Script, spoken: Spoken, library: { key: string; description: string }[], recent: string[][]): string {
  const said = new Map(spoken.beats.map((b) => [b.id, b.spoken]));
  return [
    `Title: ${script.title}`,
    `Series: ${script.series}`,
    ``,
    `## Beats (spoken text, sentences numbered from 0)`,
    ...script.beats.map((b) => {
      const sentences = splitSentences(said.get(b.id) ?? b.narration);
      return `${b.id} (${b.role}), the writer's visual idea: ${b.visual}\n${sentences.map((s, i) => `  [${i}] ${s}`).join("\n")}`;
    }),
    ``,
    `## Claims (numbers on screen must match)`,
    ...script.claims.map((c) => `- ${c.claim}`),
    ``,
    `## Image library (reuse these keys when they fit)`,
    library.length ? library.map((l) => `- ${l.key}: ${l.description}`).join("\n") : "(empty)",
    ``,
    `## Template sequences of recent videos (do not repeat)`,
    recent.length ? recent.map((r) => `- ${r.join(" > ")}`).join("\n") : "(none yet)",
  ].join("\n");
}

export async function writeStoryboard(
  llm: Llm,
  script: Script,
  spoken: Spoken,
  library: { key: string; description: string }[],
  recent: string[][] = [],
): Promise<{ storyboard: Storyboard; problems: string[] }> {
  let storyboard = await llm.structured({
    step: "storyboard",
    model: "opus",
    effort: "high",
    system: STORYBOARD_SYSTEM,
    user: storyboardPrompt(script, spoken, library, recent),
    schema: StoryboardSchema,
    maxTokens: 32000,
  });
  let problems = checkStoryboard(storyboard, script, spoken);
  if (problems.length) {
    storyboard = await llm.structured({
      step: "storyboard-fix",
      model: "opus",
      effort: "high",
      system: STORYBOARD_SYSTEM,
      user: `${storyboardPrompt(script, spoken, library, recent)}\n\n## Your previous storyboard\n${JSON.stringify(storyboard)}\n\n## Fix these problems and return the whole storyboard\n${problems.map((p) => `- ${p}`).join("\n")}`,
      schema: StoryboardSchema,
      maxTokens: 32000,
    });
    problems = checkStoryboard(storyboard, script, spoken);
  }
  return { storyboard, problems };
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9'-]/g, "");

/** Code checks on the shot list. */
export function checkStoryboard(sb: Storyboard, script: Script, spoken: Spoken): string[] {
  const p: string[] = [];
  const said = new Map(spoken.beats.map((b) => [b.id, b.spoken]));
  const beatIds = script.beats.map((b) => b.id);
  const imageKeys = new Set(sb.images.map((i) => i.key));
  if (sb.shots.length < 6) p.push(`Only ${sb.shots.length} shots; use about 8-14.`);
  const distinct = new Set(sb.shots.map((s) => s.template)).size;
  if (distinct < 5) p.push(`Only ${distinct} different templates; use at least 5.`);
  let last = -1;
  sb.shots.forEach((s, i) => {
    const bi = beatIds.indexOf(s.beatId);
    if (bi < 0) p.push(`Shot ${i + 1} names unknown beat ${s.beatId}.`);
    const sentences = splitSentences(said.get(s.beatId) ?? "");
    if (s.startSentence < 0 || s.startSentence >= sentences.length) p.push(`Shot ${i + 1}: beat ${s.beatId} has no sentence ${s.startSentence}.`);
    const pos = bi * 1000 + s.startSentence;
    if (pos < last) p.push(`Shot ${i + 1} starts before the shot above it; keep narration order.`);
    if (pos === last) p.push(`Shot ${i + 1} starts at the same sentence as the shot above it; merge them or move one.`);
    last = pos;
    if (i > 0 && sb.shots[i - 1].template === s.template) p.push(`Shots ${i} and ${i + 1} both use ${s.template}; never repeat a template back to back.`);
    for (const k of [s.image, s.image2]) if (k && !imageKeys.has(k)) p.push(`Shot ${i + 1} uses image "${k}" that is not in the images list.`);
    if (s.template === "big-number" && !s.number) p.push(`Shot ${i + 1} is big-number without a number.`);
    if (s.template === "list" && (s.items.length < 2 || s.items.length > 4)) p.push(`Shot ${i + 1} is a list with ${s.items.length} items; use 2-4.`);
    if ((s.template === "compare" || s.template === "scale") && (!s.image || !s.image2)) p.push(`Shot ${i + 1} (${s.template}) needs image and image2.`);
  });
  const first = sb.shots[0];
  if (first && (first.beatId !== beatIds[0] || first.startSentence !== 0)) p.push("The first shot must start at sentence 0 of the first beat.");
  for (const b of beatIds) if (!sb.shots.some((s) => s.beatId === b)) p.push(`Beat ${b} has no shot.`);
  // Cue words must be spoken somewhere in the narration.
  const words = new Set(spoken.beats.flatMap((b) => b.spoken.split(/\s+/).map(norm)));
  sb.shots.forEach((s, i) => {
    for (const c of [s.cueWord, s.cueWord2, ...s.items.map((x) => x.cueWord)]) {
      if (c && !words.has(norm(c.split(/\s+/)[0]))) p.push(`Shot ${i + 1}: cue word "${c}" is not in the spoken text.`);
    }
  });
  return p;
}
