import type { StepTiming } from "@/lib/schema/analysis";

/** Steps the pipeline currently runs, in order. Extend as rules/explain land. */
export const PIPELINE_STEPS: { step: StepTiming["step"]; label: string; model?: string }[] = [
  { step: "preprocess", label: "Preprocess" },
  { step: "inventory", label: "Inventory", model: "Muse Spark" },
  { step: "segment", label: "Segment", model: "SAM 3.1" },
];

function fmt(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function PipelineTimeline({
  timings,
  running,
}: {
  timings: StepTiming[];
  running: boolean;
}) {
  const done = new Map(timings.map((t) => [t.step, t]));
  const firstPending = PIPELINE_STEPS.find((s) => !done.has(s.step))?.step;

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {PIPELINE_STEPS.map((s, i) => {
        const t = done.get(s.step);
        const active = running && s.step === firstPending;
        return (
          <li key={s.step} className="flex items-center gap-2">
            {i > 0 && <span className="text-line">→</span>}
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${
                t
                  ? "border-accent/30 bg-accent-soft text-ink"
                  : active
                    ? "border-amber/50 bg-amber/10 text-ink"
                    : "border-line text-muted"
              }`}
              title={t?.detail}
            >
              {t ? (
                <span className="text-accent">✓</span>
              ) : active ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-line" />
              )}
              <span className="font-medium">{s.label}</span>
              {s.model && <span className="text-muted">· {s.model}</span>}
              {t && (
                <span className="tabular-nums text-muted">
                  {t.cached ? "cached" : fmt(t.ms)}
                  {t.detail ? ` · ${t.detail}` : ""}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
