import {
  decodeMaskToRaster,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
} from "@meta-sam/parser";
import { cached, hashKey } from "../cache";
import { rasterToRle } from "../pipeline/mask";
import type { Box, Mask } from "../schema/region";
import { logCall, metaClient, PRICES, SAM_MODEL } from "./client";

/** One detected instance, before region IDs are assigned. */
export type SamInstance = {
  score: number;
  /** Half-open box in source-image pixels. */
  box: Box;
  mask: Mask;
  svg_path: string;
};

export type SegmentResult = {
  instances: SamInstance[];
  ms: number;
  cached: boolean;
  cost_usd: number;
};

/**
 * SAM 3.1 concept segmentation over the Responses API (dev.meta.ai/docs/sam).
 * One noun phrase per call. Request/response shape recorded in docs/meta-api-notes.md.
 */
export async function samSegmentMeta(opts: {
  imageDataUrl: string;
  imageSha256: string;
  concept: string;
}): Promise<SegmentResult> {
  const started = Date.now();
  const key = hashKey(SAM_MODEL, "concept-v1", opts.imageSha256, opts.concept);

  const { value, hit } = await cached("sam", key, async () => {
    const stream = await metaClient().responses.create({
      model: SAM_MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: opts.concept },
            { type: "input_image", image_url: opts.imageDataUrl, detail: "auto" },
          ],
        },
      ],
      stream: true,
      // Metadata values must be strings.
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
    });
    const result = await parseImageStream(stream).finalResult;
    if (result.outcome.status !== "completed") {
      throw new Error(`SAM "${opts.concept}" ended early: ${JSON.stringify(result.outcome)}`);
    }
    for (const d of result.diagnostics) {
      console.warn(`[sam] ${opts.concept}: ${d.severity} ${d.code} ${d.message}`);
    }
    const instances: SamInstance[] = recordsOfKind(result.records, "mask").map((rec) => ({
      // include_confidence is requested, so c should always be present.
      score: rec.confidence ?? 1,
      box: { x1: rec.bounds.left, y1: rec.bounds.top, x2: rec.bounds.right, y2: rec.bounds.bottom },
      mask: {
        w: rec.mask.width,
        h: rec.mask.height,
        rle: rasterToRle(decodeMaskToRaster(rec.mask)),
      },
      svg_path: decodeMaskToSVGPath(rec.mask),
    }));
    return instances;
  });

  const ms = Date.now() - started;
  const cost_usd = hit ? 0 : PRICES.samPerImage;
  logCall({ model: SAM_MODEL, op: `segment "${opts.concept}"`, ms, cached: hit, cost_usd });
  return { instances: value, ms, cached: hit, cost_usd };
}
