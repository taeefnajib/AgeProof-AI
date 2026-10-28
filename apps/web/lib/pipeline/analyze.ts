import { randomUUID } from "node:crypto";
import { SAM_MODEL } from "../meta/client";
import { INVENTORY_PROMPT_VERSION } from "../prompts/inventory";
import type { PhotoAnalysis, StepTiming } from "../schema/analysis";
import { ALWAYS_SEGMENT, type RoomType } from "../schema/vocabulary";
import { candidatesToFindings } from "./findings";
import { runInventory } from "./inventory";
import { preprocess } from "./preprocess";
import { runRules } from "./rules";
import { runSegment } from "./segment";

/**
 * Runs the pipeline for one photo: preprocess → inventory → segment → rules.
 */
export async function analyzePhoto(
  input: Buffer,
  opts: { roomType?: RoomType; onStep?: (timing: StepTiming) => void } = {},
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

  // Not a usable room photo: don't spend SAM calls; the UI asks for a better photo.
  const usable = inv.data.is_room_photo && inv.data.photo_quality === "ok";
  const concepts = usable ? [...new Set<string>([...inv.data.concepts, ...ALWAYS_SEGMENT])] : [];
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
  const candidates = usable
    ? runRules({
        width: pre.width,
        height: pre.height,
        luminance: pre.luminance,
        roomType,
        regions: seg.regions,
      })
    : [];
  record({ step: "rules", ms: Date.now() - t, detail: `${candidates.length} candidates` });

  return {
    id: randomUUID(),
    sha256: pre.sha256,
    width: pre.width,
    height: pre.height,
    image_data_url: pre.dataUrl,
    luminance: pre.luminance,
    inventory: inv.data,
    room_type: roomType,
    room_type_source: opts.roomType ? "user" : "auto",
    regions: seg.regions,
    candidates,
    findings: candidatesToFindings(candidates),
    findings_source: "rules",
    concept_runs: seg.runs,
    timings,
    prompt_versions: { inventory: INVENTORY_PROMPT_VERSION },
    models: { vlm: inv.model, segmentation: process.env.SAM_PROVIDER === "modal" ? "sam3.1-modal" : SAM_MODEL },
    cost_usd: Math.round((inv.cost_usd + seg.cost_usd) * 100000) / 100000,
    created_at: new Date().toISOString(),
  };
}
