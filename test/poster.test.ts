import { describe, expect, it } from "vitest";
import { posterUrl, stillUrl } from "../src/lib/content/poster.js";

describe("posterUrl", () => {
  it("is the drop-in public path", () => {
    expect(posterUrl("oceans-thirteen-2007")).toBe("/posters/oceans-thirteen-2007.jpg");
  });
});

describe("stillUrl", () => {
  it("keys stills by title and line index", () => {
    expect(stillUrl("oceans-thirteen-2007", 1334)).toBe("/stills/oceans-thirteen-2007/1334.jpg");
  });
});
