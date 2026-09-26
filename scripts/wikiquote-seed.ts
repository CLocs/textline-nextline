import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTitle } from "../src/lib/content/load.js";
import { matchDocsToCatalog, scanReadwiseVault } from "../src/lib/content/readwise.js";
import {
  matchHighlightsToTitles,
  matchQuotesToTitle,
  mergeStarSeeds,
  type StarSeed,
} from "../src/lib/content/starSeed.js";
import { loadStarSeedFile, type StarSeedFile } from "../src/lib/content/starsPush.js";
import { extractWikiquoteQuotes, wikiquotePageTitle } from "../src/lib/content/wikiquote.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSeed = join(packageRoot, "content", "stars-seed.json");
const USER_AGENT = "textline-nextline/0.1 (personal quote match; https://github.com)";

function usage(): never {
  console.log(`Usage:
  npm run content:wikiquote -- --title the-big-lebowski-1998 [--vault <readwise-dir>]

Fetches the English Wikiquote film page, matches Dialogue (and character
sections) onto our transcript, and unions those lines into stars-seed.json.
Vault highlights for the same title are merged too. A vault line keeps the
line when both sources hit it. Other titles already in the seed file stay.

Does not write D1. Push with:
  npm run content:stars-push -- --email you@example.com --title <id> --merge --remote --dry-run

  --title   Catalog title id (required).
  --page    Wikiquote page title, if it differs from the catalog name.
  --vault   Readwise/Obsidian folder. Highlights for this title are kept.
  --seed    stars-seed.json path. Default: content/stars-seed.json
`);
  process.exit(1);
}

function parseArgs(argv: string[]): { titleId: string; page: string; vault: string; seed: string } {
  let titleId = "";
  let page = "";
  let vault = "";
  let seed = defaultSeed;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") titleId = argv[++i] ?? "";
    else if (arg === "--page") page = argv[++i] ?? "";
    else if (arg === "--vault") vault = argv[++i] ?? "";
    else if (arg === "--seed") seed = argv[++i] ?? seed;
    else if (arg === "--help" || arg === "-h") usage();
  }
  if (!titleId.trim()) usage();
  return { titleId: titleId.trim(), page: page.trim(), vault: vault.trim(), seed: resolve(seed) };
}

async function fetchWikitext(page: string): Promise<string> {
  const url = new URL("https://en.wikiquote.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", page);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Wikiquote HTTP ${response.status} for ${page}`);
  }
  const data = (await response.json()) as {
    error?: { info?: string };
    parse?: { wikitext?: { "*"?: string } };
  };
  if (data.error) throw new Error(data.error.info || `Wikiquote refused page ${page}`);
  const wikitext = data.parse?.wikitext?.["*"];
  if (!wikitext) throw new Error(`No wikitext for ${page}`);
  return wikitext;
}

function loadExisting(path: string): StarSeed[] {
  if (!existsSync(path)) return [];
  return loadStarSeedFile(path);
}

async function main(): Promise<void> {
  const { titleId, page, vault, seed } = parseArgs(process.argv.slice(2));
  const title = loadTitle(titleId);
  const pageTitle = page || wikiquotePageTitle(title.title);
  const wikitext = await fetchWikitext(pageTitle);
  const quotes = extractWikiquoteQuotes(wikitext);
  const wikiSeeds = matchQuotesToTitle(
    title,
    quotes.map((text) => ({ text, note: "wikiquote" })),
  );

  let vaultSeeds: StarSeed[] = [];
  if (vault) {
    if (!existsSync(vault)) {
      console.error(`Readwise vault not found: ${vault}`);
      process.exit(1);
    }
    const docs = scanReadwiseVault(vault);
    const matches = matchDocsToCatalog(docs, [title]);
    vaultSeeds = matchHighlightsToTitles(matches, [title]);
    console.log(`Vault highlights matched: ${vaultSeeds.length}`);
  }

  const existing = loadExisting(seed);
  const others = existing.filter((star) => star.titleId !== title.id);
  const prior = existing.filter((star) => star.titleId === title.id);
  const mergedTitle = mergeStarSeeds(mergeStarSeeds(prior, vaultSeeds), wikiSeeds);
  const stars = [...others, ...mergedTitle];
  const file: StarSeedFile = { updatedAt: new Date().toISOString(), stars };
  writeFileSync(seed, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  const scores = { exact: 0, contains: 0, window: 0 };
  for (const star of wikiSeeds) scores[star.score] += 1;
  const added = mergedTitle.length - prior.length;
  console.log(`Wikiquote page: ${pageTitle}`);
  console.log(`Quotes considered: ${quotes.length}`);
  console.log(
    `Matched lines: ${wikiSeeds.length} (exact ${scores.exact}, contains ${scores.contains}, window ${scores.window})`,
  );
  console.log(
    `Seed for ${title.id}: ${prior.length} already in seed, ${mergedTitle.length} after merge (${added >= 0 ? "+" : ""}${added})`,
  );
  console.log(`Wrote ${stars.length} stars → ${seed}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
