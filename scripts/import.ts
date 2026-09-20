import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog } from "../src/types/content.js";
import type { CatalogEntry } from "../src/types/content.js";
import {
  parseTranscriptMakerWork,
  titleToCatalogEntry,
  workToTitle,
  ImportError,
} from "../src/lib/import/transcriptMaker.js";
import {
  formatQueueMarkdown,
  markFilmsImported,
  parseQueueFile,
} from "../src/lib/content/letterboxdQueue.js";
import { parseTitleYear } from "../src/lib/content/titleMatch.js";
import { catalogPath, contentDir, titlePath, titlesDir } from "../src/lib/content/load.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const importsDir = join(packageRoot, "imports");

function writeTitle(title: ReturnType<typeof workToTitle>): void {
  mkdirSync(titlesDir(), { recursive: true });
  writeFileSync(titlePath(title.id), `${JSON.stringify(title, null, 2)}\n`, "utf8");
}

function rebuildCatalog(entries: CatalogEntry[]): void {
  const catalog: Catalog = {
    version: 1,
    updatedAt: new Date().toISOString(),
    titles: entries.sort((a, b) => a.title.localeCompare(b.title)),
  };
  mkdirSync(contentDir(), { recursive: true });
  writeFileSync(catalogPath(), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

function loadExistingCatalogEntries(): CatalogEntry[] {
  if (!existsSync(catalogPath())) return [];
  const catalog = JSON.parse(readFileSync(catalogPath(), "utf8")) as Catalog;
  return catalog.titles;
}

function markQueue(imported: ReturnType<typeof workToTitle>[]): void {
  const queuePath = join(contentDir(), "queue.json");
  if (!existsSync(queuePath)) return;
  const queue = parseQueueFile(JSON.parse(readFileSync(queuePath, "utf8")));
  const n = markFilmsImported(
    queue.films,
    imported.map((title) => ({
      title: title.title,
      year: title.meta?.year ?? parseTitleYear(title.title).year,
      lineCount: title.lineCount,
    })),
  );
  if (n === 0) return;
  queue.updatedAt = new Date().toISOString();
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  writeFileSync(join(contentDir(), "queue.md"), formatQueueMarkdown(queue.films), "utf8");
  console.log(`Marked ${n} queue film(s) as imported.`);
}

function importFile(filePath: string): ReturnType<typeof workToTitle> {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const work = parseTranscriptMakerWork(raw);
  const title = workToTitle(work);
  writeTitle(title);
  console.log(`Imported "${title.title}" → content/titles/${title.id}.json (${title.lineCount} lines)`);
  return title;
}

function usage(): never {
  console.log(`Usage:
  npm run import -- <file.json> [more.json ...]   Import one or more transcript_maker exports
  npm run import:all               Import every .json in imports/

Drop raw exports from transcript_maker into imports/ first.`);
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--all")) {
    mkdirSync(importsDir, { recursive: true });
    const files = readdirSync(importsDir).filter((name) => name.endsWith(".json"));
    if (files.length === 0) {
      console.error("No .json files in imports/");
      process.exit(1);
    }

    const byId = new Map(loadExistingCatalogEntries().map((entry) => [entry.id, entry]));
    const imported = [];
    for (const file of files) {
      try {
        const title = importFile(join(importsDir, file));
        imported.push(title);
        byId.set(title.id, titleToCatalogEntry(title));
      } catch (error) {
        if (error instanceof ImportError) {
          console.error(`${file}: ${error.message}`);
          process.exit(1);
        }
        throw error;
      }
    }
    rebuildCatalog([...byId.values()]);
    console.log(`Catalog updated (${byId.size} title(s)).`);
    markQueue(imported);
    return;
  }

  const fileArgs = args.filter((arg) => !arg.startsWith("-"));
  if (fileArgs.length === 0) usage();

  const byId = new Map(loadExistingCatalogEntries().map((e) => [e.id, e]));
  const imported = [];
  for (const fileArg of fileArgs) {
    const title = importFile(resolve(fileArg));
    imported.push(title);
    byId.set(title.id, titleToCatalogEntry(title));
  }
  rebuildCatalog([...byId.values()]);
  console.log(`Catalog updated (${imported.length} imported, ${byId.size} title(s) total).`);
  markQueue(imported);
}

main();
