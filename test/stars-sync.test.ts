import { afterEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

describe("star sync offline fallback", () => {
  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
    vi.stubEnv("VITE_API_URL", "");
    vi.resetModules();

    const { isStarApiEnabled } = await import("../src/lib/stars/api.js");
    const { toggleStar } = await import("../src/lib/stars/sync.js");
    const { getStarredLineIndices, isStarred, listStars } = await import(
      "../src/lib/stars/store.js"
    );

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
