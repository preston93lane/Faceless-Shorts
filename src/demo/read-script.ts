/**
 * Reads a script aloud with the brand voice, for human review before anything is rendered.
 *   npx tsx src/demo/read-script.ts scripts/pilot-01-hole-through-earth.json public/generated/pilot-01/draft-read.wav
 */
import { readFileSync } from "node:fs";
import { ScriptSchema, fullNarration } from "../agents/schemas";
import { BRAND } from "../brand";
import { synthesize } from "../voice/kokoro";

const [scriptPath, out] = process.argv.slice(2);
const s = ScriptSchema.parse(JSON.parse(readFileSync(scriptPath, "utf8")));
const r = await synthesize({ text: fullNarration(s), voice: BRAND.voice.id, speed: BRAND.voice.speed, outPath: out });
console.log(`${out}: ${(r.durationMs / 1000).toFixed(1)}s`);
