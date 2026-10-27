import { samSegmentMeta, type SamInstance, type SegmentResult } from "../meta/sam";
import type { Region } from "../schema/region";
import { maskAreaPx } from "./mask";

/** Keep masks at or above this SAM confidence (tune in eval). */
export const MIN_SCORE = 0.5;
const CONCURRENCY = 6;

type SegmentFn = (opts: {
  imageDataUrl: string;
  imageSha256: string;
  concept: string;
}) => Promise<SegmentResult>;

/**
 * Self-hosted fallback (services/sam-modal). Contract: POST JSON
 * { image_data_url, concept } → { instances: SamInstance[] }.
 */
const samSegmentModal: SegmentFn = async ({ imageDataUrl, concept }) => {
  const url = process.env.MODAL_SAM_URL;
  if (!url) throw new Error("SAM_PROVIDER=modal but MODAL_SAM_URL is not set.");
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_data_url: imageDataUrl, concept }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Modal SAM ${res.status}: ${await res.text()}`);
  const { instances } = (await res.json()) as { instances: SamInstance[] };
  return { instances, ms: Date.now() - started, cached: false, cost_usd: 0 };
};

/** Provider switch: SAM_PROVIDER=meta|modal. */
export function segmenter(): SegmentFn {
  return process.env.SAM_PROVIDER === "modal" ? samSegmentModal : samSegmentMeta;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export type ConceptRun = {
  concept: string;
  instances: number;
  kept: number;
  ms: number;
  cached: boolean;
};

/** Step 2: one SAM call per concept; keep confident masks; assign stable IDs R1, R2… */
export async function runSegment(opts: {
  imageDataUrl: string;
  imageSha256: string;
  width: number;
  height: number;
  concepts: string[];
}): Promise<{ regions: Region[]; runs: ConceptRun[]; cost_usd: number }> {
  const segment = segmenter();
  const results = await mapLimit(opts.concepts, CONCURRENCY, async (concept) => {
    try {
      return { concept, res: await segment({ ...opts, concept }) };
    } catch (e) {
      // One failed concept shouldn't sink the whole photo.
      console.error(`[segment] "${concept}" failed:`, (e as Error).message);
      return { concept, res: null };
    }
  });

  const imageArea = opts.width * opts.height;
  const regions: Region[] = [];
  const runs: ConceptRun[] = [];
  let cost_usd = 0;
  for (const { concept, res } of results) {
    if (!res) {
      runs.push({ concept, instances: 0, kept: 0, ms: 0, cached: false });
      continue;
    }
    cost_usd += res.cost_usd;
    const kept = res.instances
      .filter((inst) => inst.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score);
    for (const inst of kept) {
      regions.push({
        id: `R${regions.length + 1}`,
        concept,
        score: Math.round(inst.score * 1000) / 1000,
        box: inst.box,
        area_pct: Math.round((maskAreaPx(inst.mask, inst.box) / imageArea) * 10000) / 100,
        mask: inst.mask,
        svg_path: inst.svg_path,
      });
    }
    runs.push({
      concept,
      instances: res.instances.length,
      kept: kept.length,
      ms: res.ms,
      cached: res.cached,
    });
  }
  return { regions, runs, cost_usd };
}
