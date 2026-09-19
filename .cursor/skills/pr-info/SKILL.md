---
name: pr-info
description: >-
  Drafts a GitHub PR title and markdown body from the current branch vs main.
  Use when the user says "Make PR info", "PR info", "PR description", "PR title",
  "PR copy", or asks for a pull-request summary without opening the PR.
---

# Make PR info

Do **not** run `gh pr create` unless the user also asks to open/create the PR.

## Procedure

1. Base = `main` unless they name another branch.
2. In parallel: `git status`, `git log --format="%h %s" <base>..HEAD`, `git diff --stat <base>...HEAD`, and skim the source diff (skip binaries / `api/.wrangler/**`).
3. Cover **all** commits on the branch, not only the tip. If they name a commit range (e.g. last 4), still skim the rest of `<base>..HEAD` and say if anything else is on the branch.
4. Reply with **Title** and **Description** as copy-paste blocks (format below). No extra essay.
5. Call out merge hazards: secrets, `api/.wrangler/**`, accidental `node_modules`, huge binaries.

Write from the diff, not the commit subject line. Do not invent unshipped work. If the working tree has extra uncommitted files, mention whether they belong in the PR.

## Output

**Title** — one line, ~50–80 chars. Imperative or noun phrase. Match this repo’s casual-but-specific style (`Teach mode, more prompt context, and curated posters`).

**Description** — markdown, sections in this order. Keep each section short (a few sentences or bullets). If a section does not apply, one line saying so — do not drop the heading.

```markdown
## What changed, why it changed
(What the branch actually does, then why — the product reason, not a file list.)

## Features added: technical implementation
(How it was built: key files, APIs, data, flags. Skip fluff; name the mechanisms.)

## Logical meaning
(What this means in domain terms — the idea a player or curator would recognize.)

## User experience before and after
(Concrete before → after: what someone sees or does on Home / Profile / Play / etc.)

## Overall impact estimation
(Who it affects, how big, risk. Honest: small UI vs catalog/API vs stills/R2. What could break.)

## Test plan
- [ ] (concrete clicks / modes / titles)
```
