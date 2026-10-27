import { z } from "zod";

/** Explain-step output (CLAUDE.md §5.4). Used from Day 4; defined now as the contract. */
export const FindingSchema = z.object({
  id: z.string(),
  rule_id: z.string().nullable(),
  category: z.enum(["trip", "bathroom", "lighting", "reach", "mobility", "other"]),
  title: z.string().max(60),
  explanation: z.string(),
  suggestion: z.string(),
  region_ids: z.array(z.string()),
  scope: z.enum(["region", "whole_image"]),
  confidence: z.enum(["low", "medium", "high"]),
  priority: z.enum(["discuss_soon", "worth_checking", "minor"]),
  evidence: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;
