/**
 * Thin Claude API layer shared by every agent. Model routing (docs/PLAN.md, "Model routing"):
 *   - Which model each step uses lives in src/agents/routing.ts (Sonnet 5.5 and Haiku 5.5 by default since
 *     2026-11-27 for cost; Opus 5.5 on request).
 *
 * Agents depend on the `Llm` interface, not on the SDK, so tests can pass a fake.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
} as const;
export type ModelKey = keyof typeof MODELS;
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** USD per million tokens, and per web search. Used for the per-video cost log. */
const PRICE = {
  opus: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  sonnet: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  haiku: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  webSearch: 0.01,
} as const;

/** Message Batches bill tokens at half price. Search fees are logged at full price until a bill shows otherwise. */
export const BATCH_TOKEN_DISCOUNT = 0.5;

export type ClaudeLlmOptions = {
  /** Send research calls through the Message Batches API: half-price tokens, results in minutes (up to 24 h). */
  batch?: boolean;
  /** How often to poll a pending batch. */
  pollMs?: number;
  log?: (line: string) => void;
};

export type CallCost = { step: string; model: string; inputTokens: number; outputTokens: number; webSearches: number; usd: number };

/** Every Claude call made during one pipeline run, so each video's cost can be logged. */
export class CostLedger {
  readonly calls: CallCost[] = [];
  add(c: CallCost) {
    this.calls.push(c);
  }
  get totalUsd() {
    return this.calls.reduce((a, c) => a + c.usd, 0);
  }
}

export type StructuredRequest<S extends z.ZodType> = {
  step: string;
  model: ModelKey;
  effort: Effort;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  /** Images shown before the text (vision review). */
  images?: { mediaType: "image/jpeg" | "image/png"; data: string; caption?: string }[];
};

export type ResearchRequest = {
  step: string;
  system: string;
  user: string;
  effort: Effort;
  maxSearches: number;
  /** Defaults to Sonnet (src/agents/routing.ts). */
  model?: ModelKey;
};

export type ResearchResult = {
  /** The model's written findings. */
  text: string;
  /** Every URL that web search actually returned. Used to reject sources the model invents. */
  retrievedUrls: string[];
  /** URLs the model cited inline (subset of retrievedUrls in practice). */
  citedUrls: string[];
};

export interface Llm {
  structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>>;
  research(req: ResearchRequest): Promise<ResearchResult>;
}

export class ClaudeLlm implements Llm {
  private client: Anthropic;
  constructor(
    readonly ledger = new CostLedger(),
    client?: Anthropic,
    private readonly options: ClaudeLlmOptions = {},
  ) {
    // Claude Code withholds ANTHROPIC_API_KEY from the commands it runs, so cloud sessions read
    // WONDERSCRAPS_ANTHROPIC_KEY instead (same key, different variable name).
    this.client = client ?? new Anthropic({ maxRetries: 3, apiKey: process.env.ANTHROPIC_API_KEY || process.env.WONDERSCRAPS_ANTHROPIC_KEY });
  }

  /** Opus calls opt into server-side refusal fallbacks; Haiku has none. */
  private fallbackParams(model: ModelKey) {
    return model === "opus" || model === "sonnet"
      ? { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const }
      : {};
  }

