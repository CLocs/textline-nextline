import catalogJson from "../../../content/catalog.json";
import type { Catalog, CatalogEntry, Title } from "../../types/content.js";

const catalog = catalogJson as Catalog;

const titleModules = import.meta.glob("../../../content/titles/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Title>;

function titleModulePath(id: string): string {
  return `../../../content/titles/${id}.json`;
}

export function getCatalog(): Catalog {
  return catalog;
}

export function listCatalogEntries(includeSample = false): CatalogEntry[] {
  return catalog.titles
    .filter((entry) => includeSample || entry.id !== "sample-episode")
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getTitle(id: string): Title | undefined {
  return titleModules[titleModulePath(id)];
}
