import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { applyRules, claimsForPrompt, factCheck, feedbackFrom, searchBudget, sourcesForDescription } from "../src/agents/fact-checker";
import { ClaudeLlm, type Llm, type ResearchRequest, type ResearchResult, type StructuredRequest } from "../src/agents/llm";
import { checkSpoken } from "../src/agents/narration-prep";
import { type FactCheck, fullNarration, type Script, ScriptSchema, TIKTOK_BONUS_ID, tiktokNarration, validateScript } from "../src/agents/schemas";
import { judgeProbe, packForWriter, packProblems, type ResearchPack, usableFacts, verifyPack } from "../src/agents/research-pack";
import { isReputable, normalizeUrl } from "../src/agents/sources";
import { runScriptStage } from "../src/pipeline/script-stage";
import { parseVoiceSpec } from "../src/voice/kokoro";

const pilot = ScriptSchema.parse(JSON.parse(readFileSync("scripts/pilot-01-hole-through-earth.json", "utf8")));

describe("pilot script", () => {
  it("passes the code checks", () => {
    expect(validateScript(pilot)).toEqual([]);
  });
  it("puts the TikTok bonus after the named beat", () => {
    const tt = tiktokNarration(pilot);
    expect(tt.length).toBeGreaterThan(fullNarration(pilot).length);
    expect(tt).toContain(pilot.tiktokBonus.narration);
  });
});

describe("validateScript", () => {
  it("flags kid targeting, bad structure and length", () => {
    const bad: Script = {
      ...pilot,
      title: "Fun space facts for kids",
      beats: pilot.beats.slice(1, 3),
      claims: [{ id: "c1", beatId: "b99", claim: "x" }],
    };
    const p = validateScript(bad).join("\n");
    expect(p).toMatch(/targets kids/);
    expect(p).toMatch(/first beat must be the hook/);
    expect(p).toMatch(/last beat must be the loop/);
    expect(p).toMatch(/Short runs about/);
    expect(p).toMatch(/unknown beat b99/);
  });
  it("lets a claim point at the TikTok bonus, and shows the checker the bonus narration", () => {
    const s: Script = { ...pilot, claims: [...pilot.claims, { id: "cx", beatId: TIKTOK_BONUS_ID, claim: "x" }] };
    expect(validateScript(s)).toEqual([]);
    expect(claimsForPrompt(s)).toContain(`(${TIKTOK_BONUS_ID}): "${pilot.tiktokBonus.narration}"`);
  });
});

describe("sources", () => {
  it("accepts agencies, universities and journals, rejects trivia and forums", () => {
    expect(isReputable("https://solarsystem.nasa.gov/moons/earths-moon/")).toBe(true);
    expect(isReputable("https://www.physics.illinois.edu/ask")).toBe(true);
    expect(isReputable("https://arxiv.org/abs/1308.1342")).toBe(true);
    expect(isReputable("https://www.britannica.com/place/Earth")).toBe(true);
    expect(isReputable("https://www.reddit.com/r/askscience")).toBe(false);
    expect(isReputable("https://en.wikipedia.org/wiki/Gravity_train")).toBe(false);
    expect(isReputable("https://notnasa.gov.example.com/")).toBe(false);
    expect(isReputable("not a url")).toBe(false);
  });
  it("normalizes URLs for comparison", () => {
    expect(normalizeUrl("https://www.Nature.com/articles/x/#sec")).toBe(normalizeUrl("http://nature.com/articles/x"));
  });
});

const fc = (claims: FactCheck["claims"]): FactCheck => ({ claims, notes: "" });

