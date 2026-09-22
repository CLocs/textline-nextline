import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissInstallHelper,
  isIosSafari,
  isMobileInstallCandidate,
  isStandaloneDisplay,
  wasInstallDismissed,
} from "../src/lib/pwa/install.js";

const storage = new Map<string, string>();

function stubBrowser(options?: {
  navigator?: Partial<Navigator> & { userAgent?: string; platform?: string; maxTouchPoints?: number; standalone?: boolean };
  matchMedia?: (query: string) => { matches: boolean };
}) {
  const nav = {
    userAgent: "",
    platform: "",
    maxTouchPoints: 0,
    ...options?.navigator,
  };
  const matchMedia =
    options?.matchMedia ??
    (() => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

  vi.stubGlobal("window", {
    matchMedia,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  });
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
  });
}

beforeEach(() => {
  storage.clear();
  stubBrowser();
});

afterEach(() => {
  storage.clear();
  vi.unstubAllGlobals();
});

describe("pwa install helpers", () => {
  it("reads and writes dismiss flag", () => {
    expect(wasInstallDismissed()).toBe(false);
    dismissInstallHelper();
    expect(wasInstallDismissed()).toBe(true);
  });

  it("detects standalone display-mode", () => {
    stubBrowser({
      matchMedia: (query: string) => ({
        matches: query.includes("display-mode: standalone"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    expect(isStandaloneDisplay()).toBe(true);
  });

  it("treats iPhone Safari as an install candidate", () => {
    stubBrowser({
      navigator: {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
        standalone: false,
      },
    });
    expect(isIosSafari()).toBe(true);
    expect(isMobileInstallCandidate()).toBe(true);
  });

  it("hides helper for desktop Chrome", () => {
    stubBrowser({
      navigator: {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        platform: "Win32",
        maxTouchPoints: 0,
      },
    });
    expect(isMobileInstallCandidate()).toBe(false);
  });
});
