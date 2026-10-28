import { describe, expect, it } from "vitest";
import type { ExplainFinding } from "../../schema/explain";
import { runRules } from "../rules";
import { truncateTitle, validateFindings } from "../validate";
import { rect, scene } from "./fixtures";

const FLOOR = rect("R1", "floor", 0, 700, 1600, 1200);
const TOILET = rect("R2", "toilet", 700, 700, 900, 1000);
const MAT = rect("R3", "bath mat", 600, 1010, 900, 1100);
const regions = [FLOOR, TOILET, MAT];
const candidates = runRules(scene(regions));

function f(over: Partial<ExplainFinding>): ExplainFinding {
  return {
    rule_id: null,
    category: "trip",
    title: "Something",
    explanation: "It may matter.",
    suggestion: "This may be worth discussing with an occupational therapist.",
    region_ids: ["R3"],
    scope: "region",
    confidence: "medium",
    priority: "worth_checking",
    evidence: "visible",
    ...over,
  };
}

describe("validateFindings", () => {
  it("drops findings that cite unknown regions and counts them", () => {
    const { findings, stats } = validateFindings(
      { findings: [f({ region_ids: ["R9"], title: "Invented" })], rejected: [] },
      regions,
      [],
    );
    expect(findings).toHaveLength(0);
    expect(stats.dropped_ungrounded).toBe(1);
  });

  it("drops region-scoped findings with no regions, keeps whole-image ones", () => {
    const { findings, stats } = validateFindings(
      {
        findings: [
          f({ region_ids: [], scope: "region", title: "Nowhere" }),
          f({ region_ids: [], scope: "whole_image", category: "lighting", title: "Dim" }),
        ],
        rejected: [],
      },
      regions,
      [],
    );
    expect(findings.map((x) => x.title)).toEqual(["Dim"]);
    expect(stats.dropped_ungrounded).toBe(1);
  });

  it("caps absence findings at medium confidence even if the model says high", () => {
    const { findings } = validateFindings(
      {
        findings: [
          f({ rule_id: "NO_GRAB_BAR_TOILET", region_ids: ["R2"], category: "bathroom", confidence: "high", title: "No rail visible" }),
        ],
        rejected: [],
      },
      regions,
      candidates,
    );
    const rail = findings.find((x) => x.rule_id === "NO_GRAB_BAR_TOILET")!;
    expect(rail.confidence).toBe("medium");
    expect(rail.evidence).toContain("measured:");
  });

  it("caps VLM-only observations at medium", () => {
    const { findings } = validateFindings(
      { findings: [f({ confidence: "high", category: "reach", region_ids: ["R2"] })], rejected: [] },
      regions,
      [],
    );
    expect(findings[0].confidence).toBe("medium");
  });

  it("replaces rule wording that breaks language rules, drops VLM wording that does", () => {
    const { findings, stats } = validateFindings(
      {
        findings: [
          f({ rule_id: "NO_GRAB_BAR_TOILET", region_ids: ["R2"], category: "bathroom", title: "Toilet is unsafe" }),
          f({ suggestion: "Install a rail here.", region_ids: ["R2"], category: "reach" }),
        ],
        rejected: [],
      },
      regions,
      candidates,
    );
    expect(findings.some((x) => /unsafe/i.test(x.title))).toBe(false);
    expect(findings.find((x) => x.rule_id === "NO_GRAB_BAR_TOILET")!.title).toBe(
      "No grab rail visible beside the toilet",
    );
    expect(stats.language_fixed).toBe(1);
    expect(stats.language_dropped).toBe(1);
  });

  it("records rejections and restores candidates the model skipped", () => {
    expect(candidates.map((c) => c.rule_id).sort()).toEqual(["NO_GRAB_BAR_TOILET", "TRIP_RUG_ON_PATH"]);
    const { findings, stats } = validateFindings(
      { findings: [], rejected: [{ rule_id: "TRIP_RUG_ON_PATH", region_ids: ["R3"], reason: "It is a towel." }] },
      regions,
      candidates,
    );
    expect(stats.rejected).toEqual([
      { rule_id: "TRIP_RUG_ON_PATH", region_ids: ["R3", "R2"], reason: "It is a towel." },
    ]);
    expect(stats.restored).toBe(1);
    expect(findings.map((x) => x.rule_id)).toEqual(["NO_GRAB_BAR_TOILET"]);
  });

  it("de-duplicates, sorts by priority and numbers F1, F2…", () => {
    const { findings, stats } = validateFindings(
      {
        findings: [
          f({ title: "Minor thing", priority: "minor", region_ids: ["R3"], category: "other" }),
          f({ rule_id: "NO_GRAB_BAR_TOILET", region_ids: ["R2"], category: "bathroom", priority: "discuss_soon" }),
          f({ rule_id: "NO_GRAB_BAR_TOILET", region_ids: ["R2"], category: "bathroom", priority: "discuss_soon" }),
        ],
        rejected: [],
      },
      regions,
      candidates,
    );
    expect(stats.deduplicated).toBe(1);
    expect(findings[0].priority).toBe("discuss_soon");
    expect(findings.map((x) => x.id)).toEqual(findings.map((_, i) => `F${i + 1}`));
  });

  it("treats a made-up rule_id as a VLM observation", () => {
    const { findings } = validateFindings(
      { findings: [f({ rule_id: "NOT_A_RULE", region_ids: ["R3"] })], rejected: [] },
      regions,
      [],
    );
    expect(findings[0].rule_id).toBeNull();
  });
});

describe("matching findings to candidates", () => {
  it("pairs each finding with the candidate sharing the most regions (shared anchor)", () => {
    const rs = [
      FLOOR,
      rect("R4", "bath mat", 300, 1000, 500, 1100),
      rect("R5", "rug", 700, 1000, 900, 1100),
      rect("R6", "vanity", 450, 700, 750, 990),
    ];
    const cands = runRules(scene(rs)).filter((c) => c.rule_id === "TRIP_RUG_ON_PATH");
    expect(cands.map((c) => c.region_ids)).toEqual([
      ["R4", "R6"],
      ["R5", "R6"],
    ]);
    const { findings, stats } = validateFindings(
      { findings: [f({ rule_id: "TRIP_RUG_ON_PATH", region_ids: ["R5", "R6"], title: "Rug near the sink" })], rejected: [] },
      rs,
      cands,
    );
    expect(stats.restored).toBe(1); // the bath mat candidate, not the rug
    expect(findings.map((x) => x.region_ids.join(",")).sort()).toEqual(["R4,R6", "R5,R6"]);
  });
});

describe("truncateTitle", () => {
  it("cuts long titles at a word boundary", () => {
    const t = truncateTitle("A very long title that keeps going well past the sixty character limit");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith("…")).toBe(true);
  });
});
