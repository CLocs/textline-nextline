import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/types/content.js";
import { buildCatalogOpsRows, coveragePct, formatCoveragePct, missingStills, sortCatalogOpsRows } from "../src/lib/content/catalogOps.js";
import { canViewCatalogOps, isOwnerEmail } from "../src/lib/content/owner.js";
import {
  formatUploadsMarkdown,
  matchUploadsToCatalog,
  parseMediaFilename,
  preferMovieSource,
} from "../src/lib/content/mediaUploads.js";

const movies: CatalogEntry[] = [
  { id: "pulp-fiction-1994", title: "Pulp Fiction (1994)", lineCount: 2000, sourceFilename: "x.srt", importedAt: "", meta: { year: 1994 } },
  { id: "the-wolf-of-wall-street-2013", title: "The Wolf of Wall Street (2013)", lineCount: 3268, sourceFilename: "x.srt", importedAt: "", meta: { year: 2013 } },
  { id: "the-empire-strikes-back-1980", title: "The Empire Strikes Back (1980)", lineCount: 1323, sourceFilename: "x.srt", importedAt: "", meta: { year: 1980 } },
  { id: "star-wars-1977", title: "Star Wars (1977)", lineCount: 1155, sourceFilename: "x.srt", importedAt: "", meta: { year: 1977 } },
  { id: "star-wars-episode-vi-return-of-the-jedi-1983", title: "Star Wars Episode VI Return of the Jedi (1983)", lineCount: 1598, sourceFilename: "x.srt", importedAt: "", meta: { year: 1983 } },
  { id: "oceans-thirteen-2007", title: "Ocean's Thirteen (2007)", lineCount: 1341, sourceFilename: "x.srt", importedAt: "", meta: { year: 2007 } },
  { id: "django-unchained-2012", title: "Django Unchained (2012)", lineCount: 1859, sourceFilename: "x.srt", importedAt: "", meta: { year: 2012 } },
  { id: "rocknrolla-2008", title: "RocknRolla (2008)", lineCount: 100, sourceFilename: "x.srt", importedAt: "", meta: { year: 2008 } },
  { id: "goldeneye-1995", title: "GoldenEye (1995)", lineCount: 878, sourceFilename: "x.srt", importedAt: "", meta: { year: 1995 } },
  { id: "snatch-2000", title: "Snatch (2000)", lineCount: 1272, sourceFilename: "x.srt", importedAt: "", meta: { year: 2000 } },
  { id: "the-man-from-uncle-2015", title: "The Man from UNCLE (2015)", lineCount: 1100, sourceFilename: "x.srt", importedAt: "", meta: { year: 2015 } },
  { id: "back-to-the-future-1985", title: "Back to the Future (1985)", lineCount: 1400, sourceFilename: "x.srt", importedAt: "", meta: { year: 1985 } },
  { id: "back-to-the-future-part-ii-1989", title: "Back to the Future Part II (1989)", lineCount: 1400, sourceFilename: "x.srt", importedAt: "", meta: { year: 1989 } },
  { id: "back-to-the-future-part-iii-1990", title: "Back to the Future Part III (1990)", lineCount: 1400, sourceFilename: "x.srt", importedAt: "", meta: { year: 1990 } },
];

describe("parseMediaFilename", () => {
  it("reads year, part, and scene tags", () => {
    expect(parseMediaFilename("Pulp Fiction (1994) Part1.avi")).toEqual({
      name: "Pulp Fiction (1994) Part1.avi",
      title: "Pulp Fiction",
      year: 1994,
      part: 1,
    });
    expect(parseMediaFilename("The Wolf of Wall Street [2013] 1080p BluRay AAC x264-tomcat12[ETRG].mp4")).toMatchObject({
      title: "The Wolf of Wall Street",
      year: 2013,
      part: null,
    });
    expect(parseMediaFilename("Looper (2012) p2.avi")).toMatchObject({
      title: "Looper",
      year: 2012,
      part: 2,
    });
    expect(parseMediaFilename("The Man from U.N.C.L.E. (2015).mkv")).toMatchObject({
      title: "The Man from UNCLE",
      year: 2015,
      part: null,
    });
  });
});

