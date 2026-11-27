# Pilot 01: "What If You Jumped Into a Hole Through the Earth?"

_Status: **approved by the owner** (2026-11-27). **Draft Short rendered** (paper style, Michael/Puck voice, 50.8 s): `npx tsx src/demo/build-pilot-01.ts`, then render (see the file header). **Fact Checker agent: still not run.** `ANTHROPIC_API_KEY` is set on the environment but did not reach the session's processes, so run `npm run script:check -- --script scripts/pilot-01-hole-through-earth.json` in a new session and re-render if it changes any narration._

> Units: the owner asked for US units in the TikTok bonus (serious video), so it now says "over 9,000 degrees Fahrenheit" and "about 7.5 miles" (claims c8 and c9 updated to match). Narration prep (spelling numbers out for the voice) was done by hand in `scripts/pilot-01-hole-through-earth.spoken.json` and passes `checkSpoken()`.

- Script file: [`scripts/pilot-01-hole-through-earth.json`](../scripts/pilot-01-hole-through-earth.json). It passes the code checks: hook ≤16 words, beat structure, length, no kid targeting.
- Length: Short **~50 s** (136 words; measured read-through 50.0 s). TikTok cut **~68 s** with the bonus segment.
- Voice: the new brand voice, Michael/Puck blend at speed 1.12 (see [BRAND.md](BRAND.md#narration)).
- Who wrote it: Opus 5.5 in the build session, following the same writing guide the Script Writer agent uses (`src/agents/style-guide.ts`). The agent itself couldn't run yet because the API key wasn't loaded in that session. The **Fact Checker agent has not run on it yet**. The research notes below come from manual web searches, so treat them as preliminary.

## Script

| # | Role | Narration | Paper card | Visual (one thing moves) |
|---|---|---|---|---|
| b1 | Hook | What if you jumped into a hole that went straight through the Earth? | Hole through Earth? | Earth cut open like a cake, a tunnel through the middle; a paper figure steps to the edge |
| b2 | Surprise | You wouldn't fall forever. In about 38 minutes, you'd pop out the other side! | 38 minutes! | A stopwatch card sweeps to 38 |
| b3 | Beat | Pretend there's no air and nothing can melt you. You'd speed up all the way down, to about 5 miles every second. That's across America in about 10 minutes! | 5 miles per second | Figure drops with speed lines; then a dotted line races across a paper USA map |
| b4 | Beat | At the center, gravity hits zero. The whole planet pulls on you from every side, so it all cancels out! | Zero gravity | Figure floats at the center; arrows point outward in every direction and pulse |
| *TikTok bonus* | | Now, in real life this is impossible. Earth's center is over 9,000 degrees Fahrenheit, about as hot as the surface of the Sun! And the deepest hole people have ever dug, in Russia, goes down only about 7.5 miles. That's less than one five-hundredth of the way to the center. | | Thermometer next to a paper Sun; then a tiny drill barely scratching the Earth |
| b5 | Beat | Then you'd shoot up the other side, slowing down, and stop right at the surface. | Out the other side | Figure rises and peeks out at the bottom of the Earth |
| b6 | Crazy part | Here's the crazy part. Slide down a straight tunnel between any two cities, like New York and London, and it takes about the same time. Around 40 minutes! | Any two cities?! | A straight tunnel under the ocean between two city pins; a little paper train slides through |
| b7 | Loop | If nobody grabs you at the top, you'd fall right back in and do it all again. | Again and again | Figure slips back in; camera eases back to the opening shot (seamless replay into b1) |

**Title:** What If You Jumped Into a Hole Through the Earth?
**Series badge:** WHAT IF?

## Preliminary fact notes (manual search, before the Fact Checker agent)
| Claim | Status | Notes |
|---|---|---|
| ~38 min through the center | Solid | Klotz, *American Journal of Physics* 83, 231 (2015): 38 min 11 s with realistic density; 42 min 12 s with uniform density ([arXiv 1308.1342](https://arxiv.org/abs/1308.1342), [Phys.org](https://phys.org/news/2015-03-fall-hole-earth.html)) |
| ~5 miles/second at the center | Likely | Uniform-density model gives 7.9 km/s (4.9 mi/s); Klotz is quoted as saying "over 8 km/s" ([Live Science](https://www.livescience.com/50312-how-long-to-fall-through-earth.html)). Needs a second source |
| Across the US in ~10 min | Arithmetic | ~4,500 km ÷ 8 km/s ≈ 9.4 min |
| Zero net gravity at the center | Solid | [PBS NOVA](https://www.pbs.org/wgbh/nova/education/physics/gravity-earths-center.html), [Univ. of Illinois Physics Q&A](https://van.physics.illinois.edu/ask/listing/246858) |
| Any straight tunnel ≈ same time | Solid, with a caveat | Exactly true (42 min) with uniform density; 38–42 min with real density, so "around 40 minutes" is fair. Ignores Earth's rotation ([Klotz 2024, arXiv 2411.18758](https://arxiv.org/abs/2411.18758)) |
| Center is over 5,000 °C, about as hot as the Sun's surface | Solid | 2013 X-ray study put it near 6,000 ± 500 °C; older estimates ~5,000 °C ([Smithsonian](https://www.smithsonianmag.com/smart-news/the-center-of-the-earth-is-as-hot-as-the-sun-43631207)) |
| Deepest hole ~12 km, under 1/500 of the way down | Needs check | Kola Superdeep Borehole, 12,262 m; 12.3 ÷ 6,371 ≈ 1/520. "Dug" vs "drilled" wording is for the Fact Checker to judge |

## Honest simplifications the narration flags
"Pretend there's no air and nothing can melt you" covers the no-air and survivability assumptions. The narration does **not** mention Earth's rotation, which in reality would push you into the tunnel wall. I think that's an acceptable simplification for a 50-second Short. The Fact Checker may want a caveat.
