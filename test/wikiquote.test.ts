import { describe, expect, it } from "vitest";
import { mergeStarSeeds, type StarSeed } from "../src/lib/content/starSeed.js";
import { cleanWikiQuote, extractWikiquoteQuotes, wikiquotePageTitle } from "../src/lib/content/wikiquote.js";

const WIKITEXT = `== Walter Sobchak ==
[[File:John Goodman.jpg|thumb|Smokey, this is not Nam, this is Bowling, there are rules.]]
* That rug really tied the room together, did it not?
* Smokey, my friend. [pulls out a gun] You're entering a world of pain.

== Dialogue ==
: '''The Dude''': Yeah, man, it really tied the room together.
: '''Donny''': What?

== Taglines ==
* Times like these call for a Big Lebowski.

== Quotes about ''The Big Lebowski'' ==
* A critic said something long enough to be a fake quote about the movie.

== Cast ==
* Jeff Bridges as The Dude
`;

describe("wikiquotePageTitle", () => {
  it("drops a trailing year", () => {
    expect(wikiquotePageTitle("The Big Lebowski (1998)")).toBe("The Big Lebowski");
  });
});

describe("extractWikiquoteQuotes", () => {
  const quotes = extractWikiquoteQuotes(WIKITEXT);

  it("keeps dialogue and character lines", () => {
    expect(quotes).toContain("Yeah, man, it really tied the room together.");
    expect(quotes).toContain("That rug really tied the room together, did it not?");
    expect(quotes).toContain("Smokey, this is not Nam, this is Bowling, there are rules.");
  });

  it("drops taglines, cast, and quotes about the film", () => {
    expect(quotes.some((quote) => /times like these/i.test(quote))).toBe(false);
    expect(quotes.some((quote) => /jeff bridges/i.test(quote))).toBe(false);
    expect(quotes.some((quote) => /critic said/i.test(quote))).toBe(false);
  });

  it("strips a stage direction and a short reply", () => {
    expect(quotes).toContain("Smokey, my friend. You're entering a world of pain.");
    expect(quotes).not.toContain("What?");
  });
});

describe("cleanWikiQuote", () => {
  it("resolves a piped link inside a caption", () => {
    expect(cleanWikiQuote("say what you want about [[Nazism|National Socialism]]")).toBe(
      "say what you want about National Socialism",
    );
  });
});

describe("mergeStarSeeds", () => {
  const line = (note: string | null, lineIndex = 3): StarSeed => ({
    titleId: "the-big-lebowski-1998",
    title: "The Big Lebowski (1998)",
    lineIndex,
    text: "Yeah, man.",
    prevText: null,
    nextText: null,
    highlight: note === "wikiquote" ? "wiki" : "vault",
    note,
    score: "contains",
  });

  it("keeps a vault line when Wikiquote hits the same index", () => {
    const merged = mergeStarSeeds([line("from the vault")], [line("wikiquote")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.note).toBe("from the vault");
  });

  it("lets a vault line replace an earlier Wikiquote hit", () => {
    const merged = mergeStarSeeds([line("wikiquote")], [line("from the vault")]);
    expect(merged[0]?.highlight).toBe("vault");
  });

  it("adds a Wikiquote line the vault did not have", () => {
    const merged = mergeStarSeeds([line("from the vault", 3)], [line("wikiquote", 9)]);
    expect(merged.map((star) => star.lineIndex).sort()).toEqual([3, 9]);
  });
});
