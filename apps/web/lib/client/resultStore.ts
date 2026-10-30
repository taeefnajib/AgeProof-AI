import type { PhotoAnalysis } from "../schema/analysis";
import { asScreening, type Screening } from "../schema/screening";

/**
 * Results live only in this browser tab's sessionStorage: nothing about the
 * photos is persisted server-side, and they're gone when the tab closes.
 */
const PREFIX = "ageproof:result:";
const KEY = (id: string) => `${PREFIX}${id}`;

export function saveResult(s: Screening): void {
  const json = JSON.stringify(s);
  try {
    sessionStorage.setItem(KEY(s.id), json);
  } catch {
    // Quota exceeded (five photos are a few MB): drop older results and retry once.
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
    try {
      sessionStorage.setItem(KEY(s.id), json);
    } catch {
      throw new Error("These results are too large to keep in this browser tab. Please try fewer photos.");
    }
  }
}

export function loadResult(id: string): Screening | null {
  try {
    const raw = sessionStorage.getItem(KEY(id));
    return raw ? asScreening(JSON.parse(raw) as Screening | PhotoAnalysis) : null;
  } catch {
    return null;
  }
}
