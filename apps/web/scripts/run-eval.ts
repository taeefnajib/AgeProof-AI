/**
 * npm run eval -w apps/web [-- name-filter] — run the pipeline on every image in
 * eval/labels.json and write eval/results/<name>.json for eval/score.py.
 *
 * Model calls are cached (.cache/), so reruns after a rules change are free.
 * Latency and cost are only meaningful on a live run: when every call for an
 * image was served from cache, the previous live numbers are kept.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./env";
import { analyzePhoto } from "../lib/pipeline/analyze";
import type { PhotoAnalysis } from "../lib/schema/analysis";

type Labels = { images: { path: string }[] };

function boxesOf(a: PhotoAnalysis, ids: string[]) {
  const byId = new Map(a.regions.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r) => r !== undefined)
    .map((r) => ({
      concept: r.concept,
      box: [r.box.x1 / a.width, r.box.y1 / a.height, r.box.x2 / a.width, r.box.y2 / a.height].map(
        (v) => Math.round(v * 1000) / 1000,
      ),
    }));
}

async function main() {
  const filter = process.argv[2];
  const labels = JSON.parse(await readFile(path.join(REPO_ROOT, "eval", "labels.json"), "utf8")) as Labels;
  const outDir = path.join(REPO_ROOT, "eval", "results");
  await mkdir(outDir, { recursive: true });

  for (const { path: rel } of labels.images) {
    const name = path.basename(rel).replace(/\.[^.]+$/, "");
    if (filter && !name.includes(filter)) continue;
    const outFile = path.join(outDir, `${name}.json`);
    const a = await analyzePhoto(await readFile(path.join(REPO_ROOT, rel)));
    const live = a.timings.every((t) => !t.cached);
    const ms = a.timings.reduce((s, t) => s + t.ms, 0);
    let latency = { ms, cost_usd: a.cost_usd, measured_live: live };
    if (!live && existsSync(outFile)) {
      const prev = JSON.parse(await readFile(outFile, "utf8"));
      if (prev.sha256 === a.sha256 && prev.latency?.measured_live) latency = prev.latency;
    }
    const result = {
      image: rel,
      sha256: a.sha256,
      room_type: a.room_type,
      photo_check: a.photo_check,
      latency,
      prompt_versions: a.prompt_versions,
      validation: a.validation,
      candidates: a.candidates.map((c) => ({ rule_id: c.rule_id, region_ids: c.region_ids, measurement: c.measurement })),
      findings: a.findings.map((f) => ({
        id: f.id,
        rule_id: f.rule_id,
        category: f.category,
        priority: f.priority,
        confidence: f.confidence,
        scope: f.scope,
        title: f.title,
        regions: boxesOf(a, f.region_ids),
      })),
    };
    await writeFile(outFile, JSON.stringify(result, null, 1) + "\n");
    console.log(
      `${name.padEnd(28)} ${String(a.photo_check?.quality).padEnd(10)} ${a.findings.length} findings ` +
        `${(latency.ms / 1000).toFixed(1)}s $${latency.cost_usd.toFixed(4)}${latency.measured_live ? "" : " (no live run)"}`,
    );
  }
}

main();
