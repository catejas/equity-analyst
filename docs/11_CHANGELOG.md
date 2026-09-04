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

## v1.0.1 — 2026-09-03
A real 165 KB PSU banking payload could not be imported. Three defects, all
found by that one file.

Fixed:
- **Null at leaf level was still a type error.** The block-level rule was
  already right, but the leaf checks were not: a macro reading with no value, a
  budget line with no figure, an unverifiable market size, a disclosure check
  never performed, an empty consensus block and a liquidity block with no traded
  value all produced errors. Thirty-six of them on one honest payload. Every one
  is now a stated gap.
- **An empty block was read as populated because its shape was there.** A
  consensus block of nested objects whose every leaf is null is an honest way of
  saying no consensus exists; the emptiness check only looked one level deep.
  It now looks at any depth.
- **When no company cleared the kill switch, the sector report contained no
  company analysis at all.** On the payload that surfaced this, all three banks
  were correctly barred for having no register search, and the theses, the
  mispricing work and the management guidance record were silently discarded.
  The kill switch decides whether a company may be recommended, not whether it
  may be discussed. The leading companies are now covered in full with the bar
  stated against each. The sector report on that payload went from 19 sections
  and 5 figures to 56 sections and 18 figures.

Changed:
- The Import panel described the marker-line format as primary. It now describes
  the fenced json block, which is what the prompt asks for and what carries the
  copy button.
- The framework document leads with how null is treated, because that was the
  thing a researcher most needed to know and could not find.

Tests: 321 assertions, 0 failures.

## v1.0.2 — 2026-09-03
The import was broken in the browser and every engine test still passed, because
the tests never loaded the page. The app is now run in a real DOM as part of
testing, which found five faults in one pass.

Fixed:
- **A deleted function was still referenced**, `window.gmpFirstSeen`, left behind
  when the grey-market code came out. It threw at load and killed the rest of
  the script, which is why the Setup page showed no build number and why the
  import button did nothing. One line, and it disabled half the application.
- **The payload scanner did not recognise an equity payload.** It looked for
  `schema`, `score_lines`, `meta`, `verdict` or `recommendation` — all IPO keys.
  A complete 165 KB equity payload scanned as zero candidates, so the app fell
  back to scraping the report prose and reported "No data block found".
- **The reader and `parseImport` had the same blind spot** and are now told what
  an equity payload looks like in one place: `run` plus `companies`.
- **The scoring worksheet crashed the review.** `labelOf` and `maxOf` index into
  a table a block was removed from, so every lookup ran off the end. Both are
  now defensive, and the worksheet is skipped entirely for an equity payload,
  which is scored by the engine.
- **The segment picker died silently if its taxonomy had not loaded.** The
  handlers were skipped at bind time rather than looking the list up when used.

Added:
- `tests/` browser tests: the page is loaded in jsdom, the payload is pasted,
  READ IT and SAVE are clicked, every tab is opened and every picker exercised.
  This is what should have existed before the package was called ready.

Tests: 321 engine assertions plus the browser flow, 0 failures.

## v1.0.3 — 2026-09-03
A real two-part run on the phone. The import worked; the save did not.

Fixed:
- **"high" was not accepted as a severity.** The payload used the ordinary
  English words — high, medium, minor, critical — and the validator rejected the
  whole 165 KB file because it wanted low, moderate or severe. That is pedantry
  dressed as rigour. Unambiguous synonyms are now read and normalised in place,
  so a red flag written as "high" still trips the kill switch. A word that is
  genuinely not a severity is still an error, and now names one field rather
  than repeating itself once per array position.
- **The first block of a split reply was called invalid.** A reply sent in two
  messages carries the segment work first and the companies after; the app said
  "payload.companies must be a non-empty array", which sends the reader hunting
  for a fault that is not there. That block is now saved as a partial run,
  carrying all the segment research, and the app says to reply CONTINUE and
  merge the rest with Add To This Analysis.
