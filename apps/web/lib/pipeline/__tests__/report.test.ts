import { describe, expect, it } from "vitest";
import type { Finding } from "../../schema/finding";
import { priorityCounts, questionsFor } from "../report";

const f = (over: Partial<Finding>): Finding => ({
  id: "F1",
  rule_id: null,
  category: "trip",
  title: "Thing",
  explanation: "",
  suggestion: "",
  region_ids: ["R1"],
  scope: "region",
  confidence: "medium",
  priority: "worth_checking",
  evidence: "",
  ...over,
});

describe("report questions", () => {
  it("uses the rule's question, once per rule, numbered by finding", () => {
    const qs = questionsFor([
      [
        f({ rule_id: "NO_GRAB_BAR_TOILET", category: "bathroom" }),
        f({ rule_id: "TRIP_CORD_ON_FLOOR" }),
        f({ rule_id: "TRIP_CORD_ON_FLOOR" }),
        f({ rule_id: null, category: "reach", title: "Low drawers" }),
      ],
    ]);
    expect(qs.map((q) => q.label)).toEqual(["1", "2", "4"]);
    expect(qs[0].question).toMatch(/grab rail beside the toilet/);
    expect(qs[2].question).toMatch(/reach/);
  });

  it("never phrases a question as an instruction or with banned words", () => {
    const all = questionsFor([
      (["trip", "bathroom", "lighting", "reach", "mobility", "upkeep", "other"] as const).map((category) =>
        f({ category }),
      ),
    ]);
    for (const q of all) {
      expect(q.question).not.toMatch(/\b(safe|unsafe|compliant|passes|install|drill)\b/i);
      expect(q.question.endsWith("?")).toBe(true);
    }
  });

  it("labels findings by photo when there are several, and asks a repeated rule once", () => {
    const qs = questionsFor([
      [f({ rule_id: "TRIP_RUG_ON_PATH" })],
      [f({ rule_id: "TRIP_RUG_ON_PATH" }), f({ rule_id: "LOW_LIGHT", category: "lighting" })],
    ]);
    expect(qs.map((q) => q.label)).toEqual(["A1", "B2"]);
  });

  it("counts priorities", () => {
    expect(priorityCounts([f({ priority: "minor" }), f({ priority: "minor" })])).toEqual({
      discuss_soon: 0,
      worth_checking: 0,
      minor: 2,
    });
  });
});
