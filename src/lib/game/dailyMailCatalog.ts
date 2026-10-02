/** One framed prompt the daily email can render without the full transcript. */
export type MailCue = {
  titleId: string;
  lineIndex: number;
  title: string;
  prompt: string;
  correct: string;
  distractors: string[];
};

type CompactCue = [string, number, string, string, string, string[]];

export function packCue(cue: MailCue): CompactCue {
  return [cue.titleId, cue.lineIndex, cue.title, cue.prompt, cue.correct, cue.distractors];
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

/** Packed cues written to `public/daily-mail-catalog.json`. */
export function parseDailyMailCatalog(raw: unknown): MailCue[] {
  if (!raw || typeof raw !== "object" || !("cues" in raw)) return [];
  const rows = (raw as { cues?: unknown }).cues;
  if (!Array.isArray(rows)) return [];

  const cues: MailCue[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [titleId, lineIndex, title, prompt, correct, distractors] = row as unknown[];
    if (typeof titleId !== "string" || titleId.length === 0 || titleId.length > 180) continue;
    if (typeof lineIndex !== "number" || !Number.isInteger(lineIndex) || lineIndex < 0) continue;
    if (typeof title !== "string" || typeof prompt !== "string" || typeof correct !== "string") continue;
    if (!prompt.trim() || !correct.trim() || !isStringList(distractors)) continue;
    cues.push({
      titleId,
      lineIndex,
      title: title.trim() || titleId,
      prompt,
      correct,
      distractors: distractors.slice(0, 3),
    });
  }
  return cues;
}
