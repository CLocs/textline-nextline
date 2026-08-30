import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, Title } from "../../types/content.js";

export type { LineSource } from "./lines.js";
export { getLine, getNextLine } from "./lines.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function contentDir(): string {
  return join(packageRoot, "content");
}

export function titlesDir(): string {
  return join(contentDir(), "titles");
}

export function catalogPath(): string {
  return join(contentDir(), "catalog.json");
}

export function titlePath(id: string): string {
  return join(titlesDir(), `${id}.json`);
}

export function readJsonFile<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadCatalog(): Catalog {
  return readJsonFile<Catalog>(catalogPath());
}

export function loadTitle(id: string): Title {
  return readJsonFile<Title>(titlePath(id));
}

export function listTitles(): Title[] {
  const catalog = loadCatalog();
  return catalog.titles.map((entry) => loadTitle(entry.id));
}
