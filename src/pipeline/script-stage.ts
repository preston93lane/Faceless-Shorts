/**
 * Script stage of the pipeline: Script Writer -> Fact Checker -> (revise, at most 2 rounds) -> narration prep.
 * Output goes to out/scripts/<slug>/: script.json, factcheck.json, spoken.json, review.md, cost.json.
 *
 *   npm run script:new -- --topic "What if you fell through the Earth?" --series "WHAT IF?" [--notes "..."]
 *   npm run script:check -- --script scripts/pilot-01-hole-through-earth.json   # fact-check an existing script
 *   npm run script:check -- --script edited.json --prior out/scripts/<slug>       # re-check only what changed since that run
 *
 *   npm run script:new -- --research research/<slug>.json            # write from a research pack (topic and series come from it)
 *
 * Fact-check research goes through the Message Batches API (half-price tokens; each research round can
 * take from a few minutes up to 24 h). Add --now to skip batching and pay full price for an immediate answer.
 *
 * Exits with code 2 when the script still fails after the revision rounds; it then needs a human.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { factCheck, type FactCheckResult, feedbackFrom, type PriorCheck, sourcesForDescription } from "../agents/fact-checker";
import { ClaudeLlm, type Llm } from "../agents/llm";
import { prepareNarration } from "../agents/narration-prep";
import {
  estimateSeconds,
  fullNarration,
  type Script,
  ScriptSchema,
  SERIES,
  type Series,
  type Spoken,
  tiktokNarration,
  validateScript,
  wordCount,
} from "../agents/schemas";
import { loadPack, packForWriter, packProblems, usableFacts, type VerifiedPack } from "../agents/research-pack";
import { reviseScript, writeValidScript } from "../agents/script-writer";

/** Automatic revise-and-recheck rounds before a human edits the script (each round is a paid research pass). */
export const MAX_FACT_ROUNDS = 1;

export type StageResult = {
  script: Script;
  check: FactCheckResult;
  spoken: Spoken | null;
  problems: string[];
  rounds: number;
};

/** The stage logic, independent of files and the CLI so tests can drive it with a fake Llm. */
export async function runScriptStage(
  llm: Llm,
  input: { brief: { topic: string; series: Series; notes?: string } } | { script: Script },
  pack?: VerifiedPack,
  prior?: PriorCheck,
): Promise<StageResult> {
  let script: Script;
  let problems: string[];
  if ("script" in input) {
    script = input.script;
    problems = validateScript(script);
  } else {
    const notes = [input.brief.notes, pack ? packForWriter(pack) : ""].filter(Boolean).join("\n\n");
    ({ script, problems } = await writeValidScript(llm, { ...input.brief, notes: notes || undefined }));
  }

  let check = await factCheck(llm, script, { pack, prior });
  let rounds = 0;
  while ((!check.pass || problems.length) && rounds < MAX_FACT_ROUNDS) {
    rounds++;
    const prior = { script, result: check };
    script = await reviseScript(llm, script, [...feedbackFrom(check), ...problems]);
    problems = validateScript(script);
    check = await factCheck(llm, script, { prior, pack });
  }

  const spoken = check.pass && problems.length === 0 ? await prepareNarration(llm, script) : null;
  return { script, check, spoken, problems, rounds };
}

