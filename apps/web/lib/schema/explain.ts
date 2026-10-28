import { z } from "zod";
import { FindingSchema } from "./finding";

/**
 * What Muse Spark returns in step 4. Looser than FindingSchema (no title
 * length, no IDs): validate.ts turns it into grounded, numbered Findings.
 */
export const ExplainFindingSchema = z.object({
  rule_id: z
    .string()
    .nullable()
    .describe("rule_id of the candidate this confirms, or null for a new observation"),
  category: FindingSchema.shape.category,
  title: z.string().describe("at most 60 characters, plain English"),
  explanation: z.string().describe("at most 2 short sentences: why it may matter"),
  suggestion: z.string().describe("an option to discuss with an occupational therapist"),
  region_ids: z.array(z.string()).describe("IDs from the region table, e.g. R3; [] only for whole_image"),
  scope: FindingSchema.shape.scope,
  confidence: FindingSchema.shape.confidence,
  priority: FindingSchema.shape.priority,
  evidence: z.string().describe("what in the photo or measurement supports this"),
});
export type ExplainFinding = z.infer<typeof ExplainFindingSchema>;

export const ExplainOutputSchema = z.object({
  findings: z.array(ExplainFindingSchema),
  rejected: z
    .array(
      z.object({
        rule_id: z.string(),
        region_ids: z.array(z.string()),
        reason: z.string().describe("what in the photo shows the candidate is wrong"),
      }),
    )
    .describe("rule candidates that the photo clearly contradicts"),
});
export type ExplainOutput = z.infer<typeof ExplainOutputSchema>;
