import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractHighlights,
  matchDocsToQueue,
  parseReadwiseMarkdown,
  scanReadwiseVault,
} from "../src/lib/content/readwise.js";
import { matchHighlightsToTitles } from "../src/lib/content/starSeed.js";
import { parseTitleYear, titlesLikelyMatch } from "../src/lib/content/titleMatch.js";
import type { QueueFilm } from "../src/types/contentQueue.js";
import type { Title } from "../src/types/content.js";

const vaultDir = join(import.meta.dirname, "fixtures", "readwise");

describe("parseTitleYear", () => {
  it("reads a parenthetical year and strips transcript suffixes", () => {
    expect(parseTitleYear("The Great Escape (1963) - Full Transcript")).toEqual({
      title: "The Great Escape",
      year: 1963,
    });
  });

  it("reads a year glued to a release-group filename", () => {
    expect(parseTitleYear("Friday1995DirectorsCut720pBluRayx264")).toEqual({
      title: "Friday",
      year: 1995,
    });
  });
});

describe("parseReadwiseMarkdown", () => {
  it("extracts highlights and notes from a Readwise export note", () => {
    const text = readFileSync(
      join(vaultDir, "Articles", "The Great Escape (1963) - Full Transcript.md"),
      "utf8",
    );
    const doc = parseReadwiseMarkdown(text, "escape.md");
    expect(doc?.title).toBe("The Great Escape");
    expect(doc?.year).toBe(1963);
    expect(doc?.highlights).toHaveLength(2);
    expect(doc?.highlights[0]?.text).toContain("Cooler.");
    expect(doc?.highlights[0]?.note).toBe("Pleasure.");
    expect(doc?.highlights[1]?.text).toContain("madness in their method");
  });
});

describe("extractHighlights", () => {
  it("ignores notes without a Highlights section", () => {
    expect(extractHighlights("# Essay\n\nNo quotes here.\n")).toEqual([]);
  });
});

describe("matchDocsToQueue", () => {
  it("attaches Readwise docs to the Letterboxd film when title+year match", () => {
    const docs = scanReadwiseVault(vaultDir);
    const films: QueueFilm[] = [
      {
        title: "The Great Escape",
        year: 1963,
        letterboxdUri: "https://boxd.it/escape",
        liked: true,
        rating: 5,
        priority: 1,
        playCount: 2,
        highlightCount: 0,
        tmdbId: null,
        srt: "missing",
        converted: false,
        imported: false,
      },
    ];
    const matches = matchDocsToQueue(docs, films);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.highlights).toHaveLength(2);
  });
});

describe("titlesLikelyMatch", () => {
  it("rejects the same title in a different year", () => {
    expect(
      titlesLikelyMatch(
        { title: "Dune", year: 2021 },
        { title: "Dune", year: 1984 },
      ),
    ).toBe(false);
  });

  it("treats Ocean's Eleven and Oceans Eleven as the same film", () => {
    expect(
      titlesLikelyMatch(
        { title: "Ocean's Eleven", year: 2001 },
        { title: "Oceans Eleven (2001)", year: 2001 },
      ),
    ).toBe(true);
  });

  it("treats Ocean's 11 Script as Ocean's Eleven", () => {
    expect(
      titlesLikelyMatch(
        { title: "Ocean's 11 Script", year: null },
        { title: "Oceans Eleven (2001)", year: 2001 },
      ),
    ).toBe(true);
  });
});

describe("matchHighlightsToTitles", () => {
  it("stars a catalog line that contains the highlight", () => {
    const title: Title = {
      id: "the-great-escape-1963",
      title: "The Great Escape (1963)",
      sourceFilename: "escape.srt",
      importedAt: "2026-01-01T00:00:00.000Z",
      lineCount: 2,
      lines: [
        { index: 0, text: "Cooler. Name? Ives.", kind: "dialogue", startMs: 0, endMs: 1 },
        { index: 1, text: "There's madness in their method.", kind: "dialogue", startMs: 2, endMs: 3 },
      ],
      meta: { year: 1963 },
    };
    const seeds = matchHighlightsToTitles(
      [
        {
          letterboxdUri: "https://boxd.it/escape",
          title: "The Great Escape",
          year: 1963,
          sourcePath: "escape.md",
          highlights: [{ text: "There's madness in their method.", note: null }],
        },
      ],
      [title],
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0]?.lineIndex).toBe(1);
    expect(seeds[0]?.score).toBe("exact");
    expect(seeds[0]?.prevText).toBe("Cooler. Name? Ives.");
    expect(seeds[0]?.nextText).toBeNull();
  });

  it("matches a censored Readwise span across consecutive subtitle cues", () => {
    const title: Title = {
      id: "the-gentlemen-2019",
      title: "The Gentlemen (2019)",
      sourceFilename: "gentlemen.srt",
      importedAt: "2026-01-01T00:00:00.000Z",
      lineCount: 4,
      lines: [
        { index: 0, text: "Enter our protagonist.", kind: "dialogue", startMs: 0, endMs: 1 },
        { index: 1, text: "He's good-looking, he's gorgeous,", kind: "dialogue", startMs: 2, endMs: 3 },
        { index: 2, text: "he's golden age, he's a proper handsome cunt.", kind: "dialogue", startMs: 4, endMs: 5 },
        { index: 3, text: "I said, play a fucking game with me, Ray.", kind: "dialogue", startMs: 6, endMs: 7 },
      ],
      meta: { year: 2019 },
    };
    const seeds = matchHighlightsToTitles(
      [
        {
          letterboxdUri: "https://boxd.it/gents",
          title: "The Gentlemen",
          year: 2019,
          sourcePath: "gents.md",
          highlights: [
            {
              text: "Enter our protagonist. He's good-looking, he's gorgeous, he's golden age, he's a proper handsome c**t.",
              note: "A proper handsome cunt.",
            },
            {
              text: "I said play a f*cking game with me, Ray.",
              note: null,
            },
          ],
        },
      ],
      [title],
    );
    expect(seeds.map((s) => s.lineIndex)).toEqual([0, 3]);
    expect(seeds[0]?.score).toBe("window");
    expect(seeds[1]?.score).toBe("contains");
  });
});
