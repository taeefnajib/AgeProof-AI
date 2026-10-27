"use client";

import { maskTransform } from "@/lib/pipeline/mask";
import { conceptColour } from "@/lib/render/palette";
import type { Region } from "@/lib/schema/region";

/**
 * Photo with an SVG overlay in image-pixel coordinates (viewBox = image size),
 * so masks line up at any display size.
 */
export function RegionOverlay({
  src,
  width,
  height,
  regions,
  activeId,
  onHover,
}: {
  src: string;
  width: number;
  height: number;
  regions: Region[];
  activeId: string | null;
  onHover: (id: string | null) => void;
}) {
  // Draw large regions first so small ones stay hoverable on top.
  const ordered = [...regions].sort((a, b) => b.area_pct - a.area_pct);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Analysed room photo" className="block h-auto w-full" />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 h-full w-full"
        onMouseLeave={() => onHover(null)}
      >
        {ordered.map((r) => {
          const colour = conceptColour(r.concept);
          const active = activeId === r.id;
          const dimmed = activeId !== null && !active;
          const isFloor = r.concept === "floor";
          return (
            <g key={r.id} onMouseEnter={() => onHover(r.id)} className="cursor-pointer">
              <path
                d={r.svg_path}
                transform={maskTransform(r.mask, r.box)}
                fill={colour}
                fillOpacity={isFloor ? (active ? 0.25 : 0.08) : active ? 0.55 : dimmed ? 0.12 : 0.35}
                stroke={colour}
                strokeOpacity={dimmed ? 0.3 : 0.9}
                strokeWidth={active ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                style={{ transition: "fill-opacity 150ms, stroke-opacity 150ms" }}
              />
            </g>
          );
        })}
        {activeId &&
          regions
            .filter((r) => r.id === activeId)
            .map((r) => (
              <g key={`label-${r.id}`} pointerEvents="none">
                <rect
                  x={r.box.x1}
                  y={Math.max(0, r.box.y1 - 34)}
                  width={Math.max(120, (r.id.length + r.concept.length + 2) * 13)}
                  height={30}
                  rx={6}
                  fill="#1d2a2c"
                  fillOpacity={0.85}
                />
                <text
                  x={r.box.x1 + 10}
                  y={Math.max(0, r.box.y1 - 34) + 21}
                  fill="#fff"
                  fontSize={18}
                  fontFamily="ui-sans-serif, system-ui"
                >
                  {r.id} · {r.concept}
                </text>
              </g>
            ))}
      </svg>
    </div>
  );
}
