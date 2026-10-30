# Responsible AI

AgeProof AI is a **screening aid, not an assessment**. A photo can never establish that a home is safe for an older person, so the product is built to point at possibilities and send people to an occupational therapist (OT), never to give a verdict.

This page lists each safeguard and where it lives in the code, so it can be checked rather than taken on trust.

## 1. Every highlight is grounded

| Safeguard | How | Where |
|---|---|---|
| The language model never places a hazard | SAM 3.1 produces every region; Muse Spark can only cite region IDs from the table it is given | `lib/pipeline/segment.ts`, `lib/prompts/explain.ts` |
| Citations are checked | Findings that cite an unknown region, or a model observation pinned only to the floor, are dropped and counted (`dropped_ungrounded`, the hallucination metric in the eval) | `lib/pipeline/validate.ts` |
| Conditions SAM can't outline aren't guessed | Mould, wet floors and similar are shown as "whole photo" findings when SAM can't outline them, never as a pin on a guessed spot | `WALL_MOULD`, `WET_FLOOR` in `lib/pipeline/rules.ts` |
| Measurements are deterministic | Rules are pure functions with unit tests; the same masks always give the same candidates | `lib/pipeline/rules.ts`, `lib/pipeline/__tests__/` |
| If the model fails, the app doesn't make things up | The rule wording is shown instead | `lib/pipeline/analyze.ts` |

## 2. Careful language

| Rule (CLAUDE.md §7) | Enforcement |
|---|---|
| Never "safe", "unsafe", "compliant", "passes", or a score | Banned-word check on every title, explanation and suggestion: a breaking finding falls back to the rule's template wording, or is dropped if it has none (`language_fixed`, `language_dropped`). No score exists anywhere in the schema. |
| Suggestions are things to discuss, never instructions | Suggestions starting with "install", "drill", "fit", "remove", "replace", "buy", "add", "put", "move" or "mount" are rejected the same way. The report's "Questions to ask your OT" are fixed templates (`lib/pipeline/report.ts`), unit-tested against the same words. |
| Absence is "not visible in this photo" | Absence rules (`NO_GRAB_BAR_*`, `NO_HANDRAIL_STAIRS`) say so in their wording, and their confidence is capped at medium. A rail could be just out of frame. |
| Model-only observations are tentative | Confidence of a finding without a rule behind it is capped at medium. |
| No statements about the person | The explain prompt forbids comments on anyone's health or abilities. |
| Respectful, plain wording | "Older people", never "elderly" or "frail" (also in the banned-word check). Prompts target a reading age of about 12. |

The disclaimer is shown verbatim on the home page, every result, the report page and the PDF (`components/Disclaimer.tsx`).

## 3. Asking for a better photo instead of guessing

A photo is screened only if it is usable (`checkPhoto` in `lib/pipeline/analyze.ts`):

- Muse Spark's inventory judges whether it is a room in a home and whether it is clear enough.
- Measurements can overrule it: a mean brightness under 25/255, more than 92% very dark pixels, or a sharpness (variance of the Laplacian) under 15 is always "too dark" or "too blurry". These limits were calibrated on the demo photos; the dimmest real one (a hallway at 77% dark pixels) is still screened, with a low-light finding.
- An unusable photo gets no findings. The page says why and gives tips for a better photo.
- If the model says "not a room in a home", the user can overrule it ("It's part of my home, screen it anyway"), and the result says it was screened at their request. Darkness and blur can't be overruled.

## 4. Privacy

| Safeguard | Where |
|---|---|
| EXIF (including GPS) removed in the browser, then again on the server | `lib/client/resize.ts`, `lib/pipeline/preprocess.ts` |
| Every `person` mask is blurred before the photo is displayed or sent to Muse Spark again, including photos that can't be screened | `lib/pipeline/privacy.ts` |
| Nothing is stored on the server; results live in the tab's sessionStorage and go when it closes | `lib/client/resultStore.ts` |
| The PDF is built in the browser; "Send as email" hands the file to the user's own mail app | `lib/client/reportPdf.ts` |
| No names or addresses are collected; the report has blank lines to fill in by hand | `components/ReportView.tsx` |
| Only Standard-mode Meta models; `*-contributor` variants are refused in code, because their prompts may be used for training | `lib/meta/client.ts` |
| No analytics on image content | — |

## 5. Known limits

- One photo shows one view. Anything out of frame, behind furniture or under a mat has not been checked; the "Also check in person" list covers the common ones.
- SAM 3.1 can't judge condition ("loose", "slippery"), and Muse Spark can be wrong about it. Condition findings are low confidence.
- The eval set is small and the labels were drafted from visual inspection (see `eval/README.md`). Treat the numbers as a sanity check, not a validation study.
