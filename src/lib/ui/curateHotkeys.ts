export type CurateHotkeyAction =
  | "down"
  | "up"
  | "star"
  | "quote"
  | "note"
  | "save-note"
  | "cancel-note"
  | "current-line";

export type CurateKeyState = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** Focus is in a text field, including the note. */
  typing?: boolean;
  /** Focus is in the note textarea. */
  noteFocused?: boolean;
  /** A note editor is open. */
  noteOpen?: boolean;
  dialogOpen?: boolean;
  sendMenuOpen?: boolean;
};

const NON_TEXT_INPUT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

type TargetLike = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  dataset?: { curateNote?: string };
};

/** Letter keys type in text fields. Checkboxes and buttons still take shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as TargetLike;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el.type || "text").toLowerCase();
  return !NON_TEXT_INPUT.has(type);
}

export function isCurateNoteField(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as TargetLike;
  return el.tagName?.toUpperCase() === "TEXTAREA" && el.dataset?.curateNote === "true";
}

/**
 * Vim order: j / Down move down, k / Up move up.
 * Ctrl/Cmd+Enter saves the note. Escape cancels it, or returns to the Sync line.
 * Modified keys, open dialogs, and text fields yield no list action.
 */
export function curateHotkeyAction(state: CurateKeyState): CurateHotkeyAction | null {
  if (state.dialogOpen || state.sendMenuOpen) return null;

  const ctrlOrMeta = state.ctrlKey === true || state.metaKey === true;
  if (ctrlOrMeta && state.altKey !== true && state.key === "Enter") {
    if (state.repeat) return null;
    return state.noteFocused ? "save-note" : null;
  }
  if (ctrlOrMeta || state.altKey === true) return null;

  if (state.key === "Escape") {
    if (state.typing && !state.noteFocused) return null;
    if (state.noteOpen || state.noteFocused) return "cancel-note";
    return "current-line";
  }

  if (state.typing) return null;

  let action: CurateHotkeyAction | null = null;
  switch (state.key) {
    case "j":
    case "J":
    case "ArrowDown":
      action = "down";
      break;
    case "k":
    case "K":
    case "ArrowUp":
      action = "up";
      break;
    case "s":
    case "S":
      action = "star";
      break;
    case "q":
    case "Q":
      action = "quote";
      break;
    case "n":
    case "N":
      action = "note";
      break;
    default:
      return null;
  }

  if (state.repeat && (action === "star" || action === "quote" || action === "note")) return null;
  return action;
}

/** Line that star, quote, and note act on. Browse wins, then the Sync pin, then the first row. */
export function curateActionLine(
  filtered: readonly number[],
  browse: number | null,
  pinned: number | null,
): number | null {
  if (browse !== null && filtered.includes(browse)) return browse;
  if (pinned !== null && filtered.includes(pinned)) return pinned;
  return filtered[0] ?? null;
}

/**
 * Neighbor in the filtered list. Null when the list is empty or the move stays put.
 * The first step leaves the Sync line (or the first row, when Sync is off).
 */
export function stepCurateLine(
  filtered: readonly number[],
  browse: number | null,
  pinned: number | null,
  direction: 1 | -1,
): number | null {
  const origin = curateActionLine(filtered, browse, pinned);
  if (origin === null) return null;
  const pos = filtered.indexOf(origin);
  if (pos < 0) return null;
  const next = filtered[pos + direction];
  return next === undefined ? null : next;
}
