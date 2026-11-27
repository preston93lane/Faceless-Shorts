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
  - Optional **research packs** ([docs/RESEARCH-PACKS.md](docs/RESEARCH-PACKS.md)): facts researched ahead of time in your own Claude session. Claims a pack covers are checked against it without web search; code checks every pack link.
- **Video stage** (`src/pipeline/make-short.ts`, `npm run make:short`): script → finished Short in one command.
  - **Storyboard** (Opus 5.5, `src/agents/storyboard.ts`) picks a shot template per moment, the cue words that trigger motion, and the illustrations needed; it must vary the template sequence from recent uploads.
  - **Shot templates** (`src/video/scenes/templates.tsx`): title, hero, big-number, compare, scale, list, arrows, progress, fact, count.
  - **Illustrations** (`src/assets/images.ts`): paper cut-outs from FLUX.1 [dev] on fal.ai (~$0.027 each with background removal), kept in `public/assets/library/` and reused by key.
  - **Sound**: paper swish and pop effects synthesized in code (`src/audio/sfx.ts`), an optional music bed from `public/music/` ducked under the voice, loudness normalized to -14 LUFS.
  - **QA** (`src/agents/qa.ts`): size, frame rate, duration, loudness, black frames, shot pacing, caption timing, variety vs recent uploads, then an Opus vision review of one frame per shot and every new illustration. Wrong illustrations are redrawn and the video re-rendered.
  - Uploads the video and its review notes to Dropbox `Wonderscraps/01 Review` once the Dropbox app keys are set (`src/publish/dropbox.ts`).
- **Pilot 01**: [docs/PILOT-01.md](docs/PILOT-01.md). Approved, and a draft Short is rendered (`src/demo/build-pilot-01.ts`, scenes in `src/video/scenes/hole.tsx`). The Fact Checker passed every number; two wording fixes were noted and the script was kept as approved (2026-11-27).

## Dev
```bash
npm ci                      # .npmrc skips onnxruntime's CUDA download
npm test                    # unit tests
npm run typecheck

# Script stage (needs ANTHROPIC_API_KEY; in Claude Code cloud sessions set WONDERSCRAPS_ANTHROPIC_KEY instead)
npm run script:new -- --topic "What if you fell through the Earth?" --series "WHAT IF?"
npm run script:check -- --script scripts/pilot-01-hole-through-earth.json
npm run make:short -- --from out/scripts/<slug>          # finished Short from a fact-checked script
npm run make:short -- --research research/<slug>.json    # research pack → script → Short
npm run research:validate -- research/hole-through-earth.json   # check a research pack (free)
npm run script:new -- --research research/hole-through-earth.json
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