  async structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
    const res = await this.client.beta.messages.parse(
      {
        model: MODELS[req.model],
        max_tokens: req.maxTokens ?? 16000,
        // The system prompt is stable across runs, so cache it.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent(req) }],
        output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
        ...this.fallbackParams(req.model),
      },
      // An explicit timeout lets large outputs (storyboards) run without streaming; the SDK otherwise refuses
      // max_tokens above ~21k on a plain request.
      { timeout: 20 * 60 * 1000 },
    );
    this.record(req.step, req.model, res.usage);
    checkStop(req.step, res.stop_reason, res.stop_details);
    if (res.parsed_output == null) throw new Error(`${req.step}: model output did not match the schema`);
    return res.parsed_output as z.infer<S>;
  }

  async research(req: ResearchRequest): Promise<ResearchResult> {
    const tools = [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: req.maxSearches }];
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: req.user }];
    const retrieved = new Set<string>();
    const cited = new Set<string>();
    const texts: string[] = [];

    // Web search runs server-side; a long research turn can pause and must be resumed.
    for (let turn = 0; turn < 6; turn++) {
      const params = {
        model: MODELS[req.model ?? "sonnet"],
        max_tokens: 32000,
        system: [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }],
        messages,
        tools,
        output_config: { effort: req.effort },
      };
      const res = this.options.batch
        ? await this.viaBatch(req.step, params)
        : await this.client.beta.messages.stream({ ...params, ...this.fallbackParams(req.model ?? "sonnet") }).finalMessage();
      this.record(req.step, req.model ?? "sonnet", res.usage, this.options.batch ? BATCH_TOKEN_DISCOUNT : 1);

      for (const block of res.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) if (r.type === "web_search_result") retrieved.add(r.url);
        } else if (block.type === "text") {
          texts.push(block.text);
          for (const c of block.citations ?? []) if ("url" in c && c.url) cited.add(c.url);
        }
      }
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      checkStop(req.step, res.stop_reason, res.stop_details);
      return { text: texts.join(""), retrievedUrls: [...retrieved], citedUrls: [...cited] };
    }
    throw new Error(`${req.step}: research did not finish after 6 resumed turns`);
  }

  /**
   * Runs one request through the Message Batches API and waits for it. Batches reject `fallbacks`,
   * so a refusal here is not retried on another model; checkStop reports it.
   */
  private async viaBatch(step: string, params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> {
    const log = this.options.log ?? ((l: string) => console.error(l));
    const pollMs = this.options.pollMs ?? 30_000;
    const batch = await this.client.beta.messages.batches.create({ requests: [{ custom_id: step, params }] });
    log(`${step}: queued as batch ${batch.id}; most finish within an hour (24 h max)`);
    const started = Date.now();
    for (;;) {
      const b = await this.client.beta.messages.batches.retrieve(batch.id);
      if (b.processing_status === "ended") break;
      await new Promise((r) => setTimeout(r, pollMs));
      log(`${step}: batch ${batch.id} still running (${Math.round((Date.now() - started) / 60_000)} min)`);
    }
    for await (const r of await this.client.beta.messages.batches.results(batch.id)) {
      if (r.result.type === "succeeded") return r.result.message;
      const why = r.result.type === "errored" ? JSON.stringify(r.result.error) : r.result.type;
      throw new Error(`${step}: batch ${batch.id} request ${r.result.type}: ${why}`);
    }
    throw new Error(`${step}: batch ${batch.id} returned no result`);
  }

  private record(step: string, model: ModelKey, usage: Anthropic.Beta.BetaUsage, tokenRate = 1) {
    const p = PRICE[model];
    const searches = usage.server_tool_use?.web_search_requests ?? 0;
    const input = usage.input_tokens;
    const usd =
      (input * p.input +
        usage.output_tokens * p.output +
        (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
        (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) *
        tokenRate /
        1e6 +
      searches * PRICE.webSearch;
    this.ledger.add({ step, model: MODELS[model], inputTokens: input, outputTokens: usage.output_tokens, webSearches: searches, usd });
  }
}

function userContent(req: { user: string; images?: StructuredRequest<z.ZodType>["images"] }): string | Anthropic.Beta.BetaContentBlockParam[] {
  if (!req.images?.length) return req.user;
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const im of req.images) {
    if (im.caption) blocks.push({ type: "text", text: im.caption });
    blocks.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } });
  }
  blocks.push({ type: "text", text: req.user });
  return blocks;
}

function checkStop(step: string, stop: string | null, details: unknown) {
  if (stop === "refusal") throw new Error(`${step}: request was declined (${JSON.stringify(details)})`);
  if (stop === "max_tokens") throw new Error(`${step}: output hit max_tokens and is incomplete`);
}