describe("fact-check rules", () => {
  const script: Script = { ...pilot, claims: pilot.claims.slice(0, 2) };
  const [c1, c2] = script.claims;

  it("passes when every claim has 2 retrieved reputable sources on different sites", () => {
    const urls = ["https://arxiv.org/abs/1308.1342", "https://phys.org/news/2015-03-fall-hole-earth.html", "https://pbs.org/x"];
    const r = applyRules(
      script,
      fc([
        { claimId: c1.id, verdict: "supported", explanation: "", suggestedRewrite: null, sources: [{ url: urls[0], publisher: "arXiv", supports: "" }, { url: urls[1], publisher: "Phys.org", supports: "" }] },
        { claimId: c2.id, verdict: "supported", explanation: "", suggestedRewrite: null, sources: [{ url: urls[1], publisher: "Phys.org", supports: "" }, { url: urls[2], publisher: "PBS", supports: "" }] },
      ]),
      urls,
      "",
    );
    expect(r.pass).toBe(true);
    expect(sourcesForDescription(r).split("\n")).toHaveLength(4); // header + 3 unique sources
  });

  it("downgrades 'supported' when sources were invented, untrusted or from one site", () => {
    const r = applyRules(
      script,
      fc([
        {
          claimId: c1.id,
          verdict: "supported",
          explanation: "",
          suggestedRewrite: null,
          sources: [
            { url: "https://nasa.gov/made-up-page", publisher: "NASA", supports: "" }, // never retrieved
            { url: "https://reddit.com/r/space/1", publisher: "Reddit", supports: "" }, // untrusted
          ],
        },
        {
          claimId: c2.id,
          verdict: "supported",
          explanation: "",
          suggestedRewrite: null,
          sources: [
            { url: "https://phys.org/a", publisher: "Phys.org", supports: "" },
            { url: "https://phys.org/b", publisher: "Phys.org", supports: "" }, // same site
          ],
        },
      ]),
      ["https://reddit.com/r/space/1", "https://phys.org/a", "https://phys.org/b"],
      "",
    );
    expect(r.pass).toBe(false);
    expect(r.claims.map((c) => c.verdict)).toEqual(["needs_rewrite", "needs_rewrite"]);
    expect(feedbackFrom(r).join("\n")).toMatch(/Only 0 reputable/);
  });

  it("treats a claim the checker skipped as unsupported", () => {
    const r = applyRules(script, fc([]), [], "");
    expect(r.claims.every((c) => c.verdict === "unsupported")).toBe(true);
  });
});

describe("narration prep checks", () => {
  it("accepts spelled-out numbers and rejects leftover digits or dropped words", () => {
    const s: Script = {
      ...pilot,
      beats: [{ ...pilot.beats[0], id: "b1", narration: "You'd fall for 38 minutes!" }],
      tiktokBonus: { ...pilot.tiktokBonus, narration: "About 6,000 °C." },
    };
    expect(checkSpoken(s, { beats: [{ id: "b1", spoken: "You'd fall for thirty-eight minutes!" }], tiktokBonus: "About six thousand degrees Celsius." })).toEqual([]);
    const bad = checkSpoken(s, { beats: [{ id: "b1", spoken: "You'd drop for 38 minutes!" }], tiktokBonus: "About six thousand degrees Celsius." });
    expect(bad.join("\n")).toMatch(/digits or symbols/);
    expect(bad.join("\n")).toMatch(/dropped: fall/);
  });
});

describe("voice blends", () => {
  it("parses and normalizes blend weights", () => {
    expect(parseVoiceSpec("am_michael")).toEqual([{ voice: "am_michael", weight: 1 }]);
    expect(parseVoiceSpec("am_michael:0.7+am_puck:0.3")).toEqual([
      { voice: "am_michael", weight: 0.7 },
      { voice: "am_puck", weight: 0.3 },
    ]);
    expect(parseVoiceSpec("am_michael:3+am_puck:1")[1].weight).toBeCloseTo(0.25);
    expect(() => parseVoiceSpec("am_michael:-1")).toThrow();
  });
});

/** A fake model: first fact check fails one claim, the revision fixes it, the second check passes. */
class FakeLlm implements Llm {
  steps: string[] = [];
  researched: { user: string; maxSearches: number }[] = [];
  private checks = 0;
  async structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
    this.steps.push(`${req.step}:${req.model}`);
    if (req.step === "script-writer" || req.step === "script-reviser") return pilot as z.infer<S>;
    if (req.step === "fact-check-structure") {
      const ok = this.checks > 1;
      return {
        claims: pilot.claims.map((c, i) => ({
          claimId: c.id,
          verdict: ok || i > 0 ? "supported" : "needs_rewrite",
          explanation: "",
          suggestedRewrite: ok || i > 0 ? null : "fixed line",
          sources: [
            { url: "https://arxiv.org/abs/1308.1342", publisher: "arXiv", supports: "" },
            { url: "https://phys.org/news/x", publisher: "Phys.org", supports: "" },
          ],
        })),
        notes: "",
      } as z.infer<S>;
    }
    if (req.step === "narration-prep") {
      const spell = (t: string) => t.replace(/\d[\d,.]*/g, "many").replace(/%/g, " percent").replace(/°/g, " degrees ");
      return { beats: pilot.beats.map((b) => ({ id: b.id, spoken: spell(b.narration) })), tiktokBonus: spell(pilot.tiktokBonus.narration) } as z.infer<S>;
    }
    throw new Error(`unexpected step ${req.step}`);
  }
  async research(req: ResearchRequest): Promise<ResearchResult> {
    this.steps.push(`${req.step}:opus`);
    this.researched.push({ user: req.user, maxSearches: req.maxSearches });
    this.checks++;
    return { text: "findings", retrievedUrls: ["https://arxiv.org/abs/1308.1342", "https://phys.org/news/x"], citedUrls: [] };
  }
}

