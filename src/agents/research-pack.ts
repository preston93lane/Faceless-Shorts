/**
 * Research packs: facts researched ahead of time (for example in a separate Claude session on the owner's
 * subscription), saved as JSON in research/<slug>.json. With a pack, the Script Writer works from verified
 * facts and the Fact Checker judges claims against the pack without web search. Claims the pack does not
 * cover still get normal web research.
 *
 * Trust rules (code, not the model):
 *   - A pack source counts only if its site is on the reputable list AND the URL loads (checked at run time).
 *     This replaces the "web search actually returned it" rule, which cannot apply to research done elsewhere.
 *   - The checking model cites fact ids, never URLs; code attaches each fact's verified sources.
 *   - "supported" still needs 2 sources from different sites.
 *
 *   npm run research:validate -- research/<slug>.json    # schema + source check, no Claude calls
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import type { Llm } from "./llm";
import { type Script, VERDICTS } from "./schemas";
import { hostOf, isReputable, normalizeUrl } from "./sources";

export const PackSourceSchema = z.object({
  url: z.string(),
  publisher: z.string(),
  supports: z.string().describe("What this page says that backs the fact, ideally a short quote."),
});

export const ResearchPackSchema = z.object({
  topic: z.string(),
  series: z.string().optional(),
  researchedOn: z.string().describe("YYYY-MM-DD"),
  facts: z
    .array(
      z.object({
        id: z.string().describe('"f1", "f2", ...'),
        fact: z.string().describe("Precise, checkable statement, including any simplifying assumption."),
        sayItLike: z.string().optional().describe("A plain, accurate way to say it out loud."),
        caveats: z.string().optional(),
        sources: z.array(PackSourceSchema).min(1),
      }),
    )
    .min(1),
  avoid: z.array(z.string()).optional().describe("Misconceptions or wordings that are wrong or misleading."),
  notes: z.string().optional(),
});
export type ResearchPack = z.infer<typeof ResearchPackSchema>;
export type PackSource = z.infer<typeof PackSourceSchema>;

export type SourceCheck = PackSource & { ok: boolean; reason?: string };
/** A pack whose sources code has checked. Only `ok` sources are ever attached to a verdict. */
export type VerifiedPack = ResearchPack & {
  checked: Map<string, SourceCheck[]>;
  /** No link could be loaded at all: the network is blocked here, so nothing in the pack is usable. */
  offline: boolean;
};

/** Fetches a URL and says whether the page exists. Injected in tests. */
export type UrlProbe = (url: string) => Promise<{ status: number } | { error: string }>;

