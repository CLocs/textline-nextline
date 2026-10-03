export type GameMode = "fun" | "teach" | "medium" | "hard";

export type GameLength = "full" | "mini";

export const MINI_GAME_SIZE = 10;

const MODE_LABELS: Record<GameMode, string> = {
  fun: "Fun",
  teach: "Learn",
  medium: "Medium",
  hard: "Hard",
};

export function gameModeLabel(mode: GameMode): string {
  return MODE_LABELS[mode];
}

export const GAME_MODES: {
  id: GameMode;
  label: string;
  description: string;
}[] = [
  {
    id: "fun",
    label: "Fun",
    description: "Multiple choice. Wrong answers let you try again. Skip if you're stuck.",
  },
  {
    id: "teach",
    label: "Learn",
    description: "Like Fun, but skip shows this line and the next until you dismiss the card.",
  },
];

export const GAME_LENGTHS: {
  id: GameLength;
  label: string;
  description: string;
}[] = [
  {
    id: "mini",
    label: "Mini-game (10)",
    description: "Ten questions. Your stars first, then global stars.",
  },
  {
    id: "full",
    label: "Full episode",
    description: "Play through every dialogue line in order.",
  },
];