- **The rejection dialog repeated itself.** Six lines saying the same thing
  about six array positions tell the reader one fact, not six. Repeated errors
  are collapsed to one line with a count.

Tests: 328 engine assertions plus the browser flow, 0 failures.

## v1.1.0 — 2026-09-04
The validator could raise 109 distinct rejections. Most were shape problems no
person could reasonably be asked to avoid by care alone, and any one of them
cost the whole run.

Added:
- **A repair pass, ahead of validation.** A list sent as a single item, a single
  item sent as a list, numbers written as text, a price written as "1,234.50",
  a source tier written as "Tier 1", a disclosure written as "no", a probability
  given as 25 rather than 0.25, three probabilities that sum to 0.99, a
  financial row that omits the basis its series already states, a price series
  of the wrong length, a guidance entry with only half the pair. All read and
  reported, none fatal. Every repair is printed as "Read as written: …" so
  nothing is changed silently.
- **A pre-flight check in the prompt** listing only what cannot be repaired,
  because fixing it would mean deciding what the writer meant. Ten items, each
  one a thing a person can actually check.
- **A block plan.** A three-company run is about 150,000 characters, past what
  most chat interfaces emit in one reply, so the prompt now asks for the segment
  in one block and each company in its own, all sharing the same run object. The
  application merges them and nothing is overwritten. One company at full depth
  fits in a single block; three does not, and pretending otherwise produced the
  cut-off replies.

Changed:
- What was refused and is now repaired: a mismatched price series is set aside
  rather than fatal, an unanswered mispricing concern is set aside with the
  reader told to answer it, a half-written guidance entry is set aside since it
  only means anything as a pair, and an unreadable disclosure becomes unknown
  rather than an error.
- Still refused, because repairing would change meaning: a bear case above a
  bull case, probabilities that are nowhere near summing to one, a severity that
  reads as nothing, an unknown register or flag category.

Tests: 337 engine assertions plus the browser flow, 0 failures.

## v1.2.0 — 2026-09-04
The Report page rebuilt as four independent runs, and the reason no PDF ever
appeared.

Fixed:
- **The document panel was hidden after every equity import.** It was gated by a
  test for `meta`, `verdict` or `score_lines` — all IPO keys — so a perfectly
  good equity run left the whole panel invisible. This is why no report could be
  generated, and it had nothing to do with the payload.
- **The page header and footer crashed on every document**, reading
  `meta.short_name` and `meta.analysis_datetime` from a block equity payloads do
  not have.
- **The Score Card printed two different scales as a fraction.** "82  5" was a
  0-100 rating beside a weight. Every line now reads points earned against
  points available — a line weighted 5 and rated 82 earns 4.1 of 5 — and an
  unrated line removes its points from the denominator rather than counting as
  zero. The four pillars carry 70 points and the four other dimensions 30, and
  the page now says so instead of printing "64.5/100" over a card summing to 30.
- The forensic tile said "Unscored" with no reason; it now says how many tests
  ran against the four needed. The coverage tile no longer contradicts itself.
- `scrollIntoView` is guarded: it is missing in some webviews and was aborting
  the import in them.

Changed:
- **Four independent runs.** The segment is researched alone and names its Top 3
  in `run.top3`; each company is then researched alone in its own box with its
  own search, import, delete and report. Every reply fits one code block with a
  working copy button, which the single 150,000-character payload never did.
- Documents are built from the composed run, so the sector report sees the
  companies and each company report sees the segment backdrop.
- Each box is titled by what it holds: the segment box by segment and
  subsegment, each company box by that company.
- Delete per box. Deleting the segment takes its companies with it rather than
  orphaning them; deleting a company leaves the rest untouched.
- Removed: the Recent picker, the "All 28 score lines" footnote, the tool picker
  when detection succeeds.

Tests: 337 engine assertions plus browser tests that import four runs, build all
six documents and delete a company.
