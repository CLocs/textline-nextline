# Raw transcript_maker exports

Drop timed JSON files here (exported from transcript_maker), then run:

```bash
npm run import:all
```

Or import a single file:

```bash
npm run import -- path/to/export.json
```

Normalized titles land in `content/titles/`; `content/catalog.json` is updated automatically.
