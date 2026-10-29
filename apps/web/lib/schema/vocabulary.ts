import { z } from "zod";

/** Fixed concept vocabulary sent to SAM 3.1. Tune from eval (CLAUDE.md §5). */
export const CONCEPTS = [
  // Floor & walkways
  "floor",
  "rug",
  "bath mat",
  "floor mat",
  "electrical cord",
  "step",
  "stairs",
  "threshold",
  "clutter on floor",
  "shoes on floor",
  // Bathroom
  "toilet",
  "shower",
  "bathtub",
  "grab bar",
  "shower chair",
  "towel rail",
  "vanity",
  // Furniture & storage
  "bed",
  "chair",
  "sofa",
  "coffee table",
  "shelf",
  "high cupboard",
  "low drawer",
  // Walls & windows (presence judged by Muse Spark; SAM localises)
  "mould on wall",
  "loose window blind",
  // Lighting & support
  "lamp",
  "light switch",
  "handrail",
  "night light",
  // Privacy
  "person",
  "photo frame",
  "document",
] as const;

export const ConceptSchema = z.enum(CONCEPTS);
export type Concept = z.infer<typeof ConceptSchema>;

/**
 * Labels SAM is asked to segment. "door" is not something the VLM picks from,
 * but the spatial rules need it (rug near a door, step at a doorway).
 */
export type SegmentLabel = Concept | "door";

/** Always segmented, whatever the inventory says. */
export const ALWAYS_SEGMENT: readonly SegmentLabel[] = ["floor", "door", "person"];

export const ROOM_TYPES = ["bathroom", "bedroom", "living", "kitchen", "hallway", "other"] as const;
export const RoomTypeSchema = z.enum(ROOM_TYPES);
export type RoomType = z.infer<typeof RoomTypeSchema>;
