import type OpenAI from "openai";
import { z } from "zod";
import { cached, hashKey } from "../cache";
import { logCall, metaClient, museModel, PRICES } from "./client";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

export type MuseJsonResult<T> = {
  data: T;
  model: string;
  ms: number;
  cached: boolean;
  cost_usd: number;
};

/** zod → JSON Schema for response_format, minus the $schema meta key. */
function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

function costOf(usage: OpenAI.CompletionUsage | undefined): number {
  if (!usage) return 0;
  const cachedIn = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return (
    ((usage.prompt_tokens - cachedIn) * PRICES.museInputPerM +
      cachedIn * PRICES.museCachedInputPerM +
      usage.completion_tokens * PRICES.museOutputPerM) /
    1_000_000
  );
}

/**
 * One Muse Spark call with constrained JSON output, validated by zod.
 * On a validation failure, retries once with the error appended (CLAUDE.md §10).
 * Results are cached by (model, prompt version, messages, schema).
 */
export async function museJson<S extends z.ZodType>(opts: {
  op: string;
  promptVersion: string;
  schemaName: string;
  schema: S;
  system: string;
  user: ContentPart[];
  /** Muse Spark always reasons; lower effort = faster and cheaper. "none" is rejected (400). */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}): Promise<MuseJsonResult<z.infer<S>>> {
  const model = museModel();
  const jsonSchema = jsonSchemaFor(opts.schema);
  const key = hashKey(model, opts.promptVersion, opts.reasoningEffort ?? "default", opts.system, opts.user, jsonSchema);
  const started = Date.now();

  const { value, hit } = await cached(`muse-${opts.op}`, key, async () => {
    const messages: ChatMessage[] = [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ];
    let cost = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await metaClient().chat.completions.create({
        model,
        messages,
        ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, schema: jsonSchema },
        },
      });
      cost += costOf(res.usage);
      logCall({
        model,
        op: opts.op,
        ms: Date.now() - started,
        cached: false,
        cost_usd: costOf(res.usage),
        input_tokens: res.usage?.prompt_tokens,
        output_tokens: res.usage?.completion_tokens,
      });
      const text = res.choices[0]?.message?.content ?? "";
      let parsed: unknown;
      let error: string;
      try {
        parsed = JSON.parse(text);
        const result = opts.schema.safeParse(parsed);
        if (result.success) return { data: result.data, cost_usd: cost };
        error = z.prettifyError(result.error);
      } catch (e) {
        error = `Invalid JSON: ${(e as Error).message}`;
      }
      messages.push(
        { role: "assistant", content: text },
        {
          role: "user",
          content: `That output failed validation:\n${error}\nReturn corrected JSON only.`,
        },
      );
    }
    throw new Error(`${opts.op}: Muse Spark output failed validation twice`);
  });

  if (hit) logCall({ model, op: opts.op, ms: 0, cached: true, cost_usd: 0 });
  return {
    data: value.data as z.infer<S>,
    model,
    ms: Date.now() - started,
    cached: hit,
    cost_usd: hit ? 0 : value.cost_usd,
  };
}

export function imagePart(dataUrl: string): ContentPart {
  return { type: "image_url", image_url: { url: dataUrl } };
}

export function textPart(text: string): ContentPart {
  return { type: "text", text };
}
