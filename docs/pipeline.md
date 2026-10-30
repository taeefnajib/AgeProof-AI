# Analysis pipeline

```
photo ──► 0. Preprocess ──► 1. Inventory (Muse Spark) ──► 2. Segment (SAM 3.1)
      ──► 3. Spatial rules ──► 4. Explain (Muse Spark) ──► 5. Validate & render
```

Status: all steps are built. A full photo takes about 15–25s uncached and costs about $0.03–0.06.

| Step | Code | What it does |
|---|---|---|
| 0. Preprocess | `lib/pipeline/preprocess.ts` | Applies EXIF rotation, scales the longest side down to 1600px and re-encodes as JPEG, which drops all metadata including GPS. Computes SHA-256 for caching, plus luminance stats (mean luma, % of pixels below 50) for the lighting check, and sharpness (variance of the Laplacian on a 512px copy). |
| 1. Inventory | `lib/pipeline/inventory.ts`, `lib/prompts/inventory.ts` | Muse Spark returns JSON constrained by `InventorySchema`: whether the photo is a usable room photo, the room type, and which concepts from the fixed vocabulary appear. Then `checkPhoto` decides if the photo is usable: the inventory's verdict, overruled by measurement when it is clearly too dark (mean < 25 or > 92% dark pixels) or too blurry (sharpness < 15). An unusable photo only gets a `person` segmentation (so people are blurred) and the page asks for a better photo. The user can overrule "not a room" but not darkness or blur. |
| 2. Segment | `lib/pipeline/segment.ts`, `lib/meta/sam.ts` | One SAM 3.1 call per inventory concept, plus `floor`, `door` and `person` every time, with up to 6 calls in parallel. Masks with confidence ≥ 0.5 are kept and given stable IDs `R1, R2…`. Some concepts have fallback prompts, tried in order until one matches: `floor` → the inventory's `floor_phrase` (e.g. "light blue carpet") → `carpet`; `mould on wall` → `stain on wall` → `mould`; `loose window blind` → `window blind`; `wet floor` → `puddle` → `wet floor`; `cracked floor tile` → `cracked tile` → `broken tile`. A hose on the floor is handled by `TRIP_CORD_ON_FLOOR`. SAM can't judge condition ("loose", "mouldy"), so for those concepts Muse Spark's inventory decides whether they're present and SAM only finds where. Each region stores its box, its mask (RLE of the box-cropped raster), an SVG path, its area as a % of the image, and its score. |
| 3. Spatial rules | `lib/pipeline/rules.ts`, `lib/pipeline/geometry.ts` | Pure, unit-tested functions. Masks are resampled onto a shared 4px grid so regions can be compared by overlap, adjacency (dilation) and box gaps. Each rule emits a candidate with region IDs, a numeric measurement and template wording. Thresholds live in `T`. Before the rules run, `shoes on floor` regions lying on or beside a `person` mask are dropped: shoes someone is wearing aren't clutter. |

| Privacy | `lib/pipeline/privacy.ts` | Every `person` mask, padded by 1%, is blurred before the photo is displayed or sent to Muse Spark again. |
| 4. Explain | `lib/pipeline/explain.ts`, `lib/prompts/explain.ts` | Muse Spark (`reasoning_effort: "low"`) sees the photo, the same photo with numbered region outlines, the region table and the rule candidates. It confirms or rejects each candidate and may add up to 3 observations, which **must cite region IDs** (or be `whole_image`). |
| Report | `lib/pipeline/report.ts`, `components/ReportView.tsx`, `lib/client/reportPdf.ts` | `/report/[id]` shows the annotated photo, findings, one templated "question to ask your OT" per finding, the room's in-person checklist and space for notes. The PDF is drawn in the browser with jsPDF from the same data. |
| 5. Validate | `lib/pipeline/validate.ts` | Drops findings that cite unknown region IDs (the hallucination metric). Fixes scope, caps confidence (absence findings and VLM-only findings at medium, never above the rule's own), enforces the language rules (banned words or imperative suggestions fall back to template wording, or the finding is dropped), de-duplicates, restores candidates the model skipped, then sorts and numbers. If the explain call fails, template findings are shown instead, so the demo never breaks. |

### Rules

| Rule | Fires when | Priority |
|---|---|---|
| `TRIP_RUG_ON_PATH` | rug, bath mat or floor mat lies on the floor (or touches it) | `discuss_soon` within 8% of the diagonal of a shower/bath, `worth_checking` near a door/toilet/bed, otherwise `minor` |
| `TRIP_CORD_ON_FLOOR` | ≥ 30% of a cord is on or beside the floor | `worth_checking` |
| `CLUTTER_FLOOR` | clutter/shoes cover ≥ 2% of the floor | `worth_checking` |
| `NO_GRAB_BAR_TOILET` | no grab bar/handrail within 1.5 toilet widths | `discuss_soon`, confidence capped at medium |
| `NO_GRAB_BAR_WET` | no grab bar/handrail within one fixture size of a shower or bath | `discuss_soon`, confidence capped at medium |
| `STEP_THRESHOLD` | step/threshold near a door, shower or bath; stairs anywhere | `worth_checking` |
| `NO_HANDRAIL_STAIRS` | stairs with no handrail within half a stair width | `discuss_soon`, confidence capped at medium |
| `LOW_LIGHT` | mean luma < 75 or > 35% very dark pixels (whole photo) | `minor`, or `worth_checking` below 55 |
| `HIGH_STORAGE` | shelf/high cupboard in the top quarter of the frame | `minor` |
| `WET_FLOOR` | SAM outlined a puddle on the floor, or the inventory saw a wet floor SAM couldn't outline (then `whole_image`) | `discuss_soon` |
| `UNEVEN_FLOOR` | cracked/broken tile on the floor | `worth_checking` |
| `WALL_MOULD` | SAM outlined a stain, or the inventory saw mould that SAM couldn't outline (then `whole_image`, never a guessed spot) | `worth_checking`, low confidence |
| `LOOSE_BLIND` | the inventory judged a blind loose or damaged; SAM outlines the blind | `worth_checking`, low confidence |

Rules about absence say "not visible in this photo", because a rail could be just out of frame. Without a floor mask, rules fall back to "lower half of the photo" and drop to low confidence.

Design rule: **the LLM never invents locations.** SAM produces the regions, deterministic rules measure them, and the LLM only explains findings that cite real region IDs.

Every Meta call goes through `lib/meta/`. Each one has a timeout, one retry on 429/5xx, a content-hash cache (filesystem in dev, off in production) and a cost/latency log line.

`SAM_PROVIDER=modal` swaps `segment()` to a self-hosted SAM 3.1 behind the same `SamInstance[]` contract.
