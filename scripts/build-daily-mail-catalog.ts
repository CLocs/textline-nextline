import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogLabel } from "../src/lib/content/libraryGroups.js";
import { loadCatalog, loadTitle } from "../src/lib/content/load.js";
import { mailCuesForTitle, packMailCatalog } from "../src/lib/game/dailyMailCues.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stillsPath = join(root, "content", "stills-lines.json");
const outPath = join(root, "public", "daily-mail-catalog.json");

const stills = JSON.parse(readFileSync(stillsPath, "utf8")) as Record<string, unknown>;
const catalog = loadCatalog();
const cues = [];

for (const entry of catalog.titles) {
  const framed = stills[entry.id];
  if (!Array.isArray(framed)) continue;
  const indices = framed.filter((line) => Number.isInteger(line) && line >= 0) as number[];
  if (indices.length === 0) continue;
  const title = loadTitle(entry.id);
  cues.push(...mailCuesForTitle(title, indices, catalogLabel(entry)));
}

cues.sort((a, b) => a.titleId.localeCompare(b.titleId) || a.lineIndex - b.lineIndex);

mkdirSync(dirname(outPath), { recursive: true });
const body = JSON.stringify(packMailCatalog(cues));
writeFileSync(outPath, body);
console.log(`daily mail catalog: ${cues.length} cues, ${body.length} bytes → ${outPath}`);
