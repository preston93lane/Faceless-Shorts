/**
 * Turns a storyboard into a render-ready VideoSpec. Shots start on sentence boundaries from the voice
 * (Kokoro sentence timings); each shot's key motion fires on its cue word (whisper word timings).
 * Sound effects follow the same timings: a paper swish on shot changes, a soft pop when a card lands.
 */
import type { Caption } from "@remotion/captions";
import type { Script, Spoken } from "../agents/schemas";
import type { Shot, Storyboard } from "../agents/storyboard";
import { SFX_FILES } from "../audio/sfx";
import type { LibraryEntry } from "../assets/images";
import type { ImageRef } from "../video/scenes/templates";
import type { SceneSpec, ThemeId, VideoSpec } from "../video/types";
import { splitSentences } from "../voice/sentences";

export type Narration = { durationMs: number; sentences: { text: string; startMs: number; endMs: number }[] };

const norm = (w: string) => w.trim().toLowerCase().replace(/[^a-z0-9'-]/g, "");

/** Start time of every beat's sentences, checked against the audio. */
export function sentenceStarts(script: Script, spoken: Spoken, narration: Narration): Map<string, number[]> {
  const said = new Map(spoken.beats.map((b) => [b.id, b.spoken]));
  const out = new Map<string, number[]>();
  let n = 0;
  for (const b of script.beats) {
    const count = splitSentences(said.get(b.id) ?? "").length;
    out.set(b.id, narration.sentences.slice(n, n + count).map((s) => s.startMs));
    n += count;
  }
  if (n !== narration.sentences.length) throw new Error(`sentence count mismatch: script ${n}, audio ${narration.sentences.length}`);
  return out;
}

/** First spoken occurrence of `word` in [fromMs, toMs), or null. */
export function cueTime(captions: Caption[], word: string | null | undefined, fromMs: number, toMs: number): number | null {
  if (!word) return null;
  const w = norm(word.split(/\s+/)[0]);
  const c = captions.find((x) => x.startMs >= fromMs - 60 && x.startMs < toMs && norm(x.text) === w);
  return c ? c.startMs : null;
}

const humanize = (key: string) => key.replace(/-/g, " ");

export function buildSpec(opts: {
  id: string;
  theme: ThemeId;
  script: Script;
  spoken: Spoken;
  storyboard: Storyboard;
  narration: Narration;
  captions: Caption[];
  images: Map<string, LibraryEntry | null>;
  audio: string;
  music?: { file: string; volume?: number };
}): VideoSpec {
  const { storyboard, narration, captions, images } = opts;
  const starts = sentenceStarts(opts.script, opts.spoken, narration);
  const startOf = (s: Shot) => {
    const t = starts.get(s.beatId)?.[s.startSentence];
    if (t === undefined) throw new Error(`shot starts at missing sentence ${s.beatId}[${s.startSentence}]`);
    return s === storyboard.shots[0] ? 0 : Math.round(t);
  };
  const ref = (key: string | null, label: string | null): ImageRef | null =>
    key ? { file: images.get(key)?.file ?? null, label: label ?? humanize(key) } : null;

  const sfx: NonNullable<VideoSpec["sfx"]> = [];
  const scenes: SceneSpec[] = storyboard.shots.map((s, i) => {
    const startMs = startOf(s);
    const endMs = i + 1 < storyboard.shots.length ? startOf(storyboard.shots[i + 1]) : Math.round(narration.durationMs);
    const dur = Math.max(1, endMs - startMs);
    /** Cue time relative to the shot, or a fallback fraction of the shot. */
    const cue = (word: string | null | undefined, fallbackFrac: number) => {
      const abs = cueTime(captions, word, startMs, endMs);
      return abs === null ? Math.round(dur * fallbackFrac) : Math.max(0, abs - startMs);
    };
    const c1 = cue(s.cueWord, 0.2);
    const c2 = cue(s.cueWord2, 0.6);
    const base = { mood: s.mood };
    let props: Record<string, unknown>;
    switch (s.template) {
      case "title":
        props = { ...base, image: ref(s.image, s.imageLabel), text: s.text ?? opts.script.title, textAtMs: Math.min(c1, 400) };
        break;
      case "hero":
        props = { ...base, image: ref(s.image, s.imageLabel), label: s.text ?? "", labelAtMs: c1 };
        break;
      case "big-number":
        props = {
          ...base,
          image: ref(s.image, s.imageLabel),
          value: s.number?.value ?? 0,
          decimals: s.number?.decimals ?? 0,
          prefix: s.number?.prefix ?? "",
          suffix: s.number?.suffix ?? "",
          unit: s.text ?? "",
          countAtMs: c1,
        };
        break;
      case "compare":
        props = { ...base, left: ref(s.image, s.imageLabel), right: ref(s.image2, s.image2Label), rightAtMs: cue(s.cueWord, 0.35), layout: s.layout ?? "side" };
        break;
      case "scale":
        props = { ...base, big: ref(s.image, s.imageLabel), small: ref(s.image2, s.image2Label), smallAtMs: c1, ratio: s.ratio ?? "", ratioAtMs: Math.max(c2, c1 + 600), smallSize: 90 };
        break;
      case "list":
        props = {
          ...base,
          heading: s.text ?? "",
          image: ref(s.image, s.imageLabel),
          items: s.items.map((it, k) => ({ text: it.text, atMs: cue(it.cueWord, 0.15 + (0.6 * k) / Math.max(1, s.items.length)) })),
        };
        break;
      case "arrows":
        props = { ...base, image: ref(s.image, s.imageLabel), labels: s.arrowLabels, direction: s.direction ?? "in", arrowsAtMs: c1 };
        break;
      case "progress":
        props = { ...base, image: ref(s.image, s.imageLabel), fromLabel: s.fromLabel ?? "", toLabel: s.toLabel ?? "", valueText: s.ratio ?? "", moveAtMs: c1, arriveAtMs: Math.max(c2, c1 + 900) };
        break;
      case "fact":
        props = { ...base, image: ref(s.image, s.imageLabel), text: s.text ?? "", textAtMs: c1, source: "" };
        break;
      case "count":
        props = { ...base, image: ref(s.image, s.imageLabel), shown: s.shown ?? 24, label: s.text ?? "", fillAtMs: c1 };
        break;
    }
    if (i > 0) sfx.push({ atMs: Math.max(0, startMs - 120), file: SFX_FILES.paper, volume: 0.3 });
    if (s.template !== "title" || i > 0) sfx.push({ atMs: startMs + c1, file: s.template === "big-number" ? SFX_FILES.tick : SFX_FILES.pop, volume: 0.28 });
    return { kind: s.template, startMs, endMs, props };
  });

  return {
    id: opts.id,
    theme: opts.theme,
    series: opts.script.series,
    audio: opts.audio,
    durationMs: narration.durationMs,
    captions,
    scenes,
    sfx,
    music: opts.music,
  };
}
