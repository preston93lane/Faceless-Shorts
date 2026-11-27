# Research packs

A research pack is a JSON file of facts about one topic, each backed by sources, researched before the script is written. Facts come from a separate Claude session that you run yourself on your subscription. The pipeline then:

- has the **Script Writer** build the script from the pack's facts;
- has the **Fact Checker** judge each claim against the pack (one Opus call, no web search, a few cents);
- sends only the claims the pack doesn't cover to normal web research (batched).

With a good pack, most scripts need no web searches at all.

## Workflow

1. Open a new Claude session (claude.ai chat, or Claude Code). Paste the prompt below, with your topic list at the end.
2. Save each pack it returns as `research/<slug>.json` in this repo, for example `research/hole-through-earth.json`.
3. Check it (free, no Claude calls):
   ```bash
   npm run research:validate -- research/hole-through-earth.json
   ```
4. Write the script from it. The topic and series come from the pack:
   ```bash
   npm run script:new -- --research research/hole-through-earth.json
   ```
   or fact-check an existing script against it:
   ```bash
   npm run script:check -- --script scripts/pilot-01-hole-through-earth.json --research research/hole-through-earth.json
   ```

`research/hole-through-earth.json` is a complete example, built from the pilot's fact check.

## How the pipeline trusts a pack

The research session runs outside the pipeline, so code checks its work:

- A source counts only if its site is on the reputable list (`src/agents/sources.ts`) **and** the link loads. A 404, a dead site or a malformed URL is rejected. A site that refuses automated readers (HTTP 401/403/429, common for journals) still counts, because made-up URLs don't produce that.
- A fact is used only if it has working sources on **2 different sites**. Others are ignored, and `research:validate` lists them so you can fix them.
- When the Fact Checker relies on the pack, it names fact ids, never URLs. Code attaches that fact's checked sources, so a source can't be invented at that step.
- Links are checked each run, on the machine running the pipeline. That needs open internet: your computer or GitHub Actions work; this repo's Claude Code cloud environment blocks most sites. Where links can't be checked, the pack is ignored and every claim gets web research, as before.

## Prompt for the research session

Copy everything in the box, then add your topics at the end.

````text
You are the researcher for Wonderscraps, a curiosity-science YouTube Shorts / TikTok channel for a general audience (curious 9–14 year olds and adults). Each video is about 45 seconds, with a 60–75 second TikTok version that adds a bonus fact. A wrong fact can get the channel demonetized, so be strict.

For each topic below, research it on the web and produce one research pack as JSON in exactly this format:

{
  "topic": "What if you jumped into a hole through the Earth?",
  "series": "WHAT IF?",
  "researchedOn": "YYYY-MM-DD",
  "facts": [
    {
      "id": "f1",
      "fact": "Precise, checkable statement with its numbers and any simplifying assumption.",
      "sayItLike": "A plain, accurate way to say it out loud (optional).",
      "caveats": "What it does not mean, or where it stops being true (optional).",
      "sources": [
        { "url": "https://exact-page-url", "publisher": "NASA", "supports": "Short quote or close paraphrase of what the page says." }
      ]
    }
  ],
  "avoid": ["Common misconceptions or wordings that are wrong or misleading."],
  "notes": "Anything else the writer should know (optional)."
}

Rules:
- series is one of: WHAT IF?, HOW IT WORKS, ANIMAL SUPERPOWERS, YOUR AMAZING BODY, WILD BIOLOGY, SPACE & SCALE, MYTH BUSTED.
- 8–15 facts per topic: the core answer, the surprising "crazy part", the key numbers (with units, and the US-customary version where it helps), and 2–3 bonus facts deep enough for the TikTok version.
- Every fact needs at least 2 sources from DIFFERENT websites, and each must say what the fact says, numbers included.
- Only these sources count: government science agencies and universities (.gov, .edu, .ac.uk and similar), NASA, ESA, NOAA, NIH, the Smithsonian, natural history museums, Britannica, peer-reviewed journals and arXiv (Nature, Science, PNAS, AIP, APS, IOP, PLOS, Frontiers, Cell…), and established science journalism (National Geographic, Scientific American, New Scientist, Smithsonian Magazine, Live Science, Space.com, Phys.org, Science News, Quanta, PBS, BBC, HowStuffWorks, Physics World). Not Wikipedia, Reddit, Quora, YouTube, content farms or trivia sites (Wikipedia can point you to real sources).
- Give the exact URL of the page you read, never a guessed or reconstructed one. Every link is checked, and facts with broken links are dropped.
- When sources disagree, give the range and say so in caveats. Prefer phrasings that stay true ("about", "more than") over ones that are only true under one model.
- List common misconceptions about the topic in "avoid".

Output one JSON code block per topic, with nothing else in it.

Topics:
- 
````