describe("matchUploadsToCatalog", () => {
  it("matches catalog titles and flags split encodes", () => {
    const { matched, unmatched } = matchUploadsToCatalog(
      [
        "Pulp Fiction (1994) Part1.avi",
        "Pulp Fiction (1994) Part2.avi",
        "Ocean's 13 (2007).avi",
        "Star Wars Episode V - The Empire Strikes Back.avi",
        "Star Wars Episode IV - A New Hope.avi",
        "Star Wars Episode I - The Phantom Menace.avi",
        "Star Wars Episode VI - Return Of The Jedi.avi",
        "The Wolf of Wall Street [2013] 1080p BluRay AAC x264-tomcat12[ETRG].mp4",
        "Django Unchained (2012).mkv",
        "Golden Eye (1995).mp4",
        "Casino (1995).avi",
      ],
      movies,
    );

    const byId = Object.fromEntries(matched.map((row) => [row.titleId, row]));
    expect(byId["pulp-fiction-1994"]).toMatchObject({ status: "split" });
    expect(byId["pulp-fiction-1994"]?.files).toHaveLength(2);
    expect(byId["oceans-thirteen-2007"]?.status).toBe("ok");
    expect(byId["the-empire-strikes-back-1980"]?.status).toBe("ok");
    expect(byId["star-wars-1977"]?.status).toBe("ok");
    expect(byId["star-wars-1977"]?.files).toEqual(["Star Wars Episode IV - A New Hope.avi"]);
    expect(byId["star-wars-episode-vi-return-of-the-jedi-1983"]?.status).toBe("ok");
    expect(byId["the-wolf-of-wall-street-2013"]?.status).toBe("ok");
    expect(byId["django-unchained-2012"]?.status).toBe("ok");
    expect(byId["goldeneye-1995"]?.status).toBe("ok");
    expect(byId["goldeneye-1995"]?.files).toEqual(["Golden Eye (1995).mp4"]);
    expect(byId["rocknrolla-2008"]?.status).toBe("missing");
    expect(byId["snatch-2000"]?.status).toBe("missing");
    expect(byId["the-man-from-uncle-2015"]?.status).toBe("missing");
    expect(unmatched.map((row) => row.name)).toEqual([
      "Casino (1995).avi",
      "Star Wars Episode I - The Phantom Menace.avi",
    ]);
  });

  it("associates Snatch and dotted U.N.C.L.E. filenames", () => {
    const { matched, unmatched } = matchUploadsToCatalog(
      ["Snatch (2000).mp4", "The Man from U.N.C.L.E. (2015).mkv"],
      movies,
    );
    const byId = Object.fromEntries(matched.map((row) => [row.titleId, row]));
    expect(byId["snatch-2000"]).toMatchObject({
      status: "ok",
      files: ["Snatch (2000).mp4"],
    });
    expect(byId["the-man-from-uncle-2015"]).toMatchObject({
      status: "ok",
      files: ["The Man from U.N.C.L.E. (2015).mkv"],
    });
    expect(unmatched).toEqual([]);
  });

  it("keeps one whole copy and associates Back to the Future sequels", () => {
    const { matched, unmatched } = matchUploadsToCatalog(
      [
        "Back to the Future (1985) 1080p.mp4",
        "Back to the Future I  (1985).mp4",
        "Back To The Future II (1989).avi",
        "Back to the Future III (1990).avi",
      ],
      movies,
    );
    const byId = Object.fromEntries(matched.map((row) => [row.titleId, row]));
    expect(byId["back-to-the-future-1985"]).toMatchObject({
      status: "ok",
      files: ["Back to the Future (1985) 1080p.mp4"],
    });
    expect(byId["back-to-the-future-part-ii-1989"]).toMatchObject({
      status: "ok",
      files: ["Back To The Future II (1989).avi"],
    });
    expect(byId["back-to-the-future-part-iii-1990"]).toMatchObject({
      status: "ok",
      files: ["Back to the Future III (1990).avi"],
    });
    expect(unmatched).toEqual([]);
  });

  it("prefers an H: copy over a higher-scored G: file", () => {
    const picked = preferMovieSource(
      [
        { name: "Back to the Future (1985) 1080p.mp4", path: "G:/videos/movies/Back to the Future (1985) 1080p.mp4" },
        { name: "Back to the Future (1985).mp4", path: "H:/videos/movies/Back to the Future (1985).mp4" },
      ],
      ["H:/videos/movies", "G:/videos/movies"],
    );
    expect(picked.path).toBe("H:/videos/movies/Back to the Future (1985).mp4");
  });
});

