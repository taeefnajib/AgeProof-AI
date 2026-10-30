/**
 * npm run demo:build — run the pipeline on the three curated demo photos and save
 * the full results to public/demo/<name>.json for demo mode (?demo=1), which
 * replays them with their step timings when the API is slow or down.
 *
 * Model calls are cached, so a rebuild after a UI or rules change is free. A
 * cached step reports ~0ms, so timings from the last live run are kept (or a
 * typical value is used) to keep the replay realistic.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./env";
import { analyzePhoto } from "../lib/pipeline/analyze";
import type { PhotoAnalysis, StepTiming } from "../lib/schema/analysis";

/** Repo-relative paths; public/samples/<name>.jpg must be a copy of the same photo. */
export const DEMO_PHOTOS = {
  bathroom: "demo/bathroom-1.jpg",
  bedroom: "eval/images/bedroom-fairfax.jpg",
  living: "demo/living-1.jpg",
} as const;

/** Typical live timings (ms), from the eval runs. */
const TYPICAL: Record<StepTiming["step"], number> = {
  preprocess: 120,
  inventory: 5500,
  segment: 6000,
  rules: 10,
  explain: 10000,
  validate: 1,
};

async function main() {
  const outDir = path.join(REPO_ROOT, "apps", "web", "public", "demo");
  await mkdir(outDir, { recursive: true });
  for (const [name, file] of Object.entries(DEMO_PHOTOS)) {
    const a = await analyzePhoto(await readFile(path.join(REPO_ROOT, file)));
    const outFile = path.join(outDir, `${name}.json`);
    const prev: PhotoAnalysis | null =
      existsSync(outFile) ? JSON.parse(await readFile(outFile, "utf8")) : null;
    const timings = a.timings.map((t) => {
      if (!t.cached) return t;
      const before = prev?.sha256 === a.sha256 ? prev.timings.find((p) => p.step === t.step) : undefined;
      return { ...t, ms: before && !before.cached ? before.ms : TYPICAL[t.step], cached: false };
    });
    const demo: PhotoAnalysis = { ...a, id: `demo-${name}`, timings, demo: true };
    await writeFile(outFile, JSON.stringify(demo));
    const total = timings.reduce((s, t) => s + t.ms, 0);
    console.log(`${name.padEnd(9)} ${a.findings.length} findings, replay ${(total / 1000).toFixed(1)}s → public/demo/${name}.json`);
  }
}

main();
