# Weekly long-form video (8–12 min): plan and cost

_Written 2026-11-27. Phase 3 work; nothing here is built yet._

## Why
From Feb 1, 2027 YouTube monetization needs 8,000 watch hours a year (or 20M Shorts views in 90 days). Shorts views barely count toward watch hours, so one 8–12 minute video a week carries that goal, and it earns Education-tier ad rates.

## What it is
Each week has a theme ("Space Week"). The week's 5–7 Shorts become chapters of one deeper video. It is **not** a compilation: it gets new narration that connects and deepens the Shorts, plus new shots, because a stitched re-upload risks YouTube's inauthentic-content rules.

## How it runs (once a week)
1. **You research it.** Drop a long-form research pack into Dropbox `Wonderscraps/05 Research Packs/Long-form/` (same format as Shorts packs, `docs/RESEARCH-PACKS.md`, but 25–40 facts and a suggested chapter order). This is the step that would otherwise cost the most in API web searches.
2. **Script (Opus).** A long-form writer turns the week's Shorts plus your pack into a ~1,400–1,800 word narration (about 9–11 minutes at the narrator's pace) with 5–7 chapters, a cold open, and a payoff at the end.
3. **Fact check against your pack** (no web search). Only claims your pack doesn't cover get a batched web search, usually none or a few.
4. **Voice and captions:** Kokoro and whisper, free and local.
5. **Storyboard (Opus):** about one shot every 8–10 seconds (60–75 shots), in 16:9. It reuses the week's illustrations and adds new ones only where needed.
6. **Render** 1920×1080 on GitHub Actions, normalize loudness, build chapter timestamps for the description, and render a thumbnail from a template.
7. **QA** (technical checks plus a vision review of one frame per shot), then into `01 Review` like the Shorts.

## Cost per video
| Item | With your research pack | Without (API web research) |
|---|---|---|
| Script writing (Opus) | ~$0.25 | ~$0.25 |
| Fact check | ~$0.15 (against the pack) | ~$1.50–3.00 (40+ claims searched) |
| Storyboard, 60–75 shots (Opus) | ~$0.40–0.60 | same |
| QA vision review (Opus, ~70 frames) | ~$0.25–0.40 | same |
| New illustrations (10–20 × ~$0.027; the rest reused) | ~$0.30–0.55 | same |
| Thumbnail art | ~$0.05 | same |
| Voice, captions, music, sound effects | $0 | $0 |
| **Rendering** | **$0** (see below) | $0 |
| **Total** | **≈ $1.40–2.00** | ≈ $3–5 |

Batching the Claude calls overnight halves their token cost, bringing the pack version to roughly **$1.00–1.50**. Four a month is about **$4–8**.

### Rendering cost
Rendering is free. It runs on GitHub Actions:
- Our renderer does a 16-second Short in ~46 s on 4 CPU cores. A 10-minute video is the same number of pixels per frame, so expect **~30 min on 4 cores, ~60 min on GitHub's 2-core private-repo runner**.
- GitHub gives private repos **2,000 free minutes a month** (public repos are unlimited). A month of the plan uses roughly 4 long-form × ~60 min + 30 Shorts × ~3 min ≈ **330 minutes**, well inside the free tier.
- If the repo ever outgrows that, extra Linux minutes cost $0.008/min, so a long-form render would be about $0.50.

## Build list (Phase 3)
- [ ] 16:9 layouts for every shot template (the Shorts layouts are 9:16).
- [ ] Long-form script writer prompt and schema (chapters, cold open, connective narration, reuse of the week's Shorts).
- [ ] Chapter timestamps in the description.
- [ ] Thumbnail template (Remotion still): big subject cut-out, 3–4 word title, brand colors.
- [ ] Watch from Dropbox `05 Research Packs/Long-form` for the week's pack.
- [ ] GitHub Actions weekly job (Sunday) with a 90-minute timeout.
