/**
 * Brand defaults used by every pipeline step. Decisions and rationale: docs/BRAND.md.
 */
import type { ThemeId } from "./video/types";

export const BRAND = {
  name: "Wonderscraps",
  /** Same handle on YouTube, TikTok, Instagram and Facebook. */
  handle: "wonderscraps",
  theme: "paper" as ThemeId,
  voice: {
    engine: "kokoro" as const,
    /**
     * Kokoro "Michael" (deeper, authoritative US male, chosen 2026-11-27), blended 70/30 with
     * "Puck" for more enthusiasm (owner ask, 2026-11-27). The blend keeps Michael's pitch
     * (~110 Hz) but widens pitch movement ~8% (p10-p90 8.1 -> 8.7 semitones).
     * Comparison clips: src/demo/voice-samples.ts.
     */
    id: "am_michael:0.7+am_puck:0.3",
    /** Brisker than the first demo (1.08) for energy, still clear. */
    speed: 1.12,
  },
  audience: "general" as const, // never "made for kids"; see docs/RESEARCH.md §3
} as const;
