"use client";

import { useMemo } from "react";
import { PRIORITY_ORDER } from "@/lib/pipeline/findings";
import { maskTransform } from "@/lib/pipeline/mask";
import { PRIORITY_STYLE } from "@/lib/render/palette";
import { layoutPins, pinRadius, primaryRegion } from "@/lib/render/pins";
import type { Finding } from "@/lib/schema/finding";
import type { Region } from "@/lib/schema/region";

/**
 * The annotated photo: each finding's main region filled in its priority
 * colour with a numbered pin; anchor regions (e.g. the door a rug is near)
 * are outlined when that finding is active.
 */
export function FindingsOverlay({
  src,
  width,
  height,
  findings,
  regions,
  activeId,
  onActive,
  onSelect,
}: {
  src: string;
  width: number;
  height: number;
  findings: Finding[];
  regions: Region[];
  activeId: string | null;
  onActive: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const pins = useMemo(() => layoutPins(findings, regions, width, height), [findings, regions, width, height]);
  const r = pinRadius(width, height);
  const wholeImage = findings.filter((f) => f.region_ids.length === 0);
  // Paint minor first so "discuss soon" sits on top.
  const painted = [...findings]
    .filter((f) => f.region_ids.length > 0)
    .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Room photo with possible hazards marked" className="block h-auto w-full" />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 h-full w-full"
        onMouseLeave={() => onActive(null)}
        role="img"
        aria-label={`${findings.length} possible hazards marked on the photo`}
      >
        {painted.map((f) => {
          const colour = PRIORITY_STYLE[f.priority].colour;
          const active = activeId === f.id;
          const dimmed = activeId !== null && !active;
          const main = primaryRegion(f, byId);
          return (
            <g
              key={f.id}
              className="cursor-pointer"
              onMouseEnter={() => onActive(f.id)}
              onClick={() => onSelect(f.id)}
              style={{ transition: "opacity 150ms" }}
              opacity={dimmed ? 0.25 : 1}
            >
              {f.region_ids.map((id) => {
                const region = byId.get(id);
                if (!region) return null;
                const isMain = region === main;
                if (!isMain && !active) return null;
                // A floor-wide fill would swamp the photo: outline it instead.
                const fill = isMain && region.concept !== "floor";
                return (
                  <path
                    key={id}
                    d={region.svg_path}
                    transform={maskTransform(region.mask, region.box)}
                    fill={fill ? colour : "none"}
                    fillOpacity={active ? 0.5 : 0.32}
                    stroke={isMain ? colour : "#ffffff"}
                    strokeWidth={active ? 3.5 : 2}
                    strokeDasharray={fill ? undefined : "8 6"}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          );
        })}

        {pins.map((p) => {
          const f = findings.find((x) => x.id === p.findingId)!;
          const active = activeId === f.id;
          const radius = active ? r * 1.25 : r;
          return (
            <g
              key={p.findingId}
              className="cursor-pointer"
              onMouseEnter={() => onActive(f.id)}
              onClick={() => onSelect(f.id)}
            >
              <circle cx={p.x} cy={p.y} r={radius + r * 0.18} fill="#ffffff" opacity={0.95} />
              <circle cx={p.x} cy={p.y} r={radius} fill={PRIORITY_STYLE[f.priority].colour} />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fontSize={radius * 1.1}
                fontWeight={700}
                fontFamily="ui-sans-serif, system-ui"
                pointerEvents="none"
              >
                {p.number}
              </text>
            </g>
          );
        })}
      </svg>

      {wholeImage.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          {wholeImage.map((f) => (
            <span
              key={f.id}
              className={`rounded-full px-3 py-1 text-xs font-medium text-white shadow ${
                activeId === f.id ? "ring-2 ring-white" : ""
              }`}
              style={{ background: PRIORITY_STYLE[f.priority].colour }}
            >
              {findings.indexOf(f) + 1} · whole photo
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
