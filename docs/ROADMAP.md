# Roadmap

Working plan. How we got here: [SHIPPED.md](SHIPPED.md). Library growth: [CONTENT.md](CONTENT.md). How to run the app: [README.md](../README.md).

App work does **not** wait on new titles. One idea lives here once; do not copy it back into the README.

## Now

**Send streaks from Curate.** Curate Send is one line. Next: send a **star streak** (two or more starred lines in a row) to a friend or a named group. The share is those lines in transcript order, the same way a streak already plays in a mini-game. Same friend gate, Send overlay, and 10s same-share cooldown as a one-line send. Inbox and Chats show one Play N-line streak card (`#/play/{shareId}`), not N MCQ cards. Cap is mini size (10).

## Next

1. **Keep it going** — after send streaks. A one-line send (random quote or DM) that sits in a star streak offers a button to play the rest in transcript order, from the next starred line. The card stays one line until they tap.
2. **Content C3 hygiene** — strip leftover `.en` from Simpsons S4 titles/ids without breaking star `titleId`s; persist `year` / `tmdbId`. Details: [CONTENT.md](CONTENT.md#c3--import--movie-catalog-hygiene-this-repo-).
3. **Security L1** — session TTL / logout, Bearer on runs/shares/me, Google JWT checks, magic-link rate limit, claim-anonymous cannot steal stars. Do this before inviting a much larger circle. Ladder: [Open spikes](#open-spikes).

## Later

Parked. Steer as we go. Full phase writeups stay in [SHIPPED.md](SHIPPED.md).

**Popular-line room** *(name open).* Turn-based room for 2–4, same board as a full-transcript room, walking the title’s crowd-popular starred lines (all or most) in transcript order. Longer than a 10-pack, shorter than every cue. Name is unset.

**Friends of friends.** Tap a Home friend face to open that friend’s friends (display name, same day-streak badge), then **Request**. One hop. No search-by-name, no user directory, no emails. Block still hides that person.

**Attempt chat.** Person icons in a Chats thread for who got a 1-line share first / second / third try. Not rooms. Belongs next to that share.

**Chats → quote replies.** Short text **under** a quote card, scoped to that `share_id`. Same DM/group thread. Not Discord-style channels.

**Chats → cross-title mini-games.** Multi-select message cards in a thread → frozen share spanning `{ titleId, lineIndex }[]`. Cap like mini (e.g. 10). Queue format today is per-title.

**Quote challenges (Concept 2).** Share a single line + guess link without a full room. Directed one-question send already exists; this is the broader async challenge.

**Difficulty modes.** Medium / Hard free text (exact or fuzzy). Fun / MCQ is the live mode.

**Leaderboards.** Per title, global, friends — builds on the Phase 2.5 run log. Public ladders are not v1 of reputation.

**Curate mini-game builder.** Filter the title’s starred pool (starred-by **union**, including crowd) and sort (most starred / most played / chrono forward·reverse) before locking a queue. Named playlists are a different product from stars and from history Share; use frozen run-replays in the wild first. See [Open spikes](#open-spikes).

**Scene visuals leftovers.** Starred stills, posters, R2, and mini-game still→poster shipped in 2.6. Cover stills on library/Home cards (lowest line index in `content/stills-coverage.json` `covers`). Still parked: git-lfs / checking JPEGs into the repo; shipping video; random poster rotation; player wrong-still / request-still reports. **Every-cue extract** (after sync is eyeballed): dialogue stills for every playable line, skipping SDH/junk/lyrics. Movies first; TV when an episode is starred. CLI: `npm run content:stills -- --title TITLE_ID --playable`. Skill: [stills-extract](../.cursor/skills/stills-extract/SKILL.md). Stills from your own files; don’t scrape streaming services. Loved-frame cover preference stays later.

**Line / still feedback.** On Play / Curate, flag **wrong still**, **request still**, or **split this line**. Persist `(title_id, line_index, kind, user_id)`; Catalog queue. Signed-in only. Does not change live stills or remint `line.index`. Not player JPEG uploads or auto-reextract.

**Split multi-sentence lines.** Curate-time overlay (`parentIndex` + `part`) so one cue can be two playable beats without reminting star indices. Import-time auto-split only for titles with no stars. Players can request a split via line feedback.

**Weighted popular (2.5 leftover).** Do not change `/api/stars/popular` until enough thumbs exist. Then a small title-level nudge: `popular_score ≈ star_count × (1 + ε × title_sentiment)`, `ε ≈ 0.1`, clamp ~0.9–1.1. Thumbs never dominate a 3-star vs 1-star gap.

**Curator incentives.** Track how many stars a person lays down, then weight by co-stars and/or thumbs on games that used those lines. Do not pay out on raw star count (easy to farm).

**Favorite quote after a mini-game.** After a run, pick a favorite line. Card is frame + textline + next line, with star / love / share / export. No choices.

**Liked titles for daily and Play 3.** A played title (or show, via a played episode) counts as liked. Daily mail starred cards and Play 3 prefer the player’s stars on those titles, then crowd stars on the same titles. Line of the day stays global.

**Badges and friends boards.** Mini-games played, weighted perfects, and DMs answered correctly — friends only, no public list. Counts already exist at `GET /api/stats/counts` and are not shown yet.

**Quote parallels Medium.** Situation blurb + moderated URL; bidirectional links; up/down votes; Home Parallels rail; short pack chat; diff view of a rewrite. Light packs already shipped.

**Standalone quote ties.** Send a quote in Chats with nothing to guess; quote shelf on the profile; quote marks seeding parallel packs; Quotes filter in global search; cover stills preferring a quote-marked frame. Quote mark on Curate/Play + daily/Home card already shipped.

**Watch-list connections.** Player-facing Letterboxd (and maybe Trakt) → “you might like” + requests. Owner ZIP ingest already exists. Light title search/request shipped first.

**Integrations.** Letterboxd (no public API we will call), Flickchart via official export if they offer one, Netflix/Amazon watch-history **spike** (API or official export only — expected no). No scraping. Trakt maybe for TV after Letterboxd/Flickchart.

**Quotes from anywhere.** Paste an IG/YT/other link, infer or type **one** line into a personal library. Licensing, ToS, and “is this even our transcript?” are the gates.

**Songs.** Parse lyrics as a transcript; infer timestamps or keep extra lead-in. New catalog kind, not Movies \| TV.

**More sources.** Official scripts, fan transcripts — with licensing notes — beyond SRT.

**Daily challenge.** Same title + start line for everyone. Not the same as the daily quote email.

**Premium GIFs from selected lines.** Paid tier renders a capped (~6s) loop over selected cues from the local remux. Own bucket beside `/stills`. First feature that needs billing. GIF vs silent MP4/WebM is open. Rights is the Steam question again.

**Native apps.** After PWA-lite has been in the wild. Capacitor or similar if store / iOS push / offline become real needs.

**SRT and video automation.** Filling a [title request](SHIPPED.md#title-requests-light) automatically. Manual drop + paced OpenSubtitles already exist ([C2](CONTENT.md#c2--subtitle-acquisition-hybrid)). Daily cap, match quality, and copyright sit between requested and playable. Video has no licensed equivalent of the owner’s local file. Rights, source, rate limit, and file match all have to be true at once.

**Obsidian → TL (remaining).** Weighted seed of `stars-seed.json` into D1 / Curate; watch-party metadata; login + group popularity. Vault scrape + fuzzy match already shipped.

**Perfect mini confetti.** Short burst on the complete screen when a mini-game finishes all-correct.

**Logo artwork.** Coolors palette1 → palette2 (plum/mint/lime) already on the content branch; logo later.

**Visual palette leftovers / loved cover stills.** Library cover stills preferring a loved frame.

## Open spikes

Questions, not fake phases.

### Rooms (Phase 2)

2–4 players take turns guessing the next line in the same transcript run. Prefer logged-in players (display name from account).

- **Room / session** — host creates a game (title, 2–4 players); join link or short code.
- **Turn rotation** — one player on the clock. Fun: same player tries again. Medium: that player is eliminated. Hard: the room ends.
- **Shared state** — same current line, whose turn, identical MCQ options. Real-time sync (WebSocket or similar).
- **End game** — Fun: standings by correct/incorrect. Medium: last standing. Hard: team score = lines before the miss.

**Open:** reconnect via Phase 2a session token? Popular-line room name, and whether the queue is every crowd-popular line or a long cap.

Does **not** block other app work.

### Security ladder

Users care; a single “do security” project will bog us down. Auth today is magic link + Google → D1 sessions; stars/runs/shares are account-scoped.

| Level | What | When |
|-------|------|------|
| **L0 — Hygiene** | Secrets in Wrangler/CI; CORS; OAuth origins | ✅ Sep 2026 — [SHIPPED.md](SHIPPED.md#l0-hygiene-checklist-pass-sep-2026) |
| **L1 — Auth & session** | TTL / logout; Bearer; Google JWT; magic-link rate limit; claim-anonymous | After 2a.2; before a large friend circle |
| **L2 — Abuse & data bounds** | Soft rate limits; never return other users’ emails; D1 migration checklist | When share links go beyond a small circle |
| **L3 — Dependencies** | `npm audit`; pin `jose` / wrangler; Dependabot or periodic bump | Cheap; parallel with L1 |
| **L4 — Cursor Security Review** | Agent on auth/API PR diffs | Habit on sensitive PRs |
| **L5 — External audit** | Pen-test / bounty | Only if PII at scale, commercial, or enterprise demand |

Sequence: L0 → L1 → L3 (parallel) → L4 as habit → L2 when sharing grows → **skip L5** until we outgrow friends-and-family.

**Out of scope until needed:** SOC2, CSP perfectionism, WAF, app-layer D1 encryption, storing passwords (we don’t).

**Open:** public “how we handle accounts” note?; share meta display name vs owner email.

### Curated / saved mini-game packs

Named playlists of quotes (pick 10, save, replay, share) ≠ stars ≠ frozen run-replays. History Share is the cheap prototype. Use that before building an editor.

Open: title-scoped vs mixed-title; curated sequence vs shuffle-on-play; edit after someone has played; how this relates to stars / thumbs / crowd popular; pick from transcript vs “save this run”; “most played” per-line vs title-level.

### YouTube videos as titles

Paste a URL → timed transcript → same `Title` + `Line` loop (stars, packs, Chats). Scene frames later (no local file). Not downloading full video into the app. Gates: YouTube ToS / caption licensing, auto-caption quality, dedupe, personal vs shared catalog.

### Online quotes (Wikiquote)

Allowlist: **Wikiquote** (MediaWiki API) yes; IMDb Quotes no (no API, terms); quote farms no. One-film trial and `content:wikiquote` shipped — [SHIPPED.md](SHIPPED.md#spike-online-quotes-eg-imdb-research). Remaining: more titles, Curate review of quote-mark misses, then protect.

### Steam

Paid listing after the web app. Two gates before any store work:

- **Copyright.** Personal curated library today; selling changes that. Open: what the build ships (lines, stills, or video); license vs client that does not bundle transcripts; Steam third-party IP review. This note is not a rights plan.
- **$5.** Comparison point, not a price. Rooms, popular-line room, and a requestable catalog are still parked — more should land before a $5 listing is a fair offer.

Not this yet: Steamworks, a Windows build, or moving off the web app.

### Netflix / Amazon watch history

Time-box whether a signed-in player’s history can be read at all: public API, then official export, then stop. Scraping is out. Expected outcome is **no**.

## Status

| Item | Status |
|------|--------|
| 0 – 1.8 Foundation, MVP, stars, Curate, library browse | Shipped |
| 2a Auth + share mini-game, Google Sign-In | Shipped |
| 2.5 Runs, profile, Home rails, thumbs, exact mini replay | Shipped (weighted popular later) |
| 2.6 Starred stills, R2, Catalog ops, protect curated stars | Shipped (every-cue / video later) |
| Loved, star streaks, friends, inbox, groups, friend faces, Chats | Shipped |
| Teach, MCQ similarity, parallels Light, image export, daily email, Play now | Shipped |
| Standalone quotes, global search, play UX, PWA-lite, title requests | Shipped |
| **Send streaks from Curate** | **Now** |
| Keep it going; C3 hygiene; security L1 | Next |
| Rooms, popular-line room, Steam, YouTube titles, GIF billing | Open / later |
| C0 – C1.5 Letterboxd queue, batch convert, `.sub` | Shipped — [CONTENT.md](CONTENT.md) |
| C2 SRT acquisition | Inbox drop works; OpenSubtitles optional |
| C3 Import hygiene | Next content polish |
| C4 Ongoing Letterboxd delta | Whenever you re-export |

Pilot: only `dascolin@gmail.com` and nalongi can star or love lines. Everyone else can still play.
