# Faceless Shorts

An automated, agent-driven pipeline for a faceless, family-friendly curiosity-science channel on YouTube and TikTok.

- [docs/RESEARCH.md](docs/RESEARCH.md): market research covering niches, top channels, monetization data, policy guardrails and creative patterns.
- [docs/PLAN.md](docs/PLAN.md): agent architecture, tech stack, unit economics, roadmap, and the accounts each step needs.

## Status
Phase 1 (brand + MVP) is in progress. Working so far:
- **Voice:** Kokoro TTS runs locally, at no cost (`src/voice/kokoro.ts`).
- **Captions:** word-level timing from whisper.cpp, matched back onto the script's own words and pinned to Kokoro's sentence boundaries (`src/voice/align.ts`).
- **Rendering:** Remotion renders a 1080×1920 Short from a JSON `VideoSpec` (`src/video/`). Three visual themes, `neon`, `paper` and `chalk`, share the same scene geometry.

## Dev
```bash
npm ci                      # .npmrc skips onnxruntime's CUDA download
npm test                    # unit tests
npm run typecheck

# Demo: narration → captions → specs → render
npx tsx src/voice/kokoro.ts --voice af_heart --out public/generated/moon/voice_af_heart.wav --text "..."
npx tsx src/voice/align.ts  --audio public/generated/moon/voice_af_heart.wav --out public/generated/moon/captions_af_heart.json --text "..."
npx tsx src/demo/build-moon-spec.ts af_heart
npx remotion render src/video/index.ts Short out/demo-paper.mp4 --props=public/generated/moon/spec-paper.json
```
If headless Chrome is already installed, set `REMOTION_BROWSER_EXECUTABLE` to its path; otherwise Remotion downloads its own. Fonts are bundled in `public/fonts` (SIL Open Font License), so renders never depend on a font CDN.
