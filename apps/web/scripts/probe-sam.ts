/** npm run probe -- <image> <prompt...> — try SAM prompts on one image (cached). */
import { readFile } from "node:fs/promises";
import "./env";
import { samSegmentMeta } from "../lib/meta/sam";
import { preprocess } from "../lib/pipeline/preprocess";

async function main() {
  const [file, ...prompts] = process.argv.slice(2);
  const pre = await preprocess(await readFile(file));
  for (const concept of prompts) {
    const r = await samSegmentMeta({ imageDataUrl: pre.dataUrl, imageSha256: pre.sha256, concept });
    console.log(concept.padEnd(16), r.instances.map((i) => `${i.score.toFixed(2)}@[${i.box.x1},${i.box.y1},${i.box.x2},${i.box.y2}]`).join(" ") || "none");
  }
}
main();
