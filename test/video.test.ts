import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBlack, sequenceSimilarity, technicalChecks, varietyCheck } from "../src/agents/qa";
import { ScriptSchema, type Spoken } from "../src/agents/schemas";
import { checkStoryboard, type Shot, type Storyboard } from "../src/agents/storyboard";
import { keyOf } from "../src/assets/images";
import { apiArg, reviewPath } from "../src/publish/dropbox";
import { parseLoudnormJson } from "../src/pipeline/render";
import { buildSpec, cueTime, sentenceStarts } from "../src/pipeline/spec";
import { splitSentences } from "../src/voice/sentences";

const script = ScriptSchema.parse(JSON.parse(readFileSync("scripts/pilot-01-hole-through-earth.json", "utf8")));
const spoken = JSON.parse(readFileSync("scripts/pilot-01-hole-through-earth.spoken.json", "utf8")) as Spoken;

const shot = (o: Partial<Shot>): Shot => ({
  beatId: "b1",
  startSentence: 0,
  template: "hero",
  mood: "day",
  image: null,
  image2: null,
  imageLabel: null,
  image2Label: null,
  text: null,
  number: null,
  items: [],
  arrowLabels: [],
  direction: null,
  fromLabel: null,
  toLabel: null,
  ratio: null,
  shown: null,
  layout: null,
  cueWord: null,
  cueWord2: null,
  ...o,
});

// One shot per beat, cycling templates so none repeats back to back.
const templates = ["title", "big-number", "hero", "arrows", "progress", "compare", "fact"] as const;
const good: Storyboard = {
  images: [{ key: "earth", description: "a round globe" }, { key: "person", description: "a paper person" }],
  shots: script.beats.map((b, i) =>
    shot({
      beatId: b.id,
      template: templates[i % templates.length],
      image: "earth",
      image2: "person",
      text: "x",
      number: { value: 38, decimals: 0, prefix: "", suffix: "" },
      cueWord: splitSentences(spoken.beats[i].spoken)[0].split(/\s+/)[1],
    }),
  ),
};

describe("storyboard checks", () => {
  it("accepts a valid shot list", () => {
    expect(checkStoryboard(good, script, spoken)).toEqual([]);
  });
  it("flags repeats, missing beats, unknown images, bad cues and too little variety", () => {
    const bad: Storyboard = {
      images: [],
      shots: [shot({ template: "hero", image: "ghost", cueWord: "zebra" }), shot({ beatId: "b2", template: "hero" }), shot({ beatId: "b3", template: "list", items: [{ text: "a", cueWord: "the" }] })],
    };
    const p = checkStoryboard(bad, script, spoken).join("\n");
    expect(p).toMatch(/Only 3 shots/);
    expect(p).toMatch(/different templates/);
    expect(p).toMatch(/both use hero/);
    expect(p).toMatch(/image "ghost"/);
    expect(p).toMatch(/cue word "zebra"/);
    expect(p).toMatch(/list with 1 items/);
    expect(p).toMatch(/Beat b7 has no shot/);
  });
});

describe("spec builder", () => {
  const sentences = spoken.beats.flatMap((b) => splitSentences(b.spoken));
  const narration = { durationMs: sentences.length * 2000, sentences: sentences.map((t, i) => ({ text: t, startMs: i * 2000, endMs: i * 2000 + 1800 })) };
  const captions = sentences.flatMap((s, i) =>
    s.split(/\s+/).map((w, k) => ({ text: (i || k ? " " : "") + w, startMs: i * 2000 + k * 200, endMs: i * 2000 + k * 200 + 180, timestampMs: 0, confidence: null })),
  );

  it("starts shots on sentence boundaries and fires cues on the spoken word", () => {
    const starts = sentenceStarts(script, spoken, narration);
    expect(starts.get("b1")).toEqual([0]);
    expect(cueTime(captions, "nope", 0, 99999)).toBeNull();
    const spec = buildSpec({ id: "t", theme: "paper", script, spoken, storyboard: good, narration, captions, images: new Map([["earth", { key: "earth", description: "", file: "assets/library/earth.png", model: "", seed: 0, createdAt: "" }]]), audio: "a.wav" });
    expect(spec.scenes).toHaveLength(good.shots.length);
    expect(spec.scenes[0].startMs).toBe(0);
    spec.scenes.forEach((s, i) => i && expect(s.startMs).toBe(spec.scenes[i - 1].endMs));
    // Shot 2's cue is its beat's second word, which the fake captions put 200 ms into the shot.
    expect(spec.scenes[1].props?.countAtMs).toBe(200);
    expect((spec.scenes[0].props?.image as { file: string }).file).toBe("assets/library/earth.png");
    expect((spec.scenes[5].props?.right as { file: string | null }).file).toBeNull();
    expect(spec.sfx?.length).toBeGreaterThan(spec.scenes.length);
  });

  it("refuses audio whose sentences don't match the script", () => {
    expect(() => sentenceStarts(script, spoken, { ...narration, sentences: narration.sentences.slice(1) })).toThrow(/sentence count mismatch/);
  });
});

