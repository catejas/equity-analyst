# Changelog

## v1.0 — 2026-09-02
Initial Claude handover specification.
Established:
- product mission
- research methodology
- scoring/ranking
- data integrity
- PWA UX
- technical architecture
- QA
- roadmap
- persistent project-memory protocol

## v0.1.0 — 2026-09-02
Audited the handover package: 13 specification documents, no codebase.

Added:
- Scoring engine implementing all four 100-point pillars and the weighted
  overall score, with sector weight overrides and coverage tracking.
- Ranking engine: Top 3, Top 10, full universe, four research lenses,
  deterministic tie-breaks, and the red-flag kill switch with stated reasons.
- Multibagger arithmetic for 3x/5x/10x across all four horizons.
- Data-integrity layer: DataPoint provenance envelope, evidence labels, source
  tiers, basis and period mixing guards, confidence grading.
- Provider adapter layer with an unconfigured default that reports unavailability.
- Installable mobile-first PWA shell with the six specified sections, offline
  application shell, and an in-browser engine self-check.
- Test suite: 40 assertions covering the QA protocol calculation, ranking and
  research-integrity areas. All passing.

Fixed:
- Kill switch rejected valid non-severe risk categories. Flag taxonomy separated
  from the kill-switch category set.

Known limitations:
- No market-data provider connected. Research runs are blocked by design.

## v0.2.0 — 2026-09-02
Added:
- Financial metrics engine: growth and CAGR, margins, ROE, ROA, ROCE, ROIC,
  incremental ROIC, leverage, working capital and the cash conversion cycle,
  cash flow and accruals, valuation multiples, and banking metrics. Sector
  applicability rules withhold ROCE and EV multiples from banks and NBFCs.
- Research payload schema and strict validator.
- Prompt builder generating a copyable research prompt from the live engine
  constants.
- Report builder computing scores, ranks, upside, margin of safety, scenario
  asymmetry and confidence from an imported payload.
- Printable report view and Save as PDF.
- Prompt, import and report flows wired into the PWA.
- A clearly labelled synthetic example payload for testing the import.

Changed:
- Horizon labels now read as sentences.
- The dashboard no longer says research is blocked, because the prompt and
  import route works without a data feed.

Tests: 114 assertions, 0 failures.

## v0.3.0 — 2026-09-02
Added:
- Valuation engine: WACC, DCF on free cash flow to the firm with both terminal
  methods, mid-year convention, a two-way sensitivity grid, reverse DCF for
  implied market expectations, and probability-weighted scenario blending.
- Technical engine: SMA, EMA, Wilder RSI, MACD, ATR, Bollinger, OBV, relative
  strength, 52-week range position and swing support and resistance, combined
  into an entry-context summary that carries its own caveat.
- Persistence: saved runs, watchlist and thesis-breaker monitoring, on a wrapped
  storage layer that degrades to memory rather than failing.
- Run comparison producing the mandatory "What Changed?" and "Why?" sections,
  with attribution to the pillar that moved and an explicit refusal to attribute
  when the payloads cannot support one.
- Optional payload blocks for financials, price history and DCF assumptions,
  which feed the metrics, technical and valuation engines and render in the
  report.
- History, Watchlist and Alerts views wired to real data.

Fixed:
- Relative strength and MACD reported differences that did not match their own
  displayed components. Components are now rounded before subtraction.

Tests: 171 assertions, 0 failures.

## v0.4.0 — 2026-09-02
Added:
- Anchored rubrics for all 52 scored components, four bands each, every band
  tied to an observable and every rubric carrying a measurable threshold.
- Evidence gating: a rating without a supporting sentence does not count.
- Driver-based forecast model. Revenue from volume and realisation by segment,
  cost structure, depreciation on a rolling block, working capital from days,
  capex, debt schedule, tax, and both FCFF and FCFE, with fully diluted shares.
- Five reconciliation checks per forecast year, reported not hidden.
- Driver sensitivity with a standard flex set, ranked by effect on earnings.
- Ranking noise band: scores within 3 points tie, and the band does not chain.

