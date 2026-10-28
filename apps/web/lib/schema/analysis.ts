import { z } from "zod";
import { RuleCandidateSchema } from "./candidate";
import { FindingSchema } from "./finding";
import { InventorySchema } from "./inventory";
import { RegionSchema } from "./region";
import { RoomTypeSchema } from "./vocabulary";

export const LuminanceSchema = z.object({
  /** Mean luma 0–255. */
  mean: z.number(),
  /** % of pixels with luma below the darkness threshold. */
  dark_pct: z.number(),
});
export type Luminance = z.infer<typeof LuminanceSchema>;

export const StepTimingSchema = z.object({
  step: z.enum(["preprocess", "inventory", "segment", "rules", "explain", "render"]),
  ms: z.number(),
  detail: z.string().optional(),
  cached: z.boolean().optional(),
});
export type StepTiming = z.infer<typeof StepTimingSchema>;

export const ConceptRunSchema = z.object({
  concept: z.string(),
  instances: z.number().int(),
  kept: z.number().int(),
  ms: z.number(),
  cached: z.boolean(),
});

/** Everything the result page needs for one photo. */
export const PhotoAnalysisSchema = z.object({
  id: z.string(),
  sha256: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  /** Preprocessed JPEG (EXIF stripped, ≤1600px) as a data URL. */
  image_data_url: z.string(),
  luminance: LuminanceSchema,
  inventory: InventorySchema,
  /** Room type used downstream: the user's override, else the inventory's guess. */
  room_type: RoomTypeSchema,
  room_type_source: z.enum(["auto", "user"]),
  regions: z.array(RegionSchema),
  /** Step 3 output: deterministic rule candidates. */
  candidates: z.array(RuleCandidateSchema),
  /** Final, grounded findings shown to the user. */
  findings: z.array(FindingSchema),
  /** "rules" = template wording from step 3 (explain not run or failed); "explain" = Muse Spark. */
  findings_source: z.enum(["rules", "explain"]),
  concept_runs: z.array(ConceptRunSchema),
  timings: z.array(StepTimingSchema),
  prompt_versions: z.record(z.string(), z.string()),
  models: z.record(z.string(), z.string()),
  cost_usd: z.number(),
  created_at: z.string(),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>;
