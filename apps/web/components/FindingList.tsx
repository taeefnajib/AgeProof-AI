"use client";

import { useEffect, useRef } from "react";
import { CATEGORY_LABEL } from "@/lib/labels";
import { PRIORITY_STYLE } from "@/lib/render/palette";
import type { Finding } from "@/lib/schema/finding";

export function FindingList({
  findings,
  activeId,
  selectedId,
  onActive,
  onSelect,
}: {
  findings: Finding[];
  activeId: string | null;
  selectedId: string | null;
  onActive: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // A pin click selects a finding: bring its row into view.
  useEffect(() => {
    if (selectedId) rowRefs.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  if (findings.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        No possible hazards were flagged from what is visible in this photo. That doesn&apos;t mean
        there are none: items not visible have not been checked.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-line">
      {findings.map((f, i) => {
        const style = PRIORITY_STYLE[f.priority];
        const active = activeId === f.id;
        const open = selectedId === f.id;
        return (
          <li
            key={f.id}
            ref={(el) => {
              if (el) rowRefs.current.set(f.id, el);
              else rowRefs.current.delete(f.id);
            }}
            onMouseEnter={() => onActive(f.id)}
            onMouseLeave={() => onActive(null)}
            className={`-mx-2 rounded-lg px-2 transition-colors ${active || open ? "bg-paper" : ""}`}
          >
            <button
              type="button"
              onClick={() => onSelect(open ? null : f.id)}
              aria-expanded={open}
              className="flex w-full items-start gap-3 py-3 text-left"
            >
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: style.colour }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{f.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span style={{ color: style.colour }} className="font-semibold">
                    {style.label}
                  </span>
                  <span>·</span>
                  <span>{CATEGORY_LABEL[f.category]}</span>
                  <span>·</span>
                  <span>{f.confidence} confidence</span>
                </span>
              </span>
              <span className={`mt-1 text-muted transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {open && (
              <div className="space-y-2 pb-4 pl-10 text-sm leading-relaxed">
                <p>{f.explanation}</p>
                <p className="rounded-lg bg-accent-soft px-3 py-2 text-ink">
                  <span className="font-medium">To discuss: </span>
                  {f.suggestion}
                </p>
                <p className="text-xs text-muted">
                  <span className="font-medium">How this was found: </span>
                  {f.rule_id ? `measured by rule ${f.rule_id}` : "observed by Muse Spark"} ·{" "}
                  {f.region_ids.length ? `regions ${f.region_ids.join(", ")}` : "whole photo"} · {f.evidence}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