export const fetchProbe: UrlProbe = async (url) => {
  const get = (method: "HEAD" | "GET") =>
    fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Mozilla/5.0 (fact-check link checker)" } });
  try {
    let res = await get("HEAD");
    // Some servers reject HEAD; ask again with GET before deciding.
    if (res.status === 405 || res.status === 403 || res.status >= 500) res = await get("GET");
    await res.body?.cancel();
    return { status: res.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * A page "exists" if it loads, or if the site refuses automated readers (401/403/429), which publishers
 * such as journals often do. A made-up URL shows up as 404/410, a dead host, or a malformed URL.
 */
export function judgeProbe(r: Awaited<ReturnType<UrlProbe>>): { ok: boolean; reason?: string } {
  if ("error" in r) return { ok: false, reason: `could not load (${r.error})` };
  if (r.status < 400 || r.status === 401 || r.status === 403 || r.status === 429) return { ok: true };
  return { ok: false, reason: `HTTP ${r.status}` };
}

export async function verifyPack(pack: ResearchPack, probe: UrlProbe = fetchProbe): Promise<VerifiedPack> {
  const cache = new Map<string, Promise<{ ok: boolean; reason?: string }>>();
  const check = (s: PackSource) => {
    if (!hostOf(s.url)) return Promise.resolve({ ok: false, reason: "not a valid URL" });
    if (!isReputable(s.url)) return Promise.resolve({ ok: false, reason: "site is not on the reputable list" });
    const key = normalizeUrl(s.url);
    if (!cache.has(key)) cache.set(key, probe(s.url).then(judgeProbe));
    return cache.get(key) as Promise<{ ok: boolean; reason?: string }>;
  };
  const checked = new Map<string, SourceCheck[]>();
  await Promise.all(
    pack.facts.map(async (f) => checked.set(f.id, await Promise.all(f.sources.map(async (s) => ({ ...s, ...(await check(s)) }))))),
  );
  const probed = [...checked.values()].flat().filter((s) => isReputable(s.url));
  const offline = probed.length > 0 && probed.every((s) => !s.ok && s.reason?.startsWith("could not load"));
  return { ...pack, checked, offline };
}

/** Facts that have at least 2 working reputable sources on different sites. */
export function usableFacts(pack: VerifiedPack): ResearchPack["facts"] {
  return pack.facts.filter((f) => distinctHosts(pack.checked.get(f.id) ?? []) >= 2);
}

function distinctHosts(sources: SourceCheck[]): number {
  return new Set(sources.filter((s) => s.ok).map((s) => normalizeUrl(s.url).split("/")[0])).size;
}

/** Problems a human should fix in the pack. Facts with fewer than 2 good sources are not used. */
export function packProblems(pack: VerifiedPack): string[] {
  if (pack.offline)
    return [
      "No source link could be loaded, so this machine probably can't reach the web (a restricted network). " +
        "Links are not checked here, so no pack fact is used and every claim gets web research instead. " +
        "Run on a machine with open internet (your computer or GitHub Actions) to use the pack.",
    ];
  const p: string[] = [];
  const ids = new Set<string>();
  for (const f of pack.facts) {
    if (ids.has(f.id)) p.push(`Fact id ${f.id} is used twice.`);
    ids.add(f.id);
    for (const s of pack.checked.get(f.id) ?? []) if (!s.ok) p.push(`${f.id}: source ${s.url} rejected: ${s.reason}.`);
    const n = distinctHosts(pack.checked.get(f.id) ?? []);
    if (n < 2) p.push(`${f.id} has ${n} usable source site(s); it needs 2, so the pipeline will not use it.`);
  }
  return p;
}

/** The pack as Script Writer notes: only usable facts, plus what to avoid. */
export function packForWriter(pack: VerifiedPack): string {
  const facts = usableFacts(pack).map((f) => `- ${f.fact}${f.sayItLike ? ` (say it like: "${f.sayItLike}")` : ""}${f.caveats ? ` Caveat: ${f.caveats}` : ""}`);
  return [
    `Verified facts for this topic. Build the script from these; any fact not on this list will be web-checked and may be cut.`,
    ...facts,
    pack.avoid?.length ? `Do not say: ${pack.avoid.join("; ")}` : "",
    pack.notes ? `Researcher notes: ${pack.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Checking claims against the pack (no web search)
// ---------------------------------------------------------------------------

export const PackCheckSchema = z.object({
  claims: z.array(
    z.object({
      claimId: z.string(),
      coverage: z.enum(["covered", "not_covered"]).describe('"covered" if the pack facts settle this claim either way.'),
      verdict: z.enum(VERDICTS).describe('Only meaningful when covered; use "unsupported" when not covered.'),
      factIds: z.array(z.string()).describe("Ids of the pack facts that settle this claim."),
      explanation: z.string(),
      suggestedRewrite: z.string().nullable(),
    }),
  ),
  notes: z.string(),
});
export type PackCheck = z.infer<typeof PackCheckSchema>;

export const PACK_CHECK_SYSTEM = `You are the fact checker for Wonderscraps, a curiosity-science channel. You check script claims against a pack of pre-verified facts. You have no web access; judge only from the pack.

For each claim:
- "covered" means the pack's facts are enough to judge the claim AS WORDED, including its numbers and simplifications. If the claim adds a number, detail or comparison the pack does not state, it is "not_covered" (it will be researched separately). Do not use your own knowledge to fill gaps.
- If covered, give a verdict: "supported" (the facts back it and the wording is fair), "needs_rewrite" (the core is right but a number, word or missing caveat makes it wrong or misleading; give the corrected narration line), "unsupported" (the facts contradict it).
- Also judge the narration around the claim: a true fact framed misleadingly is "needs_rewrite". Respect the pack's "do not say" list.
- List the ids of the facts you relied on. Never invent fact ids.`;

export function packForChecker(pack: VerifiedPack): string {
  return [
    ...usableFacts(pack).map((f) => `${f.id}: ${f.fact}${f.caveats ? ` (Caveat: ${f.caveats})` : ""}`),
    pack.avoid?.length ? `\nDo not say: ${pack.avoid.join("; ")}` : "",
  ].join("\n");
}

export async function checkAgainstPack(llm: Llm, script: Script, claimsText: string, pack: VerifiedPack): Promise<PackCheck> {
  return llm.structured({
    step: "fact-check-pack",
    model: "opus",
    effort: "high",
    system: PACK_CHECK_SYSTEM,
    user: [
      `Script title: ${script.title}`,
      `Full narration: ${script.beats.map((b) => b.narration).join(" ")}`,
      `TikTok bonus narration: ${script.tiktokBonus.narration}`,
      ``,
      `## Pack facts`,
      packForChecker(pack),
      ``,
      `## Claims to check`,
      claimsText,
    ].join("\n"),
    schema: PackCheckSchema,
  });
}

/** The working sources behind the facts a verdict cites, one per site. Fact ids the model made up add nothing. */
export function sourcesForFacts(pack: VerifiedPack, factIds: string[]): PackSource[] {
  const usable = new Set(usableFacts(pack).map((f) => f.id));
  const seen = new Set<string>();
  const out: PackSource[] = [];
  for (const id of factIds) {
    if (!usable.has(id)) continue;
    for (const s of pack.checked.get(id) ?? []) {
      const host = normalizeUrl(s.url).split("/")[0];
      if (!s.ok || seen.has(host)) continue;
      seen.add(host);
      out.push({ url: s.url, publisher: s.publisher, supports: s.supports });
    }
  }
  return out;
}

export async function loadPack(path: string, probe?: UrlProbe): Promise<VerifiedPack> {
  return verifyPack(ResearchPackSchema.parse(JSON.parse(await readFile(path, "utf8"))), probe);
}

const isMain = process.argv[1]?.endsWith("research-pack.ts");
if (isMain) {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (!positionals[0]) {
    console.error("Usage: npm run research:validate -- research/<slug>.json");
    process.exit(1);
  }
  const pack = await loadPack(positionals[0]);
  const problems = packProblems(pack);
  console.log(`${pack.topic}: ${usableFacts(pack).length} of ${pack.facts.length} facts usable.`);
  for (const p of problems) console.log(`- ${p}`);
  process.exit(problems.length ? 2 : 0);
}
