/**
 * Which model and effort each step uses. One table, so cost and quality are tuned in one place.
 *
 * Owner decision 2026-11-27: the first five pilots cost about $20 in Claude credits with Opus at high effort
 * everywhere, mostly in web-researched fact checks. Default routing is now Sonnet 5.5 for judgment steps and
 * Haiku 5.5 for checks and mechanical steps; research comes from the owner's research packs where possible.
 * Code still enforces the hard rules (2 approved sources per claim, real URLs, length limits).
 *
 * WONDERSCRAPS_QUALITY=opus switches the judgment steps back to Opus (complex topics, spot checks).
 */
import type { Effort, ModelKey } from "./llm";

export type Step =
  | "scriptWriter"
  | "scriptReviser"
  | "factResearch"
  | "factStructure"
  | "packCheck"
  | "narrationPrep"
  | "storyboard"
  | "imageCheck"
  | "qaVision";

type Route = { model: ModelKey; effort: Effort };

export const ROUTES: Record<Step, Route> = {
  scriptWriter: { model: "sonnet", effort: "medium" },
  scriptReviser: { model: "sonnet", effort: "medium" },
  factResearch: { model: "sonnet", effort: "medium" },
  factStructure: { model: "haiku", effort: "low" },
  packCheck: { model: "sonnet", effort: "medium" },
  narrationPrep: { model: "haiku", effort: "low" },
  storyboard: { model: "sonnet", effort: "medium" },
  imageCheck: { model: "haiku", effort: "low" },
  qaVision: { model: "sonnet", effort: "low" },
};

const JUDGMENT: Step[] = ["scriptWriter", "scriptReviser", "factResearch", "packCheck", "storyboard", "qaVision"];

export function route(step: Step): Route {
  const r = ROUTES[step];
  if (process.env.WONDERSCRAPS_QUALITY === "opus" && JUDGMENT.includes(step)) return { model: "opus", effort: "high" };
  return r;
}
