import { z } from "zod";
import { FindingSchema } from "./finding";

export const RULE_IDS = [
  "TRIP_RUG_ON_PATH",
  "TRIP_CORD_ON_FLOOR",
  "CLUTTER_FLOOR",
  "NO_GRAB_BAR_TOILET",
  "NO_GRAB_BAR_WET",
  "STEP_THRESHOLD",
  "NO_HANDRAIL_STAIRS",
  "LOW_LIGHT",
  "HIGH_STORAGE",
  "WALL_MOULD",
  "LOOSE_BLIND",
] as const;
export const RuleIdSchema = z.enum(RULE_IDS);
export type RuleId = z.infer<typeof RuleIdSchema>;

/** Rules about something NOT being visible: confidence is capped at medium. */
export const ABSENCE_RULES: readonly RuleId[] = [
  "NO_GRAB_BAR_TOILET",
  "NO_GRAB_BAR_WET",
  "NO_HANDRAIL_STAIRS",
];

/**
 * Output of a deterministic spatial rule (step 3). Carries template wording so
 * it can be shown as a finding directly if the explain step is unavailable.
 */
export const RuleCandidateSchema = z.object({
  rule_id: RuleIdSchema,
  category: FindingSchema.shape.category,
  region_ids: z.array(z.string()),
  scope: FindingSchema.shape.scope,
  /** Human-readable measurement, e.g. "bath mat R2 is 35px from door R5". */
  measurement: z.string(),
  metrics: z.record(z.string(), z.number()),
  confidence: FindingSchema.shape.confidence,
  priority: FindingSchema.shape.priority,
  title: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
});
export type RuleCandidate = z.infer<typeof RuleCandidateSchema>;
