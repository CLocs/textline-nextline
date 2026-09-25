/** Status of SRT acquisition for a queued film. */
export type SrtStatus = "missing" | "manual" | "opensubtitles" | "short";

/**
 * One movie in the Letterboxd seed queue (likes ∪ ratings ≥ 4.5).
 * `priority` is 1 = highest (5★ + liked) … 5 = liked with no rating.
 */
export type QueueFilm = {
  title: string;
  year: number | null;
  letterboxdUri: string;
  liked: boolean;
  rating: number | null;
  priority: number;
  /** Diary log count (rewatches included). */
  playCount: number;
  /** Readwise/Obsidian highlight count matched to this title. */
  highlightCount: number;
  tmdbId: number | null;
  srt: SrtStatus;
  converted: boolean;
  imported: boolean;
};

/** A TV season queued by hand (not from the Letterboxd film seed). */
export type QueueShow = {
  title: string;
  season: number;
  year: number | null;
  srt: SrtStatus;
  note?: string;
};

export type ContentQueue = {
  version: 1;
  updatedAt: string;
  seed: "likes ∪ ratings>=4.5";
  films: QueueFilm[];
  /** Preserved across Letterboxd re-exports. */
  shows?: QueueShow[];
};
