import protectedJson from "../../../content/stars-protected.json";
import uploadsJson from "../../../content/uploads.json";
import stillsCoverageJson from "../../../content/stills-coverage.json";
import type { ProtectedStarsFile } from "./starsPush.js";
import type { StillsCoverageFile, UploadsSnapshot } from "./mediaUploads.js";

export function loadProtectedTitleIdsBrowser(): string[] {
  const raw = protectedJson as ProtectedStarsFile;
  return Array.isArray(raw.titleIds) ? raw.titleIds.filter((id) => typeof id === "string") : [];
}

export function loadUploadsSnapshot(): UploadsSnapshot | null {
  const raw = uploadsJson as UploadsSnapshot;
  if (!raw || !Array.isArray(raw.matched)) return null;
  return raw;
}

export function loadStillsCoverage(): Record<string, number> {
  const raw = stillsCoverageJson as StillsCoverageFile;
  if (!raw?.titles || typeof raw.titles !== "object") return {};
  return raw.titles;
}