describe("QA checks", () => {
  const spec = { id: "x", theme: "paper" as const, series: "S", audio: "a", durationMs: 45000, captions: [], scenes: [{ kind: "hero", startMs: 0, endMs: 3000 }, { kind: "fact", startMs: 3000, endMs: 12000 }] };
  it("passes a correct file and flags wrong size, loudness and black frames", () => {
    const ok = technicalChecks({ width: 1080, height: 1920, fps: 30, durationS: 45, hasAudio: true }, spec, -14.2, []);
    expect(ok.filter((c) => !c.ok && c.severity === "fail")).toEqual([]);
    expect(ok.find((c) => c.name === "shot pacing")?.ok).toBe(false);
    const bad = technicalChecks({ width: 720, height: 1280, fps: 30, durationS: 75, hasAudio: false }, spec, -20, [{ startS: 3, endS: 4 }]);
    expect(bad.filter((c) => !c.ok).map((c) => c.name)).toEqual(expect.arrayContaining(["resolution", "duration", "audio", "loudness", "black frames"]));
  });
  it("parses ffmpeg output", () => {
    expect(parseBlack("[blackdetect @ 0x1] black_start:3.2 black_end:4.1 black_duration:0.9")).toEqual([{ startS: 3.2, endS: 4.1 }]);
    expect(parseLoudnormJson('x\n{\n"input_i" : "-19.2",\n"input_tp" : "-3.0",\n"input_lra" : "4.1",\n"input_thresh" : "-29.5",\n"target_offset" : "0.2"\n}').input_i).toBe("-19.2");
  });
  it("warns when a video repeats a recent template sequence", () => {
    expect(sequenceSimilarity(["a", "b", "c"], ["a", "b", "d"])).toBeCloseTo(2 / 3);
    expect(varietyCheck(["a", "b", "c"], [["a", "b", "c"]]).ok).toBe(false);
    expect(varietyCheck(["a", "b", "c"], [["c", "a", "b"]]).ok).toBe(true);
  });
});

describe("assets and Dropbox", () => {
  it("makes stable library keys and ASCII-safe Dropbox args", () => {
    expect(keyOf("Grain of Rice!")).toBe("grain-of-rice");
    expect(apiArg({ path: "/Wonderscraps/01 Review/café.mp4" })).toBe('{"path":"/Wonderscraps/01 Review/caf\\u00e9.mp4"}');
    expect(reviewPath("a.mp4")).toBe("/Wonderscraps/01 Review/a.mp4");
  });
});

describe("image generation with a check", () => {
  it("regenerates a rejected picture from the checker's better description, then saves it", async () => {
    const { getImage, forgetImage } = await import("../src/assets/images");
    const { existsSync, rmSync } = await import("node:fs");
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 1 } } }).png().toBuffer();
    const uri = `data:image/png;base64,${png.toString("base64")}`;
    const prompts: string[] = [];
    const call = async (model: string, input: Record<string, unknown>) => {
      if (model.includes("flux")) prompts.push(String(input.prompt));
      return model.includes("flux") ? { images: [{ url: uri }] } : { image: { url: uri } };
    };
    let checks = 0;
    const verify = async () => (++checks === 1 ? { ok: false, problems: ["has a tail"], betterDescription: "a tailless barrel" } : { ok: true });
    const key = "zz-test-subject";
    try {
      const e = await getImage({ key, description: "a barrel with a tail" }, { call, verify, log: () => {} });
      expect(prompts).toHaveLength(2);
      expect(prompts[1]).toMatch(/^a tailless barrel\./);
      expect(e?.description).toBe("a tailless barrel");
      expect(existsSync(`public/${e?.file}`)).toBe(true);
    } finally {
      await forgetImage(key);
      rmSync(`public/assets/library/${key}.png`, { force: true });
    }
  });
});