describe("script stage", () => {
  it("revises after a failed fact check, then preps narration, routing each step to the planned model", async () => {
    const llm = new FakeLlm();
    const r = await runScriptStage(llm, { brief: { topic: "hole through the Earth", series: "WHAT IF?" } });
    expect(r.check.pass).toBe(true);
    expect(r.rounds).toBe(1);
    expect(r.spoken).not.toBeNull();
    expect(llm.steps).toEqual([
      "script-writer:opus",
      "fact-check-research:opus",
      "fact-check-structure:haiku",
      "script-reviser:opus",
      "fact-check-research:opus",
      "fact-check-structure:haiku",
      "narration-prep:haiku",
    ]);
  });
  it("re-researches only the claim that failed, and keeps the others' verdicts and sources", async () => {
    const llm = new FakeLlm();
    const r = await runScriptStage(llm, { script: pilot });
    const [first, second] = llm.researched;
    const [failed, ...rest] = pilot.claims;
    expect(first.maxSearches).toBe(searchBudget(pilot.claims.length));
    expect(second.user).toContain(`${failed.id}: ${failed.claim}`);
    for (const c of rest) expect(second.user).not.toContain(`${c.id}: ${c.claim}`);
    expect(second.maxSearches).toBe(searchBudget(1));
    expect(r.check.claims.map((c) => c.claimId)).toEqual(pilot.claims.map((c) => c.id));
    expect(r.check.claims[0].reused).toBeUndefined();
    expect(r.check.claims.slice(1).every((c) => c.reused && c.acceptedSources.length === 2)).toBe(true);
  });
  it("re-researches a passed claim when its narration changes", async () => {
    const supported = (claims: Script["claims"]) => ({
      pass: true,
      notes: "",
      research: "",
      claims: claims.map((c) => ({ claimId: c.id, verdict: "supported" as const, explanation: "", suggestedRewrite: null, sources: [], acceptedSources: [] })),
    });
    const llm = new FakeLlm();
    const edited: Script = { ...pilot, beats: pilot.beats.map((b) => (b.id === pilot.claims[1].beatId ? { ...b, narration: `${b.narration} Wow.` } : b)) };
    await factCheck(llm, edited, { prior: { script: pilot, result: supported(pilot.claims) } });
    const changed = pilot.claims.filter((c) => c.beatId === pilot.claims[1].beatId).map((c) => c.id);
    const asked = [...llm.researched[0].user.matchAll(/^(c\d+):/gm)].map((m) => m[1]);
    expect(asked).toEqual(changed);
  });
});

describe("batch research", () => {
  it("sends research through a batch without fallbacks, waits for it, and logs half-price tokens", async () => {
    const created: unknown[] = [];
    let polls = 0;
    const message = {
      content: [
        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://nasa.gov/a" }] },
        { type: "text", text: "c1 supported", citations: [] },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 1_000_000, output_tokens: 0, server_tool_use: { web_search_requests: 10 } },
    };
    const client = {
      beta: {
        messages: {
          batches: {
            create: async (p: unknown) => (created.push(p), { id: "b1" }),
            retrieve: async () => ({ processing_status: ++polls < 2 ? "in_progress" : "ended" }),
            results: async () => (async function* () {
              yield { custom_id: "fact-check-research", result: { type: "succeeded", message } };
            })(),
          },
        },
      },
    };
    const llm = new ClaudeLlm(undefined, client as never, { batch: true, pollMs: 0, log: () => {} });
    const r = await llm.research({ step: "fact-check-research", system: "s", user: "u", effort: "high", maxSearches: 4 });
    expect(r.text).toBe("c1 supported");
    expect(r.retrievedUrls).toEqual(["https://nasa.gov/a"]);
    const params = (created[0] as { requests: { params: Record<string, unknown> }[] }).requests[0].params;
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("stream");
    // 1M input tokens at $4/M, halved, plus 10 searches at full price.
    expect(llm.ledger.totalUsd).toBeCloseTo(2 + 0.1);
  });
});

