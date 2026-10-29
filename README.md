# AgeProof AI

Turns ordinary photos of a bathroom, bedroom, living room or balcony into a home-safety **screening** for older people. You get highlighted regions on the photo, a plain-language explanation of each possible hazard, and a report to bring to an occupational therapist.

> *AgeProof AI highlights possible hazards visible in photos. It cannot confirm whether a home is safe and does not replace an assessment by an occupational therapist or other qualified professional. Items not visible in the photos have not been checked.*

Built for the Meta Global AI Developer Hackathon (Indie track) by a data analyst working in Australian aged care.

## How it works

```
photo ──► Preprocess ──► Inventory (Muse Spark) ──► Segment (SAM 3.1)
      ──► Spatial rules (deterministic) ──► Explain (Muse Spark) ──► Validate & render
```

The language model never invents locations. SAM 3.1 finds the regions, unit-tested rules measure them, and Muse Spark only explains findings that cite real region IDs. See [docs/pipeline.md](docs/pipeline.md).

**Status (Day 5, MVP end to end):** upload a photo and in about 15–18 seconds you get numbered, colour-coded hazard regions on the photo, each with a plain-language explanation and something to discuss with an OT. There's also a room checklist of things a photo can't show, and a toggle to reveal every object SAM 3.1 detected. **Generate OT report** opens a printable report that downloads as a PDF (built in the browser) or goes to your mail app as an attachment. Each photo costs about $0.02–0.06. Demo mode and eval numbers are next.

What makes it grounded:
- **SAM 3.1** segments only the concepts Muse Spark's inventory says are present.
- **13 deterministic spatial rules** (unit-tested) measure masks on a shared grid: overlap with the floor, distance to doors, toilets and showers, and whether a rail is absent nearby.
- **Muse Spark** confirms or rejects each rule finding and may add observations, but every finding must cite a real region ID. A validator drops any that don't, logs them as a hallucination metric, caps confidence for "not visible" findings, and enforces the responsible-language rules.
- People are blurred before the photo is shown or sent to the VLM.

## Run locally

Needs Node ≥ 22.

```bash
npm install
cp .env.example apps/web/.env.local   # then add MODEL_API_KEY
npm run dev                           # http://localhost:3000
npm test                              # vitest
npm run smoke:meta                    # one Muse Spark + one SAM 3.1 call on demo/bathroom-1.jpg
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
