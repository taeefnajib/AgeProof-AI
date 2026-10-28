/** Stable colour per concept for the raw "all detected objects" layer. */
const RAW_COLOURS = [
  "#2f7d6d", "#3a6ea5", "#8a5a9e", "#b07d2b", "#5c8a3a",
  "#a5523a", "#3a8a8a", "#6b6bb0", "#9e5a7a", "#7a7a3a",
];

export function conceptColour(concept: string): string {
  let h = 0;
  for (let i = 0; i < concept.length; i++) h = (h * 31 + concept.charCodeAt(i)) >>> 0;
  return RAW_COLOURS[h % RAW_COLOURS.length];
}

/** Priority colours: calm amber/orange/grey, never alarming red (CLAUDE.md §5). */
export const PRIORITY_STYLE = {
  discuss_soon: { colour: "#d9692b", label: "Discuss soon" },
  worth_checking: { colour: "#d99a1e", label: "Worth checking" },
  minor: { colour: "#8b8f8c", label: "Minor" },
} as const;
