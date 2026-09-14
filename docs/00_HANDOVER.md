# Equity Analyst — Handover

Read this first in a new chat, then `docs/11_CHANGELOG.md` for the full history.
Everything here is current as of build **14-09-2026.2**.

---

## What this is

A static PWA for Indian listed equity research. No backend, no analytics, no
network calls of its own. It builds a research prompt, the person runs it in
Claude / ChatGPT / Gemini / Perplexity, pastes the JSON reply back, and the app
scores it and renders A4 PDF reports.

Everything that can be computed is computed by the app. The model supplies
ratings with evidence and the operating drivers of a financial model; it does
not supply scores, rankings or valuations.

---

## The four pages

| Page | Holds |
|---|---|
| **Sector** | Sector and sub-sector dropdowns, holding horizon, saved-run picker, Research / Import / Delete, the four AI tools, then Sector Research Report and Executive Summary |
| **Company** | Independent Company Research (its own picker, needs no sector), the three Top 3 boxes, Saved Company Research picker, the four AI tools |
| **Score Card** | Two independent pickers — sector run and company run — the 52-component card, and Score Card PDF / Share |
| **Setup** | Install, in-app AI toggle, data and privacy, build number |

Vocabulary is **sector / sub-sector** in the interface, prompt, framework and
reports. The payload keys stay `segment` and `subsegment` — renaming those would
invalidate every payload already imported. The rename happens on the finished
prompt text via `sectorVocabulary()` in `prompt-builder.js`.

---

## How a run works

1. **Sector run.** Prompt asks for the full sector study plus a `shortlist` of
   ~12 companies, each rated on four pillars with an evidence sentence carrying
   a figure. It explicitly says **DO NOT CHOOSE THE THREE**.
2. **The app screens.** `src/core/screen.js` ranks the shortlist on equal pillar
   weights and takes three. Same ratings always give the same three, whatever
   order they arrive in. A company rated on fewer than three pillars ranks below
   every fully rated one. Ties are reported, not broken silently.
3. **Company runs.** One per company, each its own payload, each its own report.
4. **Independent Company Research** is a separate path for a company outside any
   Top 3, flagged `standalone`, never filling a Top 3 slot.

Every segment run is kept. The same sector on another date, or with another
tool, is a distinct run with its own Top 3. Companies bind to the run they were
imported under by record id, never matched by name.

---

## Architecture

```
index.html          the whole app: markup, styles, page controllers
render.js           document builders (sector, company, exec, score card)
charts.js           14 inline-SVG chart types
docs.js             PDF pipeline, share, per-document dispatch
segments.js         the sector/sub-sector taxonomy
src/engine-bridge.js  ES module that publishes window.EQ
src/core/*.js       the engine: scoring, ranking, screen, schema, repair, …
sw.js               service worker; BUILD must match window.APP_BUILD
```

The engine is an **ES module and lands after the page script**. Anything reading
it must redraw on `eq:ready`. A banner appears after four seconds if it never
arrives, rather than leaving blank pages.

---

## Bugs that cost the most time, and what they taught

- **An unclosed `</div>` in the import card** made Score Card and Setup children
  of that card, so hiding it blanked both pages. jsdom silently repairs
  unbalanced markup; Safari does not. Eleven passing browser suites missed it.
  → `tests/structure.mjs` now reads the markup directly and asserts the div
  depth returns to zero and all four pages sit at the same depth.
- **Removing a thing removed its neighbours**, three times: `str`/`esc` went
  with the Recent block, the Recent handlers went with the card, READ IT went
  with the tool picker's wrapper. The container is never only the thing you are
  removing.
- **IPO-shaped tests gating equity features.** The payload scanner, `isV3` on
  the document panel, and `labelOf` all checked for IPO keys. Each one made a
  valid equity run look broken.
- **Verifying the wrong layer.** 321 engine tests passed while the app could not
  import anything, because none of them loaded the page. Same again when a
  prompt was "in company mode" but still carried the whole sector study.
- **`null` is not an error.** A payload that says null where a figure could not
  be established is honest and must import. Repair before validate; only a
  contradiction refuses a run.

---

## Testing

```
cd iee   && node tests/run-tests.js      # 358 engine assertions
cd /home/claude && node structure.mjs    # markup balance — run this first
                   node readit.mjs sectorpdf.mjs solo.mjs integrate.mjs \
                        binding.mjs twopage.mjs top3strict.mjs screened.mjs
```

The browser suites drive jsdom: import payloads, press buttons, build documents.
`structure.mjs` is the one that catches what jsdom hides.

---

## Open work

**Analytics expansion, agreed in tiers, not started.**

- **Tier 1 — compute in the app.** From a price series: SMA 20/50/100/200, RSI,
  MACD, Bollinger, momentum, Hull MA, PSAR, support/resistance, trend, 20-day
  high breakout. Deterministic; same payload, same numbers.
- **Tier 2 — needs volume.** Volume analysis, spike confirmation, Renko, OBV.
- **Tier 3 — already in the 52 components.** The multibagger model needs
  surfacing as a named dashboard, not building.
- **Tier 4 — argued against.** Sector rotation needs many sectors priced on the
  same dates; sectors are researched one at a time, so it would compare stale
  snapshots and look authoritative while being wrong.

**The data constraint, and the way through it.** The app cannot fetch prices:
static PWA, and NSE and Yahoo both block browser-origin requests. Asking a model
to transcribe 250 daily closes fails often — `priceHistory` already does, which
is why it is non-fatal. The agreed approach is **52 weekly closes plus the
daily-derived figures that matter**: 52-week high and low with dates, distance
from the 200-day average, the 20-day high, average daily volume and the latest
spike ratio. Under 100 numbers, most of them quoted figures rather than a
transcribed series.

**Also open:** final PDF page counts have never been verified — the packer runs
in a browser and cannot be measured here. Ink coverage went from 4.5% to 15.2%
on the sector report after the type scale and packer changes, but the page count
needs a device to confirm.

---

## Conventions

- Dates are **DD-MM-YYYY** everywhere, including the build number.
- Never claim something is verified that has not been run.
- Say plainly when something cannot be reproduced, rather than guessing at a fix
  and calling it done.
