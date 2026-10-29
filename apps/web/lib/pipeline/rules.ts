import type { Luminance } from "../schema/analysis";
import type { RuleCandidate } from "../schema/candidate";
import type { Region } from "../schema/region";
import type { RoomType } from "../schema/vocabulary";
import {
  boxGap,
  boxHeight,
  boxWidth,
  count,
  dilate,
  intersectCount,
  makeGrid,
  regionCells,
  union,
  type Grid,
} from "./geometry";

/** Tunable thresholds (CLAUDE.md §5.3). Fractions are of the image diagonal unless noted. */
export const T = {
  /** A rug/mat this close to a door, toilet, shower, bed… is on a likely walking route. */
  nearAnchorFrac: 0.08,
  /** Ring around a rug/cord used to test whether it lies on the detected floor. */
  floorRingFrac: 0.015,
  /** Share of a cord's cells that must be on or beside the floor. */
  cordOnFloorMin: 0.3,
  /** Clutter area as a share of floor area. */
  clutterFloorMin: 0.02,
  /** Without a floor mask: clutter area as % of the photo. */
  clutterPhotoPctMin: 1,
  /** Grab rail must be within this many toilet widths of the toilet. */
  grabBarToiletWidths: 1.5,
  /** Grab rail must be within this many fixture sizes of a shower/bath. */
  grabBarWetSizes: 1.0,
  /** Handrail must be within this many stair widths. */
  handrailStairWidths: 0.5,
  lowLightMean: 75,
  veryLowLightMean: 55,
  lowLightDarkPct: 35,
  /** Storage counts as high if its top is in the upper 25% and it sits in the upper 60%. */
  highStorageTopFrac: 0.25,
  highStorageBottomFrac: 0.6,
  /** Shoes this much on or beside a person mask are being worn, not left on the floor. */
  wornShoeOverlap: 0.4,
  /** Ring around a person mask for the worn-shoe test. */
  personRingFrac: 0.01,
};

export type RuleInput = {
  width: number;
  height: number;
  luminance: Luminance;
  roomType: RoomType;
  regions: Region[];
  /** Concepts Muse Spark's inventory saw, for conditions SAM can't localise (e.g. mould). */
  inventoryConcepts?: readonly string[];
};

const RUG_LIKE = ["rug", "bath mat", "floor mat"];
const CLUTTER_LIKE = ["clutter on floor", "shoes on floor"];
const WALK_ANCHORS = ["door", "toilet", "shower", "bathtub", "bed", "stairs", "step", "vanity", "sofa"];
const WET_ANCHORS = ["shower", "bathtub"];
const SUPPORTS = ["grab bar", "handrail"];

/** Shared, lazily computed geometry for one photo. */
class Scene {
  readonly grid: Grid;
  readonly diag: number;
  private cache = new Map<string, Uint8Array>();
  private floorCells: Uint8Array | null | undefined;

  constructor(readonly input: RuleInput) {
    this.grid = makeGrid(input.width, input.height);
    this.diag = Math.hypot(input.width, input.height);
  }

  of(...concepts: string[]): Region[] {
    return this.input.regions.filter((r) => concepts.includes(r.concept));
  }

  cells(r: Region): Uint8Array {
    let c = this.cache.get(r.id);
    if (!c) {
      c = regionCells(r, this.grid);
      this.cache.set(r.id, c);
    }
    return c;
  }

  /** Union of all floor regions, or null if no floor was detected. */
  floor(): Uint8Array | null {
    if (this.floorCells === undefined) {
      const floors = this.of("floor");
      this.floorCells = floors.length ? union(this.grid, floors.map((f) => this.cells(f))) : null;
    }
    return this.floorCells;
  }

  cellsFor(frac: number): number {
    return Math.max(1, Math.round((frac * this.diag) / this.grid.step));
  }

