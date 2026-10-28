import { maskCentroid } from "../pipeline/mask";
import type { Finding } from "../schema/finding";
import type { Region } from "../schema/region";

export type Pin = { findingId: string; number: number; x: number; y: number };

export function pinRadius(width: number, height: number) {
  return Math.round(Math.max(width, height) / 55);
}

/**
 * The region a finding is "about": its first cited region that isn't floor
 * (rules list the hazard first and the anchor, e.g. the door, second).
 */
export function primaryRegion(f: Finding, byId: Map<string, Region>): Region | undefined {
  const regions = f.region_ids.map((id) => byId.get(id)).filter((r): r is Region => !!r);
  return regions.find((r) => r.concept !== "floor") ?? regions[0];
}

/** One pin per region-scoped finding, at its main region's centroid, nudged apart to avoid overlaps. */
export function layoutPins(findings: Finding[], regions: Region[], width: number, height: number): Pin[] {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const r = pinRadius(width, height);
  const pins: Pin[] = [];
  findings.forEach((f, i) => {
    const region = primaryRegion(f, byId);
    if (!region) return;
    let { x, y } = maskCentroid(region.mask, region.box);
    // Nudge down-right until clear of earlier pins (bounded).
    for (let tries = 0; tries < 8 && pins.some((p) => Math.hypot(p.x - x, p.y - y) < 2.2 * r); tries++) {
      x += 1.6 * r;
      y += 0.8 * r;
    }
    pins.push({
      findingId: f.id,
      number: i + 1,
      x: Math.min(width - r - 2, Math.max(r + 2, x)),
      y: Math.min(height - r - 2, Math.max(r + 2, y)),
    });
  });
  return pins;
}
