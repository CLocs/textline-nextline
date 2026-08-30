import type { Line, Title } from "../../types/content.js";

export type LineSource = Pick<Title, "lines">;

export function getLine(source: LineSource, index: number): Line | undefined {
  return source.lines.find((line) => line.index === index);
}

export function getNextLine(source: LineSource, currentIndex: number): Line | undefined {
  const currentPosition = source.lines.findIndex((line) => line.index === currentIndex);
  if (currentPosition === -1) return undefined;
  return source.lines[currentPosition + 1];
}
