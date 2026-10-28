import type { RoomType } from "./schema/vocabulary";

/**
 * Standard questions per room that a photo can't answer (CLAUDE.md §5.5).
 * Phrased as things to check or ask, never as instructions.
 */
const COMMON = [
  "Is there a clear path from the bed to the toilet at night?",
  "Can light switches be reached from the doorway without walking in the dark?",
  "Are walking aids (if used) easy to reach and use in this room?",
];

export const ROOM_CHECKLISTS: Record<RoomType, string[]> = {
  bathroom: [
    "Is the bath mat non-slip underneath?",
    "Is the floor slippery when wet?",
    "Is there something firm to hold when getting in and out of the shower or bath?",
    "Is the toilet seat a comfortable height to sit down and stand up?",
    "Can the door be opened from outside in an emergency?",
    "Is hot water temperature limited to avoid scalds?",
  ],
  bedroom: [
    "Is the bed a comfortable height to sit on and stand up from?",
    "Can a lamp or light be reached from the bed?",
    "Is there a night light on the way to the toilet?",
    "Can a phone be reached from the bed?",
    "Are everyday clothes stored between waist and shoulder height?",
  ],
  living: [
    "Are chairs and the sofa a comfortable height to stand up from?",
    "Do rugs grip the floor, with edges that lie flat?",
    "Are cords kept away from where people walk?",
    "Is there enough light for reading and moving around in the evening?",
    "Can the phone and TV remote be reached from the usual chair?",
  ],
  kitchen: [
    "Are everyday items stored between waist and shoulder height?",
    "Is there a stable place to sit while preparing food?",
    "Is the floor slippery when wet?",
    "Is the lighting bright over the bench and stove?",
  ],
  hallway: [
    "Is the hallway lit along its whole length, day and night?",
    "Are there handrails where the floor level changes?",
    "Is the path to the front door clear of furniture and clutter?",
  ],
  other: ["Are walkways clear of clutter and cords?", "Is the room well lit day and night?"],
};

export function checklistFor(room: RoomType): string[] {
  const own = ROOM_CHECKLISTS[room] ?? ROOM_CHECKLISTS.other;
  return [...own, ...COMMON.filter((q) => !own.includes(q))];
}
