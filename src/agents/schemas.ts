/**
 * Data contracts between pipeline steps. The models fill these via structured outputs;
 * anything structured outputs can't express (word counts, banned words, cross-references)
 * is checked in code by `validateScript` and fed back to the writer as revision notes.
 */
import { z } from "zod";

export const SERIES = ["WHAT IF?", "HOW IT WORKS", "ANIMAL SUPERPOWERS", "YOUR AMAZING BODY", "WILD BIOLOGY", "SPACE & SCALE", "MYTH BUSTED"] as const;
export type Series = (typeof SERIES)[number];

export const BEAT_ROLES = ["hook", "surprise", "beat", "crazy", "loop"] as const;

export const BeatSchema = z.object({
  id: z.string().describe('Short id, "b1", "b2", ... in order.'),
  role: z.enum(BEAT_ROLES),
  narration: z.string().describe("Exactly what the narrator says, written for the ear. Numbers may use digits; they are spelled out later."),
  onScreenText: z.string().describe("2-4 word paper-card label for this beat (not the caption; captions are automatic)."),
  visual: z.string().describe("One sentence describing the paper-cutout picture: what is on screen and the single thing that moves."),
});

export const ClaimSchema = z.object({
  id: z.string().describe('"c1", "c2", ...'),
  beatId: z.string().describe("The beat whose narration makes this claim."),
  claim: z.string().describe("The factual statement in precise, checkable form, including any simplifying assumption."),
});

export const ScriptSchema = z.object({
  slug: z.string().describe("kebab-case id, e.g. hole-through-earth"),
  series: z.enum(SERIES),
  title: z.string().describe("YouTube title, at most 70 characters, honest, curiosity-driven."),
  beats: z.array(BeatSchema),
  tiktokBonus: z.object({
    afterBeatId: z.string().describe("Insert the bonus segment after this beat in the TikTok cut."),
    narration: z.string().describe("Extra 15-25 seconds that deepen the topic for the 61-75 s TikTok version."),
    visual: z.string(),
  }),
  claims: z.array(ClaimSchema),
  description: z.string().describe("2-3 sentence YouTube description. Sources are appended later by code."),
  tags: z.array(z.string()),
});
export type Script = z.infer<typeof ScriptSchema>;

export const VERDICTS = ["supported", "needs_rewrite", "unsupported"] as const;

export const FactCheckSchema = z.object({
  claims: z.array(
    z.object({
      claimId: z.string(),
      verdict: z.enum(VERDICTS),
      explanation: z.string().describe("Why, in one or two sentences."),
      suggestedRewrite: z.string().nullable().describe("A corrected narration line if the verdict is not 'supported', else null."),
      sources: z.array(z.object({ url: z.string(), publisher: z.string(), supports: z.string().describe("What this source says, in a few words.") })),
    }),
  ),
  notes: z.string().describe("Anything else the writer should know (misleading framing, missing caveat, tone)."),
});
export type FactCheck = z.infer<typeof FactCheckSchema>;

export const SpokenSchema = z.object({
  beats: z.array(z.object({ id: z.string(), spoken: z.string() })),
  tiktokBonus: z.string(),
});
export type Spoken = z.infer<typeof SpokenSchema>;

// ---------------------------------------------------------------------------
// Code checks
// ---------------------------------------------------------------------------

/** Narrator pace with the brand voice (Michael/Puck blend @ 1.12), measured on the full pilot read (139 words in 50.7 s, sentence pauses included). */
export const WORDS_PER_SECOND = 2.75;
export const SHORT_SECONDS = { min: 32, max: 50 } as const;
export const TIKTOK_SECONDS = { min: 61, max: 75 } as const;

/** Words that would make YouTube or parents read the channel as "made for kids". BRAND.md: never target kids. */
const KID_TARGETING = /\b(kids?|children|child|toddlers?|preschool|for boys|for girls|nursery)\b/i;

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
export const fullNarration = (s: Script) => s.beats.map((b) => b.narration.trim()).join(" ");
export const estimateSeconds = (words: number) => words / WORDS_PER_SECOND;

export function tiktokNarration(s: Script): string {
  const out: string[] = [];
  for (const b of s.beats) {
    out.push(b.narration.trim());
    if (b.id === s.tiktokBonus.afterBeatId) out.push(s.tiktokBonus.narration.trim());
  }
  return out.join(" ");
}

/** Problems a human editor would bounce the script for. Empty array = passes. */
export function validateScript(s: Script): string[] {
  const p: string[] = [];
  const ids = new Set(s.beats.map((b) => b.id));
  const roles = s.beats.map((b) => b.role);

  if (roles[0] !== "hook") p.push("The first beat must be the hook.");
  if (roles.at(-1) !== "loop") p.push("The last beat must be the loop line.");
  if (!roles.includes("crazy")) p.push('Missing the "crazy part" beat.');
  if (!roles.includes("surprise")) p.push("Missing the surprise beat right after the hook.");
  const hook = s.beats[0];
  if (hook && wordCount(hook.narration) > 16) p.push(`Hook is ${wordCount(hook.narration)} words; keep it to 16 or fewer (about 2 seconds of attention).`);

  const shortSec = estimateSeconds(wordCount(fullNarration(s)));
  if (shortSec < SHORT_SECONDS.min || shortSec > SHORT_SECONDS.max)
    p.push(`Short runs about ${shortSec.toFixed(0)}s; target ${SHORT_SECONDS.min}-${SHORT_SECONDS.max}s (${Math.round(SHORT_SECONDS.min * WORDS_PER_SECOND)}-${Math.round(SHORT_SECONDS.max * WORDS_PER_SECOND)} words).`);
  const ttSec = estimateSeconds(wordCount(tiktokNarration(s)));
  if (ttSec < TIKTOK_SECONDS.min || ttSec > TIKTOK_SECONDS.max)
    p.push(`TikTok cut runs about ${ttSec.toFixed(0)}s; it must be ${TIKTOK_SECONDS.min}-${TIKTOK_SECONDS.max}s for Creator Rewards.`);
  if (!ids.has(s.tiktokBonus.afterBeatId)) p.push(`tiktokBonus.afterBeatId "${s.tiktokBonus.afterBeatId}" is not a beat id.`);

  if (s.title.length > 70) p.push(`Title is ${s.title.length} characters; max 70.`);
  for (const b of s.beats) {
    const w = wordCount(b.onScreenText);
    if (w < 1 || w > 4) p.push(`Beat ${b.id} on-screen text has ${w} words; use 2-4.`);
  }
  const kid = [s.title, s.description, ...s.tags].find((t) => KID_TARGETING.test(t));
  if (kid) p.push(`"${kid}" targets kids; the channel is general-audience (no kid keywords in title, description or tags).`);

  if (s.claims.length === 0) p.push("No claims listed; every factual statement in the narration must be a claim.");
  for (const c of s.claims) if (!ids.has(c.beatId)) p.push(`Claim ${c.id} points at unknown beat ${c.beatId}.`);
  return p;
}
