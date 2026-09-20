---
name: add-show
description: >-
  Ingests a TV series from inbox/srt into the catalog as one show with
  seasons and episodes (Simpsons, It's Always Sunny, Sunny). Cleans episode
  names, converts via transcript_maker, imports new titles only, then
  Readwise-matches stars. Use when the user says "add show", "add series",
  "parse these SRTs as a show", "Sunny", "It's Always Sunny", drops a show
  folder under inbox/srt, or asks to display episodes like The Simpsons.
---

# Add show

Library grouping is automatic once each title has `meta.show`, `meta.season`, and `meta.episode`. That meta comes from a **canonical filename**:

```
It's Always Sunny in Philadelphia - 10x01 - The Gang Beats Boggs.en.srt
```

`batch:export` is **not recursive**. TV episodes are ~200–400 cues — **do not** skip ≲500 (that rule is movies only).

Stars still follow [content-ingest](../content-ingest/SKILL.md) steps 5–6 (Readwise, protect, dry-run, **wait**). Never `import:all`. Never `--force` stars-push.

## Procedure

1. **Inventory.** List `inbox/srt/<folder>` (flat or per-season subfolders). Parse `Show - NxNN - Name` or `SxxExx`. Report seasons, unique episodes, dup groups, and gaps (Sunny S18 was 4/8).

2. **One file per episode.** Prefer WEB > BluRay > DVDRip > HDTV > DSR, then larger file. Skip:
   - `4x05-06` (and similar double codes) when `4x05` already exists
   - Untitled `Episode N` placeholders unless you can name the special (Sunny `5x13` = A Very Sunny Christmas)

3. **Clean into a temp dir** (`inbox/srt/_add-show-<slug>/`, gitignored). Restore apostrophes (`It s` → `It's`). Strip release tags (`.WEB.HETeam`, `.HDTV.KILLERS`, `.DVDRip.ORPHEUS`, `.BluRay.POW4HD`, `.AMZN`). Convert `(1)`/`(2)` **and** trailing `Part 1`/`Part 2` to `Part One`/`Part Two` — transcript_maker strips both parentheses and a trailing `part 1`. Collapse `U.S.` → `USA` so junk-token `us` does not eat the title. Double spaces in this dump are stripped colons; on Windows use an em dash, not `:`.

4. **Convert** from sibling `../transcript_maker`:
   ```bash
   npm run batch:export -- <temp-dir> --out ../textline-nextline/imports
   ```
   If the dump is nested, run once per season folder (or flatten in step 3).

5. **Import each NEW json only:**
   ```bash
   npm run import -- imports/Its-Always-Sunny-in-Philadelphia---1x01---The-Gang-Gets-Racist.json
   ```
   Skip ids already in `content/catalog.json` or `content/stars-protected.json`. Confirm `catalog.json` has `"show"` + `"season"` so Library nests Show → Season → Episode.

6. **Stars.** Same as content-ingest: `content:queue --vault`, protect live≠seed, `stars-push --remote --dry-run`, **stop**, then push on confirm. Owner `dascolin@gmail.com`.

7. **Report.** Show name, season episode counts (and gaps), cue-count range, Readwise hits, D1 skip vs insert, Pages deploy still required.

## Why names have to be canonical

`titleFromFilename` (transcript_maker) treats a 4-digit year as a movie (`18x04 - 2026 A Virtual Insanity` would become a 2026 film). Episode codes now skip that, but release-group tokens still leak (`HETeam`, `KILLERS`) and `\bus\b` eats `U.S.`. Clean first.

Two-parters that share a name need Part One/Two in the **title** (Who Shot Mr Burns) or Readwise matching gives up.

## Display

No extra UI. `groupCatalogEntries` nests any `meta.show`. Home/Browse already have show → season → episode.

## Kaizen later

Per-season folders, SxxExx dumps without a temp rename, dotted acronyms (`D.E.N.N.I.S.`), incomplete last seasons.
