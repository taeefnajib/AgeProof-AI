/** Verbatim disclaimer required on every results page and the report (CLAUDE.md §7). */
export const DISCLAIMER =
  "AgeProof AI highlights possible hazards visible in photos. It cannot confirm whether a home is safe and does not replace an assessment by an occupational therapist or other qualified professional. Items not visible in the photos have not been checked.";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      className={`rounded-xl border border-line bg-card px-4 py-3 text-sm italic leading-relaxed text-muted ${className}`}
    >
      {DISCLAIMER}
    </p>
  );
}
