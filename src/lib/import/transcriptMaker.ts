import { formatBlockText } from "../text.js";
import { slugify } from "../slug.js";
import type { Line, Title, TitleMeta } from "../../types/content.js";
import type { TranscriptMakerWork } from "../../types/transcriptMaker.js";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export function parseTranscriptMakerWork(raw: unknown): TranscriptMakerWork {
  if (!raw || typeof raw !== "object") {
    throw new ImportError("Expected a JSON object.");
  }

  const work = raw as TranscriptMakerWork;

  if (typeof work.title !== "string" || !work.title.trim()) {
    throw new ImportError("Missing or empty `title`.");
  }

  if (typeof work.sourceFilename !== "string") {
    throw new ImportError("Missing `sourceFilename`.");
  }

  if (!work.transcript?.blocks?.length) {
    throw new ImportError("Missing `transcript.blocks` — generate a transcript in transcript_maker first.");
  }

  return work;
}

function metaFromWork(work: TranscriptMakerWork): TitleMeta | undefined {
  const year = work.film?.year;
  return year !== undefined ? { year } : undefined;
}

export function workToTitle(work: TranscriptMakerWork, importedAt = new Date()): Title {
  const parsed = parseTranscriptMakerWork(work);
  const lines: Line[] = parsed.transcript!.blocks.map((block, index) => ({
    index,
    text: formatBlockText(block.text),
    kind: block.kind,
    startMs: block.startMs,
    endMs: block.endMs,
  }));

  const playable = lines.filter((line) => line.text.length > 0);
  if (playable.length < 2) {
    throw new ImportError("Transcript needs at least 2 non-empty lines to play.");
  }

  return {
    id: slugify(parsed.title),
    title: parsed.title.trim(),
    sourceFilename: parsed.sourceFilename,
    importedAt: importedAt.toISOString(),
    lineCount: playable.length,
    lines: playable,
    meta: metaFromWork(parsed),
  };
}

export function titleToCatalogEntry(title: Title) {
  return {
    id: title.id,
    title: title.title,
    lineCount: title.lineCount,
    sourceFilename: title.sourceFilename,
    importedAt: title.importedAt,
    meta: title.meta,
  };
}
