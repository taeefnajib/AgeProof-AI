import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InventorySchema } from "../../schema/inventory";

describe("InventorySchema", () => {
  it("accepts a valid inventory and rejects unknown concepts", () => {
    const ok = {
      is_room_photo: true,
      photo_quality: "ok",
      room_type: "bathroom",
      room_type_confidence: "high",
      concepts: ["toilet", "bath mat"],
      floor_phrase: "white tiled floor",
      notes: "",
    };
    expect(InventorySchema.safeParse(ok).success).toBe(true);
    expect(InventorySchema.safeParse({ ...ok, concepts: ["unicorn"] }).success).toBe(false);
  });

  it("converts to a JSON Schema with the concept enum for constrained decoding", () => {
    const js = z.toJSONSchema(InventorySchema) as unknown as {
      properties: { concepts: { items: { enum: string[] } } };
    };
    expect(js.properties.concepts.items.enum).toContain("grab bar");
  });
});
