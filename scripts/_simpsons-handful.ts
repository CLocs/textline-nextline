import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCatalog, loadTitle } from "../src/lib/content/load.js";
import { matchShowVideosToCatalog } from "../src/lib/content/showMedia.js";
import { pickHandfulIndices } from "../src/lib/content/stillsHandful.js";
import { loadStillsSyncFile, SIMPSONS_THEME_OFFSET_MS } from "../src/lib/content/extractStills.js";
import {
  extractTitleStills,
  mergeSyncEntry,
  probeDurationSec,
  probeFps,
  remuxIfNeeded,
  writeStillsSyncFile,
} from "../src/lib/content/stillsStudio.js";

const root = join(import.meta.dirname, "..");
const syncPath = join(root, "content", "stills-sync.json");
const run = process.argv.includes("--run");

const catalog = loadCatalog();
const { matched } = matchShowVideosToCatalog(
  "G:/videos/shows/Simpsons",
  catalog.titles,
  "The Simpsons",
);
const sync = loadStillsSyncFile(syncPath);
const seed = JSON.parse(readFileSync(join(root, "content", "stars-seed.json"), "utf8")) as {
  stars: { titleId: string; lineIndex: number }[];
};
const starsByTitle = new Map<string, number[]>();
for (const star of seed.stars) {
  const list = starsByTitle.get(star.titleId) ?? [];
  list.push(star.lineIndex);
  starsByTitle.set(star.titleId, list);
}

const skipDone = new Set([
  "the-simpsons---4x01---kamp-krustyen",
  "the-simpsons---4x02---a-streetcar-named-margeen",
]);

const todo = matched.filter((row) => {
  if (skipDone.has(row.titleId)) return false;
  const entry = sync[row.titleId];
  if (entry?.approvedAt || entry?.batchedAt || entry?.pushedAt) return false;
  if ((entry?.handful?.length ?? 0) >= 6) return false;
  return true;
});

console.log(`matched ${matched.length}  todo ${todo.length}`);
for (const row of todo) {
  console.log(`S${String(row.season).padStart(2, "0")}E${String(row.episode).padStart(2, "0")}  ${row.titleId}`);
}
if (!run) process.exit(0);

let ok = 0;
let failed = 0;
for (const [n, row] of todo.entries()) {
  const title = loadTitle(row.titleId);
  const input = remuxIfNeeded(root, row.titleId, row.filePath);
  const durationSec = probeDurationSec(input);
  const fps = probeFps(input);
  const indices = pickHandfulIndices(title, starsByTitle.get(row.titleId) ?? []);
  console.log(`[${n + 1}/${todo.length}] ${row.titleId}  ${indices.join(",")}  ${durationSec ?? "?"}s`);
  const results = await extractTitleStills({
    packageRoot: root,
    title,
    input,
    indices,
    offsetMs: SIMPSONS_THEME_OFFSET_MS,
    timeScale: 1,
    seek: "start",
    accurateSeek: true,
  });
  const bad = results.filter((item) => !item.ok);
  if (bad.length) {
    failed += 1;
    console.log(`  failed ${bad.map((item) => item.lineIndex).join(",")}`);
  } else {
    ok += 1;
  }
  const current = loadStillsSyncFile(syncPath);
  current[row.titleId] = mergeSyncEntry(current[row.titleId], {
    offsetMs: SIMPSONS_THEME_OFFSET_MS,
    timeScale: 1,
    seek: "start",
    fps: fps ?? undefined,
    durationSec: durationSec ?? undefined,
    source: input,
    handful: indices,
    methodId: "theme-57",
    triedMethods: ["theme-57"],
    note: "Theme skip −57s. Handful for review; not batched.",
  });
  writeStillsSyncFile(syncPath, current);
}
console.log(`done ok=${ok} failed=${failed}`);
