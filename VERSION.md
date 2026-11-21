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

`22-11-2026.27` — methodology 2.0.0, payload schema 5.0.0, framework v5.

Build 27, from Tejas's review of build 26 (22-11-2026):
- **Global past growth is asked over 5, 3 and 1 year** (`global.cagr.y5`,
  `y3`, `y1`). Ten- and fifteen-year rates are no longer asked for, scored
  or printed: no consistent public series reaches that far for most sectors,
  so the tool could only stitch reports together or leave them out, and the
  follow-up asked for them again and again (Banking, 16-11-2026). The prompt
  asks for one series for all three, with y3 and y1 derived from its annual
  figures where it gives them. Older research carrying y15/y10 still reads;
  those figures are simply not shown, and still count when the app checks
  whether a block arrived as fractions.
- **Company page matches the Sector page.** After Research, the four AI tool
  buttons sit in a gold frame with the "prompt is copied" hint, and the
  Import paste box opens framed in gold and focused, on both pages.

Previous: `21-11-2026.26`.

Build 26, from Tejas's review of build 25 (21-11-2026):
- **Two versions per line.** Every sector study, Top 3 company and independent
  company keeps its LATEST version (every full report is built from it) and
  its PREVIOUS one. An update makes the latest the previous and removes the
  old previous, so the comparison is always the last two: 05-10 against
  10-11, then 10-11 against 20-11. A line is stamped on each record when it is
  saved, so a company's research survives the removal of the study version
  it was saved under and is still carried. A library holding more versions is
  brought to two on first launch. Versions are called Latest and Previous.
- **The update prompt asks for one fenced json block** (the copy button),
  in its own instructions and again as the last lines of the prompt.
- **The follow-up loop on peers is fixed.** Rows that name a company (peers,
  players, shortlist) now merge on ticker OR a normalised name, newest
  overwriting; duplicates collapse; the depth check counts distinct peers.
  The first reply's peers had no ticker on some rows and the follow-up had
  one on every row, so the two sides joined on different keys and every
  follow-up appended rows (CANBK held 16 rows for 10 peers).
- **The Update Comparison Summary** (renamed from Update Summary) has no
  contents page and opens on a Bottom Line written from the computed
  comparison. Key figures list only what moved; first-time measures get
  their own table; unchanged ones are named in a line. Units sit with the
  measure, and ₹ units go before the number. Score moves under a point read
  "little changed". A re-graded red flag shows its finding. Legal matters
  are "newly recorded". "1 day" is in words. The tool's claims are matched
  on the item only, so "marketCap" is no longer checked against the share
  price, and only figures that are plainly figures are checked. Raw keys are
  given readable names.
New suite `peermerge.mjs`; `versions.mjs` 62 checks; `update-engine.mjs` 45.

Previous: `19-11-2026.25`.

`19-11-2026.25` — methodology 2.0.0, payload schema 5.0.0, framework v5.

Build 25 is saved research brought up to date. Every sector study, Top 3
company and independent company keeps every version (a line joins them:
`src/core/update.js` `lineKey`); nothing is replaced on import any more. An
**Update** button copies an update brief — the full research brief preceded by
a digest of the saved version, asking for a complete payload plus a `changes`
log and, for a company, a `thesisCheck`. The reply is saved as the next
version wherever it is imported. A **version picker** on the Sector page and
the independent-company box selects any version; an older study version
brings back its own Top 3 on the Company page. After a sector update each slot
says whether it carries earlier research (**Update**) or is new to the Top 3
(**Research**, the full prompt). A new document, the **Update Summary**,
compares a version with the one before: figures previous / now / change /
what it means, computed by the app; Top 3 entered / left / stayed with the
ratings behind it; macro, market, competition, policy; the tool's own account
of the changes, each checked against the numbers (agrees / differs / not
checked). Each saved version shows its research date, age and why an update
is due (age, price move of 10% from a daily background check, dated events
passed, results due, year-old macro). Also fixed: computed metrics (ROE, ROA,
margins) used the OLDEST annual year for payloads listed newest first.
New suites `versions.mjs` (49 checks, real app) and `update-engine.mjs` (40).

Previous: `19-11-2026.24`.

`19-11-2026.24` — methodology 2.0.0, payload schema 5.0.0, framework v5.

Build 24 makes the test suite run anywhere and fixes three defects that the
real 16-11-2026 Banking and PNB runs exposed. Money whose unit the research
states ("INR crore", "INR crore (FY27 BE …)") now prints ₹… Crs / ₹… Lacs in
TAM/SAM/SOM, programme scales, market total and global size (`amountIn` in
render.js). Research notes no longer print the JSON word "null". A column
chart with one value says so, and the global growth chart needs two
lookbacks (a lone figure goes to the world table as "Past growth, a year").
Tests: the suites resolve paths from the repo (`tests/_paths.mjs`), the real
payloads are bundled in `tests/fixtures/real/` (see its README), jsdom is a
devDependency, `notice.mjs` checks the build-22 footer rule, and the stale
`seg.mjs` and `packer.mjs` are retired. 87/87 suites pass, twice, from a clean
checkout.

Previous: `19-11-2026.23`.

`19-11-2026.23` — methodology 2.0.0, payload schema 5.0.0, framework v5.

Build 23: sector documents are built only from the sector run (an
independently researched company had replaced the whole Banking report); the
PDF writer honours scaled pages; the industry engine covers 26 families and
computes NIM, CASA, NPA ratios, provision coverage, capital adequacy, load
factor, ARPOB, EBITDA per tonne and more from the reported lines, which the
brief now asks for; financial metrics fall back to it; entry context reads
weekly prices in trading days and takes relative strength from the stated
relative return, with every reading explained; peers are compared on each
industry's own measures with the subject computed and plotted; the four
overall dimensions are scored from bases like the pillars; shareholding,
discount-rate and multibagger exhibits corrected.

Previous: `16-11-2026.22`.

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
