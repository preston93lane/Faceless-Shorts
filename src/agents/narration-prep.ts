/**
 * Narration prep (Haiku 5.5, mechanical): rewrites narration for text-to-speech, so numbers,
 * units and symbols are spelled the way they should be said ("38" -> "thirty-eight",
 * "°C" -> "degrees Celsius"). Code checks the result before it reaches the voice step:
 * no digits or symbols left, and the wording otherwise unchanged.
 */
import type { Llm } from "./llm";
import { type Script, type Spoken, SpokenSchema } from "./schemas";

const SYSTEM = `You prepare narration for a text-to-speech engine. Rewrite each line so it reads exactly as it should be spoken:
- Numbers, years, fractions and decimals become words ("38" -> "thirty-eight", "1,000" -> "one thousand", "3.8" -> "three point eight", "1990s" -> "nineteen nineties").
- Units and symbols become words ("km/h" -> "kilometers per hour", "°C" -> "degrees Celsius", "%" -> "percent", "&" -> "and").
- Abbreviations are expanded unless they are always said as letters (keep "NASA", "DNA").
Change nothing else: keep every other word, the punctuation, and the exclamation and question marks exactly as they are.`;

export async function prepareNarration(llm: Llm, script: Script): Promise<Spoken> {
  const user = JSON.stringify({
    beats: script.beats.map((b) => ({ id: b.id, text: b.narration })),
    tiktokBonus: script.tiktokBonus.narration,
  });
  const spoken = await llm.structured({ step: "narration-prep", model: "haiku", effort: "low", system: SYSTEM, user, schema: SpokenSchema });
  const problems = checkSpoken(script, spoken);
  if (problems.length) throw new Error(`Narration prep output failed checks:\n- ${problems.join("\n- ")}`);
  return spoken;
}

const WORDS_ONLY = /[\d%$£€&@#/°+=<>]/;
const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

/** Every non-number word of the original should survive (Haiku only spells out numbers and symbols). */
export function checkSpoken(script: Script, spoken: Spoken): string[] {
  const p: string[] = [];
  const out = new Map(spoken.beats.map((b) => [b.id, b.spoken]));
  const pairs: [string, string, string | undefined][] = script.beats.map((b) => [b.id, b.narration, out.get(b.id)]);
  pairs.push(["tiktokBonus", script.tiktokBonus.narration, spoken.tiktokBonus]);
  for (const [id, original, said] of pairs) {
    if (said === undefined) {
      p.push(`${id}: missing`);
      continue;
    }
    if (WORDS_ONLY.test(said)) p.push(`${id}: still has digits or symbols: "${said}"`);
    const kept = new Set(plain(said));
    const lost = plain(original).filter((w) => !kept.has(w));
    if (lost.length > 0) p.push(`${id}: words changed or dropped: ${lost.join(", ")}`);
  }
  return p;
}
