import type { Finding } from "./schema/finding";
import type { RoomType } from "./schema/vocabulary";

export const ROOM_NAMES: Record<RoomType, string> = {
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  living: "Living room",
  kitchen: "Kitchen",
  hallway: "Hallway",
  outdoor: "Balcony or patio",
  other: "Room",
};

export const CATEGORY_LABEL: Record<Finding["category"], string> = {
  trip: "Trips",
  bathroom: "Bathroom",
  lighting: "Lighting",
  reach: "Reach",
  mobility: "Getting around",
  upkeep: "Upkeep",
  other: "Other",
};
