import stillsCoverageJson from "../../../content/stills-coverage.json";
import type { CatalogEntry } from "../../types/content.js";
import type { ShowGroup } from "./libraryGroups.js";
import type { StillsCoverageFile } from "./mediaUploads.js";

function coversMap(): Record<string, number> {
  const raw = stillsCoverageJson as StillsCoverageFile;
  if (!raw?.covers || typeof raw.covers !== "object") return {};
  return raw.covers;
}

/** Library cover: lowest starred still for this title, if we extracted one. */
export function coverStillLineIndex(titleId: string): number | undefined {
  const n = coversMap()[titleId];
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export function coverStillForEntries(
  entries: CatalogEntry[],
): { titleId: string; lineIndex: number } | undefined {
  for (const entry of entries) {
    const lineIndex = coverStillLineIndex(entry.id);
    if (lineIndex != null) return { titleId: entry.id, lineIndex };
  }
  return undefined;
}

/** First episode (season then episode order) that has a cover still. */
export function coverStillForShow(
  show: ShowGroup,
): { titleId: string; lineIndex: number } | undefined {
  const seasons = [...show.seasons.keys()].sort((a, b) => a - b);
  const episodes = seasons.flatMap((season) => show.seasons.get(season) ?? []);
  return coverStillForEntries(episodes);
}
