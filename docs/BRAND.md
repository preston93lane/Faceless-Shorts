# Wonderscraps: Brand Guide

_Decided 2026-11-27. These defaults live in code at `src/brand.ts` and `src/video/themes.ts` (`paper`)._

## Identity
- **Name:** Wonderscraps. "Wonder" stands for curiosity; "scraps" stands for the paper-cutout look.
- **Handle:** `@wonderscraps` everywhere (YouTube, TikTok, Instagram, Facebook). Fallback: `thewonderscraps`, identical on every platform.
- **Audience:** general audience. The animation will naturally appeal to kids, but nothing targets or labels itself as "for kids". There are no "kids" keywords in titles or tags, and no toddler mascots.
- **Voice of the writing:** a curious older sibling. It's confident and a bit playful, never babyish and never fear-bait.

## Visual style: Paper Cutout
Why this style was chosen over Flat Neon and Chalkboard (owner agreed with all six points):
1. AI-generated illustrations blend into one handmade paper world, and the paper look hides small AI glitches.
2. It doesn't read as "AI slop", which matters for YouTube's templated-content policy and for parents.
3. It stands out from the flat neon look that most curiosity channels copy from Kurzgesagt.
4. Dark text on white paper cards stays readable over any scene.
5. It catches kids' eyes without being babyish.
6. It renders as fast as the other styles (~46s for a 16s Short on 4 cores).

**Look:** saturated craft-paper colors, a white cut edge around every piece, soft drop shadows, a single paper-grain texture over the whole frame, and captions on white paper cards.

### Motion rules: calm, not chaotic
Owner feedback on the first demo: it "moves a little too much… chaotic." From now on:
- Stop-motion wobble stays subtle: ±0.25° and ±0.5px, changing every 6 frames (was ±0.8° and ±1.5px every 2 frames).
- Entrances get a gentle settle, not a bounce (overshoot 1.15, was 1.6), and at most 4° of tilt while sliding in (was 14°).
- Camera push-in is at most 3% per scene (was 7–8%).
- **Only one thing should be moving for attention at a time.** Background elements stay still or drift slowly.
- "Action" moments such as a wobble or a scramble are allowed, but slower: wobble cycles about 2× slower than the first demo.
- All of these numbers are in `THEMES.paper.motion`. Change them there, not in individual scenes.

### Palette (paper theme)
| Role | Hex |
|---|---|
| Night paper | `#1C2752` → `#34407A` |
| Day paper | `#8ECAE6` → `#CDEBF6` |
| Ocean / blue | `#3A86FF` |
| Green | `#8AC926` |
| Yellow (badge, highlights) | `#FFCA3A` |
| Red (highlighted caption word, accents) | `#FF595E` |
| Ink (caption text) | `#1D2440` |
| Paper white (cut edges, cards) | `#FFFDF5` |

### Type
- Captions, labels and series badges: **Lilita One** (bundled, SIL OFL).
- Captions show 2–4 words per card. The word being spoken turns red; the others stay ink-colored.

## Narration
- **Kokoro "Michael" (`am_michael`)** at speed 1.08: deeper and authoritative. It's free and runs locally.
- Upgrade path: an ElevenLabs custom voice if the channel takes off.

## Series
Each series has its own badge at the top of the frame:
- **WHAT IF?** (hypotheticals)
- **HOW IT WORKS**
- **ANIMAL SUPERPOWERS**
- **YOUR AMAZING BODY**
- **SPACE & SCALE**
- **MYTH BUSTED**

## To do
- [ ] Image-generation style prompt (fal.ai) locked to this look, tested on 10 subjects. Needs fal credit.
- [ ] End card / subtle `wonderscraps` paper tag.
- [ ] Long-form thumbnail template.
- [ ] Channel art: avatar and banner.
