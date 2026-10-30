import { z } from "zod";
import { PhotoAnalysisSchema, type PhotoAnalysis } from "./analysis";
import { RoomTypeSchema, type RoomType } from "./vocabulary";

/** Most photos per screening (CLAUDE.md §6: 1–5 photos for one room). */
export const MAX_PHOTOS = 5;

/**
 * One room, screened from 1–5 photos. Each photo is analysed on its own (same
 * pipeline, same grounding); the screening adds the room type for the set.
 */
export const ScreeningSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  room_type: RoomTypeSchema,
  room_type_source: z.enum(["auto", "user"]),
  photos: z.array(PhotoAnalysisSchema).min(1).max(MAX_PHOTOS),
  demo: z.boolean().optional(),
});
export type Screening = z.infer<typeof ScreeningSchema>;

/** Photo labels: A, B, C… (findings are then A1, A2, B1…). */
export const photoLabel = (index: number) => String.fromCharCode(65 + index);

export function isUsable(p: PhotoAnalysis): boolean {
  const quality = p.photo_check?.quality ?? (p.inventory.is_room_photo ? p.inventory.photo_quality : "not_a_room");
  return quality === "ok";
}

/**
 * Room type for the set: the user's choice, else the most common detection
 * among usable photos (ties go to the earliest photo).
 */
export function screeningRoomType(photos: PhotoAnalysis[], userChoice?: RoomType): RoomType {
  if (userChoice) return userChoice;
  const usable = photos.filter(isUsable);
  const pool = usable.length ? usable : photos;
  const votes = new Map<RoomType, number>();
  for (const p of pool) votes.set(p.room_type, (votes.get(p.room_type) ?? 0) + 1);
  let best = pool[0].room_type;
  for (const p of pool) if ((votes.get(p.room_type) ?? 0) > (votes.get(best) ?? 0)) best = p.room_type;
  return best;
}

export function makeScreening(
  photos: PhotoAnalysis[],
  opts: { id?: string; userRoomType?: RoomType; demo?: boolean } = {},
): Screening {
  return {
    id: opts.id ?? crypto.randomUUID(),
    created_at: new Date().toISOString(),
    room_type: screeningRoomType(photos, opts.userRoomType),
    room_type_source: opts.userRoomType ? "user" : "auto",
    photos,
    ...(opts.demo || photos.some((p) => p.demo) ? { demo: true } : {}),
  };
}

/** Results saved before multi-photo support were a single PhotoAnalysis. */
export function asScreening(stored: Screening | PhotoAnalysis): Screening {
  if ("photos" in stored) return stored;
  return {
    id: stored.id,
    created_at: stored.created_at,
    room_type: stored.room_type,
    room_type_source: stored.room_type_source,
    photos: [stored],
    ...(stored.demo ? { demo: true } : {}),
  };
}
