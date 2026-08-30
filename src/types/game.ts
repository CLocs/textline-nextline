export type GameMode = "fun" | "medium" | "hard";

export const GAME_MODES: {
  id: GameMode;
  label: string;
  description: string;
  available: boolean;
}[] = [
  {
    id: "fun",
    label: "Fun",
    description: "Multiple choice. Wrong answers let you try again. Skip if you're stuck.",
    available: true,
  },
  {
    id: "medium",
    label: "Medium",
    description: "Type the next line. One miss ends the run.",
    available: false,
  },
  {
    id: "hard",
    label: "Hard",
    description: "Stricter matching. One miss ends the run.",
    available: false,
  },
];