  /**
   * Share of a region that lies on or right next to the floor. Objects on the
   * floor hide it, so SAM's floor mask usually has a hole where a rug is: we
   * test the region dilated by a small ring.
   */
  onFloorShare(r: Region): number | null {
    const floor = this.floor();
    if (!floor) return null;
    const own = this.cells(r);
    const n = count(own);
    if (n === 0) return 0;
    const inside = intersectCount(own, floor);
    const ring = dilate(this.grid, own, this.cellsFor(T.floorRingFrac));
    const touching = intersectCount(ring, floor) > 0;
    return touching ? Math.max(inside / n, 0.5) : inside / n;
  }

  /** Nearest region (by box gap) among the given concepts, excluding `self`. */
  nearest(self: Region, concepts: string[]): { region: Region; gap: number } | null {
    let best: { region: Region; gap: number } | null = null;
    for (const r of this.of(...concepts)) {
      if (r.id === self.id) continue;
      const gap = boxGap(self.box, r.box);
      if (!best || gap < best.gap) best = { region: r, gap };
    }
    return best;
  }

  lowerHalf(r: Region): boolean {
    return (r.box.y1 + r.box.y2) / 2 > this.input.height / 2;
  }
}

const px = (n: number) => `${Math.round(n)}px`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function tripRugOnPath(s: Scene): RuleCandidate[] {
  const out: RuleCandidate[] = [];
  for (const rug of s.of(...RUG_LIKE)) {
    const share = s.onFloorShare(rug);
    const onFloor = share === null ? s.lowerHalf(rug) : share >= 0.5;
    if (!onFloor) continue;
    const near = s.nearest(rug, WALK_ANCHORS);
    const nearAnchor = near !== null && near.gap <= T.nearAnchorFrac * s.diag;
    const nearWet = nearAnchor && WET_ANCHORS.includes(near!.region.concept);
    const ids = nearAnchor ? [rug.id, near!.region.id] : [rug.id];
    const where = nearAnchor
      ? `${px(near!.gap)} from ${near!.region.concept} ${near!.region.id}`
      : "not next to a door or fixture";
    out.push({
      rule_id: "TRIP_RUG_ON_PATH",
      category: "trip",
      region_ids: ids,
      scope: "region",
      measurement: `${rug.concept} ${rug.id} covers ${rug.area_pct}% of the photo, ${where}`,
      metrics: {
        area_pct: rug.area_pct,
        gap_px: near ? Math.round(near.gap) : -1,
        on_floor: share ?? -1,
      },
      confidence: share === null ? "low" : "medium",
      priority: nearWet ? "discuss_soon" : nearAnchor ? "worth_checking" : "minor",
      title: nearWet
        ? `Loose ${rug.concept} near the ${near!.region.concept}`
        : nearAnchor
          ? `${capital(rug.concept)} on a likely walking route`
          : `${capital(rug.concept)} on the floor`,
      explanation: `A ${rug.concept} that slides or has raised edges may catch a foot${
        nearWet ? ", especially on a wet floor" : ""
      }. This one is ${nearAnchor ? `close to the ${near!.region.concept}, where people often walk` : "on the floor"}.`,
      suggestion: `Whether the ${rug.concept} grips the floor, or could be removed or secured, may be worth discussing with an occupational therapist.`,
    });
  }
  return out;
}

function tripCordOnFloor(s: Scene): RuleCandidate[] {
  const out: RuleCandidate[] = [];
  for (const cord of s.of("electrical cord")) {
    const share = s.onFloorShare(cord);
    const onFloor = share === null ? s.lowerHalf(cord) : share >= T.cordOnFloorMin;
    if (!onFloor) continue;
    out.push({
      rule_id: "TRIP_CORD_ON_FLOOR",
      category: "trip",
      region_ids: [cord.id],
      scope: "region",
      measurement:
        share === null
          ? `cord ${cord.id} is in the lower half of the photo (no floor detected)`
          : `${pct(share)} of cord ${cord.id} is on or beside the floor`,
      metrics: { on_floor: share ?? -1, area_pct: cord.area_pct },
      confidence: share === null ? "low" : "medium",
      priority: "worth_checking",
      title: "Cord on or near the floor",
      explanation: "A cord running across the floor may catch a foot or a walking aid.",
      suggestion: "Options for moving or covering the cord may be worth discussing with an occupational therapist.",
    });
  }
  return out;
}

