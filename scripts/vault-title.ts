import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTitle } from "../src/lib/content/load.js";
import { matchDocsToCatalog, scanReadwiseVault } from "../src/lib/content/readwise.js";
import { matchHighlightsToTitles, unionTitleStarSeeds } from "../src/lib/content/starSeed.js";
import { loadStarSeedFile, type StarSeedFile } from "../src/lib/content/starsPush.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSeed = join(packageRoot, "content", "stars-seed.json");

function usage(): never {
  console.log(`Usage:
  npm run content:vault-title -- --title the-odyssey-1997 --vault "<readwise-dir>"

Match one catalog title's Readwise highlights into content/stars-seed.json.
Other titles in the seed stay. Does not write D1. Highlight notes stay on the seed.
`);
  process.exit(1);
}

function parseArgs(argv: string[]): { titleId: string; vault: string; seed: string } {
  let titleId = "";
  let vault = "";
  let seed = defaultSeed;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") titleId = argv[++i] ?? "";
    else if (arg === "--vault") vault = argv[++i] ?? "";
    else if (arg === "--seed") seed = argv[++i] ?? seed;
    else usage();
  }
  if (!titleId || !vault) usage();
  return { titleId, vault, seed };
}

function main(): void {
  const { titleId, vault, seed } = parseArgs(process.argv.slice(2));
  if (!existsSync(vault)) {
    console.error(`Readwise vault not found: ${vault}`);
    process.exit(1);
  }

  const title = loadTitle(titleId);
  const docs = scanReadwiseVault(vault);
  const matches = matchDocsToCatalog(docs, [title]);
  if (matches.length === 0) {
    console.error(`No Readwise note matched ${title.title}. Seed was not changed.`);
    process.exit(1);
  }
  const highlightCount = matches.reduce((count, match) => count + match.highlights.length, 0);
  const incoming = matchHighlightsToTitles(matches, [title]);
  const existing = existsSync(seed) ? loadStarSeedFile(seed) : [];
  const stars = unionTitleStarSeeds(existing, title.id, incoming);
  const file: StarSeedFile = { updatedAt: new Date().toISOString(), stars };
  writeFileSync(seed, `${JSON.stringify(file, null, 2)}\n`);

  const noted = incoming.filter((star) => star.note && star.note !== "wikiquote").length;
  console.log(`Vault notes with highlights: ${docs.length}`);
  console.log(`Notes matched to ${title.title}: ${matches.length}`);
  console.log(`Highlights in those notes: ${highlightCount}`);
  console.log(`Lines matched: ${incoming.length} (${noted} with a note)`);
  console.log(`Unmatched highlights: ${highlightCount - incoming.length}`);
  console.log(`Seed lines: ${stars.length} → ${seed}`);
  console.log("D1 was not written. Dry-run stars-push for this title before inserting.");
}

main();
