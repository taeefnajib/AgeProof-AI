import type { RuleCandidate } from "../schema/candidate";
import type { Finding } from "../schema/finding";

export const PRIORITY_ORDER: Record<Finding["priority"], number> = {
  discuss_soon: 0,
  worth_checking: 1,
  minor: 2,
};
const CONFIDENCE_ORDER: Record<Finding["confidence"], number> = { high: 0, medium: 1, low: 2 };

export function sortFindings<F extends Pick<Finding, "priority" | "confidence">>(findings: F[]): F[] {
  return [...findings].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence],
  );
}

/** Renumber F1, F2… in display order. */
export function numberFindings(findings: Omit<Finding, "id">[]): Finding[] {
  return findings.map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

/** Rule candidates shown as findings using their template wording (no LLM). */
export function candidatesToFindings(candidates: RuleCandidate[]): Finding[] {
  return numberFindings(
    sortFindings(candidates).map((c) => ({
      rule_id: c.rule_id,
      category: c.category,
      title: c.title.slice(0, 60),
      explanation: c.explanation,
      suggestion: c.suggestion,
      region_ids: c.region_ids,
      scope: c.scope,
      confidence: c.confidence,
      priority: c.priority,
      evidence: c.measurement,
    })),
  );
}
