import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { applyRules, claimsForPrompt, feedbackFrom, sourcesForDescription } from "../src/agents/fact-checker";
import type { Llm, ResearchRequest, ResearchResult, StructuredRequest } from "../src/agents/llm";
import { checkSpoken } from "../src/agents/narration-prep";
import { type FactCheck, fullNarration, type Script, ScriptSchema, TIKTOK_BONUS_ID, tiktokNarration, validateScript } from "../src/agents/schemas";
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
});