describe("formatUploadsMarkdown", () => {
  it("renders catalog and unmatched sections", () => {
    const md = formatUploadsMarkdown({
      updatedAt: "2026-09-16T00:00:00.000Z",
      directory: "G:\\videos\\movies",
      matched: [
        {
          titleId: "pulp-fiction-1994",
          title: "Pulp Fiction (1994)",
          status: "split",
          files: ["Pulp Fiction (1994) Part1.avi", "Pulp Fiction (1994) Part2.avi"],
        },
      ],
      unmatched: [{ name: "Casino (1995).avi" }],
    });
    expect(md).toContain("[x] split");
    expect(md).toContain("## Unmatched files");
    expect(md).toContain("Casino (1995).avi");
  });
});

describe("buildCatalogOpsRows", () => {
  it("rolls Simpsons episodes into one show row", () => {
    const rows = buildCatalogOpsRows({
      entries: [
        movies[0]!,
        {
          id: "the-simpsons---5x01---homers-barbershop-quartet",
          title: "The Simpsons - 5x01 - Homer's Barbershop Quartet",
          lineCount: 200,
          sourceFilename: "x.srt",
          importedAt: "",
          meta: { show: "The Simpsons", season: 5, episode: 1 },
        },
        {
          id: "the-simpsons---5x02---cape-feare",
          title: "The Simpsons - 5x02 - Cape Feare",
          lineCount: 180,
          sourceFilename: "x.srt",
          importedAt: "",
          meta: { show: "The Simpsons", season: 5, episode: 2 },
        },
      ],
      protectedIds: ["pulp-fiction-1994"],
      stillCounts: { "pulp-fiction-1994": 10, "the-simpsons---5x01---homers-barbershop-quartet": 2 },
      starCounts: { "pulp-fiction-1994": 40, "the-simpsons---5x02---cape-feare": 3 },
      playCounts: { "pulp-fiction-1994": 5 },
      uploads: {
        updatedAt: "",
        directory: "",
        matched: [
          {
            titleId: "pulp-fiction-1994",
            title: "Pulp Fiction (1994)",
            status: "split",
            files: ["a", "b"],
          },
        ],
        unmatched: [],
      },
    });

    const pulp = rows.find((row) => row.key === "pulp-fiction-1994");
    const simpsons = rows.find((row) => row.key === "show:The Simpsons");
    expect(pulp).toMatchObject({
      kind: "movie",
      curated: true,
      stillCount: 10,
      media: "split",
    });
    expect(simpsons).toMatchObject({
      kind: "show",
      episodeCount: 2,
      lineCount: 380,
      starCount: 3,
      stillCount: 2,
      media: "n/a",
    });
  });
});

describe("coveragePct", () => {
  it("rounds to one decimal", () => {
    expect(coveragePct(11, 3268)).toBe(0.3);
    expect(formatCoveragePct(125, 1341)).toBe("9.3%");
    expect(coveragePct(0, 0)).toBe(0);
  });
});

describe("owner email", () => {
  it("gates catalog ops to the curator", () => {
    expect(isOwnerEmail("dascolin@gmail.com")).toBe(true);
    expect(isOwnerEmail("DasColin@gmail.com")).toBe(true);
    expect(isOwnerEmail("friend@gmail.com")).toBe(false);
    expect(canViewCatalogOps("local@dev", true)).toBe(true);
    expect(canViewCatalogOps("local@dev", false)).toBe(false);
  });
});

describe("missingStills", () => {
  it("is stars minus extracted frames, never below zero", () => {
    expect(missingStills(47, 46)).toBe(1);
    expect(missingStills(10, 10)).toBe(0);
    expect(missingStills(0, 6)).toBe(0);
    expect(missingStills(5, 8)).toBe(0);
  });
});

describe("sortCatalogOpsRows", () => {
  it("sorts numeric columns and uses title as a tiebreaker", () => {
    const built = buildCatalogOpsRows({
      entries: movies.slice(0, 3),
      protectedIds: ["pulp-fiction-1994"],
      stillCounts: { "pulp-fiction-1994": 10, "the-wolf-of-wall-street-2013": 67 },
      starCounts: { "pulp-fiction-1994": 5, "the-wolf-of-wall-street-2013": 67 },
      playCounts: {},
    });
    const byStars = sortCatalogOpsRows(built, "stars", "desc");
    expect(byStars[0]?.key).toBe("the-wolf-of-wall-street-2013");
    const byTitle = sortCatalogOpsRows(built, "label", "asc");
    expect(byTitle.map((row) => row.label)[0]).toMatch(/Empire|Pulp|Wolf/);
    expect(sortCatalogOpsRows(built, "curated", "desc")[0]?.curated).toBe(true);
  });
});
