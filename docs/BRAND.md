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
- **Kokoro "Michael", blended 70/30 with "Puck"** (`am_michael:0.7+am_puck:0.3`) at speed 1.12. The owner asked for "a little more enthusiasm" on 2026-11-27. The blend keeps Michael's deep pitch (about 110 Hz) but adds about 8% more pitch movement, and it reads about 7% faster than the first demo. It's free and runs locally.
- Comparison clips: `npm run voice:samples` writes A (old Michael @ 1.08), B (Michael @ 1.14), C (**chosen**, Puck blend @ 1.12), D (Fenrir blend @ 1.12) and E (C + 0.7 semitone pitch lift) to `public/generated/voice-samples/`.
- Enthusiasm also comes from the writing: questions, about one exclamation per four sentences, and "here's the crazy part" moments (`src/agents/style-guide.ts`).
- Upgrade path: an ElevenLabs custom voice if the channel takes off.

## Series
Each series has its own badge at the top of the frame:
- **WHAT IF?** (hypotheticals)
- **HOW IT WORKS**
- **ANIMAL SUPERPOWERS**
- **YOUR AMAZING BODY**
- **WILD BIOLOGY**: mind-blowing biochemistry and life science (cells, molecules, microbes, plants, DNA). Added 2026-11-27 at the owner's request; badge name confirmed by the owner the same day.
- **SPACE & SCALE**
- **MYTH BUSTED**

**Launch focus (first two weeks), owner pick of 2026-11-27:** WHAT IF?, YOUR AMAZING BODY, WILD BIOLOGY, SPACE & SCALE.

## Content rules (owner decisions, 2026-11-27)
- **Units:** serious videos use US units first, with metric only where a detail requires it (metric can go on the paper card). Absurd or playful videos measure in funny units like bananas, Bugattis, Minecraft creepers or grains of rice, to get people commenting, with the math still correct. The same rule covers the TikTok bonus segment (owner, 2026-11-27). Branded units are fine to say, but they're drawn as generic paper stand-ins, never real logos or game art.
- **Dark topics:** disasters, disease, predators, extinction and historical deaths are allowed when told calmly and factually. No gore, no graphic detail, no fear-bait.
- **Mix:** about 1 in 5 videos use the funny-units style; the rest are serious.
- **Depth:** lighter videos sit next to more complex ones meant to draw in adults: stellar nucleosynthesis, the Big Bang, the Sun compared with other stars (composition as well as size), radio telescopes, the stories of major physics discoveries, biochemistry, anatomy, kinesiology and sports science. The owner can supply sources to watch for space facts.
- **Evolution** is fair game and should come up often. **Climate change** is in scope too. Both are told as the mainstream science.
- **Off-limits for now:** diet and weight. The owner may come back to them later, on purpose.
- **Accuracy vs. fun:** the more complex the video, the more exact it must be. Simplifications and analogies are fine, especially in the lighter videos, as long as they stay true as said.
- These rules are in the Script Writer's brief (`src/agents/style-guide.ts`).

### Starter ideas (owner reactions, 2026-11-27)
- WILD BIOLOGY: bacterial cells in your body; tardigrades' sugar-glass survival trick; why onions make you cry. Good, but add more complex, adult-level topics too.
- YOUR AMAZING BODY: stomach lining renewing every few days; taller in the morning. Body facts are great: crazy anatomy, kinesiology, sports science.
- SPACE & SCALE: how many Earths fit in the Sun, in grains of rice. Yes, plus the serious topics listed above.
- WHAT IF?: swallowing a drop of a neutron star. Yes.

## To do
- [ ] Image-generation style prompt (fal.ai) locked to this look, tested on 10 subjects. Needs fal credit.
- [ ] End card / subtle `wonderscraps` paper tag.
- [ ] Long-form thumbnail template.
- [ ] Channel art: avatar and banner.