function clutterFloor(s: Scene): RuleCandidate[] {
  const clutter = s.of(...CLUTTER_LIKE).filter((c) => {
    const share = s.onFloorShare(c);
    return share === null ? s.lowerHalf(c) : share >= 0.5;
  });
  if (clutter.length === 0) return [];
  const floor = s.floor();
  const clutterCells = count(union(s.grid, clutter.map((c) => s.cells(c))));
  const areaPct = clutter.reduce((a, c) => a + c.area_pct, 0);
  const ratio = floor ? clutterCells / Math.max(1, count(floor) + clutterCells) : null;
  const enough = ratio === null ? areaPct >= T.clutterPhotoPctMin : ratio >= T.clutterFloorMin;
  if (!enough) return [];
  return [
    {
      rule_id: "CLUTTER_FLOOR",
      category: "trip",
      region_ids: clutter.map((c) => c.id),
      scope: "region",
      measurement:
        ratio === null
          ? `loose items cover ${areaPct.toFixed(1)}% of the photo`
          : `loose items cover about ${pct(ratio)} of the visible floor`,
      metrics: { floor_share: ratio ?? -1, area_pct: areaPct, items: clutter.length },
      confidence: "medium",
      priority: "worth_checking",
      title: "Items on the floor",
      explanation: "Things left on the floor can be easy to miss and trip over, especially at night.",
      suggestion: "Ways to keep walkways clear may be worth discussing with an occupational therapist.",
    },
  ];
}

function noGrabBarToilet(s: Scene): RuleCandidate[] {
  const out: RuleCandidate[] = [];
  for (const toilet of s.of("toilet")) {
    const radius = T.grabBarToiletWidths * boxWidth(toilet.box);
    const support = s.nearest(toilet, SUPPORTS);
    if (support && support.gap <= radius) continue;
    out.push({
      rule_id: "NO_GRAB_BAR_TOILET",
      category: "bathroom",
      region_ids: [toilet.id],
      scope: "region",
      measurement: support
        ? `nearest rail ${support.region.id} is ${px(support.gap)} away (limit ${px(radius)})`
        : `no grab rail detected within ${px(radius)} of toilet ${toilet.id}`,
      metrics: { radius_px: Math.round(radius), nearest_px: support ? Math.round(support.gap) : -1 },
      confidence: "medium",
      priority: "discuss_soon",
      title: "No grab rail visible beside the toilet",
      explanation:
        "No grab rail is visible next to the toilet in this photo. A rail can make sitting down and standing up steadier.",
      suggestion: "A grab rail beside the toilet may be worth discussing with an occupational therapist.",
    });
  }
  return out;
}

function noGrabBarWet(s: Scene): RuleCandidate[] {
  const fixtures = s.of(...WET_ANCHORS).filter((f) => {
    const radius = T.grabBarWetSizes * Math.max(boxWidth(f.box), boxHeight(f.box));
    const support = s.nearest(f, SUPPORTS);
    return !(support && support.gap <= radius);
  });
  if (fixtures.length === 0) return [];
  const names = [...new Set(fixtures.map((f) => f.concept))].join(" or ");
  return [
    {
      rule_id: "NO_GRAB_BAR_WET",
      category: "bathroom",
      region_ids: fixtures.map((f) => f.id),
      scope: "region",
      measurement: `no grab rail detected near ${fixtures.map((f) => `${f.concept} ${f.id}`).join(", ")}`,
      metrics: { fixtures: fixtures.length },
      confidence: "medium",
      priority: "discuss_soon",
      title: `No grab rail visible near the ${names}`,
      explanation: `No grab rail is visible near the ${names} in this photo. Wet floors are slippery, and a rail gives something firm to hold.`,
      suggestion: `A grab rail near the ${names} may be worth discussing with an occupational therapist.`,
    },
  ];
}

