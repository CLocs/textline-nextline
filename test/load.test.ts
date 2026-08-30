import { describe, expect, it } from "vitest";
import { getLine, getNextLine, loadCatalog, loadTitle } from "../src/lib/content/load.js";

describe("content store", () => {
  it("loads the catalog", () => {
    const catalog = loadCatalog();
    expect(catalog.version).toBe(1);
    expect(catalog.titles.length).toBeGreaterThanOrEqual(1);
  });

  it("loads a title and queries lines by index", () => {
    const catalog = loadCatalog();
    const entry = catalog.titles.find((t) => t.id === "sample-episode");
    expect(entry).toBeDefined();

    const title = loadTitle("sample-episode");
    expect(title.lines.length).toBe(4);

    const first = getLine(title, 0);
    expect(first?.text).toBe("D'oh!");

    const next = getNextLine(title, 0);
    expect(next?.text).toBe("Why you little—");
    expect(getNextLine(title, title.lines[title.lines.length - 1]!.index)).toBeUndefined();
  });
});
