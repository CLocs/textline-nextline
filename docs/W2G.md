# w2g

Watch together done right. Highlight a line in Textline, keep the list on the picture, and keep what the room said on that line.

2.7 is the highlight and the sync. 2.8 is the note. The roadmap indexes both. The steps an agent runs are [watch-highlight](../.cursor/skills/watch-highlight/SKILL.md) and [line-notes](../.cursor/skills/line-notes/SKILL.md).

Opened on a live watch of The Odyssey (1997).

## While watching

| Situation | What you do | Where it lands |
| --- | --- | --- |
| The film is already in TLNL | Open it and star lines in Curate | A star in production D1 when you are signed in on the live site |
| A new film | Drop the SRT, import, then Curate | The same star, on line numbers from that import. The live site shows the film after a Pages deploy |
| Highlighting outside the app | Highlight in Readwise. It syncs to Obsidian | `content:vault-title`, then a dry-run `content:stars-push` for that title. The note stays on the seed. It is not a D1 column |

Do the import once. Later stars use those line numbers.

```mermaid
flowchart TD
  watch[Start watching]
  known{Title is in TLNL}
  curate[Curate and star]
  ingest[Import the SRT then Curate]
  follow{Follow the picture}
  stars[Stars are the highlight]
  sync[Tap Sync]
  hear[Mic matches one line]
  head[Playhead jumps there]
  run[List advances on the clock]
  again[Tap Sync again after a pause or seek]

  watch --> known
  known -->|yes| curate
  known -->|no| ingest
  curate --> follow
  ingest --> follow
  follow -->|highlight only| stars
  follow -->|sync and follow| sync
  sync --> hear --> head --> run
  run --> again --> hear
```

## Sync

Not built. Tap Sync. The mic stays on until a spoken line matches the transcript. The list jumps to that line and the mic stops. The list then advances on the clock. Tap Sync again after a pause, a seek, or a bad lock. The movie file is not required. The transcript timings are the clock.

## Notes

A line note is the room on one quote: a joke, a life story, another movie. Quote parallels stay analogy packs, a curated tie between lines. Friends are a later link for a person. The words can be stored before anyone is linked.

There is no notes table and no note field in Curate. A watch session file can hold a note. The app does not read it.

| Path | What you do | Now |
| --- | --- | --- |
| Type it | Write the note on the starred or quoted line | First sprinkle. Not built |
| Readwise | Highlight online. Vault-import after it reaches Obsidian | The star path works. The note stays on `stars-seed.json` |
| HeyPocket after the watch | Drop the transcript. Confirm the mapping | Procedure only. The Odyssey recording with Matty Ice waits on the transcript |
| The Sync mic | Keep the mic stretch as the note on the line it locked | Needs Sync. Still confirmed by you |

```mermaid
flowchart LR
  pocket[HeyPocket transcript]
  locks[Movie lines in the recording]
  chatter[Words between those lines]
  note[Note on a catalog line]
  speaker[Speaker label]
  friend[Friend link later]
  pocket --> locks --> chatter --> note
  chatter --> speaker --> friend
```

An utterance that matches a catalog line is a lock, not a note. The words between locks are the room, attached to the lock they follow. `movieMsAtStart` is the fallback when the movie is missing from the transcript. The raw utterance stays. A cleaned line waits until you accept it. The audio stays in HeyPocket.

Speaker labels start as `Speaker 1`. Rename in place. Link a label to a friend when you decide they are the same person.

A later note may name another title's line. That pointer is not an analogy pack.

## Still later

- Summarize a stretch of chatter into one note, after you accept the short line.
- Play the recording in the app.
