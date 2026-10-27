# AgeProof AI

Guidance for Claude Code working in this repository. Read this fully before writing code.

## 1. What we're building

**AgeProof AI** turns ordinary photos of a bedroom, bathroom or living room into an annotated home-safety *screening* for older people: highlighted regions on the photo, a plain-language explanation of each potential hazard, a room checklist, and a printable report to bring to an occupational therapist (OT).

It is a **screening aid, not an assessment**. A photo can never establish that a home is safe. Every surface of the product must reflect that (see §7).

**One-line demo:** upload a bathroom photo → within ~20 seconds the photo lights up with numbered, colour-coded regions ("1 · Loose bath mat at shower entry", "2 · No grab rail visible beside toilet") → click "Generate OT report" → a clean one-page PDF.

## 2. Hackathon context (drives every priority call)

- **Event:** Meta Global AI Developer Hackathon (Meta × Cerebral Valley), remote, 10 days.
- **Window:** 26 Oct 12:00 PM EST → **4 Nov 9:00 PM EST** = **Thu 5 Nov, 12:00 PM Brisbane time**. Treat **Wed 4 Nov 6:00 PM Brisbane** as our internal code-freeze.
- **Track:** Indie developer — judged on **creativity, technical ambition, and whether it works**.
- **Theme:** *Build for Your World* — the builder works in aged-care data analytics in Australia. Lean on that domain credibility in the README and demo.
- **Required tech:** Meta models via **Meta Model API** (Muse Spark, SAM 3.1), plus optional Meta open-weights models.
- **Budget:** ~$150 Meta Model API credits. Selected participants may also have Modal / Baseten / Fireworks credits. Cache aggressively; never call models in a loop during dev without a cache.
- **Official rules / submission requirements** (demo video length, repo visibility, licence, etc.) — the builder will paste them into `docs/RULES.md`. If that file exists, it overrides anything here. If it doesn't, ask before making assumptions about submission format.

**Priority order when trade-offs arise:**
1. The live demo works reliably end to end.
2. The annotated image looks impressive and is *grounded* (every highlight corresponds to a real region).
3. Responsible-AI framing is visible and correct.
4. Technical depth judges can see (pipeline diagram, eval numbers).
5. Everything else.

## 3. Meta Model API — facts and rules

- Base URL: `https://api.meta.ai/v1` — OpenAI-compatible (Chat Completions + Responses). Auth: `Authorization: Bearer $MODEL_API_KEY`.
- VLM: **Muse Spark** (`muse-spark-1.2` default; check docs for `1.3`). Multimodal input (text, image, video, PDF) → text out.
- **SAM 3.1** is served through the same API for text-prompted ("concept") segmentation of images/video: give it an image + a short noun phrase ("bath mat") → masks, boxes and scores for every instance.
- **Do NOT guess endpoint paths, request shapes or response fields for SAM 3.1.** Before writing the SAM client, fetch the current docs from `dev.meta.ai` (API reference) and record the exact request/response shape in `docs/meta-api-notes.md`. Write a tiny smoke-test script against one image first.
- **Never use `*-contributor` model variants.** They are cheaper but prompts may be used for training. Users upload photos of their homes — this is private data.
- **Fallback for SAM:** if the hosted SAM 3.1 endpoint is unavailable/rate-limited, self-host `facebook/sam3.1` (Hugging Face, transformers `Sam3Model`) on Modal behind the same internal interface. Keep `segment()` provider-agnostic so swapping is one env var: `SAM_PROVIDER=meta|modal`.

## 4. Architecture

Keep it to **one deployable app** unless self-hosted SAM is needed.

```
apps/web          Next.js (App Router, TypeScript, Tailwind) — UI + API routes
  app/            pages: / (upload), /result/[id], /report/[id]
  app/api/analyze route: orchestrates the pipeline
  lib/pipeline/   inventory.ts, segment.ts, rules.ts, explain.ts, report.ts
  lib/meta/       thin typed clients for Muse Spark + SAM 3.1
  lib/schema/     zod schemas (single source of truth for all JSON)
  lib/cache/      content-hash cache (dev: filesystem; prod: Vercel KV or none)
services/sam-modal  (only if fallback needed) Python Modal app exposing segment()
eval/             labelled photos + scoring script (Python)
demo/             curated demo photos + cached pipeline outputs for "demo mode"
docs/             RULES.md, meta-api-notes.md, pipeline.md, responsible-ai.md
```

Deploy `apps/web` to Vercel from GitHub. Secrets in `.env.local` (never committed): `MODEL_API_KEY`, `SAM_PROVIDER`, `MODAL_SAM_URL`.

## 5. The analysis pipeline (the core of the project)

The key design idea: **the LLM never invents locations.** SAM produces regions; deterministic rules measure them; the LLM only explains findings that point at real region IDs.

```
photo ──► 0. Preprocess ──► 1. Inventory (Muse Spark) ──► 2. Segment (SAM 3.1)
      ──► 3. Spatial rules (deterministic TS) ──► 4. Explain (Muse Spark, JSON)
      ──► 5. Validate & render (overlay + checklist + OT report)
```

