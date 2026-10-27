# Meta Model API notes

Source: dev.meta.ai/docs, read 28 Oct 2026. Sections marked **Verified** were confirmed by `npm run smoke:meta`. Everything else comes from the docs and hasn't been run yet.

## Basics

- Base URL `https://api.meta.ai/v1`. Auth header: `Authorization: Bearer $MODEL_API_KEY`. The API works with the OpenAI SDK (we use `openai@7.32.0`).
- Rate limits are per team, not per key. `muse-spark-1.3`: 3,000 RPM / 4M TPM. `sam-3.1`: 3,000 RPM.
- On 429, back off exponentially and respect `Retry-After`. The SDK's `maxRetries: 1` does this for 408/409/429/5xx.
- A 400 is permanent, so don't retry it unchanged. An unknown model, or a team without access to it, gets a 404 with `code: model_not_found`.

## Models we use

| Purpose | Model ID | Price |
|---|---|---|
| VLM (inventory, explain) | `muse-spark-1.3` (env `MUSE_MODEL`) | $1.25 / M input, $0.15 / M cached input, $4.25 / M output |
| Segmentation | `sam-3.1` | $2.50 per 1,000 images |

**Never** use `muse-spark-1.3-contributor` or `muse-spark-1.2-contributor`: their content may be used for training. `lib/meta/client.ts` refuses any model ID that contains `contributor`.

Rough cost per photo: inventory is about 1.5k input + 200 output tokens, roughly $0.003. SAM is around 12 concepts × $0.0025, about $0.03. So segmentation is the main cost, and per-concept caching matters.

## Muse Spark: image + structured output (Chat Completions)

```ts
client.chat.completions.create({
  model: "muse-spark-1.3",
  messages: [{ role: "user", content: [
    { type: "text", text: "..." },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } },
  ]}],
  response_format: { type: "json_schema", json_schema: { name: "Inventory", schema: {...} } },
});
```

- Images go only in `user` messages. Public URLs, base64 data URLs and Files API `file_id`s all work.
- Structured output uses constrained decoding, so the output is guaranteed to match the schema. Recursive schemas return a 400. On the Responses API the equivalent parameter is `text.format`; `response_format` is the Chat Completions one.
- Our schemas come from zod via `z.toJSONSchema()`, with `$schema` stripped. We still validate with zod and retry once (CLAUDE.md §10).

## SAM 3.1: concept segmentation (Responses API)

Request: **one noun phrase per request**. Comma lists return 0 matches, and "and" only segments one concept. Plurals and case are ignored. Don't use commands, questions, negation or spatial phrases ("rug on the left"): segment the plain concept, then filter by box in our own code.

```ts
client.responses.create({
  model: "sam-3.1",
  input: [{ type: "message", role: "user", content: [
    { type: "input_text", text: "bath mat" },
    { type: "input_image", image_url: "data:image/jpeg;base64,...", detail: "auto" },
  ]}],
  stream: true,                     // recommended; non-streaming returns the same text
  metadata: { mask_encoding: "one_bit", include_confidence: "true" },  // values are STRINGS
});
```

`detail: "auto"` is there only because the OpenAI SDK types require it; Meta's examples leave it out. Whether Meta accepts it is checked by the smoke test (see below).

Response: special-token text in the `output_text` lane, sent as one `response.output_text.delta` per frame (an image is a single frame, `<0f>`), and ending with `response.completed`.

```
<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561;c=0.96|><|mask;x=0;y=0;c=0.96;data=46,101,!<base85>|>,1<|box;...|><|mask;...|>
```

- Each record is `objectId box mask`. Object IDs are sparse, not dense.
- Box: `x1,y1,x2,y2` are **inclusive** source pixels; `w,h` is the source image size. `c` (0–1) only appears with `include_confidence: "true"`.
- Mask: `data=H,W,<enc>payload`. **H and W are the mask raster's own size, height first.** The raster covers the record's box, not the whole frame. The encoding is `~` (lossless, the default) or `!` (`one_bit`), and the payload is base85, not base64.
- Zero matches is a normal result: an empty `output_text` and no deltas.
- Usage: `usage.video_frames_processed` only applies to video.

We parse with `@meta-sam/parser@0.1.0`:
- `parseImageStream(stream).finalResult` gives `{ records, diagnostics, outcome }`.
- `recordsOfKind(records, "mask")` returns records with `{ objectId, mask: {width, height, encoding, payload}, bounds: {left, top, right, bottom} (half-open), confidence }`.
- `decodeMaskToRaster(mask)` returns a row-major `Uint8Array` of length W×H. `decodeMaskToSVGPath(mask)` returns a path in raster coordinates. `decodeMaskToRLE` returns COCO RLE (column-major).
- To place a mask on the image, use `translate(left, top) scale((right-left)/W, (bottom-top)/H)` (`lib/pipeline/mask.ts`).

Also available but not used yet: box/point prompts (`<0f>1<|box;...|>`, `buildObjectPrompt`, at most 16 objects) and video (`input_video`, MP4/MOV, billed per frame with a 50-frame minimum).

## Verified by smoke test

_Pending: needs `MODEL_API_KEY`. Fill in from `npm run smoke:meta` output:_
- [ ] Both `muse-spark-1.3` and `sam-3.1` appear in `GET /v1/models` for our team
- [ ] Muse Spark accepts a base64 data URL plus `json_schema` response_format
- [ ] SAM accepts `detail: "auto"` on `input_image`
- [ ] Mask raster size compared with box size (is it the same resolution, or downsampled for big objects?)
- [ ] Latency per SAM call on a 1600px image
