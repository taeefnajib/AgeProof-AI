import { imagePart, museJson, textPart } from "../meta/muse";
import { EXPLAIN_PROMPT_VERSION, explainSystemPrompt, explainUserPrompt } from "../prompts/explain";
import type { Luminance } from "../schema/analysis";
import type { RuleCandidate } from "../schema/candidate";
import { ExplainOutputSchema } from "../schema/explain";
import type { Region } from "../schema/region";
import { regionTable } from "./regionTable";

/**
 * Step 4: Muse Spark sees the (person-blurred) photo, the same photo with
 * numbered outlines, the region table and the rule candidates, and returns
 * confirmed/rejected candidates plus grounded observations.
 */
export async function runExplain(opts: {
  photoDataUrl: string;
  overlayDataUrl: string;
  roomType: string;
  regions: Region[];
  candidates: RuleCandidate[];
  luminance: Luminance;
  width: number;
  height: number;
}) {
  return museJson({
    op: "explain",
    promptVersion: EXPLAIN_PROMPT_VERSION,
    schemaName: "Explain",
    schema: ExplainOutputSchema,
    reasoningEffort: "low",
    system: explainSystemPrompt(),
    user: [
      textPart("Image 1: the photo."),
      imagePart(opts.photoDataUrl),
      textPart("Image 2: the same photo with numbered region outlines."),
      imagePart(opts.overlayDataUrl),
      textPart(
        explainUserPrompt({
          roomType: opts.roomType,
          regions: regionTable(opts.regions, opts.width, opts.height),
          candidates: opts.candidates,
          luminance: opts.luminance,
        }),
      ),
    ],
  });
}
