import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadTitle } from "./src/lib/content/load.ts";
import { stillCueIndices } from "./src/lib/content/playable.ts";
import { loadStillsSyncFile } from "./src/lib/content/extractStills.ts";

const ids = [
  "the-wolf-of-wall-street-2013",
  "inglourious-basterds-2009",
  "matrix-1999",
  "the-empire-strikes-back-1980",
  "payback-1999",
];

const sync = loadStillsSyncFile("content/stills-sync.json");
const preview = "inbox/stills-preview";

for (const id of ids) {
  const title = loadTitle(id);
  const cues = stillCueIndices(title);
  const dir = join(preview, id);
  const have = new Set(
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => /^\d+\.jpe?g$/i.test(name))
          .map((name) => Number(name.replace(/\D/g, "")))
      : [],
  );
  const missing = cues.filter((n) => !have.has(n));
  const source = sync[id]?.source ?? "";
  const sourceOk = Boolean(source && existsSync(source));
  console.log(
    [
      id,
      `lines=${title.lineCount}`,
      `cues=${cues.length}`,
      `have=${have.size}`,
      `missing=${missing.length}`,
      `approved=${Boolean(sync[id]?.approvedAt)}`,
      `sourceOk=${sourceOk}`,
    ].join("  "),
  );
}
