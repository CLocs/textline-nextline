import stillsCoverageJson from "../../../content/stills-coverage.json";
import type { CatalogEntry } from "../../types/content.js";
import type { ShowGroup } from "./libraryGroups.js";
import type { StillsCoverageFile } from "./mediaUploads.js";
import { sceneLinesByTitle } from "./stillsLines.js";

function coversMap(): Record<string, number> {
  const raw = stillsCoverageJson as StillsCoverageFile;
  if (!raw?.covers || typeof raw.covers !== "object") return {};
  return raw.covers;
}

function storedCover(covers: Record<string, number>, titleId: string): number | undefined {
  const n = covers[titleId];
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function earliestSceneLine(sceneLines: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const line of sceneLines) {
    if (!Number.isInteger(line) || line < 0) continue;
    if (best == null || line < best) best = line;
  }
  return best;
}

/**
 * Cover still among JPEGs on disk.
 * Prefer the earliest starred scene so a full-playable extract cannot replace it
 * with the opening frame. Otherwise use the lowest JPEG.
 */
export function pickCoverLineIndex(
  jpegIndices: readonly number[],
  sceneLines: readonly number[] = [],
): number | undefined {
  if (jpegIndices.length === 0) return undefined;
  const onDisk = new Set(jpegIndices);
  const scenesOnDisk = sceneLines.filter((line) => onDisk.has(line));
  return earliestSceneLine(scenesOnDisk) ?? Math.min(...jpegIndices);
}

/** Library cover: earliest starred scene, else the recorded JPEG index. */
export function coverStillLineIndex(
  titleId: string,
  covers: Record<string, number> = coversMap(),
  sceneLines: Record<string, readonly number[]> = sceneLinesByTitle(),
): number | undefined {
  const scene = earliestSceneLine(sceneLines[titleId] ?? []);
  if (scene != null) return scene;
  return storedCover(covers, titleId);
}

export function coverStillForEntries(
  entries: CatalogEntry[],
  covers: Record<string, number> = coversMap(),
  sceneLines: Record<string, readonly number[]> = sceneLinesByTitle(),
): { titleId: string; lineIndex: number } | undefined {
  for (const entry of entries) {
    const lineIndex = coverStillLineIndex(entry.id, covers, sceneLines);
    if (lineIndex != null) return { titleId: entry.id, lineIndex };
  }
  return undefined;
}

/** First episode (season then episode order) that has a cover still. */
export function coverStillForShow(
  show: ShowGroup,
  covers: Record<string, number> = coversMap(),
  sceneLines: Record<string, readonly number[]> = sceneLinesByTitle(),
): { titleId: string; lineIndex: number } | undefined {
  const seasons = [...show.seasons.keys()].sort((a, b) => a - b);
  const episodes = seasons.flatMap((season) => show.seasons.get(season) ?? []);
  return coverStillForEntries(episodes, covers, sceneLines);
}
