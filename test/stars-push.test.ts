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
} from "../src/lib/content/starsPush.js";
import type { StarSeed } from "../src/lib/content/starSeed.js";

describe("insertStarsSql", () => {
  it("builds a conflict-safe insert", () => {
    const sql = insertStarsSql(
      [
        { titleId: "friday-1995", lineIndex: 133 },
        { titleId: "matrix-1999", lineIndex: 0 },
      ],
      "11111111-1111-4111-8111-111111111111",
      "2026-01-01T00:00:00.000Z",
    );
    expect(sql).toContain("ON CONFLICT(title_id, line_index, player_id) DO NOTHING");
    expect(sql).toContain("'friday-1995', 133");
    expect(sql).toContain("'matrix-1999', 0");
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
    ]);
  });
});
