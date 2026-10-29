import { samSegmentMeta, type SamInstance, type SegmentResult } from "../meta/sam";
import type { Region } from "../schema/region";
import { maskAreaPx } from "./mask";

/** Keep masks at or above this SAM confidence (tune in eval). */
export const MIN_SCORE = 0.5;
const CONCURRENCY = 6;
/**
 * SAM prompts per concept, tried in order until one finds a confident mask.
 * SAM can't judge condition ("loose", "mouldy"): Muse Spark's inventory decides
 * whether the concept is present, SAM only localises it.
 */
const SAM_PROMPTS: Partial<Record<string, string[]>> = {
  floor: ["floor", "carpet"],
  "loose window blind": ["loose window blind", "window blind"],
  "mould on wall": ["stain on wall", "mould"],
};

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
  /** Inventory's description of the floor ("grey carpet"), tried if "floor" finds nothing. */
  floorPhrase?: string;
}): Promise<{ regions: Region[]; runs: ConceptRun[]; cost_usd: number }> {
  const segment = segmenter();
  const run = async (concept: string, prompt = concept) => {
    try {
      return { concept, prompt, res: await segment({ ...opts, concept: prompt }) };
    } catch (e) {
      // One failed concept shouldn't sink the whole photo.
      console.error(`[segment] "${prompt}" failed:`, (e as Error).message);
      return { concept, prompt, res: null };
    }
  };
  const promptsFor = (concept: string) => {
    const own = SAM_PROMPTS[concept] ?? [concept];
    // Carpet often isn't matched by plain "floor", but a described surface ("grey carpet")
    // usually is, so the inventory's floor phrase goes straight after "floor".
    const phrase = concept === "floor" ? opts.floorPhrase?.trim().toLowerCase() : undefined;
    return [...new Set(phrase ? [own[0], phrase, ...own.slice(1)] : own)];
  };
  const hit = (r: { res: SegmentResult | null }) => !!r.res?.instances.some((i) => i.score >= MIN_SCORE);
  const results = await mapLimit(opts.concepts, CONCURRENCY, (c) => run(c, promptsFor(c)[0]));

  // Fallback prompts for concepts that found nothing; matches keep the concept's label.
  const misses = results.filter((r) => !hit(r) && promptsFor(r.concept).length > 1);
  await mapLimit(misses, CONCURRENCY, async ({ concept }) => {
    for (const prompt of promptsFor(concept).slice(1)) {
      const extra = await run(concept, prompt);
      results.push(extra);
      if (hit(extra)) break;
    }
  });

  const imageArea = opts.width * opts.height;
  const regions: Region[] = [];
  const runs: ConceptRun[] = [];
  let cost_usd = 0;
  for (const { concept, prompt, res } of results) {
    const label = prompt === concept ? concept : `${prompt} → ${concept}`;
    if (!res) {
      runs.push({ concept: label, instances: 0, kept: 0, ms: 0, cached: false });
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
      concept: label,
      instances: res.instances.length,
      kept: kept.length,
      ms: res.ms,
      cached: res.cached,
    });
  }
  return { regions, runs, cost_usd };
}
