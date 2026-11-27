import type { Caption } from "@remotion/captions";

export type ThemeId = "neon" | "paper" | "chalk";

/** A scene on the timeline. `kind` selects the scene component; `props` are scene-specific. */
export type SceneSpec = {
  kind: string;
  startMs: number;
  endMs: number;
  props?: Record<string, unknown>;
};

/** Everything needed to render one Short. Produced by the pipeline, consumed by Remotion. */
export type VideoSpec = {
  id: string;
  theme: ThemeId;
  /** Series badge shown at the top, e.g. "WHAT IF?" */
  series: string;
  /** Narration audio, relative to /public. */
  audio: string;
  durationMs: number;
  captions: Caption[];
  scenes: SceneSpec[];
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** Silence kept after the narration ends so the last line lands. */
export const TAIL_MS = 700;
