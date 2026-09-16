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
3. Cover **all** commits on the branch, not only the tip. Lead with why.
4. Reply with **Title** and **Description** as copy-paste blocks (format below). No extra essay.
5. Call out merge hazards: secrets, `api/.wrangler/**`, accidental `node_modules`, huge binaries.

## Output

**Title** — one line, ~50–80 chars. Imperative or noun phrase. Match this repo’s casual-but-specific style (`Teach mode, more prompt context, and curated posters`).

**Description** — markdown:

```markdown
## Summary
- (2–5 bullets: user-facing why, then notable internals)

## Test plan
- [ ] (concrete clicks / modes / titles)
```

Do not invent unshipped work. If the working tree has extra uncommitted files, mention whether they belong in the PR.