**0. Preprocess** — downscale longest side to 1600px, strip EXIF (removes GPS), compute SHA-256 for caching, compute luminance stats (mean, % of pixels below a darkness threshold) for the lighting check.

**1. Inventory (Muse Spark)** — Classify room type (bathroom / bedroom / living / kitchen / hallway / other) and return which concepts from the **fixed vocabulary** below plausibly appear. Strict JSON, validated with zod. This stops us spending SAM calls on concepts that aren't there.

**2. Segment (SAM 3.1)** — One text-prompted call per selected concept, plus always: `floor`, `door`, `person`. Keep masks with score ≥ 0.5 (tune in eval). Each region gets a stable ID: `R1, R2…`. Store mask as RLE or PNG, plus bbox, area %, score, concept.

Concept vocabulary (start here, tune from eval):
- Floor & walkways: `floor`, `rug`, `bath mat`, `floor mat`, `electrical cord`, `step`, `stairs`, `threshold`, `clutter on floor`, `shoes on floor`
- Bathroom: `toilet`, `shower`, `bathtub`, `grab bar`, `shower chair`, `towel rail`, `vanity`
- Furniture & storage: `bed`, `chair`, `sofa`, `coffee table`, `shelf`, `high cupboard`, `low drawer`
- Lighting & support: `lamp`, `light switch`, `handrail`, `night light`
- Privacy: `person`, `photo frame`, `document`

**3. Spatial rules (deterministic, unit-tested)** — These make the "spatial reasoning" claim real and explainable. Each rule emits a candidate finding referencing region IDs and a numeric measurement. Examples:

| Rule ID | Logic (approximate, tune in eval) | Finding |
|---|---|---|
| `TRIP_RUG_ON_PATH` | rug/mat mask overlaps floor mask AND is within N px of a door/shower/bed bbox | Potential trip hazard on likely walking route |
| `TRIP_CORD_ON_FLOOR` | cord mask ≥ X% inside floor mask | Cord across floor |
| `CLUTTER_FLOOR` | sum of clutter/shoe masks on floor > Y% of floor area | Cluttered walkway |
| `NO_GRAB_BAR_TOILET` | toilet present, no grab-bar mask within radius of toilet bbox | No grab rail **visible** beside toilet |
| `NO_GRAB_BAR_WET` | shower/bath present, no grab bar nearby | No grab rail **visible** near shower/bath |
| `STEP_THRESHOLD` | step/threshold/stairs detected near door or shower | Change in floor level |
| `LOW_LIGHT` | luminance stats below threshold | Room appears dimly lit **in this photo** |
| `HIGH_STORAGE` | high cupboard/shelf bbox top in upper 25% of frame with items | Frequently used items may be hard to reach |

Rules about *absence* (no grab bar) must always be phrased as "not visible in this photo" with confidence capped at `medium`.

**4. Explain (Muse Spark)** — Input: original image, an overlay image with numbered region outlines, the region table, and the rule candidates. Output: strict JSON matching `FindingSchema`. The model may (a) confirm, reword or reject a rule candidate, (b) add an observation it can see, but **only if it cites existing region IDs** or explicitly marks `region_ids: []` with `scope: "whole_image"`.

```ts
Finding = {
  id: string,                    // F1, F2…
  rule_id: string | null,        // null if VLM-originated
  category: "trip" | "bathroom" | "lighting" | "reach" | "mobility" | "other",
  title: string,                 // ≤ 60 chars, plain English
  explanation: string,           // ≤ 2 sentences, why it may matter, no jargon
  suggestion: string,            // practical option to discuss with a professional
  region_ids: string[],
  scope: "region" | "whole_image",
  confidence: "low" | "medium" | "high",
  priority: "discuss_soon" | "worth_checking" | "minor",
  evidence: string               // what in the image/rule supports this
}
```

**5. Validate & render** — Drop any finding whose region IDs don't exist (log it — that's a hallucination metric for the eval). De-duplicate. Sort by priority. Render:
- **Annotated image:** SVG overlay on `<img>`; semi-transparent mask per finding, numbered pin, colour by priority (amber / orange / grey — avoid alarming red). Hover/click a pin ↔ highlight the checklist row. Toggle "show all detected objects" to reveal the raw SAM layer (judges love seeing the machinery).
- **Room checklist:** findings + standard room-specific items that couldn't be judged from the photo ("Is the bath mat non-slip underneath?").
- **OT report:** `/report/[id]` print-optimised page → browser "Save as PDF" (no server PDF library needed). Includes thumbnails with pins, findings table, "questions to ask your OT", and the disclaimer.

Also show a **pipeline timeline** in the UI (Inventory ✓ 2.1s → Segment ✓ 6 concepts, 4.3s → Rules ✓ → Explain ✓) — makes technical ambition visible during the demo.

## 6. MVP scope

**In (must ship):** upload 1–5 photos for one room · room type auto-detect with manual override · full pipeline · annotated image · checklist · OT report page · demo mode · disclaimer everywhere · person blurring.

