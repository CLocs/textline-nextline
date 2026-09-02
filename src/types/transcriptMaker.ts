/** Subset of transcript_maker timed JSON export (`workToTimedJson`). */

export type TranscriptMakerBlock = {
  startMs: number;
  endMs: number;
  cueIndices: number[];
  text: string;
  kind: "dialogue" | "sdh";
};

export type TranscriptMakerTranscript = {
  generatedAt: number;
  options: Record<string, unknown>;
  blocks: TranscriptMakerBlock[];
};

export type TranscriptMakerWork = {
  title: string;
  sourceFilename: string;
  cues?: unknown[];
  transcript: TranscriptMakerTranscript | null;
  film?: {
    tmdbId: number;
    title: string;
    year?: number;
  } | null;
};
