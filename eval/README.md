# Evaluation

A small, honest check of how well AgeProof AI's findings line up with what a person would flag in the same photo.

```bash
npm run eval -w apps/web     # run the pipeline on every labelled image → eval/results/*.json
python eval/score.py         # precision / recall per category, grounding, latency, cost
python eval/score.py --detail   # every hit, miss and false positive, per image
```

Or `npm run eval` at the repo root for both. Model calls are cached, so rerunning after a rules change costs nothing.

## The set

29 photos (`labels.json`): 3 CC0 demo photos plus 26 CC0 or public-domain photos from Wikimedia Commons (attribution in `demo/SOURCES.md`, metadata in `sources.json`). They cover bathrooms and toilets (12), bedrooms (6), living rooms (5), kitchens (3), stairs (2), a balcony, and a shop display that should be turned away.

Many are house museums and heritage homes, because that's what is reliably CC0. They are tidier and grander than a typical older person's home, so recall on clutter is probably flattered and precision on "tight spaces" is probably understated.

## Labels

For each photo, `labels.json` lists the hazards a screener would flag: a category, a rough box (fractions of the photo) or `null` for "the whole photo", and a short description. `expect_usable` says whether the photo should be screened (`true`), turned away (`false`), or either (`null`, for borderline photos like a dark close-up).

**The labels were drafted by Claude (the coding assistant) from visual inspection, not by an occupational therapist,** and have not yet been reviewed by the builder. They are conservative: only hazards that are clearly visible. Three photos have no labels at all, to measure false alarms.

Changes after the first run, so they can be judged: the public accessible toilet (`toilet-hk`) and the museum room full of tourists (`living-vizcaya`) were changed from "should be screened" to "either is fine", because Muse Spark turning them away as "not a room in a home" is defensible. One missed label was added: no grab rail visible near the bath in `bathroom-historic`. No other labels were changed after seeing results.

## Scoring

`score.py` is deliberately simple:

- A finding matches a label if the categories match and the finding's main region overlaps the label's box by at least 30% of the smaller box. "Trip" and "getting around" (mobility) count as one family. Whole-photo findings match whole-photo labels.
- **Precision**: findings that match a label ÷ all findings. **Recall**: labels matched by at least one finding.
- **Photo check**: whether the photo was screened or turned away as expected.
- **Grounding**: how many of Muse Spark's proposed findings the validator dropped for citing regions that don't exist (the hallucination metric).
- **Latency and cost**: from each image's first live run (cached reruns keep those numbers).

A finding that isn't in the labels isn't necessarily wrong: Muse Spark often notices real things (a narrow doorway, a low chair) that the conservative labels leave out. Read `--detail` before drawing conclusions.

## Results and tuning

| Run | Precision | Recall | Muse Spark findings proposed | Dropped as ungrounded |
|---|---|---|---|---|
| explain-v4 (before tuning) | 46% | 77% | 81 | 6 (7.4%) |
| explain-v5 (current) | **78%** | **77%** | 45 | 5 (11.1%) |

The first run showed that the rules were precise but Muse Spark added the same generic remarks to almost every photo ("Low drawers may need deep bending", "Chair narrows the space"): getting-around findings were 19% precise and reach findings 8%. The explain prompt was tightened to add an observation only when an OT would clearly point it out, and to leave ordinary furniture alone. Precision rose from 46% to 78% with recall unchanged. Both runs use the same labels (after the changes listed above). Photo check: 24 right, 0 wrong, 5 where either answer is fine. Mean live latency 18.4s and cost $0.034 per photo (25 live runs).

Weakest areas, honestly: **reach** (0 of 2 labels found: high shelves are rarely flagged now) and **trip** recall (67%: books and bags on the floor, a raised hearth, and pots on a balcony were missed). Two further misses are photos that were turned away as not a home (the staged shop and the museum), where either answer is accepted but their labels still count against recall.