function stepThreshold(s: Scene): RuleCandidate[] {
  const out: RuleCandidate[] = [];
  for (const step of s.of("step", "threshold", "stairs")) {
    const near = s.nearest(step, ["door", ...WET_ANCHORS]);
    const nearAnchor = near !== null && near.gap <= T.nearAnchorFrac * s.diag;
    if (step.concept !== "stairs" && !nearAnchor) continue;
    out.push({
      rule_id: "STEP_THRESHOLD",
      category: "mobility",
      region_ids: nearAnchor ? [step.id, near!.region.id] : [step.id],
      scope: "region",
      measurement: nearAnchor
        ? `${step.concept} ${step.id} is ${px(near!.gap)} from ${near!.region.concept} ${near!.region.id}`
        : `${step.concept} ${step.id} detected`,
      metrics: { gap_px: near ? Math.round(near.gap) : -1 },
      confidence: "medium",
      priority: "worth_checking",
      title: nearAnchor ? `Change in floor level at the ${near!.region.concept}` : "Stairs in the room",
      explanation:
        "A step or raised edge can be hard to see and easy to trip on, especially when carrying something.",
      suggestion:
        "Whether the edge is easy to see, or a ramp or rail would help, may be worth discussing with an occupational therapist.",
    });
  }
  return out;
}

function noHandrailStairs(s: Scene): RuleCandidate[] {
  const out: RuleCandidate[] = [];
  for (const stairs of s.of("stairs")) {
    const radius = T.handrailStairWidths * boxWidth(stairs.box);
    const rail = s.nearest(stairs, SUPPORTS);
    if (rail && rail.gap <= radius) continue;
    out.push({
      rule_id: "NO_HANDRAIL_STAIRS",
      category: "mobility",
      region_ids: [stairs.id],
      scope: "region",
      measurement: `no handrail detected within ${px(radius)} of stairs ${stairs.id}`,
      metrics: { radius_px: Math.round(radius) },
      confidence: "medium",
      priority: "discuss_soon",
      title: "No handrail visible beside the stairs",
      explanation: "No handrail is visible beside these stairs in this photo. A rail gives support going up and down.",
      suggestion: "A handrail for these stairs may be worth discussing with an occupational therapist.",
    });
  }
  return out;
}

function lowLight(s: Scene): RuleCandidate[] {
  const { mean, dark_pct } = s.input.luminance;
  if (mean >= T.lowLightMean && dark_pct <= T.lowLightDarkPct) return [];
  return [
    {
      rule_id: "LOW_LIGHT",
      category: "lighting",
      region_ids: [],
      scope: "whole_image",
      measurement: `mean brightness ${mean}/255, ${dark_pct}% of pixels very dark`,
      metrics: { mean, dark_pct },
      confidence: "low",
      priority: mean < T.veryLowLightMean ? "worth_checking" : "minor",
      title: "Room appears dimly lit in this photo",
      explanation:
        "The room looks dim in this photo. Good lighting helps people see edges, steps and things on the floor.",
      suggestion: "Whether the lighting is bright enough, day and night, may be worth discussing with an occupational therapist.",
    },
  ];
}

function highStorage(s: Scene): RuleCandidate[] {
  const H = s.input.height;
  const high = s
    .of("high cupboard", "shelf")
    .filter((r) => r.box.y1 < T.highStorageTopFrac * H && r.box.y2 < T.highStorageBottomFrac * H);
  if (high.length === 0) return [];
  return [
    {
      rule_id: "HIGH_STORAGE",
      category: "reach",
      region_ids: high.map((r) => r.id),
      scope: "region",
      measurement: high.map((r) => `${r.concept} ${r.id} top at ${pct(r.box.y1 / H)} of photo height`).join("; "),
      metrics: { items: high.length },
      confidence: "low",
      priority: "minor",
      title: "Storage that may be hard to reach",
      explanation:
        "Storage up high can mean reaching or climbing. Everyday items may be easier to get at lower down.",
      suggestion: "Where everyday items are kept may be worth discussing with an occupational therapist.",
    },
  ];
}

