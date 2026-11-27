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
    /** Kokoro "Michael": deeper, authoritative US male. Chosen 2026-11-27. */
    id: "am_michael",
    /** Slightly brisk for Shorts pacing without raising pitch. */
    speed: 1.08,
  },
  audience: "general" as const, // never "made for kids"; see docs/RESEARCH.md §3
} as const;
