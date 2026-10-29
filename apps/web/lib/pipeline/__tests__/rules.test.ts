import { describe, expect, it } from "vitest";
import { boxGap, dilate, makeGrid, regionCells, count } from "../geometry";
import { removeWornShoes, runRules } from "../rules";
import { rect, scene } from "./fixtures";

const ruleIds = (input: Parameters<typeof runRules>[0]) => runRules(input).map((c) => c.rule_id);

// Floor covers the lower half of a 1600×1200 photo, with a hole where objects sit.
const FLOOR = rect("R1", "floor", 0, 700, 1600, 1200);

describe("geometry", () => {
  it("rasterises a box mask onto the grid", () => {
    const grid = makeGrid(1600, 1200);
    const cells = regionCells(rect("R1", "rug", 0, 0, 40, 40), grid);
    expect(count(cells)).toBe(100); // 40/4 × 40/4
  });

  it("dilates by r cells in every direction", () => {
    const grid = makeGrid(20, 20, 4); // 5×5 cells
    const one = new Uint8Array(25);
    one[12] = 1; // centre
    expect(count(dilate(grid, one, 1))).toBe(9);
  });

  it("measures box gaps", () => {
    expect(boxGap({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 13, y1: 14, x2: 20, y2: 20 })).toBe(5);
    expect(boxGap({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 20, y2: 20 })).toBe(0);
  });
});

describe("TRIP_RUG_ON_PATH", () => {
  it("flags a rug on the floor next to a door", () => {
    const [c] = runRules(
      scene([FLOOR, rect("R2", "rug", 600, 900, 900, 1000), rect("R3", "door", 950, 300, 1200, 1100)], {
        roomType: "living",
      }),
    ).filter((x) => x.rule_id === "TRIP_RUG_ON_PATH");
    expect(c.region_ids).toEqual(["R2", "R3"]);
    expect(c.priority).toBe("worth_checking");
    expect(c.metrics.gap_px).toBe(50);
  });

  it("raises priority for a bath mat beside the shower", () => {
    const [c] = runRules(
      scene([FLOOR, rect("R2", "bath mat", 300, 950, 600, 1050), rect("R3", "shower", 250, 200, 650, 940)]),
    ).filter((x) => x.rule_id === "TRIP_RUG_ON_PATH");
    expect(c.priority).toBe("discuss_soon");
    expect(c.title).toContain("near the shower");
  });

  it("ignores a rug hanging on the wall", () => {
    expect(ruleIds(scene([FLOOR, rect("R2", "rug", 600, 100, 900, 300)]))).not.toContain("TRIP_RUG_ON_PATH");
  });

  it("falls back to low confidence when no floor was detected", () => {
    const [c] = runRules(scene([rect("R2", "rug", 600, 900, 900, 1000)])).filter(
      (x) => x.rule_id === "TRIP_RUG_ON_PATH",
    );
    expect(c.confidence).toBe("low");
    expect(c.priority).toBe("minor");
  });
});

describe("grab rails (absence rules)", () => {
  const toilet = rect("R2", "toilet", 700, 700, 900, 1000);

  it("flags a toilet with no rail nearby, capped at medium confidence", () => {
    const [c] = runRules(scene([FLOOR, toilet])).filter((x) => x.rule_id === "NO_GRAB_BAR_TOILET");
    expect(c.region_ids).toEqual(["R2"]);
    expect(c.confidence).toBe("medium");
    expect(c.title).toContain("visible");
  });

  it("does not flag a toilet with a grab bar beside it", () => {
    const bar = rect("R3", "grab bar", 920, 650, 960, 850);
    expect(ruleIds(scene([FLOOR, toilet, bar]))).not.toContain("NO_GRAB_BAR_TOILET");
  });

  it("still flags when the only rail is far away", () => {
    const bar = rect("R3", "grab bar", 100, 100, 140, 300);
    expect(ruleIds(scene([FLOOR, toilet, bar]))).toContain("NO_GRAB_BAR_TOILET");
  });

  it("groups shower and bath into one candidate", () => {
    const [c] = runRules(
      scene([rect("R2", "shower", 0, 0, 400, 900), rect("R3", "bathtub", 500, 600, 1200, 1000)]),
    ).filter((x) => x.rule_id === "NO_GRAB_BAR_WET");
    expect(c.region_ids).toEqual(["R2", "R3"]);
    expect(c.title).toBe("No grab rail visible near the shower or bathtub");
  });
});

