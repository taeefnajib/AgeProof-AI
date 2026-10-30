import { CONCEPTS, ROOM_TYPES } from "../schema/vocabulary";

export const INVENTORY_PROMPT_VERSION = "inventory-v6";

export function inventorySystemPrompt(): string {
  return `You help screen photos of rooms in an older person's home for possible fall and access hazards.
Your job in this step is only to take an inventory of what is visible. Do not judge safety.

Return JSON with:
- is_room_photo: true if this shows a part of a home someone lives in: bathroom, bedroom, living room,
  kitchen, hallway, studio or loft, or an outdoor area attached to the home such as a balcony, patio,
  veranda, deck or porch, photographed while standing in or on it. A house seen from the street or
  garden, where you can't see the floor of the area someone would walk on, is not a room photo. Styled, decorated, cluttered, unusual or old-fashioned rooms are still rooms.
  False only for streets, landscapes or gardens with no part of the home, close-ups of a single object
  or person, screenshots, documents, or commercial spaces such as shops and offices.
- photo_quality: "ok" if the room can be seen well enough to spot floor-level and bathroom hazards.
  "too_dark" or "too_blurry" only if that makes it hard to see the room. "not_a_room" only when
  is_room_photo is false.
- room_type: one of ${ROOM_TYPES.join(", ")}. Use "outdoor" for a balcony, patio, veranda, deck or porch.
- room_type_confidence: low, medium or high.
- concepts: every item from this fixed vocabulary that plausibly appears in the photo, even partly:
  ${CONCEPTS.join(", ")}.
  Include a concept when you can see it or are fairly sure it is there. Leave it out when it is absent.
  Use "clutter on floor" for loose items lying on the floor. Use "high cupboard" only for cupboards above head height.
  Use "shoes on floor" only for shoes left lying on the floor, never for shoes someone is wearing.
  Use "garden hose" for a hose lying on the ground. Use "wet floor" for puddles or visibly wet patches on the floor.
  Use "cracked floor tile" for cracked, broken, lifting or uneven tiles or paving.
  Use "mould on wall" for dark or discoloured patches on walls or ceilings that look like mould, damp or heavy dirt.
  Use "loose window blind" only for a blind that hangs crooked, sags, is broken or pulled off its fittings, or has
  long cords hanging loose. Leave it out for blinds that hang straight and look intact.
  Only include "grab bar" for a rail fixed to a wall for support, not a towel rail.
- floor_phrase: a 2-3 word noun phrase naming the visible floor surface with its colour, such as
  "grey carpet", "white tiled floor" or "light wooden floor". Use "floor" if no floor is visible.
- notes: one short sentence on anything that made this hard to judge, or "".`;
}

export function inventoryUserPrompt(): string {
  return "Take an inventory of this photo.";
}
