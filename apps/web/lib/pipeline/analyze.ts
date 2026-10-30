import { randomUUID } from "node:crypto";
import { SAM_MODEL } from "../meta/client";
import { EXPLAIN_PROMPT_VERSION } from "../prompts/explain";
import { INVENTORY_PROMPT_VERSION } from "../prompts/inventory";
import type { PhotoAnalysis, PhotoCheck, StepTiming } from "../schema/analysis";
import type { Inventory } from "../schema/inventory";
import type { ValidationStats } from "../schema/validation";
import { ALWAYS_SEGMENT, type RoomType } from "../schema/vocabulary";
import { runExplain } from "./explain";
import { candidatesToFindings } from "./findings";
import { runInventory } from "./inventory";
import { preprocess } from "./preprocess";
import { blurPeople, renderRegionOverlay, toDataUrl } from "./privacy";
import { removeWornShoes, runRules } from "./rules";
import { runSegment } from "./segment";
import { validateFindings } from "./validate";

/** Measured limits that overrule the model: only clearly unusable photos (see preprocess.ts). */
export const MIN_MEAN_LUMA = 25;
/** % of very dark pixels above which nothing can be seen (the dim demo hallway is 77%). */
export const MAX_DARK_PCT = 92;
export const MIN_SHARPNESS = 15;

/**
 * Decide whether the photo can be screened. The inventory's judgement stands
 * unless brightness or sharpness measurements say it's clearly unusable.
 * `forceRoom` is the user saying "this is a room in my home" after a not_a_room
 * verdict; it never overrides darkness or blur.
 */
export function checkPhoto(
  inv: Pick<Inventory, "is_room_photo" | "photo_quality" | "notes">,
  luminance: { mean: number; dark_pct: number },
  sharpness: number,
  forceRoom = false,
): PhotoCheck {
  if (luminance.mean < MIN_MEAN_LUMA || luminance.dark_pct > MAX_DARK_PCT) {
    return {
      quality: "too_dark",
      source: "measured",
      detail: `mean brightness ${luminance.mean}/255, ${luminance.dark_pct}% of pixels very dark`,
    };
  }
  if (sharpness < MIN_SHARPNESS) {
    return { quality: "too_blurry", source: "measured", detail: `sharpness ${sharpness} (clear photos usually score over 150)` };
  }
  const quality = inv.is_room_photo ? inv.photo_quality : "not_a_room";
  if (quality === "not_a_room" && forceRoom) {
    return { quality: "ok", source: "user", detail: "screened at your request" };
  }
  // is_room_photo false wins over a photo_quality of "ok".
  return { quality, source: "model", detail: inv.notes };
}

/**
 * Runs the pipeline for one photo:
 * preprocess → inventory → segment → rules → (blur people) → explain → validate.
 */
