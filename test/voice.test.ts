import { describe, expect, it } from "vitest";
import { alignScriptToTranscript, anchorToSentences, normalizeWord } from "../src/voice/align";
import { encodeWav, splitSentences } from "../src/voice/kokoro";

describe("splitSentences", () => {
  it("splits on sentence punctuation and keeps it", () => {
    expect(splitSentences("What if the Moon vanished? Tides would shrink. Wow!")).toEqual([
      "What if the Moon vanished?",
      "Tides would shrink.",
      "Wow!",
    ]);
  });
  it("keeps a trailing fragment without punctuation", () => {
    expect(splitSentences("One. Two")).toEqual(["One.", "Two"]);
  });
});

describe("normalizeWord", () => {
  it("lowercases and strips punctuation and apostrophes", () => {
    expect(normalizeWord("Earth's,")).toBe("earths");
    expect(normalizeWord("Disappeared?")).toBe("disappeared");
  });
});

describe("alignScriptToTranscript", () => {
  it("keeps script spelling while taking whisper timings", () => {
    const heard = [
      { text: "what", startMs: 0, endMs: 100 },
      { text: "if", startMs: 100, endMs: 200 },
      { text: "the", startMs: 200, endMs: 300 },
      { text: "moon", startMs: 300, endMs: 500 },
    ];
    const out = alignScriptToTranscript("What if the Moon", heard);
    expect(out.map((w) => w.text)).toEqual(["What", "if", "the", "Moon"]);
    expect(out[3]).toMatchObject({ startMs: 300, endMs: 500 });
  });

  it("interpolates timing for words whisper missed", () => {
    const heard = [
      { text: "tides", startMs: 0, endMs: 400 },
      { text: "shrink", startMs: 1000, endMs: 1400 },
    ];
    const out = alignScriptToTranscript("tides would shrink", heard);
    expect(out[1].text).toBe("would");
    expect(out[1].startMs).toBeGreaterThanOrEqual(400);
    expect(out[1].endMs).toBeLessThanOrEqual(1000);
  });
});

describe("anchorToSentences", () => {
  it("pins each sentence's words to the exact synthesized span", () => {
    const words = [
      { text: "Hi", startMs: 300, endMs: 500 },
      { text: "there.", startMs: 500, endMs: 900 },
      { text: "Bye.", startMs: 1500, endMs: 1900 },
    ];
    const out = anchorToSentences(words, [
      { text: "Hi there.", startMs: 0, endMs: 1200 },
      { text: "Bye.", startMs: 1400, endMs: 1800 },
    ]);
    expect(out[0].startMs).toBe(0);
    expect(out[1].endMs).toBe(1200);
    expect(out[2]).toMatchObject({ startMs: 1400, endMs: 1800 });
  });
});

describe("encodeWav", () => {
  it("writes a valid 16-bit mono PCM header", () => {
    const buf = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 24000);
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buf.readUInt32LE(24)).toBe(24000);
    expect(buf.length).toBe(44 + 4 * 2);
  });
});
