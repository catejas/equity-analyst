# Current-State Inventory — v0.3.0 (2026-09-02)

## What was supplied
13 specification documents (~2,471 words). No application, no source code, no
configuration, no data. Verified by directory inspection, not assumed.

## What now exists

| Module | File | State | Verified by |
|---|---|---|---|
| Scoring engine | src/core/scoring.js | Complete to doc 04 | 13 tests |
| Ranking + kill switch | src/core/ranking.js | Complete to doc 01 / DEC-009 | 9 tests |
| Multibagger arithmetic | src/core/multibagger.js | Complete to doc 04 | 6 tests |
| Data integrity | src/core/integrity.js | Complete to doc 05 | 7 tests |
| Provider adapter | src/data/provider.js | Interface only, no live feed | 3 tests |
| PWA shell | index.html, app.css, src/ui/app.js | Six sections, offline-capable | Manual |
| Service worker | sw.js | Shell cached, API responses never cached | Manual |
| Manifest + icons | manifest.webmanifest, icons/ | Installable | JSON parse, files present |

Test suite: 40 assertions, 0 failures. Run with `node tests/run-tests.js`.

## Not built
Everything that requires market data: universe discovery, screening, financial
analysis, forensic analysis, valuation, technicals, reports, watchlist
persistence, history diffing, alerts. These are blocked on a data feed, not on
engineering effort.

## Defect found and fixed during this build
The kill switch initially rejected any risk flag outside the five severe
categories, so a legitimate moderate regulatory flag threw an error instead of
being recorded. The flag taxonomy is now separate from the kill-switch set: all
flags are recorded and scored, but only severe accounting, governance, promoter,
solvency or data-integrity flags bar a company from the Top 3.

## Spec observations recorded, not resolved
1. Management and governance are scored inside Business Quality (doc 04: 10 + 10)
   and again as a separate 10% overall dimension. They therefore carry roughly
   14% of the total score. Left exactly as specified; flagged for a decision.
2. The 10+ year horizon has no fixed year count. Modelled as 15 years for CAGR
   arithmetic, and configurable.
3. Doc 04 defines rubrics for four pillars, but the overall score has eight
   dimensions. Financial quality, technical entry and catalysts currently take a
   single 0-100 input each and need their own component rubrics.


## Added since v0.1.0
Metrics, valuation, technicals, payload schema and validator, prompt builder,
report builder, printable report, persistence, and run comparison. 171 tests.

## Still blocked on a market-data licence
Automated universe discovery and screening, live prices, automatic corporate
action handling, scheduled refresh, and any monitoring that runs without a
person looking at it. Everything else now works through the prompt and import
route.

## Roadmap position
Phases 1 and 3 through 9 are built in the form that does not need a live feed.
Phase 2 (universe) and the automated half of Phase 9 remain blocked. Phase 10
was not started.
