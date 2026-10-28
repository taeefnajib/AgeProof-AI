import { z } from "zod";
import { ConceptSchema, RoomTypeSchema } from "./vocabulary";

/** Muse Spark step 1 output. Also sent as the JSON Schema for constrained decoding. */
export const InventorySchema = z.object({
  is_room_photo: z.boolean().describe("false if this is not a photo of a room inside a home"),
  photo_quality: z
    .enum(["ok", "too_dark", "too_blurry", "not_a_room"])
    .describe("whether the photo is usable for a home-safety screening"),
  room_type: RoomTypeSchema,
  room_type_confidence: z.enum(["low", "medium", "high"]),
  concepts: z
    .array(ConceptSchema)
    .describe("concepts from the vocabulary that plausibly appear in the photo"),
  floor_phrase: z
    .string()
    .describe("2-3 word noun phrase naming the floor surface with its colour, e.g. 'grey carpet'"),
  notes: z.string().describe("one short sentence on anything that made this hard to judge, or empty"),
});
export type Inventory = z.infer<typeof InventorySchema>;
