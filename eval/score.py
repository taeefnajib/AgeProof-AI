"""Score pipeline output (eval/results/*.json) against eval/labels.json.

    python eval/score.py            # summary table
    python eval/score.py --detail   # per-image matches, misses and false positives
    python eval/score.py --json     # machine-readable summary (also written to eval/summary.json)

Matching (deliberately simple and lenient, see eval/README.md):
- A finding matches a label when the categories are compatible and they overlap.
  "trip" and "mobility" are treated as one family (a raised hearth can fairly be
  called either); every other category must match exactly.
- Overlap: the finding's region boxes (union) and the label box share at least
  30% of the smaller box. Whole-photo findings match whole-photo labels of the
  same category; a whole-photo label can also be matched by a region finding.
- Precision = findings that match a label / findings. Recall = labels matched
  by at least one finding. Several findings on one hazard all count as correct.
- Images the pipeline turned away count as zero findings; whether turning them
  away was right is scored separately ("photo check").
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FAMILIES = {"trip": "floor", "mobility": "floor"}
MIN_OVERLAP = 0.3


def family(category: str) -> str:
    return FAMILIES.get(category, category)


def area(b: list[float]) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def union_box(boxes: list[list[float]]) -> list[float] | None:
    if not boxes:
        return None
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def overlap_of_smaller(a: list[float], b: list[float]) -> float:
    inter = [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]
    smaller = min(area(a), area(b))
    return area(inter) / smaller if smaller > 0 else 0.0


def matches(finding: dict, label: dict) -> bool:
    if family(finding["category"]) != family(label["category"]):
        return False
    if label["bbox"] is None:
        return True
    # The hazard is the first non-floor region (rules list the hazard, then its anchor).
    regions = [r for r in finding["regions"] if r["concept"] != "floor"] or finding["regions"]
    box = union_box([r["box"] for r in regions[:1]]) if regions else None
    if box is None:
        return False
    return overlap_of_smaller(box, label["bbox"]) >= MIN_OVERLAP


def score() -> dict:
    labels = json.loads((ROOT / "labels.json").read_text(encoding="utf-8"))["images"]
    per_cat = defaultdict(lambda: {"findings": 0, "correct": 0, "labels": 0, "found": 0})
    detail = []
    check = {"right": 0, "wrong": 0, "either": 0}
    latencies, costs, proposed, dropped, missing = [], [], 0, 0, []

    for img in labels:
        name = Path(img["path"]).stem
        res_file = ROOT / "results" / f"{name}.json"
        if not res_file.exists():
            missing.append(name)
            continue
        res = json.loads(res_file.read_text(encoding="utf-8"))
        usable = (res.get("photo_check") or {}).get("quality") == "ok"
        expected = img["expect_usable"]
        if expected is None:
            check["either"] += 1
        elif expected == usable:
            check["right"] += 1
        else:
            check["wrong"] += 1

        findings = res["findings"] if usable else []
        if res.get("validation"):
            proposed += res["validation"]["proposed"]
            dropped += res["validation"]["dropped_ungrounded"]
        if res["latency"].get("measured_live"):
            latencies.append(res["latency"]["ms"] / 1000)
            costs.append(res["latency"]["cost_usd"])

        row = {"image": name, "usable": usable, "expected_usable": expected, "hits": [], "misses": [], "false_positives": []}
        for f in findings:
            per_cat[f["category"]]["findings"] += 1
            if any(matches(f, l) for l in img["labels"]):
                per_cat[f["category"]]["correct"] += 1
                row["hits"].append(f"{f['id']} {f['title']}")
            else:
                row["false_positives"].append(f"{f['id']} [{f['category']}] {f['title']}")
        for l in img["labels"]:
            per_cat[l["category"]]["labels"] += 1
            if any(matches(f, l) for f in findings):
                per_cat[l["category"]]["found"] += 1
            else:
                row["misses"].append(f"[{l['category']}] {l['hazard']}")
        detail.append(row)

    def ratio(a: int, b: int) -> float | None:
        return round(a / b, 3) if b else None

    tot = {k: sum(c[k] for c in per_cat.values()) for k in ("findings", "correct", "labels", "found")}
    summary = {
        "images": len(labels) - len(missing),
        "missing_results": missing,
        "precision": ratio(tot["correct"], tot["findings"]),
        "recall": ratio(tot["found"], tot["labels"]),
        "per_category": {
            cat: {**c, "precision": ratio(c["correct"], c["findings"]), "recall": ratio(c["found"], c["labels"])}
            for cat, c in sorted(per_cat.items())
        },
        "photo_check": check,
        "grounding": {
            "proposed_by_vlm": proposed,
            "dropped_ungrounded": dropped,
            "dropped_pct": round(100 * dropped / proposed, 1) if proposed else None,
        },
        "latency_s_mean": round(sum(latencies) / len(latencies), 1) if latencies else None,
        "cost_usd_mean": round(sum(costs) / len(costs), 4) if costs else None,
        "live_runs": len(latencies),
    }
    return {"summary": summary, "detail": detail}


def pct(v: float | None) -> str:
    return "  -  " if v is None else f"{100 * v:4.0f}%"


def main() -> None:
    out = score()
    s = out["summary"]
    (ROOT / "summary.json").write_text(json.dumps(s, indent=1) + "\n", encoding="utf-8")
    if "--json" in sys.argv:
        print(json.dumps(s, indent=1))
        return
    print(f"AgeProof AI eval: {s['images']} images\n")
    print(f"{'category':<10} {'findings':>8} {'correct':>8} {'precision':>9}   {'labels':>6} {'found':>6} {'recall':>6}")
    for cat, c in s["per_category"].items():
        print(
            f"{cat:<10} {c['findings']:>8} {c['correct']:>8} {pct(c['precision']):>9}   "
            f"{c['labels']:>6} {c['found']:>6} {pct(c['recall']):>6}"
        )
    print(f"{'all':<10} {'':>8} {'':>8} {pct(s['precision']):>9}   {'':>6} {'':>6} {pct(s['recall']):>6}\n")
    pc = s["photo_check"]
    print(f"Photo check: {pc['right']} right, {pc['wrong']} wrong, {pc['either']} where either answer is fine")
    g = s["grounding"]
    print(f"Grounding: {g['dropped_ungrounded']} of {g['proposed_by_vlm']} Muse Spark findings dropped as ungrounded ({g['dropped_pct']}%)")
    print(f"Latency: {s['latency_s_mean']}s mean, cost ${s['cost_usd_mean']} mean per image ({s['live_runs']} live runs)")
    if s["missing_results"]:
        print(f"\nNo results yet for: {', '.join(s['missing_results'])} (run: npm run eval -w apps/web)")
    if "--detail" in sys.argv:
        for row in out["detail"]:
            print(f"\n== {row['image']}" + ("" if row["usable"] else "  (turned away)"))
            for h in row["hits"]:
                print(f"   ok   {h}")
            for m in row["misses"]:
                print(f"   MISS {m}")
            for fp in row["false_positives"]:
                print(f"   FP   {fp}")


if __name__ == "__main__":
    main()
