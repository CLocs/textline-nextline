import stillsLinesJson from "../../../content/stills-lines.json";

const linesByTitle = stillsLinesJson as Record<string, number[]>;

export function sceneLinesByTitle(): Record<string, number[]> {
  return linesByTitle;
}

/** Starred lines that already have a scene frame, lowest index first. */
export function sceneLinesFor(titleId: string): number[] {
  const lines = linesByTitle[titleId];
  if (!Array.isArray(lines)) return [];
  return lines.filter((line) => Number.isInteger(line) && line >= 0);
}

export function hasSceneFrame(titleId: string, lineIndex: number): boolean {
  return sceneLinesFor(titleId).includes(lineIndex);
}
