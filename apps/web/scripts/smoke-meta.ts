/**
 * npm run smoke:meta — one Muse Spark call and one SAM 3.1 call on demo/bathroom-1.jpg.
 * Bypasses the cache on purpose and prints raw shapes so docs/meta-api-notes.md stays honest.
 */
import { REPO_ROOT } from "./env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeMaskToRaster, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { metaClient, museModel, SAM_MODEL } from "../lib/meta/client";
import { preprocess } from "../lib/pipeline/preprocess";

async function* replay<T>(events: T[]) {
  for (const e of events) yield e;
}

async function main() {
  const client = metaClient();
  const img = await preprocess(await readFile(path.join(REPO_ROOT, "demo", "bathroom-1.jpg")));
  console.log(`image ${img.width}x${img.height}, ${img.jpeg.length} bytes, luma`, img.luminance);

  // 1. Model access
  const models = await client.models.list();
  const ids = models.data.map((m) => m.id);
  console.log("\nmodels:", ids.join(", "));
  for (const want of [museModel(), SAM_MODEL]) {
    console.log(`  ${want}: ${ids.includes(want) ? "available" : "NOT LISTED"}`);
  }

  // 2. Muse Spark, structured output, image input
  let t = Date.now();
  const chat = await client.chat.completions.create({
    model: museModel(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What room is this, and list up to 5 objects you can see." },
          { type: "image_url", image_url: { url: img.dataUrl } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Smoke",
        schema: {
          type: "object",
          properties: {
            room: { type: "string" },
            objects: { type: "array", items: { type: "string" } },
          },
          required: ["room", "objects"],
          additionalProperties: false,
        },
      },
    },
  });
  console.log(`\nmuse ${chat.model} ${Date.now() - t}ms usage`, chat.usage);
  console.log("content:", chat.choices[0]?.message?.content);

  // 3. SAM 3.1, streamed, raw events captured then parsed
  t = Date.now();
  const stream = await client.responses.create({
    model: SAM_MODEL,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "toilet" },
          { type: "input_image", image_url: img.dataUrl, detail: "auto" },
        ],
      },
    ],
    stream: true,
    metadata: { mask_encoding: "one_bit", include_confidence: "true" },
  });
  const events = [];
  for await (const e of stream) events.push(e);
  console.log(`\nsam ${Date.now() - t}ms, event types:`, [...new Set(events.map((e) => e.type))]);
  const done = events.find((e) => e.type === "response.completed");
  if (done && "response" in done) console.log("usage:", JSON.stringify(done.response.usage));
  const raw = events
    .filter((e) => e.type === "response.output_text.delta")
    .map((e) => ("delta" in e ? e.delta : ""))
    .join("");
  console.log("raw output (first 300 chars):", raw.slice(0, 300));

  const result = await parseImageStream(replay(events)).finalResult;
  console.log("outcome:", result.outcome, "diagnostics:", result.diagnostics.length);
  for (const m of recordsOfKind(result.records, "mask")) {
    const raster = decodeMaskToRaster(m.mask);
    const on = raster.reduce((a, b) => a + b, 0);
    const b = m.bounds;
    console.log(
      `  obj ${m.objectId} c=${m.confidence} bounds=[${b.left},${b.top},${b.right},${b.bottom}]` +
        ` (${b.right - b.left}x${b.bottom - b.top}) raster=${m.mask.width}x${m.mask.height}` +
        ` ${m.mask.encoding} fill=${((on / raster.length) * 100).toFixed(1)}%`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