**Stretch (only after MVP is demo-ready):** short video upload (sample frames, or SAM 3.1 video tracking) · multi-room home report · before/after comparison after modifications · multilingual explanations.

**Out:** accounts/login, databases, mobile native app, any "safety score" out of 100, insurance or medical claims.

## 7. Responsible-AI rules (non-negotiable)

- Never output the words "safe", "unsafe", "compliant", "passes" or a numeric safety score about the home.
- Use: "potential", "may", "visible in this photo", "worth discussing with an occupational therapist".
- Every results page and the report carry this disclaimer, verbatim:
  > *AgeProof AI highlights possible hazards visible in photos. It cannot confirm whether a home is safe and does not replace an assessment by an occupational therapist or other qualified professional. Items not visible in the photos have not been checked.*
- Suggestions are things to *discuss with a professional*, never instructions to install, drill or modify (no "install a grab rail here" — use "a grab rail beside the toilet may be worth discussing with an OT").
- No medical or diagnostic statements about the person.
- **Privacy:** strip EXIF; blur any `person` mask before display and before sending the overlay to the VLM; don't persist uploads beyond the session by default; no contributor-tier models; no analytics on image content.
- Explanations target a reading age of ~12; short sentences; respectful tone toward older people (avoid "elderly", "frail"; use "older people").
- If the photo isn't a room or is too dark/blurry, say so and ask for a better photo rather than guessing.

## 8. Evaluation (cheap, but shows rigour)

- `eval/images/`: 20–30 room photos the builder has rights to use (own photos, friends' homes with permission, or CC0/public-domain sources — **never** real-estate listing photos or other copyrighted images).
- `eval/labels.json`: per image, the hazards a human would flag (category + rough bbox).
- `eval/score.py`: precision / recall per category, % findings dropped by grounding validation, mean latency, mean cost per image.
- Put the headline numbers in the README and one slide of the demo video. Honest numbers beat impressive ones.

## 9. Demo mode

`?demo=1` (or a "Try a sample room" button) replays cached pipeline outputs for 3 curated photos (bathroom, bedroom, living room) with realistic step timings. The live demo uses real calls; demo mode is the safety net if the API is slow or down on recording day. Cached JSON lives in `demo/`, generated by `npm run demo:build`.

## 10. Coding conventions

- TypeScript strict. zod for every model input/output; parse model JSON with zod and retry once with the validation error appended before failing.
- All prompts live in `lib/prompts/*.ts` as exported template functions with a version constant; log prompt version with each result.
- Every Meta API call goes through `lib/meta/` with: timeout, one retry on 429/5xx with backoff, content-hash cache, and cost/latency logging.
- Rules in `lib/pipeline/rules.ts` are pure functions with unit tests (Vitest) using fixture region tables — no network in tests.
- Small commits with clear messages. Don't add dependencies without saying why.
- When unsure about a Meta API behaviour, check docs or write a smoke test — don't assume.

## 11. Commands (keep updated as the repo grows)

```
npm install
npm run dev            # local app
npm test               # vitest (rules + schemas)
npm run smoke:meta     # one Muse Spark + one SAM 3.1 call on demo/bathroom.jpg
npm run pipeline -w apps/web [files...]  # run pipeline on demo/*.jpg → apps/web/.cache/out/*.json + overlay PNGs
npm run typecheck -w apps/web
npm run demo:build     # regenerate cached demo outputs (Day 8, not yet implemented)
python eval/score.py   # run evaluation
```

## 12. Schedule (Brisbane dates)

| Day | Date | Goal |
|---|---|---|
| 1 | Tue 27 Oct | Repo + Vercel deploy of hello-world; API key; read Meta docs; `smoke:meta` passing for Muse Spark and SAM 3.1; write `docs/meta-api-notes.md` |
| 2 | Wed 28 Oct | Preprocess + inventory + segment working on 3 photos; raw masks rendered on image |
| 3 | Thu 29 Oct | Spatial rules + unit tests; region table; first findings |
| 4 | Fri 30 Oct | Explain step with grounding validation; findings JSON stable |
| 5 | Sat 31 Oct | UI: annotated overlay, pins ↔ checklist, pipeline timeline. **MVP end-to-end** |
| 6 | Sun 1 Nov | OT report page; disclaimer; person blur; bad-photo handling |
| 7 | Mon 2 Nov | Eval set labelled + `score.py`; tune thresholds and concept list |
| 8 | Tue 3 Nov | Demo mode; polish visuals; README with architecture diagram + eval numbers |
| 9 | Wed 4 Nov | Code freeze 6 PM; record demo video; stretch only if everything else is done |
| 10 | Thu 5 Nov | Submit **before 12:00 PM Brisbane** (aim for 9 AM) |

If a day slips, cut stretch goals first, then multi-photo upload, then the eval breadth — never the grounding validation or the disclaimer.

## 13. About the builder

Solo builder: data analyst in Australian aged care, strong Python/data background, ex-visual designer (so the UI should look genuinely polished — clean typography, calm colours, generous whitespace). Prefers concrete examples, structured outputs and practical specificity in explanations. When proposing options, recommend one and say why.
