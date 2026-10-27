/**
 * npm run pipeline -- [files...] — run the Day 2 pipeline on photos (default: demo/*.jpg)
 * and write .cache/out/<name>.json plus <name>.overlay.png with every kept mask drawn.
 */
import { REPO_ROOT } from "./env";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { analyzePhoto } from "../lib/pipeline/analyze";
import { maskTransform } from "../lib/pipeline/mask";
import { conceptColour } from "../lib/render/palette";
import type { PhotoAnalysis } from "../lib/schema/analysis";

function overlaySvg(a: PhotoAnalysis): string {
  const shapes = a.regions
    .filter((r) => r.concept !== "floor")
    .map((r) => {
      const c = conceptColour(r.concept);
      return `<path d="${r.svg_path}" transform="${maskTransform(r.mask, r.box)}" fill="${c}" fill-opacity="0.45" stroke="${c}" stroke-width="0.5"/>
<text x="${r.box.x1 + 4}" y="${r.box.y1 + 22}" font-family="Arial" font-size="20" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${r.id} ${r.concept} ${r.score.toFixed(2)}</text>`;
    });
  const floor = a.regions
    .filter((r) => r.concept === "floor")
    .map(
      (r) =>
        `<path d="${r.svg_path}" transform="${maskTransform(r.mask, r.box)}" fill="none" stroke="#ffd400" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width}" height="${a.height}">${floor.join("")}${shapes.join("")}</svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  const demoDir = path.join(REPO_ROOT, "demo");
  const files = args.length
    ? args.map((f) => path.resolve(f))
    : (await readdir(demoDir)).filter((f) => f.endsWith(".jpg")).map((f) => path.join(demoDir, f));
  const outDir = path.resolve(import.meta.dirname, "..", ".cache", "out");
  await mkdir(outDir, { recursive: true });

  for (const file of files) {
    const name = path.basename(file, path.extname(file));
    console.log(`\n=== ${name}`);
    const a = await analyzePhoto(await readFile(file));
    const { image_data_url: _img, ...rest } = a;
    await writeFile(
      path.join(outDir, `${name}.json`),
      JSON.stringify({ ...rest, regions: rest.regions.map(({ mask: _m, svg_path: _p, ...r }) => r) }, null, 2),
    );
    const base = Buffer.from(a.image_data_url.split(",")[1], "base64");
    await sharp(base)
      .composite([{ input: Buffer.from(overlaySvg(a)) }])
      .png()
      .toFile(path.join(outDir, `${name}.overlay.png`));
    console.log(`room=${a.inventory.room_type} (${a.inventory.room_type_confidence}) quality=${a.inventory.photo_quality}`);
    console.log(`concepts: ${a.inventory.concepts.join(", ")}`);
    for (const r of a.concept_runs) {
      console.log(`  ${r.concept.padEnd(18)} ${r.kept}/${r.instances} kept ${r.cached ? "(cached)" : `${r.ms}ms`}`);
    }
    console.log(`regions=${a.regions.length} cost=$${a.cost_usd} timings=${a.timings.map((t) => `${t.step}:${t.ms}ms`).join(" ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
