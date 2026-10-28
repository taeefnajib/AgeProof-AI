# Analysis pipeline

```
photo ──► 0. Preprocess ──► 1. Inventory (Muse Spark) ──► 2. Segment (SAM 3.1)
      ──► 3. Spatial rules ──► 4. Explain (Muse Spark) ──► 5. Validate & render
```

Status: steps 0 to 3 are built. Steps 4 and 5 come next.

| Step | Code | What it does |
|---|---|---|
| 0. Preprocess | `lib/pipeline/preprocess.ts` | Applies EXIF rotation, scales the longest side down to 1600px and re-encodes as JPEG, which drops all metadata including GPS. Computes SHA-256 for caching, plus luminance stats (mean luma, % of pixels below 50) for the lighting check. |
| 1. Inventory | `lib/pipeline/inventory.ts`, `lib/prompts/inventory.ts` | Muse Spark returns JSON constrained by `InventorySchema`: whether the photo is a usable room photo, the room type, and which concepts from the fixed vocabulary appear. If the photo isn't usable, we stop and ask for a better one. |
| 2. Segment | `lib/pipeline/segment.ts`, `lib/meta/sam.ts` | One SAM 3.1 call per inventory concept, plus `floor`, `door` and `person` every time, with up to 6 calls in parallel. Masks with confidence ≥ 0.5 are kept and given stable IDs `R1, R2…`. Each region stores its box, its mask (RLE of the box-cropped raster), an SVG path, its area as a % of the image, and its score. |

Design rule: **the LLM never invents locations.** SAM produces the regions, deterministic rules measure them, and the LLM only explains findings that cite real region IDs.

Every Meta call goes through `lib/meta/`. Each one has a timeout, one retry on 429/5xx, a content-hash cache (filesystem in dev, off in production) and a cost/latency log line.

`SAM_PROVIDER=modal` swaps `segment()` to a self-hosted SAM 3.1 behind the same `SamInstance[]` contract.
