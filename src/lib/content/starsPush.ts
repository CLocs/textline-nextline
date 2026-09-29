import { existsSync, readFileSync } from "node:fs";
import type { StarSeed } from "./starSeed.js";

export type StarSeedFile = {
  updatedAt?: string;
  stars: StarSeed[];
};

export type ProtectedStarsFile = {
  updatedAt?: string;
  titleIds: string[];
};

const TITLE_ID_RE = /^[a-z0-9-]+$/i;

/** Fallback if content/stars-protected.json is missing. */
export const DEFAULT_PROTECTED_TITLE_IDS = [
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
];

export function loadProtectedTitleIds(path: string): string[] {
  if (!existsSync(path)) return [...DEFAULT_PROTECTED_TITLE_IDS];
  const raw = JSON.parse(readFileSync(path, "utf8")) as ProtectedStarsFile;
  if (!Array.isArray(raw.titleIds)) {
    throw new Error("stars-protected.json must have a titleIds array.");
  }
  return raw.titleIds.filter((id) => typeof id === "string" && TITLE_ID_RE.test(id.trim()));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadStarSeedFile(path: string): StarSeed[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as StarSeedFile;
  if (!Array.isArray(raw.stars)) {
    throw new Error("stars-seed.json must have a stars array.");
  }
  return raw.stars.filter((star) => {
    if (!TITLE_ID_RE.test(star.titleId)) return false;
    if (!Number.isInteger(star.lineIndex) || star.lineIndex < 0) return false;
    return true;
  });
}

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function starOrigin(note: string | null | undefined): "mine" | "wikiquote" {
  return note === "wikiquote" ? "wikiquote" : "mine";
}

export function insertStarsSql(
  stars: Pick<StarSeed, "titleId" | "lineIndex" | "note">[],
  playerId: string,
  starredAt: string,
): string {
  if (!UUID_RE.test(playerId)) {
    throw new Error("playerId must be a UUID (logged-in user id).");
  }
  const values = stars
    .map(
      (star) =>
        `(${sqlString(star.titleId)}, ${star.lineIndex}, ${sqlString(playerId)}, ${sqlString(starredAt)}, ${sqlString(starOrigin(star.note))})`,
    )
    .join(",\n");
  return `INSERT INTO stars (title_id, line_index, player_id, starred_at, origin)
VALUES
${values}
ON CONFLICT(title_id, line_index, player_id) DO NOTHING;`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function filterStarsByTitle(
  stars: StarSeed[],
  query: string,
): StarSeed[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return stars;
  return stars.filter((star) => {
    if (star.titleId === needle) return true;
    if (star.titleId.includes(needle)) return true;
    return star.title.toLowerCase().includes(needle);
  });
}

export function excludeTitleIds(
  stars: StarSeed[],
  titleIds: Iterable<string>,
): StarSeed[] {
  const skip = new Set(titleIds);
  return stars.filter((star) => !skip.has(star.titleId));
}

/**
 * Titles a push must not write. Protected titles always stay untouched.
 * Without --force or --merge, a title that already has any of your stars is
 * skipped whole. --merge inserts missing lines on titles that already have
 * stars (ON CONFLICT DO NOTHING); it does not delete or update rows.
 */
export function titleIdsToSkip(options: {
  protectedIds: Iterable<string>;
  existingIds: Iterable<string>;
  excludeIds: Iterable<string>;
  force: boolean;
  merge: boolean;
}): Set<string> {
  const skip = new Set<string>(options.protectedIds);
  for (const id of options.excludeIds) skip.add(id);
  if (!options.force && !options.merge) {
    for (const id of options.existingIds) skip.add(id);
  }
  return skip;
}

export function countByTitle(stars: Pick<StarSeed, "titleId" | "title">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const star of stars) {
    const key = star.title || star.titleId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
