import { afterEach, describe, expect, it, vi } from "vitest";
import { countUnfilledInbox, inboxSolvedKey, isInboxItemSolved, markInboxItemSolved } from "../src/lib/inbox/solved.js";

const storage = new Map<string, string>();

describe("inbox solved helpers", () => {
  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
  });

  function stubStorage() {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  }

  it("counts items that are not marked solved", () => {
    stubStorage();
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(countUnfilledInbox(items)).toBe(3);
    expect(isInboxItemSolved("a")).toBe(false);

    markInboxItemSolved("a");
    expect(isInboxItemSolved("a")).toBe(true);
    expect(storage.get(inboxSolvedKey("a"))).toBe("1");
    expect(countUnfilledInbox(items)).toBe(2);

    markInboxItemSolved("b");
    markInboxItemSolved("c");
    expect(countUnfilledInbox(items)).toBe(0);
  });

  it("treats empty inbox as zero unfilled", () => {
    stubStorage();
    expect(countUnfilledInbox([])).toBe(0);
  });
});
