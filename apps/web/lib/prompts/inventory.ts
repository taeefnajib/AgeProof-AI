import { CONCEPTS, ROOM_TYPES } from "../schema/vocabulary";

export const INVENTORY_PROMPT_VERSION = "inventory-v2";

export function inventorySystemPrompt(): string {
  return `You help screen photos of rooms in an older person's home for possible fall and access hazards.
Your job in this step is only to take an inventory of what is visible. Do not judge safety.

Return JSON with:
- is_room_photo: true if this shows the inside of a room where someone could live: bathroom, bedroom,
  living room, kitchen, hallway, studio or loft. Styled, decorated, cluttered, unusual or old-fashioned
  rooms are still rooms. False only for outdoor scenes, close-ups of a single object or person,
  screenshots, documents, or commercial spaces such as shops and offices.
- photo_quality: "ok" if the room can be seen well enough to spot floor-level and bathroom hazards.
  "too_dark" or "too_blurry" only if that makes it hard to see the room. "not_a_room" only when
  is_room_photo is false.
- room_type: one of ${ROOM_TYPES.join(", ")}.
- room_type_confidence: low, medium or high.
- concepts: every item from this fixed vocabulary that plausibly appears in the photo, even partly:
  ${CONCEPTS.join(", ")}.
  Include a concept when you can see it or are fairly sure it is there. Leave it out when it is absent.
  Use "clutter on floor" for loose items lying on the floor. Use "high cupboard" only for cupboards above head height.
  Only include "grab bar" for a rail fixed to a wall for support, not a towel rail.
- notes: one short sentence on anything that made this hard to judge, or "".`;
}

export function inventoryUserPrompt(): string {
  return "Take an inventory of this photo.";
}
