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

function importFile(filePath: string): ReturnType<typeof titleToCatalogEntry> {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const work = parseTranscriptMakerWork(raw);
  const title = workToTitle(work);
  writeTitle(title);
  console.log(`Imported "${title.title}" → content/titles/${title.id}.json (${title.lineCount} lines)`);
  return titleToCatalogEntry(title);
}

function usage(): never {
  console.log(`Usage:
  npm run import -- <file.json>     Import one transcript_maker export
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
    for (const file of files) {
      try {
        const entry = importFile(join(importsDir, file));
        byId.set(entry.id, entry);
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
    return;
  }

  const fileArg = args.find((arg) => !arg.startsWith("-"));
  if (!fileArg) usage();

  const filePath = resolve(fileArg);
  const entry = importFile(filePath);

  const byId = new Map(loadExistingCatalogEntries().map((e) => [e.id, e]));
  byId.set(entry.id, entry);
  rebuildCatalog([...byId.values()]);
  console.log("Catalog updated.");
}

main();