describe("floor hazards", () => {
  it("flags a cord lying on the floor", () => {
    expect(ruleIds(scene([FLOOR, rect("R2", "electrical cord", 200, 800, 700, 820)]))).toContain(
      "TRIP_CORD_ON_FLOOR",
    );
  });

  it("ignores a cord high on the wall", () => {
    expect(ruleIds(scene([FLOOR, rect("R2", "electrical cord", 200, 100, 700, 120)]))).not.toContain(
      "TRIP_CORD_ON_FLOOR",
    );
  });

  it("flags clutter above the floor-share threshold only", () => {
    const small = rect("R2", "clutter on floor", 100, 1100, 110, 1110); // tiny
    const big = rect("R3", "shoes on floor", 300, 900, 600, 1100);
    expect(ruleIds(scene([FLOOR, small]))).not.toContain("CLUTTER_FLOOR");
    expect(ruleIds(scene([FLOOR, small, big]))).toContain("CLUTTER_FLOOR");
  });
});

describe("level changes", () => {
  it("flags a threshold at a door, and stairs anywhere without a rail", () => {
    const ids = ruleIds(
      scene([
        FLOOR,
        rect("R2", "threshold", 1000, 1050, 1300, 1080),
        rect("R3", "door", 1000, 300, 1300, 1050),
        rect("R4", "stairs", 100, 400, 500, 1100),
      ]),
    );
    expect(ids.filter((i) => i === "STEP_THRESHOLD")).toHaveLength(2);
    expect(ids).toContain("NO_HANDRAIL_STAIRS");
  });

  it("ignores a lone step far from any door or shower", () => {
    expect(ruleIds(scene([FLOOR, rect("R2", "step", 100, 1100, 200, 1150)]))).not.toContain("STEP_THRESHOLD");
  });
});

describe("whole-photo rules", () => {
  it("flags a dim photo as whole_image with no regions", () => {
    const [c] = runRules(scene([FLOOR], { luminance: { mean: 50, dark_pct: 60 } })).filter(
      (x) => x.rule_id === "LOW_LIGHT",
    );
    expect(c.scope).toBe("whole_image");
    expect(c.region_ids).toEqual([]);
    expect(c.priority).toBe("worth_checking");
  });

  it("does not flag a bright photo", () => {
    expect(ruleIds(scene([FLOOR]))).not.toContain("LOW_LIGHT");
  });

  it("flags storage in the upper quarter only", () => {
    expect(ruleIds(scene([rect("R2", "high cupboard", 100, 50, 500, 400)]))).toContain("HIGH_STORAGE");
    expect(ruleIds(scene([rect("R2", "shelf", 100, 500, 500, 900)]))).not.toContain("HIGH_STORAGE");
  });
});

describe("worn shoes", () => {
  it("drops shoes on a person's feet but keeps shoes left on the floor", () => {
    const input = scene([
      FLOOR,
      rect("R2", "person", 400, 200, 600, 1050),
      rect("R3", "shoes on floor", 420, 1000, 580, 1060),
      rect("R4", "shoes on floor", 1200, 1000, 1350, 1060),
    ]);
    expect(removeWornShoes(input).map((r) => r.id)).toEqual(["R1", "R2", "R4"]);
  });

  it("keeps all shoes when nobody is in the photo", () => {
    const input = scene([FLOOR, rect("R2", "shoes on floor", 420, 1000, 580, 1060)]);
    expect(removeWornShoes(input)).toHaveLength(2);
  });
});

describe("WALL_MOULD and LOOSE_BLIND", () => {
  it("points at outlined mould patches", () => {
    const [c] = runRules(scene([rect("R2", "mould on wall", 100, 100, 300, 250)])).filter(
      (x) => x.rule_id === "WALL_MOULD",
    );
    expect(c.region_ids).toEqual(["R2"]);
    expect(c.scope).toBe("region");
    expect(c.category).toBe("upkeep");
  });

  it("falls back to whole photo when the inventory saw mould SAM couldn't outline", () => {
    const [c] = runRules(scene([FLOOR], { inventoryConcepts: ["mould on wall"] })).filter(
      (x) => x.rule_id === "WALL_MOULD",
    );
    expect(c.region_ids).toEqual([]);
    expect(c.scope).toBe("whole_image");
  });

  it("flags a loose blind only when one was segmented or seen", () => {
    expect(ruleIds(scene([FLOOR]))).not.toContain("LOOSE_BLIND");
    const [c] = runRules(scene([rect("R2", "loose window blind", 0, 0, 300, 600)])).filter(
      (x) => x.rule_id === "LOOSE_BLIND",
    );
    expect(c.region_ids).toEqual(["R2"]);
  });
});

describe("determinism", () => {
  it("returns identical output for identical input", () => {
    const input = scene([FLOOR, rect("R2", "rug", 600, 900, 900, 1000), rect("R3", "toilet", 100, 700, 300, 1000)]);
    expect(runRules(input)).toEqual(runRules(input));
  });
});
