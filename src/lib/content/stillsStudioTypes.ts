export type StudioEpisodeStatus =
  | "no-file"
  | "ready"
  | "review"
  | "approved"
  | "batched"
  | "pushed";

export type StudioEpisode = {
  titleId: string;
  title: string;
  label: string;
  season: number;
  episode: number;
  lineCount: number;
  status: StudioEpisodeStatus;
  videoPath: string | null;
  videoName: string | null;
  offsetMs: number;
  timeScale: number;
  lineOffsets: Record<string, number>;
  handful: number[];
  starCount: number;
  stillCount: number;
  durationSec: number | null;
  durationWarn: boolean;
  fps: number | null;
  seek: "start" | "mid";
  methodId: string;
  methodLabel: string;
  triedMethodIds: string[];
};

export type StudioQueue = {
  show: string;
  directory: string;
  directoryExists: boolean;
  episodes: StudioEpisode[];
  unmatched: string[];
};

export type StudioFrame = {
  lineIndex: number;
  text: string;
  seekSec: number;
  extraMs: number;
  url: string;
  ok: boolean;
  error?: string;
};

export type StudioExtractMode = "handful" | "retry" | "smart" | "batch";