describe("research packs", () => {
  const pack: ResearchPack = {
    topic: "hole through the Earth",
    series: "WHAT IF?",
    researchedOn: "2026-11-27",
    facts: [
      {
        id: "f1",
        fact: "A fall through a pole-to-pole tunnel takes about 38 minutes with Earth's real density.",
        sources: [
          { url: "https://arxiv.org/abs/1308.1342", publisher: "arXiv", supports: "38 min 11 s" },
          { url: "https://phys.org/news/2015-03-fall-hole-earth.html", publisher: "Phys.org", supports: "38 minutes" },
        ],
      },
      {
        id: "f2",
        fact: "Gravity is zero at Earth's center.",
        sources: [
          { url: "https://www.wtamu.edu/missing-page", publisher: "WTAMU", supports: "" },
          { url: "https://randomblog.example/zero-g", publisher: "Blog", supports: "" },
          { url: "https://www.nasa.gov/a", publisher: "NASA", supports: "" },
        ],
      },
    ],
    avoid: ["you would fall forever"],
  };
  const probe = async (url: string) => (url.includes("missing") ? { status: 404 } : url.includes("phys.org") ? { status: 403 } : { status: 200 });

  it("treats loading pages and bot-blocking sites as real, and 404s and dead hosts as not", () => {
    expect(judgeProbe({ status: 200 }).ok).toBe(true);
    expect(judgeProbe({ status: 403 }).ok).toBe(true);
    expect(judgeProbe({ status: 404 }).ok).toBe(false);
    expect(judgeProbe({ error: "getaddrinfo ENOTFOUND" }).ok).toBe(false);
  });

  it("only uses facts with 2 working reputable sources on different sites", async () => {
    const v = await verifyPack(pack, probe);
    expect(usableFacts(v).map((f) => f.id)).toEqual(["f1"]);
    const p = packProblems(v).join("\n");
    expect(p).toMatch(/missing-page rejected: HTTP 404/);
    expect(p).toMatch(/randomblog\.example\/zero-g rejected: site is not on the reputable list/);
    expect(p).toMatch(/f2 has 1 usable source site/);
    expect(packForWriter(v)).toContain("38 minutes");
    expect(packForWriter(v)).not.toContain("zero at Earth's center");
    expect(packForWriter(v)).toContain("Do not say: you would fall forever");
  });

  it("says the network is blocked, instead of blaming every link, when nothing loads", async () => {
    const v = await verifyPack(pack, async () => ({ error: "fetch failed" }));
    expect(v.offline).toBe(true);
    expect(usableFacts(v)).toEqual([]);
    expect(packProblems(v)).toHaveLength(1);
    expect(packProblems(v)[0]).toMatch(/can't reach the web/);
  });

  it("judges covered claims from the pack without search and web-checks only the rest", async () => {
    const v = await verifyPack(pack, probe);
    const [c1, c2, ...others] = pilot.claims;
    const researched: string[] = [];
    const llm: Llm = {
      async structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
        if (req.step === "fact-check-pack")
          return {
            claims: [
              { claimId: c1.id, coverage: "covered", verdict: "supported", factIds: ["f1", "f99"], explanation: "", suggestedRewrite: null },
              // Relies on a fact with too few sources, so code downgrades it.
              { claimId: c2.id, coverage: "covered", verdict: "supported", factIds: ["f2"], explanation: "", suggestedRewrite: null },
              ...others.map((c) => ({ claimId: c.id, coverage: "not_covered", verdict: "unsupported", factIds: [], explanation: "", suggestedRewrite: null })),
            ],
            notes: "",
          } as z.infer<S>;
        return {
          claims: others.map((c) => ({
            claimId: c.id,
            verdict: "supported",
            explanation: "",
            suggestedRewrite: null,
            sources: [
              { url: "https://arxiv.org/abs/1", publisher: "arXiv", supports: "" },
              { url: "https://phys.org/x", publisher: "Phys.org", supports: "" },
            ],
          })),
          notes: "",
        } as z.infer<S>;
      },
      async research(req) {
        researched.push(req.user);
        return { text: "", retrievedUrls: ["https://arxiv.org/abs/1", "https://phys.org/x"], citedUrls: [] };
      },
    };
    const r = await factCheck(llm, pilot, { pack: v });
    expect(researched).toHaveLength(1);
    expect(researched[0]).not.toContain(`${c1.id}: ${c1.claim}`);
    expect(researched[0]).not.toContain(`${c2.id}: ${c2.claim}`);
    for (const c of others) expect(researched[0]).toContain(`${c.id}: ${c.claim}`);
    const byId = new Map(r.claims.map((c) => [c.claimId, c]));
    expect(byId.get(c1.id)?.verdict).toBe("supported");
    expect(byId.get(c1.id)?.fromPack).toBe(true);
    expect(byId.get(c1.id)?.acceptedSources.map((s) => s.publisher)).toEqual(["arXiv", "Phys.org"]);
    expect(byId.get(c2.id)?.verdict).toBe("needs_rewrite");
    expect(byId.get(c2.id)?.downgradedBecause).toMatch(/0 working reputable source/);
  });
});