function wallMould(s: Scene): RuleCandidate[] {
  const patches = s.of("mould on wall");
  const seen = s.input.inventoryConcepts?.includes("mould on wall") ?? false;
  if (patches.length === 0 && !seen) return [];
  // SAM often can't outline mould. Then the finding is about the whole photo, never a guessed spot.
  const located = patches.length > 0;
  return [
    {
      rule_id: "WALL_MOULD",
      category: "upkeep",
      region_ids: patches.map((r) => r.id),
      scope: located ? "region" : "whole_image",
      measurement: located
        ? patches.map((r) => `patch ${r.id} covers ${r.area_pct}% of the photo`).join("; ")
        : "inventory saw possible mould; no patch could be outlined",
      metrics: { patches: patches.length, area_pct: patches.reduce((a, r) => a + r.area_pct, 0) },
      confidence: "low",
      priority: "worth_checking",
      title: located ? "Possible mould or marks on the wall" : "Possible mould or marks visible in this photo",
      explanation:
        "Dark patches on a wall may be mould, damp or dirt. Mould and damp can make the air in a room less healthy.",
      suggestion:
        "Whether this is mould or damp, and what may be causing it, may be worth discussing with an occupational therapist or a building professional.",
    },
  ];
}

function looseBlind(s: Scene): RuleCandidate[] {
  // Only segmented when the inventory judged a blind loose or damaged; SAM finds the blind itself.
  const blinds = s.of("loose window blind");
  const seen = s.input.inventoryConcepts?.includes("loose window blind") ?? false;
  if (blinds.length === 0 && !seen) return [];
  const located = blinds.length > 0;
  return [
    {
      rule_id: "LOOSE_BLIND",
      category: "upkeep",
      region_ids: blinds.map((r) => r.id),
      scope: located ? "region" : "whole_image",
      measurement: located
        ? `inventory saw a loose or damaged blind; SAM outlined ${blinds.map((r) => r.id).join(", ")}`
        : "inventory saw a loose or damaged blind; it could not be outlined",
      metrics: { blinds: blinds.length },
      confidence: "low",
      priority: "worth_checking",
      title: "Window blind that may be loose or damaged",
      explanation:
        "A blind that hangs loose or crooked may come down if pulled or leaned on. Loose cords can catch hands or walking aids.",
      suggestion:
        "Whether the blind is secure and easy to open and close may be worth discussing with an occupational therapist.",
    },
  ];
}

/**
 * Shoes on someone's feet aren't clutter. Drops "shoes on floor" regions that sit
 * mostly on or right beside a person mask, so neither the rules nor Muse Spark see them.
 */
export function removeWornShoes(input: RuleInput): Region[] {
  const s = new Scene(input);
  const people = s.of("person");
  if (people.length === 0) return input.regions;
  const near = dilate(s.grid, union(s.grid, people.map((p) => s.cells(p))), s.cellsFor(T.personRingFrac));
  return input.regions.filter((r) => {
    if (r.concept !== "shoes on floor") return true;
    const own = s.cells(r);
    return intersectCount(own, near) / Math.max(1, count(own)) < T.wornShoeOverlap;
  });
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const RULES: Record<RuleCandidate["rule_id"], (s: Scene) => RuleCandidate[]> = {
  TRIP_RUG_ON_PATH: tripRugOnPath,
  TRIP_CORD_ON_FLOOR: tripCordOnFloor,
  CLUTTER_FLOOR: clutterFloor,
  NO_GRAB_BAR_TOILET: noGrabBarToilet,
  NO_GRAB_BAR_WET: noGrabBarWet,
  STEP_THRESHOLD: stepThreshold,
  NO_HANDRAIL_STAIRS: noHandrailStairs,
  LOW_LIGHT: lowLight,
  HIGH_STORAGE: highStorage,
  WALL_MOULD: wallMould,
  LOOSE_BLIND: looseBlind,
};

/** Step 3: run every rule. Pure and deterministic: same regions in, same candidates out. */
export function runRules(input: RuleInput): RuleCandidate[] {
  const scene = new Scene(input);
  return Object.values(RULES).flatMap((rule) => rule(scene));
}
