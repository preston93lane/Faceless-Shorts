/**
 * Fact Checker agent.
 *   1. Research (Opus 5.5 + server-side web search): checks every claim, writes findings.
 *   2. Structuring (Haiku 5.5): turns the findings into FactCheck JSON. Mechanical, and checked by 3.
 *   3. Code rules: a source only counts if web search actually returned that URL and the site is
 *      on the reputable list; "supported" needs 2 such sources, otherwise it is downgraded.
 */
import type { Llm } from "./llm";
import { type FactCheck, FactCheckSchema, type Script } from "./schemas";
import { isReputable, normalizeUrl, TRUSTED_LIST_FOR_PROMPT } from "./sources";

export const MIN_SOURCES = 2;

const RESEARCH_SYSTEM = `You are the fact checker for Wonderscraps, a curiosity-science channel. A wrong fact can get the channel demonetized and misleads young viewers, so you are strict.

For each claim:
- Search the web and find at least ${MIN_SOURCES} independent reputable sources that support the claim AS WORDED, including its numbers and simplifications.
- Reputable means: ${TRUSTED_LIST_FOR_PROMPT}. Trivia sites, content farms, forums, Quora/Reddit, YouTube and Wikipedia do not count (Wikipedia can point you to real sources).
- Verdicts: "supported" (2+ reputable sources agree and the wording is fair), "needs_rewrite" (the core fact is right but a number, word or missing caveat makes it wrong or misleading; give the corrected narration line), "unsupported" (cannot be verified or is false; suggest a replacement line or cutting it).
- Also judge the narration around the claim: a true fact framed misleadingly is "needs_rewrite".

Write your findings claim by claim. For every claim give: claim id, verdict, a one or two sentence explanation, a suggested rewrite if needed, and each source as its exact URL with the publisher name and what it says. Only list URLs you actually opened or saw in search results.`;

const STRUCTURE_SYSTEM = `Convert a fact checker's written findings into the required JSON. Copy verdicts, explanations, rewrites and URLs exactly as written; do not add, drop or change any source or verdict. If the findings do not mention a claim id, give it verdict "unsupported" with explanation "Not checked".`;

export type CheckedClaim = FactCheck["claims"][number] & {
  /** Sources that passed the code rules. */
  acceptedSources: { url: string; publisher: string; supports: string }[];
  /** Why the verdict was changed by code, if it was. */
  downgradedBecause?: string;
};

export type FactCheckResult = {
  pass: boolean;
  claims: CheckedClaim[];
  notes: string;
  /** Raw research text, kept for the human reviewer. */
  research: string;
};

export function claimsForPrompt(script: Script): string {
  const beat = new Map(script.beats.map((b) => [b.id, b.narration]));
  return script.claims
    .map((c) => `${c.id}: ${c.claim}\n   Narration it appears in (${c.beatId}): "${beat.get(c.beatId) ?? ""}"`)
    .join("\n");
}

export async function factCheck(llm: Llm, script: Script): Promise<FactCheckResult> {
  const research = await llm.research({
    step: "fact-check-research",
    system: RESEARCH_SYSTEM,
    effort: "high",
    // About 3 searches per claim, capped.
    maxSearches: Math.min(30, Math.max(6, script.claims.length * 3)),
    user: [
      `Script title: ${script.title}`,
      `Full narration: ${script.beats.map((b) => b.narration).join(" ")}`,
      ``,
      `Claims to check:`,
      claimsForPrompt(script),
    ].join("\n"),
  });

  const structured = await llm.structured({
    step: "fact-check-structure",
    model: "haiku",
    effort: "low",
    system: STRUCTURE_SYSTEM,
    user: `Claim ids: ${script.claims.map((c) => c.id).join(", ")}\n\n## Findings\n${research.text}`,
    schema: FactCheckSchema,
  });

  return applyRules(script, structured, research.retrievedUrls.concat(research.citedUrls), research.text);
}

/** The code half of the fact check. Exported for tests. */
export function applyRules(script: Script, fc: FactCheck, retrievedUrls: string[], researchText: string): FactCheckResult {
  const retrieved = new Set(retrievedUrls.map(normalizeUrl));
  const byId = new Map(fc.claims.map((c) => [c.claimId, c]));

  const claims: CheckedClaim[] = script.claims.map((claim) => {
    const found = byId.get(claim.id) ?? {
      claimId: claim.id,
      verdict: "unsupported" as const,
      explanation: "The fact checker returned no verdict for this claim.",
      suggestedRewrite: null,
      sources: [],
    };
    const accepted = dedupeByHost(found.sources.filter((s) => retrieved.has(normalizeUrl(s.url)) && isReputable(s.url)));
    const out: CheckedClaim = { ...found, acceptedSources: accepted };
    if (found.verdict === "supported" && accepted.length < MIN_SOURCES) {
      out.verdict = "needs_rewrite";
      out.downgradedBecause = `Only ${accepted.length} reputable source(s) that web search actually returned; need ${MIN_SOURCES}.`;
    }
    return out;
  });

  return { pass: claims.every((c) => c.verdict === "supported"), claims, notes: fc.notes, research: researchText };
}

/** Two pages from the same site are one source, not two. */
function dedupeByHost<T extends { url: string }>(sources: T[]): T[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const host = normalizeUrl(s.url).split("/")[0];
    if (seen.has(host)) return false;
    seen.add(host);
    return true;
  });
}

/** Turns a failed check into revision notes for the Script Writer. */
export function feedbackFrom(result: FactCheckResult): string[] {
  const notes = result.claims
    .filter((c) => c.verdict !== "supported")
    .map((c) => {
      const fix = c.suggestedRewrite ? ` Suggested line: "${c.suggestedRewrite}"` : " Cut it or replace it with a verifiable fact.";
      const why = c.downgradedBecause ?? c.explanation;
      return `Claim ${c.claimId} is ${c.verdict.replace("_", " ")}: ${why}${fix}`;
    });
  if (result.notes.trim()) notes.push(`Fact checker notes: ${result.notes.trim()}`);
  return notes;
}

/** Source list for the YouTube description: one line per accepted source, deduplicated. */
export function sourcesForDescription(result: FactCheckResult): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const c of result.claims)
    for (const s of c.acceptedSources) {
      const k = normalizeUrl(s.url);
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(`- ${s.publisher}: ${s.url}`);
    }
  return lines.length ? `Sources:\n${lines.join("\n")}` : "";
}
