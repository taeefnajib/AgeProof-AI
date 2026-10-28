import { ABSENCE_RULES, type RuleCandidate } from "../schema/candidate";
import type { ExplainOutput } from "../schema/explain";
import type { Finding } from "../schema/finding";
import type { Region } from "../schema/region";
import type { ValidationStats } from "../schema/validation";
import { numberFindings, sortFindings } from "./findings";

export type { ValidationStats };

/** Words the product must never say about a home (CLAUDE.md §7). */
const BANNED =
  /\b(safe|unsafe|safety score|compliant|compliance|non-compliant|passes|passed|elderly|frail|dangerous|hazardous)\b/i;
/** Imperative modification instructions; suggestions must be "to discuss". */
const INSTRUCTION = /^\s*(install|drill|fit|remove|replace|buy|add|put|move|mount)\b/i;

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;
const capConfidence = (c: Finding["confidence"], max: Finding["confidence"]) =>
  CONFIDENCE_RANK[c] > CONFIDENCE_RANK[max] ? max : c;

const regionKey = (ids: string[]) => [...ids].sort().join(",");

export function truncateTitle(title: string, max = 60): string {
  const t = title.trim().replace(/\.$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function breaksLanguageRules(f: Pick<Finding, "title" | "explanation" | "suggestion">): boolean {
  return (
    BANNED.test(f.title) || BANNED.test(f.explanation) || BANNED.test(f.suggestion) || INSTRUCTION.test(f.suggestion)
  );
}

function fromCandidate(c: RuleCandidate): Omit<Finding, "id"> {
  return {
    rule_id: c.rule_id,
    category: c.category,
    title: truncateTitle(c.title),
    explanation: c.explanation,
    suggestion: c.suggestion,
    region_ids: c.region_ids,
    scope: c.scope,
    confidence: c.confidence,
    priority: c.priority,
    evidence: c.measurement,
  };
}

/**
 * Step 5 (validation half): turn the model's output into grounded findings.
 * - drop any finding citing a region ID that doesn't exist, and log it
 * - fix scope/region consistency; cap confidence for absence findings and VLM-only findings
 * - enforce language rules (fall back to the rule's template wording, else drop)
 * - de-duplicate; restore rule candidates the model silently skipped
 * - sort by priority and number F1, F2…
 */
export function validateFindings(
  output: ExplainOutput,
  regions: Region[],
  candidates: RuleCandidate[],
): { findings: Finding[]; stats: ValidationStats } {
  const known = new Set(regions.map((r) => r.id));
  const byRule = new Map<string, RuleCandidate[]>();
  for (const c of candidates) byRule.set(c.rule_id, [...(byRule.get(c.rule_id) ?? []), c]);
  const usedCandidates = new Set<RuleCandidate>();
  /**
   * Match a model finding to the candidate it confirms: same rule, most shared
   * regions (a rule can fire several times, and candidates can share an anchor
   * such as a door), preferring candidates not already matched.
   */
  const findCandidate = (ruleId: string, ids: string[]) => {
    const scored = (byRule.get(ruleId) ?? [])
      .map((c) => ({
        c,
        shared: c.region_ids.filter((id) => ids.includes(id)).length,
        exact: regionKey(c.region_ids) === regionKey(ids),
      }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.shared - a.shared);
    const pick =
      scored.find((x) => x.shared > 0 && !usedCandidates.has(x.c)) ?? scored.find((x) => x.shared > 0);
    if (pick) return pick.c;
    return scored.length === 1 ? scored[0].c : undefined;
  };


  const stats: ValidationStats = {
    proposed: output.findings.length,
    dropped_ungrounded: 0,
    language_fixed: 0,
    language_dropped: 0,
    deduplicated: 0,
    rejected: [],
    restored: 0,
    kept: 0,
  };

  const kept: Omit<Finding, "id">[] = [];

  for (const raw of output.findings) {
    const ids = [...new Set(raw.region_ids.map((id) => id.trim().toUpperCase()))];
    if (ids.some((id) => !known.has(id))) {
      stats.dropped_ungrounded++;
      console.warn(`[validate] dropped ungrounded finding "${raw.title}" citing ${ids.join(",")}`);
      continue;
    }
    let scope = raw.scope;
    if (ids.length === 0 && scope === "region") {
      // A region finding with no region: nothing to point at.
      stats.dropped_ungrounded++;
      console.warn(`[validate] dropped region finding with no regions: "${raw.title}"`);
      continue;
    }
    if (ids.length > 0 && scope === "whole_image") scope = "region";

    const candidate = raw.rule_id ? findCandidate(raw.rule_id, ids) : undefined;
    if (candidate) usedCandidates.add(candidate);

    let f: Omit<Finding, "id"> = {
      rule_id: candidate ? candidate.rule_id : null,
      category: raw.category,
      title: truncateTitle(raw.title),
      explanation: raw.explanation.trim(),
      suggestion: raw.suggestion.trim(),
      region_ids: ids,
      scope,
      confidence: raw.confidence,
      priority: raw.priority,
      evidence: candidate ? `${raw.evidence.trim()} (measured: ${candidate.measurement})` : raw.evidence.trim(),
    };

    if (breaksLanguageRules(f)) {
      if (candidate) {
        f = { ...fromCandidate(candidate), region_ids: f.region_ids, scope: f.scope };
        stats.language_fixed++;
      } else {
        stats.language_dropped++;
        console.warn(`[validate] dropped finding breaking language rules: "${raw.title}"`);
        continue;
      }
    }

    // Confidence caps: never above the rule's own; absence rules ≤ medium; VLM-only ≤ medium.
    if (candidate) f.confidence = capConfidence(f.confidence, candidate.confidence);
    if (!candidate || ABSENCE_RULES.includes(candidate.rule_id)) f.confidence = capConfidence(f.confidence, "medium");

    const key = `${f.rule_id ?? f.category}|${regionKey(f.region_ids)}`;
    const dup = kept.some(
      (k) =>
        `${k.rule_id ?? k.category}|${regionKey(k.region_ids)}` === key ||
        // A VLM observation pointing at the same regions as an existing finding of the same category.
        (f.rule_id === null && k.category === f.category && f.region_ids.length > 0 &&
          f.region_ids.every((id) => k.region_ids.includes(id))),
    );
    if (dup) {
      stats.deduplicated++;
      continue;
    }
    kept.push(f);
  }

  // Rejections only count for candidates that exist; everything else unaddressed is restored.
  for (const r of output.rejected) {
    const c = findCandidate(r.rule_id, r.region_ids.map((id) => id.toUpperCase()));
    if (c && !usedCandidates.has(c)) {
      usedCandidates.add(c);
      stats.rejected.push({ rule_id: c.rule_id, region_ids: c.region_ids, reason: r.reason });
    }
  }
  for (const c of candidates) {
    if (usedCandidates.has(c)) continue;
    const key = `${c.rule_id}|${regionKey(c.region_ids)}`;
    if (kept.some((k) => `${k.rule_id}|${regionKey(k.region_ids)}` === key)) continue;
    kept.push(fromCandidate(c));
    stats.restored++;
  }

  const findings = numberFindings(sortFindings(kept));
  stats.kept = findings.length;
  return { findings, stats };
}