Changed:
- Methodology version 2.0.0. Scores from 1.x are not comparable.

Tests: 209 assertions, 0 failures.

## v0.5.0 — 2026-09-02
Added:
- Forensic engine: Beneish, Altman (emerging-market and manufacturing variants),
  Piotroski, Montier, Sloan accruals, plus the tests that catch Indian frauds —
  cash yield against the deposit rate, cumulative cash against cumulative profit
  over a decade, capex against depreciation, related-party intensity, contingent
  liabilities, effective tax rate, other income share, standalone against
  consolidated, receivables against growth, and the pledge test. Twelve
  disclosure findings weighted alongside them.
- Litigation register battery: 22 registers with how to find each, searched per
  subject, nil results recorded, unreachable registers reported as unknown.
- Kill switch widened: forensic and litigation findings, missing forensic work,
  missing litigation search, and thin essential-register coverage all bar the
  Top 3.
- Payload schema v2: ratings as objects with evidence, driver model, forensic
  inputs, litigation searches, consensus, liquidity, ownership, base rates,
  upgrade triggers, bear case, management questions and conflict log.
- Report builder v2: runs the forensic battery, assesses register coverage,
  builds and values the driver model, computes consensus deltas and liquidity.
- Prompt builder v2: ships the anchors, the register battery, the search
  strategy and the source tiers, all generated from the engine's constants.
- Shared v2 test fixtures.

Tests: 274 assertions, 0 failures.

## v0.6.0 — 2026-09-03
Named Equity Analyst throughout. English only.

Added:
- Chart module: fourteen inline-SVG types, numbered figures with source lines,
  and a stated absence wherever the data is not there.
- Payload and prompt v3 carrying every research area doc 01 makes mandatory.
- Sector Research Report rebuilt so the segment leads and the companies follow.
- Company Research Report with a segment backdrop, snapshot, numbered theses,
  the moat argued, management with its guidance record, capital allocation,
  mispricing concerns each answered, peers and ESG.
- Executive Summary carrying the backdrop, the policy and programme tables and
  the bear case for each of the Top 3.
- Import audit v3: 67 rows across thirteen groups.
- Segment taxonomy with 41 segments and 393 searchable entries, type-ahead.
- Company mode.
- New icon set with a maskable variant.

Removed:
- The Gujarati edition, in full.
- The fetched-list workflow, the grey-market machinery, the listing-outcome
  tracker and the old IPO scoring worksheet.
- The IPO framework prompt template, 1,682 lines, superseded by the engine.

Tests: 296 assertions, 0 failures.

## v1.0.0 — 2026-09-03
Tested against real research payloads for the first time. Three bugs found, all
of which had reached the page.

Fixed:
- **Explicit null was treated as a type error.** The prompt tells the researcher
  to use null where something could not be established, so an honest payload was
  rejected while one that quietly dropped the key passed. Absent and explicitly
  null now behave identically: both a stated gap, never an error. This was found
  on the first real payload and it would have blocked most real runs.
- **`[object Object]` printed into an exclusion reason.** The litigation caveat
  joined register objects rather than their names, and the string reached the
  report.
- **Thin research outranked thorough research.** A company with one rating and
  20% coverage ranked first, ahead of two companies researched at 95%, because
  the missing weights are renormalised away. Coverage is now a precondition for
  comparison rather than a tiebreak: every company that clears the floor sorts
  above every company that does not, whatever the scores say.

Changed:
- The prompt now asks for the payload in one fenced json block as the last thing
  in the reply, so the chat interface gives it a copy button, with the marker
  lines kept as a fallback for interfaces that cannot render a block, and a
  CONTINUE convention for a payload cut short by a length limit.
- Build handling matches the sibling app: one line in `index.html` and one in
  `sw.js`, and the cache name carries the build so a new build cannot be served
  from an old cache.

Added:
- `EQUITY_ANALYST_FRAMEWORK.md`, generated from the engine so it cannot drift.
- `README.md` and `VERSION.md`.

Tests: 311 assertions, 0 failures.
