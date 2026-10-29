/**
 * npm run pipeline -- [files...] — run the pipeline on photos (default: demo/*.jpg and *.png)
 * and write .cache/out/<name>.json, <name>.photo.jpg (as shown) and <name>.overlay.png.
 */
import { REPO_ROOT } from "./env";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { analyzePhoto } from "../lib/pipeline/analyze";
import { regionOverlaySvg } from "../lib/render/overlay";

async function main() {
  const args = process.argv.slice(2);
  const demoDir = path.join(REPO_ROOT, "demo");
  const files = args.length
    ? args.map((f) => path.resolve(f))
    : (await readdir(demoDir)).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => path.join(demoDir, f));
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
    // Exactly what the UI shows and the VLM sees (EXIF stripped, people blurred).
    await writeFile(path.join(outDir, `${name}.photo.jpg`), base);
    await sharp(base)
      .composite([{ input: Buffer.from(regionOverlaySvg(a.regions, a.width, a.height)) }])
      .png()
      .toFile(path.join(outDir, `${name}.overlay.png`));
    console.log(`room=${a.inventory.room_type} (${a.inventory.room_type_confidence}) quality=${a.inventory.photo_quality}`);
    console.log(`concepts: ${a.inventory.concepts.join(", ")}`);
    for (const r of a.concept_runs) {
      console.log(`  ${r.concept.padEnd(18)} ${r.kept}/${r.instances} kept ${r.cached ? "(cached)" : `${r.ms}ms`}`);
    }
    for (const c of a.candidates) {
      console.log(`  ▸ ${c.rule_id} [${c.priority}/${c.confidence}] ${c.region_ids.join(",")} — ${c.measurement}`);
    }
    console.log(`  findings (${a.findings_source}):`);
    for (const f of a.findings) {
      console.log(`  ${f.id} [${f.priority}/${f.confidence}] ${f.title} (${f.region_ids.join(",") || "whole photo"}) ${f.rule_id ?? "VLM"}`);
      console.log(`       ${f.explanation}
       → ${f.suggestion}`);
    }
    if (a.validation) {
      const { rejected, ...v } = a.validation;
      console.log(`  validation: ${JSON.stringify(v)}`);
      for (const r of rejected) console.log(`  ✗ rejected ${r.rule_id} ${r.region_ids.join(",")}: ${r.reason}`);
    }
    if (a.explain_error) console.log(`  explain error: ${a.explain_error}`);
    console.log(`regions=${a.regions.length} cost=$${a.cost_usd} timings=${a.timings.map((t) => `${t.step}:${t.ms}ms`).join(" ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
