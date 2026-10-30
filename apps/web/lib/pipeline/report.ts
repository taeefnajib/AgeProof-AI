import type { RuleId } from "../schema/candidate";
import type { Finding } from "../schema/finding";

/**
 * "Questions to ask your OT" for the report: one per finding, written as an
 * open question for the visit. Deterministic templates, so they always follow
 * the language rules (no instructions, no "safe"/"unsafe").
 */
const RULE_QUESTIONS: Record<RuleId, string> = {
  TRIP_RUG_ON_PATH: "Would it help to secure, swap or remove this mat or rug?",
  TRIP_CORD_ON_FLOOR: "Is there a better way to run or store this cord?",
  CLUTTER_FLOOR: "What would make it easier to keep this walkway clear?",
  NO_GRAB_BAR_TOILET: "Would a grab rail beside the toilet help with sitting down and standing up?",
  NO_GRAB_BAR_WET: "Would a grab rail near the shower or bath help with getting in and out?",
  STEP_THRESHOLD: "Is this change in floor level easy to see, and would a ramp, rail or contrast strip help?",
  NO_HANDRAIL_STAIRS: "Would a handrail help on these stairs?",
  LOW_LIGHT: "Is the lighting bright enough here, day and night? Would extra lights or night lights help?",
  HIGH_STORAGE: "Could everyday items be kept between waist and shoulder height?",
  WET_FLOOR: "Does this floor get slippery when wet, and what could reduce the risk of slipping?",
  UNEVEN_FLOOR: "Is this floor surface even enough to walk on comfortably?",
  WALL_MOULD: "Could this be mould or damp, and who could check what is causing it?",
  LOOSE_BLIND: "Is this blind secure and easy to open and close?",
};

const CATEGORY_QUESTIONS: Record<Finding["category"], string> = {
  trip: "Could this be a trip risk, and what might help?",
  bathroom: "Would any changes make this part of the bathroom easier to use?",
  lighting: "Is the lighting here bright enough?",
  reach: "Is this easy to reach without stretching, bending or climbing?",
  mobility: "Is there enough room to move around here, with a walking aid if one is used?",
  upkeep: "Does this need repair or cleaning, and who could help?",
  other: "Is this worth changing, and what options are there?",
};

export type ReportQuestion = { number: number; title: string; question: string };

export function questionsFor(findings: Finding[]): ReportQuestion[] {
  const seen = new Set<string>();
  const out: ReportQuestion[] = [];
  findings.forEach((f, i) => {
    let question = (f.rule_id && RULE_QUESTIONS[f.rule_id as RuleId]) || CATEGORY_QUESTIONS[f.category];
    if (f.rule_id === "TRIP_CORD_ON_FLOOR" && /hose/i.test(f.title)) question = question.replace("cord", "hose");
    // A rule that fired twice (two cords) gets one question, citing the first finding.
    if (seen.has(question) && f.rule_id) return;
    seen.add(question);
    out.push({ number: i + 1, title: f.title, question });
  });
  return out;
}

export function priorityCounts(findings: Finding[]): Record<Finding["priority"], number> {
  const counts = { discuss_soon: 0, worth_checking: 0, minor: 0 };
  for (const f of findings) counts[f.priority]++;
  return counts;
}
