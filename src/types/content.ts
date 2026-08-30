/** One playable line in a transcript (from a transcript_maker block). */
export type Line = {
  index: number;
  text: string;
  kind: "dialogue" | "sdh";
  startMs: number;
  endMs: number;
};

/** Optional show/episode metadata when the source provides it. */
export type TitleMeta = {
  show?: string;
  season?: number;
  episode?: number;
  year?: number;
};

/** Normalized transcript stored in the content library. */
export type Title = {
  id: string;
  title: string;
  sourceFilename: string;
  importedAt: string;
  lineCount: number;
  lines: Line[];
  meta?: TitleMeta;
};

/** Index entry pointing at a stored title file. */
export type CatalogEntry = {
  id: string;
  title: string;
  lineCount: number;
  sourceFilename: string;
  importedAt: string;
  meta?: TitleMeta;
};

export type Catalog = {
  version: 1;
  updatedAt: string;
  titles: CatalogEntry[];
};
