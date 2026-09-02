import { afterEach, describe, expect, it, vi } from "vitest";
import { isStarApiEnabled } from "../src/lib/stars/api.js";
import { toggleStar } from "../src/lib/stars/sync.js";
import { getStarredLineIndices, isStarred, listStars } from "../src/lib/stars/store.js";

const storage = new Map<string, string>();

describe("star sync offline fallback", () => {
  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses local-only stars when VITE_API_URL is unset", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });

    expect(isStarApiEnabled()).toBe(false);

    const starred = await toggleStar("ep-1", 4, "Hello there.");
    expect(starred).toBe(true);
    expect(isStarred("ep-1", 4)).toBe(true);
    expect(getStarredLineIndices("ep-1")).toEqual([4]);

    const unstarred = await toggleStar("ep-1", 4, "Hello there.");
    expect(unstarred).toBe(false);
    expect(listStars()).toEqual([]);
  });
});
