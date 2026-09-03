# Releasing a new build

Two lines change per release, and they must match.

1. `index.html` — near the top:
   `<script>window.APP_BUILD="2026.09.03.1";</script>`
2. `sw.js` — line 4:
   `var BUILD = '2026.09.03.1';`

The cache name is `equity-analyst-` plus that build, so a new build can never be
served out of an old cache. The Setup page prints the build it is running and
says "serving an older cache, reload twice" when the two disagree, which is the
only reliable way to tell whether a change actually reached the device.

Use `YYYY.MM.DD.n`, with `n` counting releases within the day.

## Replacing the files on the host

Unzip, edit the two lines, re-upload the contents. Nothing else changes: no build
step, no dependency install, no server. The folder you upload is the folder that
is served.

A phone that already has the app installed picks up the new build on the second
launch: the first fetches it, the second runs it. That is how service workers
behave and it is not a fault.

## Current build

`2026.09.03.1` — methodology 2.0.0, payload schema 3.0.0.
