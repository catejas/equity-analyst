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

`26-11-2026.33` — methodology 2.0.0, payload schema 5.0.0, framework v5.

Build 33, the first of three approved by Tejas on 26-11-2026 to make the
Sector Finder a professional screen:
- **Returns over 1, 2 and 3 years** (2 and 3 as an annual rate, the 3-year
  weighted most), against the **Nifty 500**; the Nifty 50 kept beside it.
- **Risk measured by the app** from four years of weekly prices
  (`sector-metrics.js`): volatility, largest fall, distance from the high,
  quarters beating the index (of 12), relative-strength trend, position
  against the 52- and 100-week averages, breadth of the bellwethers.
  Baskets are chain-linked, so a later listing joins without a jump.
- **Seven pillars**, as in the Independent Sector Research: past performance
  20, fundamentals 15, outlook 20, government and policy 15, global and
  regional 10, valuation 10, risk 10.
- **Two stages.** The screen scores all 41 on the five pillars the app can
  measure, and shortlists ten. **Deep Dive** asks, for the shortlist only, for
  the evidence the five ICICI Securities samples rest on: NSDL sector FPI
  flows, Budget allocation over five years and its use, scheme outlay against
  money disbursed, national targets, policy and trade measures (safeguard
  duties, CBAM), global market and India's share, profit drivers now and a
  year ago, graded risks, thesis/bull/bear/catalysts, five quarters of
  shareholding, and a macro backdrop. The Top 3 come from the shortlist on all
  seven pillars.
- The screen also asks each bellwether's ROE, net debt to EBITDA and the
  three-month change in consensus EPS.
- New suite `finder33.mjs`; earlier suites updated to the new model.

Build 32, Tejas's decisions of 23-11-2026 after follow-ups 8 and 9:
- **The price check is queued.** A check asked for while one runs runs
  next; a result whose data stamp (`finderStamp`) no longer matches the
  screen is thrown away and run again. His three follow-ups, imported back to
  back, had left the first check, run before his EPS arrived, stamped on the
  merged screen, so P/E history read "the app works it out" for good. On
  launch, a screen whose check was run on older data is checked again. A
  **Check prices again** button, and progress ("6 of 41 sectors…").
- **Calendar years** (CY21 = 31-12-2021) and estimate years (FY27E) are read:
  ABB's EPS can now be priced.
- **The outlook, in tiers.** Published (the research's sector forecast, or the
  companies' consensus estimates as the site shows them, year by year; with
  two forecast years the third is extended at their trend), then Guidance
  (the company's own), then Past (its last three years' EPS growth, capped at
  ±50% a year, counted at half weight). A sector takes the best tier its
  companies reached and the median of those companies only.
- **A badge on the outlook figure only**: Published, Guidance or Past, in the
  ranking table (tap for the source) and the Sector Screen PDF.
- A past-trend figure is scored but still asked for in every follow-up.
- New suites `finder32.mjs`, `finder32ui.mjs`; follow-ups 8 (two parts) and 9
  added as fixtures.

Build 31, after seven real follow-ups that still left a dozen sectors without
sector-wide figures (Tejas: "Find a way to get data. It's all listed
companies."). The tool now sends each bellwether company's own figures and
the application works the sector out:
- **Sales and profit:** each company's latest quarter and the same quarter a
  year earlier (`bellwethers[].quarter`), summed by the app. A company that
  swung to a loss is counted; a loss in both years scores as the loss
  narrowing or widening.
- **Valuation:** each company's EPS for five years and TTM
  (`bellwethers[].eps`, `epsTtm`). The price check fetches six years of
  monthly prices and works out each company's own P/E history (month-end
  close over the EPS of the latest year whose accounts were out); the sector
  is the median of its companies.
- **Outlook:** each company's consensus EPS and revenue growth
  (`bellwethers[].forecast`); the sector is their median.
- **The research's own sector figure comes first**; the companies fill only
  what it lacks, and the PDF says which.
- **The follow-up names the companies** to look up, by symbol. What the app
  measures itself (returns of any sector with an index or two bellwethers;
  P/E history once EPS is in) is not asked of the tool, until the app's own
  check fails for it. A check that could not run at all is recorded as
  failed, so the research is asked instead.
- New suite `finder31.mjs`; the real fixtures now include follow-ups 5 to 7.

Build 30, from the five real Finder payloads of 22-11-2026 (base plus four
follow-ups). Nothing in them went unread; the gaps were structural:
- **The P/E's own history, however it is published.** A five-year median
  ("pe5yMedian") or a long-run median ("peMedian", "peMedianSince") stands in
  for the five-year average, including one the tool wrote only in its source
  note ("Long-run median P/E 16.4 since 2003"). A median of a series under
  three years old is not used, and is still asked for.
