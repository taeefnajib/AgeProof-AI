# AgeProof AI

Turns ordinary photos of a bathroom, bedroom or living room into a home-safety **screening** for older people. You get highlighted regions on the photo, a plain-language explanation of each possible hazard, and a report to bring to an occupational therapist.

> *AgeProof AI highlights possible hazards visible in photos. It cannot confirm whether a home is safe and does not replace an assessment by an occupational therapist or other qualified professional. Items not visible in the photos have not been checked.*

Built for the Meta Global AI Developer Hackathon (Indie track) by a data analyst working in Australian aged care.

## How it works

```
photo ──► Preprocess ──► Inventory (Muse Spark) ──► Segment (SAM 3.1)
      ──► Spatial rules (deterministic) ──► Explain (Muse Spark) ──► Validate & render
```

The language model never invents locations. SAM 3.1 finds the regions, unit-tested rules measure them, and Muse Spark only explains findings that cite real region IDs. See [docs/pipeline.md](docs/pipeline.md).

**Status (Day 2):** preprocessing, inventory and segmentation work, and the raw masks are drawn on the photo. Spatial rules, explanations and the OT report are next.

## Run locally

Needs Node ≥ 22.

```bash
npm install
cp .env.example apps/web/.env.local   # then add MODEL_API_KEY
npm run dev                           # http://localhost:3000
npm test                              # vitest
npm run smoke:meta                    # one Muse Spark + one SAM 3.1 call on demo/bathroom.jpg
npm run pipeline -w apps/web          # run the pipeline on demo/*.jpg → apps/web/.cache/out/
```

## Privacy

- EXIF (including GPS) is removed in the browser and again on the server.
- Nothing is stored on the server. Results live in the browser tab's sessionStorage.
- Only Standard-mode Meta models are used. Contributor variants are refused in code, because their prompts may be used for training.

## Repo layout

```
apps/web     Next.js app: UI, /api/analyze, pipeline in lib/pipeline, Meta clients in lib/meta
demo/        sample photos (CC0, see demo/SOURCES.md)
eval/        labelled photos + scoring (coming)
docs/        pipeline, Meta API notes, responsible AI
```

## Licence

MIT. Sample photos are CC0 (see [demo/SOURCES.md](demo/SOURCES.md)).
