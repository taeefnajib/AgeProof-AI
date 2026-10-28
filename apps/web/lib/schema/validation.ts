import { z } from "zod";

export const ValidationStatsSchema = z.object({
  /** Findings the model returned. */
  proposed: z.number().int(),
  /** Dropped because they cited region IDs that don't exist (hallucination metric). */
  dropped_ungrounded: z.number().int(),
  /** Model text broke the language rules; replaced by template wording or dropped. */
  language_fixed: z.number().int(),
  language_dropped: z.number().int(),
  deduplicated: z.number().int(),
  /** Rule candidates the model rejected, with its reason. */
  rejected: z.array(z.object({ rule_id: z.string(), region_ids: z.array(z.string()), reason: z.string() })),
  /** Candidates the model neither confirmed nor rejected: restored with template wording. */
  restored: z.number().int(),
  kept: z.number().int(),
});
export type ValidationStats = z.infer<typeof ValidationStatsSchema>;
