import type { Luminance } from "../../schema/analysis";
import type { Region } from "../../schema/region";
import type { RuleInput } from "../rules";

/** Region whose mask fills its whole box (1×1 raster, scaled to the box). */
export function rect(id: string, concept: string, x1: number, y1: number, x2: number, y2: number): Region {
  return {
    id,
    concept,
    score: 0.9,
    box: { x1, y1, x2, y2 },
    area_pct: Math.round((((x2 - x1) * (y2 - y1)) / (1600 * 1200)) * 10000) / 100,
    mask: { w: 1, h: 1, rle: [0, 1] },
    svg_path: "M0 0L1 0L1 1L0 1Z",
  };
}

export const BRIGHT: Luminance = { mean: 130, dark_pct: 5 };

export function scene(regions: Region[], extra: Partial<RuleInput> = {}): RuleInput {
  return { width: 1600, height: 1200, luminance: BRIGHT, roomType: "bathroom", regions, ...extra };
}
