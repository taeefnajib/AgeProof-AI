import type { Region } from "../schema/region";

export type RegionRow = {
  id: string;
  concept: string;
  score: number;
  area_pct: number;
  /** Rough position in the frame, e.g. "lower left". */
  position: string;
  box: [number, number, number, number];
};

function position(r: Region, width: number, height: number): string {
  const cx = (r.box.x1 + r.box.x2) / 2 / width;
  const cy = (r.box.y1 + r.box.y2) / 2 / height;
  const v = cy < 1 / 3 ? "upper" : cy > 2 / 3 ? "lower" : "middle";
  const h = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "centre";
  return v === "middle" && h === "centre" ? "centre" : `${v} ${h}`;
}

/** Compact, mask-free summary of every region: shown in the UI and given to the explain step. */
export function regionTable(regions: Region[], width: number, height: number): RegionRow[] {
  return regions.map((r) => ({
    id: r.id,
    concept: r.concept,
    score: r.score,
    area_pct: r.area_pct,
    position: position(r, width, height),
    box: [Math.round(r.box.x1), Math.round(r.box.y1), Math.round(r.box.x2), Math.round(r.box.y2)],
  }));
}
