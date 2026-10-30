import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InventorySchema } from "../../schema/inventory";
import { checkPhoto } from "../analyze";
import type { PhotoAnalysis } from "../../schema/analysis";
import { asScreening, photoLabel, screeningRoomType } from "../../schema/screening";

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

describe("checkPhoto", () => {
  const inv = { is_room_photo: true, photo_quality: "ok" as const, notes: "" };
  it("passes a normal photo through on the model's judgement", () => {
    expect(checkPhoto(inv, { mean: 120, dark_pct: 5 }, 500)).toMatchObject({ quality: "ok", source: "model" });
  });
  it("overrules the model for very dark or very blurry photos", () => {
    expect(checkPhoto(inv, { mean: 12, dark_pct: 99 }, 500)).toMatchObject({ quality: "too_dark", source: "measured" });
    expect(checkPhoto(inv, { mean: 30, dark_pct: 97 }, 500).quality).toBe("too_dark");
    expect(checkPhoto(inv, { mean: 32, dark_pct: 77 }, 174).quality).toBe("ok"); // dim demo hallway
    expect(checkPhoto(inv, { mean: 120, dark_pct: 5 }, 8)).toMatchObject({ quality: "too_blurry", source: "measured" });
  });
  it("treats is_room_photo false as not a room, which only the user can override", () => {
    const notRoom = { ...inv, is_room_photo: false };
    expect(checkPhoto(notRoom, { mean: 120, dark_pct: 5 }, 500).quality).toBe("not_a_room");
    expect(checkPhoto(notRoom, { mean: 120, dark_pct: 5 }, 500, true)).toMatchObject({ quality: "ok", source: "user" });
    expect(checkPhoto({ ...inv, photo_quality: "too_blurry" }, { mean: 120, dark_pct: 5 }, 500, true).quality).toBe("too_blurry");
  });
});

describe("screenings", () => {
  const photo = (room_type: string, ok = true) =>
    ({
      id: "x",
      room_type,
      room_type_source: "auto",
      created_at: "",
      photo_check: { quality: ok ? "ok" : "too_dark", source: "model", detail: "" },
      inventory: { is_room_photo: true, photo_quality: "ok" },
    }) as unknown as PhotoAnalysis;

  it("labels photos A, B, C", () => {
    expect([0, 1, 4].map(photoLabel)).toEqual(["A", "B", "E"]);
  });

  it("picks the most common room type among usable photos; the user's choice wins", () => {
    expect(screeningRoomType([photo("bedroom"), photo("bathroom"), photo("bathroom")])).toBe("bathroom");
    expect(screeningRoomType([photo("bedroom"), photo("bathroom")])).toBe("bedroom"); // tie → first
    expect(screeningRoomType([photo("living", false), photo("bedroom")])).toBe("bedroom");
    expect(screeningRoomType([photo("living")], "kitchen")).toBe("kitchen");
  });

  it("wraps results saved before multi-photo support", () => {
    const s = asScreening(photo("living"));
    expect(s.photos).toHaveLength(1);
    expect(s.room_type).toBe("living");
  });
});