export async function analyzePhoto(
  input: Buffer,
  opts: { roomType?: RoomType; forceRoom?: boolean; onStep?: (timing: StepTiming) => void } = {},
): Promise<PhotoAnalysis> {
  const timings: StepTiming[] = [];
  const record = (timing: StepTiming) => {
    timings.push(timing);
    opts.onStep?.(timing);
  };
  let t = Date.now();

  const pre = await preprocess(input);
  record({ step: "preprocess", ms: Date.now() - t, detail: `${pre.width}×${pre.height}` });

  t = Date.now();
  const inv = await runInventory(pre.dataUrl);
  record({
    step: "inventory",
    ms: Date.now() - t,
    detail: `${inv.data.room_type}, ${inv.data.concepts.length} concepts`,
    cached: inv.cached,
  });

  // Not a usable room photo: only find people (so they can be blurred), and the UI asks for a better photo.
  const photoCheck = checkPhoto(inv.data, pre.luminance, pre.sharpness, opts.forceRoom);
  const usable = photoCheck.quality === "ok";
  const concepts = usable ? [...new Set<string>([...inv.data.concepts, ...ALWAYS_SEGMENT])] : ["person"];
  t = Date.now();
  const seg = await runSegment({
    imageDataUrl: pre.dataUrl,
    imageSha256: pre.sha256,
    width: pre.width,
    height: pre.height,
    concepts,
    floorPhrase: inv.data.floor_phrase,
  });
  record({
    step: "segment",
    ms: Date.now() - t,
    detail: `${concepts.length} concepts → ${seg.regions.length} regions`,
    cached: seg.runs.every((r) => r.cached),
  });

  const roomType = opts.roomType ?? inv.data.room_type;
  t = Date.now();
  const ruleInput = {
    width: pre.width,
    height: pre.height,
    luminance: pre.luminance,
    roomType,
    regions: seg.regions,
    inventoryConcepts: inv.data.concepts,
  };
  const regions = removeWornShoes(ruleInput);
  const candidates = usable ? runRules({ ...ruleInput, regions }) : [];
  record({ step: "rules", ms: Date.now() - t, detail: `${candidates.length} candidates` });

  // Privacy: blur people before anything is displayed or sent to the VLM again.
  const privacy = await blurPeople(pre.jpeg, regions, pre.width, pre.height);
  const photoDataUrl = privacy.blurred ? toDataUrl(privacy.jpeg) : pre.dataUrl;

  // Step 4 + 5: explain, then validate. Any explain failure falls back to rule wording
  // so the demo never breaks on a model hiccup.
  let findings = candidatesToFindings(candidates);
  let findingsSource: "rules" | "explain" = "rules";
  let validation: ValidationStats | null = null;
  let explainCost = 0;
  let explainError: string | null = null;
  if (usable) {
    t = Date.now();
    try {
      const overlay = await renderRegionOverlay(privacy.jpeg, regions, pre.width, pre.height);
      const exp = await runExplain({
        photoDataUrl,
        overlayDataUrl: toDataUrl(overlay),
        roomType,
        regions: regions,
        candidates,
        luminance: pre.luminance,
        width: pre.width,
        height: pre.height,
      });
      explainCost = exp.cost_usd;
      record({
        step: "explain",
        ms: Date.now() - t,
        detail: `${exp.data.findings.length} proposed, ${exp.data.rejected.length} rejected`,
        cached: exp.cached,
      });
      t = Date.now();
      const v = validateFindings(exp.data, regions, candidates);
      findings = v.findings;
      validation = v.stats;
      findingsSource = "explain";
      record({
        step: "validate",
        ms: Date.now() - t,
        detail: `${v.stats.kept} kept, ${v.stats.dropped_ungrounded} ungrounded dropped`,
      });
    } catch (e) {
      explainError = (e as Error).message;
      console.error("[explain] falling back to rule findings:", explainError);
      record({ step: "explain", ms: Date.now() - t, detail: "unavailable, using rule wording" });
    }
  }

  return {
    id: randomUUID(),
    sha256: pre.sha256,
    width: pre.width,
    height: pre.height,
    image_data_url: photoDataUrl,
    people_blurred: privacy.blurred,
    luminance: pre.luminance,
    sharpness: pre.sharpness,
    photo_check: photoCheck,
    inventory: inv.data,
    room_type: roomType,
    room_type_source: opts.roomType ? "user" : "auto",
    regions: regions,
    candidates,
    findings,
    findings_source: findingsSource,
    validation,
    explain_error: explainError,
    concept_runs: seg.runs,
    timings,
    prompt_versions: { inventory: INVENTORY_PROMPT_VERSION, explain: EXPLAIN_PROMPT_VERSION },
    models: { vlm: inv.model, segmentation: process.env.SAM_PROVIDER === "modal" ? "sam3.1-modal" : SAM_MODEL },
    cost_usd: Math.round((inv.cost_usd + seg.cost_usd + explainCost) * 100000) / 100000,
    created_at: new Date().toISOString(),
  };
}
