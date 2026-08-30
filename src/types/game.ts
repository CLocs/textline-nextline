export type GameMode = "fun" | "medium" | "hard";

export type GameLength = "full" | "mini";

export const MINI_GAME_SIZE = 10;

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

export const GAME_LENGTHS: {
  id: GameLength;
  label: string;
  description: string;
}[] = [
  {
    id: "full",
    label: "Full episode",
    description: "Play through every dialogue line in order.",
  },
  {
    id: "mini",
    label: "Mini-game (10)",
    description: "Ten questions — starred lines first, then random picks.",
  },
];
