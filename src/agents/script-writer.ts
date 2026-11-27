/**
 * Script Writer agent (Opus 5.5). Writes a hook-first Short script plus its TikTok bonus,
 * title, description, tags and a claims list for the Fact Checker. Can also revise a script
 * from fact-check results and code-validation notes.
 */
import type { Llm } from "./llm";
import { type Script, ScriptSchema, type Series, validateScript } from "./schemas";
import { WRITING_GUIDE } from "./style-guide";

export type ScriptBrief = {
  topic: string;
  series: Series;
  /** Optional angle or must-include facts from the Idea Ranker or the owner. */
  notes?: string;
};

export async function writeScript(llm: Llm, brief: ScriptBrief): Promise<Script> {
  const user = [
    `Write a Wonderscraps Short.`,
    `Topic: ${brief.topic}`,
    `Series badge: ${brief.series}`,
    brief.notes ? `Notes from the producer: ${brief.notes}` : "",
    `Return the script in the required JSON format.`,
  ]
    .filter(Boolean)
    .join("\n");
  return llm.structured({ step: "script-writer", model: "opus", effort: "high", system: WRITING_GUIDE, user, schema: ScriptSchema });
}

export async function reviseScript(llm: Llm, script: Script, feedback: string[]): Promise<Script> {
  const user = [
    `Revise this Wonderscraps script. Fix every point below; keep everything else that works (especially the hook) unless a point requires changing it.`,
    `Keep the claims list in sync with the narration.`,
    ``,
    `## Feedback`,
    ...feedback.map((f) => `- ${f}`),
    ``,
    `## Current script`,
    JSON.stringify(script, null, 2),
  ].join("\n");
  return llm.structured({ step: "script-reviser", model: "opus", effort: "high", system: WRITING_GUIDE, user, schema: ScriptSchema });
}

/** Writes a script and revises it until the code checks pass (max `rounds` revisions). */
export async function writeValidScript(llm: Llm, brief: ScriptBrief, rounds = 2): Promise<{ script: Script; problems: string[] }> {
  let script = await writeScript(llm, brief);
  let problems = validateScript(script);
  for (let i = 0; i < rounds && problems.length > 0; i++) {
    script = await reviseScript(llm, script, problems);
    problems = validateScript(script);
  }
  return { script, problems };
}