- **Each part from the measures it has.** Momentum is 3m 25 / 6m 35 / 1y 40
  (1y required); business is profit 60 / revenue 40; outlook is earnings 60 /
  demand 40, so a niche sector with only a demand forecast still scores. A
  part built from fewer measures is marked partial.
- **Like with like.** A return the app measured is set against the Nifty 50
  the app measured on the same date, not the tool's month-end figure.
- **The app's job is left to the app.** A sector with no index and with
  bellwethers is no longer asked for its returns: the follow-up tells the
  tool not to search, and the app's price check measures it. The check runs
  six sectors at a time, its stocks in parallel; a stock listed under a year
  ago counts for 3 and 6 months, and each period is averaged over the stocks
  that have it.
- **A follow-up's "not found" notes** for figures it carries are now set
  aside on the saved, merged screen (they were set aside on a copy).
- Real run: 23 → 27 sectors eligible before the price check, 32 after it.
  New suite `finderreal.mjs` replays the five payloads.

Build 29, from Tejas's first real Sector Finder run (22-11-2026: 77% depth,
3 of 8 checks, 25 "not found" notes for figures the reply carried; "it
directly affect the ranking of Top3 … Fix this any how"):
- **A gap no longer decides the Top 3.** Past momentum and the outlook (70 of
  100 points) must be there for a Top 3 place. Business momentum or
  valuation that could not be established counts as average (50th
  percentile), marked "counted as average". Momentum needs the 1-year
  return (a missing 3- or 6-month one is left out); business needs profit
  growth; outlook needs earnings growth.
- **The app reads replies as tools write them.** Numbers as text ("12.5%",
  "22.4x", "12-14%", "(4.2)", "25 bps") are read as numbers; one-string lists
  ("SBIN, HDFCBANK"; "a; b") and { text } items become lists; sector names
  ("IT", "Banks", "Oil & Gas", "Hotels & Tourism") are read as the list's;
  figures beside their block, under other names ("avgPe5y", "patGrowth",
  "return1y") or without a wrapper are moved; a column sent as fractions is
  read as percent. A figure with a scale word (crore, bn) is listed, never
  turned into a bare number. Every repair is shown in the review.
- **A "not found" note for a figure the reply carries is set aside** (kept in
  `run.searchLogSetAside`) and no longer counts as a gap.
- **The prompt closes the gaps at source.** With no sector index, the tool
  must use the bellwethers: median trailing P/E and median five-year average
  P/E (Screener, Trendlyne, Tickertape), summed quarterly results for
  business momentum, consensus forecasts for the outlook. Numbers must be
  written as numbers.
- **Follow-ups name the exact fields** each sector lacks ("Retail (pe,
  pe5yAvg)") and Finder-specific places to look.

Previous: `22-11-2026.28`.

Build 28, from Tejas's decisions of 22-11-2026:
- **The Sector Finder**, at the top of the Sector page. One prompt screens all
  41 sectors in the app's list: 3m / 6m / 1y return of the sector index and
  of the Nifty 50, sales and profit growth over the last four quarters,
  forecast earnings and demand growth over three years with tailwinds and
  risks, and P/E against its five-year average. The tool does not rank; the
  app scores each part as a percentile among the sectors (momentum 35,
  business 20, outlook 35, valuation 10) and names the Top 3 from sectors
  with all four parts. After saving, the app fetches each sector index (or
  its bellwether stocks) from Upstox itself and uses its own returns, marking
  the rest "not checked". Latest and Previous versions, Update, a depth box
  and follow-up, and a **Sector Screen** PDF (with what moved since the
  previous screen). New `src/core/finder.js`.
- **The Sector page mirrors the Company page**: Sector Finder, then **Top 3
  Sectors** (Research or Update, Import, the study's PDFs, depth, and **Top 3
  companies →**), then **Independent Sector Research**, then the AI tools.
  One study per sector however it is reached.
- **Company page**: the "Saved company research" picker is removed; the Top 3
  heading is now **Top 3 companies of [sector picker]**.
- **Missing figures: keep asking, ask better.** Nothing is ever closed. A
  failed search goes in `run.searchLog`; the item stays missing at full
  weight; the depth box shows Found / Searched, not found (×n, last date) /
  Not yet searched; the next follow-up names the sources tried and places
  not yet tried; the report's Gaps section lists it. The depth never reads
  100% while anything is missing.
- **The app checks it read everything** (`src/core/readcheck.js`): keys sent
  under a near-variant of the schema's name (`cagr_5y`, `3m`, `net_profit`)
  are read under the right one; keys nothing in the app reads are listed as
  "sent but not read"; a figure the tool called "not found" that the reply
  carries is shown. `src/core/known-keys.js` is generated by
  `node tests/gen-knownkeys.mjs`.
- Merging a follow-up keeps the saved row's own spelling of a name.
New suites `finder.mjs`, `finderui.mjs`, `followup28.mjs`, `readcheck.mjs`.

Previous: `22-11-2026.27`.

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
