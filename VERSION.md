# Releasing a new build

Two lines change per release, and they must match.

1. `index.html` — near the top:
   `<script>window.APP_BUILD="2026.09.10.1";</script>`
2. `sw.js` — line 4:
   `var BUILD = '2026.09.10.1';`

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

`16-11-2026.22` — methodology 2.0.0, payload schema 5.0.0, framework v5.

Build 22: the footer disclaimer moves under the page row with the new wording;
the rupee rate is checked by the app against a published reference for the
save date (src/core/fx.js); every litigation register is a row in the schema
and is printed register by register; market shares state their measure,
period and market total and are read correctly when given as fractions; and
the sector brief, depth check and follow-up ask by name for the global market,
India's share, five years of Budget BE against actuals, dated eras, trade
data, value-chain beneficiaries, TAM/SAM/SOM with method and programmes traced
to suppliers.

Previous: `15-11-2026.21`.

`15-11-2026.21` — methodology 2.0.0, payload schema 5.0.0, framework v5.

Build 21 is the professional A4 format: every document is set on a true A4
sheet (210 × 297 mm) with one running head and one three-part footer on every
page of every report; a type scale of 9pt text, 10.5–13pt bold headings and
7pt back matter; pastel charts drawn 1:1, two to a row, each with a numbered
title, units on the value axis, an axis title and a "What it shows" reading;
the three statements set as three tables; and a corrected liquidity section
(traded value in the reporting unit, position sizes in ₹). Checked by
`tests/a4format.mjs` on all six documents.

Previous: `12-11-2026.20`.

Build 20 moves the library from localStorage to IndexedDB and stores only the
payload (the report is rebuilt from it), so a second and every later sector
study can be saved; treats "Power" and "Power and utilities" as one sector and
never sets aside a company the study itself shortlisted; keeps the selected
study and the selected company in step on the Score Card; and measures the
depth of a payload rather than the presence of its sections, with a follow-up
prompt and a merge to fill what is thin (`src/core/completeness.js`).
