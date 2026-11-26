# Home widget

The tile on the phone home screen that shows the daily streak, whether today is done, and the day’s line. Duolingo keeps a streak visible without opening the app. That glance is why a native shell exists.

Add to Home Screen already pins the PWA. A website cannot draw a widget. Android draws the tile in the shell. iOS needs a WidgetKit extension in an App Store build. The site only feeds the data.

Roadmap: [2.9](ROADMAP.md#29-home-widget). Nothing here is built. Do not scaffold a shell until that first slice is the work in front of you.

## Order

1. Android tile in a thin shell. Three facts, for a signed-in player: streak, done today or not, the day’s line.
2. The same tile on iOS. WidgetKit beside the web view.
3. Push, offline, and store polish wait until the tile is real.

## Not decided

- Capacitor or another shell.
- What the tile shows when nobody is signed in.
- A countdown (“till next time”) or only done / not yet. The streak today is a calendar day.
- What the tile shows when the API is unreachable.
