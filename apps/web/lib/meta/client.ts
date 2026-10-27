import OpenAI from "openai";

export const META_BASE_URL = "https://api.meta.ai/v1";

/** Prices in USD from dev.meta.ai/docs/pricing-rate-limits (Standard mode). */
export const PRICES = {
  museInputPerM: 1.25,
  museCachedInputPerM: 0.15,
  museOutputPerM: 4.25,
  samPerImage: 2.5 / 1000,
};

export function museModel(): string {
  const model = process.env.MUSE_MODEL || "muse-spark-1.3";
  // Contributor variants may use our prompts (photos of people's homes) for training.
  if (model.includes("contributor")) {
    throw new Error(`Refusing to use contributor model "${model}" with private home photos.`);
  }
  return model;
}

export const SAM_MODEL = "sam-3.1";

let client: OpenAI | null = null;

/**
 * Shared OpenAI-compatible client for Meta Model API. The SDK's built-in retry
 * (maxRetries: 1) retries once on 408/409/429/5xx with backoff and honours Retry-After.
 */
export function metaClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set (see .env.example).");
  client = new OpenAI({ baseURL: META_BASE_URL, apiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

export type CallLog = {
  model: string;
  op: string;
  ms: number;
  cached: boolean;
  cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
};

export function logCall(entry: CallLog): void {
  const tokens =
    entry.input_tokens !== undefined ? ` in=${entry.input_tokens} out=${entry.output_tokens}` : "";
  console.log(
    `[meta] ${entry.op} ${entry.model} ${entry.cached ? "CACHED" : `${entry.ms}ms`}` +
      `${tokens} $${entry.cost_usd.toFixed(5)}`,
  );
}
