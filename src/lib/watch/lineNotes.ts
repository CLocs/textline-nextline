export type LineNoteSpeaker = {
  label: string;
  name: string | null;
  userId: string | null;
};

/** One room note on a catalog line. `raw` stays; `text` is the wording they kept. */
export type LineNote = {
  titleId: string;
  lineIndex: number;
  raw: string;
  text: string;
  speakers: LineNoteSpeaker[];
};

type LineNoteStore = {
  notes: LineNote[];
};

const STORAGE_KEY = "textline-nextline-line-notes";

function emptyStore(): LineNoteStore {
  return { notes: [] };
}

function isSpeaker(value: unknown): value is LineNoteSpeaker {
  if (!value || typeof value !== "object") return false;
  const speaker = value as LineNoteSpeaker;
  return typeof speaker.label === "string";
}

function isNote(value: unknown): value is LineNote {
  if (!value || typeof value !== "object") return false;
  const note = value as LineNote;
  return (
    typeof note.titleId === "string" &&
    note.titleId.length > 0 &&
    Number.isInteger(note.lineIndex) &&
    note.lineIndex >= 0 &&
    typeof note.raw === "string" &&
    typeof note.text === "string" &&
    Array.isArray(note.speakers) &&
    note.speakers.every(isSpeaker)
  );
}

function readStore(): LineNoteStore {
  if (typeof localStorage === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as LineNoteStore;
    if (!Array.isArray(parsed.notes)) return emptyStore();
    return { notes: parsed.notes.filter(isNote) };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: LineNoteStore): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getLineNotesForTitle(titleId: string): LineNote[] {
  return readStore().notes.filter((note) => note.titleId === titleId);
}

/** Save the words they typed. An empty note removes the line. Speakers stay unset. */
export function saveLineNote(titleId: string, lineIndex: number, words: string): void {
  const store = readStore();
  const trimmed = words.trim();
  const rest = store.notes.filter(
    (note) => note.titleId !== titleId || note.lineIndex !== lineIndex,
  );
  if (!trimmed) {
    writeStore({ notes: rest });
    return;
  }
  rest.push({
    titleId,
    lineIndex,
    raw: trimmed,
    text: trimmed,
    speakers: [],
  });
  writeStore({ notes: rest });
}
