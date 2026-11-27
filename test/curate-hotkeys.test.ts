import { describe, expect, it } from "vitest";
import {
  curateActionLine,
  curateHotkeyAction,
  isCurateNoteField,
  isTypingTarget,
  stepCurateLine,
  type CurateKeyState,
} from "../src/lib/ui/curateHotkeys.js";

function act(partial: CurateKeyState) {
  return curateHotkeyAction(partial);
}

describe("curateHotkeyAction", () => {
  it("maps vim and arrow keys onto the list", () => {
    expect(act({ key: "j" })).toBe("down");
    expect(act({ key: "J" })).toBe("down");
    expect(act({ key: "ArrowDown" })).toBe("down");
    expect(act({ key: "k" })).toBe("up");
    expect(act({ key: "K" })).toBe("up");
    expect(act({ key: "ArrowUp" })).toBe("up");
    expect(act({ key: "s" })).toBe("star");
    expect(act({ key: "q" })).toBe("quote");
    expect(act({ key: "n" })).toBe("note");
  });

  it("lets j and k repeat and ignores a held star, quote, or note", () => {
    expect(act({ key: "j", repeat: true })).toBe("down");
    expect(act({ key: "ArrowUp", repeat: true })).toBe("up");
    expect(act({ key: "s", repeat: true })).toBeNull();
    expect(act({ key: "q", repeat: true })).toBeNull();
    expect(act({ key: "n", repeat: true })).toBeNull();
  });

  it("leaves modified keys to the browser", () => {
    expect(act({ key: "j", ctrlKey: true })).toBeNull();
    expect(act({ key: "k", metaKey: true })).toBeNull();
    expect(act({ key: "s", altKey: true })).toBeNull();
    expect(act({ key: "f", ctrlKey: true })).toBeNull();
  });

  it("saves the note on Ctrl+Enter or Cmd+Enter only while that field is focused", () => {
    expect(act({ key: "Enter", ctrlKey: true, noteFocused: true })).toBe("save-note");
    expect(act({ key: "Enter", metaKey: true, noteFocused: true })).toBe("save-note");
    expect(act({ key: "Enter", ctrlKey: true })).toBeNull();
    expect(act({ key: "Enter", ctrlKey: true, altKey: true, noteFocused: true })).toBeNull();
    expect(act({ key: "Enter", ctrlKey: true, noteFocused: true, repeat: true })).toBeNull();
  });

  it("types letters in a text field and still cancels an open note", () => {
    expect(act({ key: "j", typing: true })).toBeNull();
    expect(act({ key: "n", typing: true })).toBeNull();
    expect(act({ key: "Escape", typing: true })).toBeNull();
    expect(act({ key: "Escape", typing: true, noteFocused: true, noteOpen: true })).toBe("cancel-note");
    expect(act({ key: "Escape", noteOpen: true })).toBe("cancel-note");
  });

  it("returns to the Sync line when browsing", () => {
    expect(act({ key: "Escape" })).toBe("current-line");
  });

  it("stays quiet while a dialog or the send menu is open", () => {
    expect(act({ key: "j", dialogOpen: true })).toBeNull();
    expect(act({ key: "Escape", dialogOpen: true })).toBeNull();
    expect(act({ key: "Enter", ctrlKey: true, noteFocused: true, dialogOpen: true })).toBeNull();
    expect(act({ key: "s", sendMenuOpen: true })).toBeNull();
    expect(act({ key: "Escape", sendMenuOpen: true })).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("treats text fields as typing and leaves buttons and checkboxes free", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "search" } as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "text" } as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" } as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" } as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: "INPUT", type: "radio" } as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" } as EventTarget)).toBe(false);
    expect(isTypingTarget({ tagName: "DIV" } as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("isCurateNoteField", () => {
  it("matches only the note textarea", () => {
    expect(
      isCurateNoteField({ tagName: "TEXTAREA", dataset: { curateNote: "true" } } as EventTarget),
    ).toBe(true);
    expect(isCurateNoteField({ tagName: "TEXTAREA", dataset: {} } as EventTarget)).toBe(false);
    expect(
      isCurateNoteField({ tagName: "INPUT", type: "text", dataset: { curateNote: "true" } } as EventTarget),
    ).toBe(false);
  });
});

describe("curate browse line", () => {
  const filtered = [5, 10, 15, 20];

  it("acts on the Sync line until a browse step, then on that step", () => {
    expect(curateActionLine(filtered, null, 10)).toBe(10);
    expect(curateActionLine(filtered, 15, 10)).toBe(15);
    expect(curateActionLine(filtered, null, null)).toBe(5);
    expect(curateActionLine([], null, 10)).toBeNull();
  });

  it("ignores a pin or browse row the filter has hidden", () => {
    expect(curateActionLine(filtered, 3, 10)).toBe(10);
    expect(curateActionLine(filtered, 3, 4)).toBe(5);
  });

  it("steps off the current row and stops at the ends", () => {
    expect(stepCurateLine(filtered, null, 10, 1)).toBe(15);
    expect(stepCurateLine(filtered, null, 10, -1)).toBe(5);
    expect(stepCurateLine(filtered, null, null, 1)).toBe(10);
    expect(stepCurateLine(filtered, null, null, -1)).toBeNull();
    expect(stepCurateLine(filtered, 20, 10, 1)).toBeNull();
    expect(stepCurateLine(filtered, 15, 10, -1)).toBe(10);
    expect(stepCurateLine([], null, null, 1)).toBeNull();
  });
});
