import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PROTECTED_TITLE_IDS,
  chunk,
  excludeTitleIds,
  filterStarsByTitle,
  insertStarsSql,
  loadProtectedTitleIds,
  sqlString,
  titleIdsToSkip,
} from "../src/lib/content/starsPush.js";
import type { StarSeed } from "../src/lib/content/starSeed.js";

describe("insertStarsSql", () => {
  it("builds a conflict-safe insert", () => {
    const sql = insertStarsSql(
      [
        { titleId: "friday-1995", lineIndex: 133, note: null },
        { titleId: "matrix-1999", lineIndex: 0, note: "wikiquote" },
      ],
      "11111111-1111-4111-8111-111111111111",
      "2026-01-01T00:00:00.000Z",
    );
    expect(sql).toContain("ON CONFLICT(title_id, line_index, player_id) DO NOTHING");
    expect(sql).toContain("'friday-1995', 133");
    expect(sql).toContain("'mine'");
    expect(sql).toContain("'matrix-1999', 0");
    expect(sql).toContain("'wikiquote'");
  });
});

describe("sqlString", () => {
  it("doubles single quotes", () => {
    expect(sqlString("o'reilly")).toBe("'o''reilly'");
  });
});

describe("chunk", () => {
  it("splits into sized groups", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

const seed: Pick<StarSeed, "titleId" | "title" | "lineIndex">[] = [
  { titleId: "payback-1999", title: "Payback (1999)", lineIndex: 1 },
  { titleId: "inglourious-basterds-2009", title: "Inglourious Basterds (2009)", lineIndex: 740 },
];

describe("filterStarsByTitle", () => {
  it("keeps Payback by id or name", () => {
    expect(filterStarsByTitle(seed as StarSeed[], "payback-1999")).toHaveLength(1);
    expect(filterStarsByTitle(seed as StarSeed[], "Payback")[0]?.titleId).toBe("payback-1999");
  });
});

describe("titleIdsToSkip", () => {
  it("skips protected titles even when merging", () => {
    const skip = titleIdsToSkip({
      protectedIds: ["payback-1999"],
      existingIds: ["the-big-lebowski-1998"],
      excludeIds: [],
      force: false,
      merge: true,
    });
    expect(skip.has("payback-1999")).toBe(true);
    expect(skip.has("the-big-lebowski-1998")).toBe(false);
  });

  it("skips a title that already has stars unless merge or force", () => {
    const base = {
      protectedIds: [] as string[],
      existingIds: ["the-big-lebowski-1998"],
      excludeIds: [] as string[],
      force: false,
      merge: false,
    };
    expect(titleIdsToSkip(base).has("the-big-lebowski-1998")).toBe(true);
    expect(titleIdsToSkip({ ...base, merge: true }).has("the-big-lebowski-1998")).toBe(false);
  });
});

describe("excludeTitleIds", () => {
  it("drops titles the player already starred", () => {
    const kept = excludeTitleIds(seed as StarSeed[], ["inglourious-basterds-2009"]);
    expect(kept.map((star) => star.titleId)).toEqual(["payback-1999"]);
  });
});

describe("loadProtectedTitleIds", () => {
  it("reads title ids from stars-protected.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "stars-protected-"));
    const path = join(dir, "stars-protected.json");
    writeFileSync(path, JSON.stringify({ titleIds: ["payback-1999", "friday-1995"] }), "utf8");
    expect(loadProtectedTitleIds(path)).toEqual(["payback-1999", "friday-1995"]);
  });

  it("keeps the repo file in sync with the fallback list", () => {
    expect(loadProtectedTitleIds(join(process.cwd(), "content", "stars-protected.json"))).toEqual(
      DEFAULT_PROTECTED_TITLE_IDS,
    );
  });

  it("falls back to curated title ids when the file is missing", () => {
    expect(loadProtectedTitleIds(join(tmpdir(), "no-such-stars-protected.json"))).toEqual(
      DEFAULT_PROTECTED_TITLE_IDS,
    );
    expect(DEFAULT_PROTECTED_TITLE_IDS).toEqual([
      "payback-1999",
      "inglourious-basterds-2009",
      "oceans-thirteen-2007",
      "the-empire-strikes-back-1980",
      "the-wolf-of-wall-street-2013",
      "batman-begins-2005",
      "django-unchained-2012",
      "the-gentlemen-2019",
      "matrix-1999",
      "the-simpsons---4x01---kamp-krustyen",
      "the-simpsons---4x02---a-streetcar-named-margeen",
      "star-wars-1977",
      "the-ministry-of-ungentlemanly-warfare-2024",
      "friday-1995",
      "the-simpsons---4x06---itchy-scratchy-the-movieen",
      "oceans-eleven-2001",
      "rocknrolla-2008",
      "the-lord-of-the-rings---the-fellowship-of-the-ring-2001",
      "the-big-lebowski-1998",
      "baby-driver-2017",
      "goodfellas-1990",
      "its-always-sunny-in-philadelphia---2x07---the-gang-exploits-a-miracle",
      "its-always-sunny-in-philadelphia---3x01---the-gang-finds-a-dumpster-baby",
      "its-always-sunny-in-philadelphia---3x04---the-gang-gets-held-hostage",
      "its-always-sunny-in-philadelphia---3x08---frank-sets-sweet-dee-on-fire",
      "its-always-sunny-in-philadelphia---4x07---who-pooped-the-bed",
      "its-always-sunny-in-philadelphia---4x08---paddys-pub-the-worst-bar-in-philadelphia",
      "its-always-sunny-in-philadelphia---4x10---sweet-dee-has-a-heart-attack",
      "its-always-sunny-in-philadelphia---5x04---the-gang-gives-frank-an-intervention",
      "its-always-sunny-in-philadelphia---5x07---the-gang-wrestles-for-the-troops",
      "its-always-sunny-in-philadelphia---5x09---mac-and-dennis-break-up",
      "its-always-sunny-in-philadelphia---6x06---macs-mom-burns-her-house-down",
      "its-always-sunny-in-philadelphia---6x10---charlie-kelly-king-of-the-rats",
      "lock-stock-and-two-smoking-barrels-1998",
      "star-wars-episode-vi-return-of-the-jedi-1983",
      "the-simpsons---4x03---homer-the-hereticen",
      "the-simpsons---4x05---treehouse-of-horror-iiien",
      "the-simpsons---5x03---homer-goes-to-college",
      "the-simpsons---5x08---boy-scoutz-n-the-hood",
      "the-simpsons---5x10---pringfield",
      "the-simpsons---5x16---homer-loves-flanders",
      "the-simpsons---6x02---lisas-rival",
      "the-simpsons---6x14---barts-comet",
      "the-simpsons---6x15---homie-the-clown",
      "the-simpsons---6x21---the-pta-disbands",
      "the-simpsons---6x25---who-shot-mr-burns",
      "the-simpsons---7x06---treehouse-of-horror-vi",
      "the-simpsons---7x08---mother-simpson",
      "the-simpsons---7x10---the-simpsons-138th-episode-spectacular",
      "the-simpsons---7x15---bart-the-fink",
      "the-simpsons---7x18---the-day-the-violence-died",
      "the-simpsons---7x19---a-fish-called-selma",
      "the-simpsons---7x21---22-short-films-about-springfield",
      "the-simpsons---7x22---raging-abe-simpson-and-his-grumbling-grandson-in-the-curse-of-the-flying-hellfish",
      "you-got-served-2004",
    ]);
  });
});
