"use client";

import { useState } from "react";
import { checklistFor } from "@/lib/checklist";
import type { RoomType } from "@/lib/schema/vocabulary";

/** Things a photo can't show, to check in person or ask the OT. Ticks are local to this tab. */
export function RoomChecklist({ roomType }: { roomType: RoomType }) {
  const items = checklistFor(roomType);
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <ul className="space-y-2">
      {items.map((q, i) => (
        <li key={q}>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
            <input
              type="checkbox"
              checked={done.has(i)}
              onChange={() =>
                setDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span className={done.has(i) ? "text-muted line-through" : ""}>{q}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
