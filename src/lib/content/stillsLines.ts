import stillsLinesJson from "../../../content/stills-lines.json";

const linesByTitle = stillsLinesJson as Record<string, number[]>;

export function hasSceneFrame(titleId: string, lineIndex: number): boolean {
  const lines = linesByTitle[titleId];
  return Array.isArray(lines) && lines.includes(lineIndex);
}