export function reviewMarkdown(r: StageResult, costUsd: number): string {
  const s = r.script;
  const shortWords = wordCount(fullNarration(s));
  const ttWords = wordCount(tiktokNarration(s));
  const icon = { supported: "✅", needs_rewrite: "✏️", unsupported: "❌" } as const;
  const lines = [
    `# ${s.title}`,
    ``,
    `**Series:** ${s.series}  ·  **Short:** ~${estimateSeconds(shortWords).toFixed(0)}s (${shortWords} words)  ·  **TikTok:** ~${estimateSeconds(ttWords).toFixed(0)}s  ·  **Fact check:** ${r.check.pass ? "PASS" : "FAIL"} after ${r.rounds} revision round(s)  ·  **Claude cost:** $${costUsd.toFixed(3)}`,
    ``,
    `## Narration`,
    ...s.beats.map((b) => `**${b.role.toUpperCase()}** (${b.id}) — ${b.narration}\n  _Card:_ ${b.onScreenText}  ·  _Visual:_ ${b.visual}`),
    ``,
    `**TIKTOK BONUS** (after ${s.tiktokBonus.afterBeatId}) — ${s.tiktokBonus.narration}`,
    ``,
    `## Claims`,
    ...r.check.claims.map((c) => {
      const claim = s.claims.find((x) => x.id === c.claimId);
      const src = c.acceptedSources.map((x) => `[${x.publisher}](${x.url})`).join(", ") || "none accepted";
      return `- ${icon[c.verdict]} **${c.claimId}**${c.reused ? " _(unchanged, verdict from an earlier round)_" : ""}${c.fromPack ? " _(checked against the research pack)_" : ""} ${claim?.claim ?? ""}\n  ${c.downgradedBecause ?? c.explanation}${c.suggestedRewrite ? `\n  Suggested: "${c.suggestedRewrite}"` : ""}\n  Sources: ${src}`;
    }),
    r.check.notes ? `\n**Checker notes:** ${r.check.notes}` : "",
    r.problems.length ? `\n## Open problems\n${r.problems.map((p) => `- ${p}`).join("\n")}` : "",
    ``,
    `## Description`,
    s.description,
    ``,
    sourcesForDescription(r.check),
    ``,
    `**Tags:** ${s.tags.join(", ")}`,
  ];
  return lines.join("\n");
}

const isMain = process.argv[1]?.endsWith("script-stage.ts");
if (isMain) {
  const { values } = parseArgs({
    options: {
      topic: { type: "string" },
      series: { type: "string" },
      notes: { type: "string" },
      script: { type: "string" },
      research: { type: "string" },
      // A previous run's folder (out/scripts/<slug>): claims that passed there and are unchanged keep their verdict.
      prior: { type: "string" },
      // Skip the Message Batches API: full price, but results right away.
      now: { type: "boolean", default: false },
    },
  });
  const llm = new ClaudeLlm(undefined, undefined, { batch: !values.now });
  let pack: VerifiedPack | undefined;
  if (values.research) {
    pack = await loadPack(values.research);
    const problems = packProblems(pack);
    console.error(`Research pack: ${usableFacts(pack).length} of ${pack.facts.length} facts usable.${problems.map((p) => `\n- ${p}`).join("")}`);
  }

  let input: Parameters<typeof runScriptStage>[1];
  if (values.script) {
    input = { script: ScriptSchema.parse(JSON.parse(await readFile(values.script, "utf8"))) };
  } else {
    // A research pack can supply the topic and series.
    const topic = values.topic ?? pack?.topic;
    const series = values.series ?? pack?.series;
    if (!topic || !SERIES.includes(series as Series)) {
      console.error(`Usage: --topic "<topic>" --series "<${SERIES.join(" | ")}>" [--notes "..."] [--research <pack.json>]  or  --script <file.json> [--research <pack.json>]`);
      process.exit(1);
    }
    input = { brief: { topic, series: series as Series, notes: values.notes } };
  }
  let prior: PriorCheck | undefined;
  if (values.prior) {
    prior = {
      script: ScriptSchema.parse(JSON.parse(await readFile(join(values.prior, "script.json"), "utf8"))),
      result: JSON.parse(await readFile(join(values.prior, "factcheck.json"), "utf8")) as FactCheckResult,
    };
  }
  const result = await runScriptStage(llm, input, pack, prior);
  const dir = join("out/scripts", result.script.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "script.json"), JSON.stringify(result.script, null, 2));
  await writeFile(join(dir, "factcheck.json"), JSON.stringify(result.check, null, 2));
  if (result.spoken) await writeFile(join(dir, "spoken.json"), JSON.stringify(result.spoken, null, 2));
  await writeFile(join(dir, "cost.json"), JSON.stringify({ totalUsd: llm.ledger.totalUsd, calls: llm.ledger.calls }, null, 2));
  await writeFile(join(dir, "review.md"), reviewMarkdown(result, llm.ledger.totalUsd));

  const ok = result.check.pass && result.problems.length === 0;
  console.log(`${ok ? "PASS" : "NEEDS HUMAN"}: ${dir}/review.md  (Claude cost $${llm.ledger.totalUsd.toFixed(3)})`);
  process.exit(ok ? 0 : 2);
}
