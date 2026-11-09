---
name: line-notes
description: >-
  Stores the room's chatter on a quote: jokes, life stories, and other movies.
  Use when the user wants notes on a line, a HeyPocket or Pocket transcript
  of a watch, speaker labels, or to map a recording onto The Odyssey or
  another title. Manual notes and the import procedure live here. 2.7 Watch
  stays highlighting and Sync. w2g is the watch: stars, Sync, and these notes.
---

# Line notes

The note half of **w2g**. A line note is the room talking over one quote: a joke, a life story, another movie. Quote parallels stay analogy packs. Friends are a later link for a person, not a requirement to store the words. Curate already shows a typed note on a starred or quoted line and stores it in this browser. There is no notes table. Do not add one in this skill. Do not insert Pocket notes until a mapping is shown and they confirm it.

Plan: [W2G.md](../../../docs/W2G.md). Highlighting and Sync stay [watch-highlight](../watch-highlight/SKILL.md).

## Paths

1. **Type it.** In Curate, on a starred or quoted line. This browser only. If they type the note in chat instead, manual note below.
2. **Readwise.** They highlight outside the app. The note stays on `stars-seed.json` after `content:vault-title`. It is not copied into the session file.
3. **HeyPocket after the watch.** Pocket import below. The Odyssey recording with Matty Ice is the trial.
4. **The Sync mic.** A stretch from a Sync lock can be kept as the note on the line it matched. Sync is in Curate. Keeping that stretch as the note is not this slice. Store the words only after they accept them.

## Where a note lives

Until a table exists, append to `inbox/watch/<title-id>.json` (gitignored):

```json
{
  "lineIndex": 0,
  "movieMs": 0,
  "raw": "",
  "text": "",
  "speakers": [{ "label": "Speaker 1", "name": null, "userId": null }]
}
```

- `lineIndex` is the catalog line (0-based). Curate shows Line N as `lineIndex + 1`.
- `raw` is the utterance. Keep it.
- `text` is a cleaned or shortened line. Leave it empty until they accept that wording.
- `speakers[].label` is the provisional Pocket name. `name` is a rename they chose. `userId` stays null until they say that label is a friend.

A Readwise note under a highlight stays on `stars-seed.json` from `content:vault-title`. It is not a D1 column. Do not copy those notes into the session file.

## Manual note

When they type a note on a line, append one object. `raw` and `text` are the words they wrote. Speakers are the names they said, with `label` equal to that name. Do not look up accounts unless they ask.

## Pocket import

The movie in the recording is the clock. The audio file stays in HeyPocket. This repo stores the transcript text.

The Odyssey trial is `the-odyssey-1997`, recorded with Matty Ice. Wait until they drop the HeyPocket transcript. Do not invent the file, a user id, or notes from memory.

1. Read the transcript and `content/titles/<title-id>.json`.
2. An utterance that matches a catalog line is a **lock**, not a note. Match on the words. A lock's `movieMs` is that line's `startMs`.
3. Words between locks are the room. Attach them to the lock they follow. One note per stretch, `raw` joined in order, `text` empty.
4. Show the locks and the notes under them: Line N, the subtitle, the raw chatter, the speaker labels. **Stop.** Wait for them to drop, merge, or accept a cleaned `text`.
5. If the movie is missing from the transcript, fall back to `pocket.movieMsAtStart` on the session. `movieMs = movieMsAtStart + offset` inside the Pocket transcript. Attach a span to the line where `startMs <= movieMs < endMs`. If `movieMsAtStart` is null, ask for the movie time when Pocket started. Do not guess.
6. A duration with no transcript only fills `pocket.durationMs`. It does not become notes.
7. Store Pocket labels as `Speaker 1`. Rename `name` when they say who that is. Set `userId` only when they say the label is a friend.

A stretch they want shortened stays `raw`. Write `text` only after they accept the short line.

## Later sprinkles

Do not build these in this pass. Speakers stay provisional labels until they rename one. A note may later name another title's line. That pointer is not an analogy pack.

## Spikes

Do not build these. Summarizing a stretch without them accepting the short line. Playing the recording in the app. Sync stays on watch-highlight.
