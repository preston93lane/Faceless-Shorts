# Faceless Shorts

An automated, agent-driven pipeline for a faceless, family-friendly curiosity-science channel on YouTube and TikTok.

- [docs/RESEARCH.md](docs/RESEARCH.md): market research covering niches, top channels, monetization data, policy guardrails and creative patterns.
- [docs/PLAN.md](docs/PLAN.md): agent architecture, tech stack, unit economics, roadmap, and the accounts each step needs.

## Status
Phase 1 (brand + MVP) is in progress. Working so far:
- **Voice:** Kokoro TTS runs locally, at no cost (`src/voice/kokoro.ts`).
- **Captions:** word-level timing from whisper.cpp, matched back onto the script's own words and pinned to Kokoro's sentence boundaries (`src/voice/align.ts`).
- **Rendering:** Remotion renders a 1080×1920 Short from a JSON `VideoSpec` (`src/video/`). Three visual themes, `neon`, `paper` and `chalk`, share the same scene geometry.
- **Script stage** (`src/agents/`, `src/pipeline/script-stage.ts`):
  - The **Script Writer** (Opus 5.5) writes a hook-first script, a TikTok bonus segment, metadata and a claims list.
  - Code checks the length, structure and kid-targeting rules.
  - The **Fact Checker** researches each claim with Opus 5.5 and web search. Haiku 5.5 then structures the findings as JSON, and code only accepts sources that web search actually returned from reputable sites (2 per claim).
  - A failed script is revised up to 2 times.
  - Narration prep (Haiku 5.5) spells out numbers for the voice; code checks its output.
  - Each run writes a `review.md`, plus the cost of each Claude call.
- **Pilot 01**: [docs/PILOT-01.md](docs/PILOT-01.md). Approved, and a draft Short is rendered (`src/demo/build-pilot-01.ts`, scenes in `src/video/scenes/hole.tsx`). The Fact Checker agent hasn't run on it yet.

## Dev
```bash
npm ci                      # .npmrc skips onnxruntime's CUDA download
npm test                    # unit tests
npm run typecheck

# Script stage (needs ANTHROPIC_API_KEY; in Claude Code cloud sessions set WONDERSCRAPS_ANTHROPIC_KEY instead)
npm run script:new -- --topic "What if you fell through the Earth?" --series "WHAT IF?"
npm run script:check -- --script scripts/pilot-01-hole-through-earth.json
# Fact-check research runs through the Message Batches API (half price, minutes to hours). Add --now for an immediate, full-price run.
npm run voice:samples        # voice comparison clips
npx tsx src/demo/read-script.ts scripts/pilot-01-hole-through-earth.json public/generated/pilot-01/draft-read.wav

# Demo: narration → captions → specs → render
npx tsx src/voice/kokoro.ts --voice am_michael:0.7+am_puck:0.3 --speed 1.12 --out public/generated/moon/voice_af_heart.wav --text "..."
npx tsx src/voice/align.ts  --audio public/generated/moon/voice_af_heart.wav --out public/generated/moon/captions_af_heart.json --text "..."
npx tsx src/demo/build-moon-spec.ts af_heart
npx remotion render src/video/index.ts Short out/demo-paper.mp4 --props=public/generated/moon/spec-paper.json
```
Node's built-in `fetch` ignores `HTTPS_PROXY`, so the npm scripts set `NODE_USE_ENV_PROXY=1`. The first Kokoro run downloads the voice model from Hugging Face; in the cloud environment its CDN hosts (`us.gcp.cdn.hf.co`, `us.aws.cdn.hf.co`) are on the allowlist.

If headless Chrome is already installed, set `REMOTION_BROWSER_EXECUTABLE` to its path; otherwise Remotion downloads its own. Fonts are bundled in `public/fonts` (SIL Open Font License), so renders never depend on a font CDN.
