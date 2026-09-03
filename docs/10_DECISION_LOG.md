# Decision Log

DEC-001 — Support 1–3, 3–5, 5–10 and 10+ year horizons.
DEC-002 — Research the entire Indian listed universe where data quality/liquidity permit.
DEC-003 — Use balanced institutional risk.
DEC-004 — Assess 3x, 5x and 10x separately.
DEC-005 — Support value, GARP and growth.
DEC-006 — Output Top 3, Top 10 and full screened universe.
DEC-007 — Use top-down + bottom-up discovery.
DEC-008 — Include direct and indirect/second/third-order value-chain beneficiaries.
DEC-009 — Severe red flags can exclude a company from Top 3.
DEC-010 — Use bear/base/bull valuation.
DEC-011 — Build five-year driver-based forecasts for Top 3.
DEC-012 — Integrate technical/volume analysis for entry context.
DEC-013 — Use long financial/price history where available.
DEC-014 — Market expectations/variant perception is mandatory.
DEC-015 — Use sector-aware scoring.
DEC-016 — Treat project documentation as persistent project memory.
DEC-017 — No codebase existed. Build from the specification rather than asking
for one. Verified by directory inspection.
DEC-018 — Phase 1 delivers the calculation engines first, because they are the
only part of the system that can be fully built and tested without market data.
DEC-019 — External data sits behind a provider adapter. Until a licensed feed is
registered, the default adapter returns explicit unavailability. No mock, sample
or placeholder market data exists anywhere in the codebase, including in tests,
where synthetic values are named TEST-* and never presented as research.
DEC-020 — Missing scoring inputs are dropped and the remaining weights
renormalised, never treated as zero. A coverage ratio travels with every score,
and coverage below 60% bars a company from the Top 3.
DEC-021 — Unscored companies sort last in ranking rather than ranking as zero.
DEC-022 — The service worker caches the application shell only. Market data is
never cached, because a stale price served as current is worse than no price.
DEC-023 — The flag taxonomy is wider than the kill-switch set. All risk flags are
recorded; only severe accounting, governance, promoter, solvency or
data-integrity flags trigger exclusion from the Top 3.
DEC-024 — No webfonts. Georgia and the system sans stack, so the shell renders
fully offline and on first paint.
DEC-025 — Numeric values are rejected at construction if they lack a source and
source tier. Tier 4 sources cannot support a FACT.
DEC-026 — Research is produced through a generated prompt and a JSON payload
imported back into the app, following the pattern established in the IPO Analyst
project. This makes the app usable before any market-data licence is bought.
DEC-027 — The payload carries judgements and evidence, never scores. The app
recomputes every score from the supplied component ratings, so the scoring
methodology cannot be rewritten by whatever produced the JSON. Any score present
in a payload is ignored.
DEC-028 — Payload validation is strict on structure and lenient on completeness.
Errors block the report entirely; gaps become warnings printed on the report.
DEC-029 — PDF output uses the browser print pipeline with a dedicated print
stylesheet, rather than a PDF library. No dependency, no CDN, works offline, and
selectable text on every device including iOS.
DEC-030 — The prompt is generated from the same constants the engine scores
with, so a change to a pillar weight changes the prompt automatically.
DEC-031 — Metric results that are arithmetically possible but economically
meaningless (P/E on a loss, ROE on negative equity, PEG without growth) are
refused with a reason rather than returned as a misleading number.
DEC-032 — Financials, price history and DCF inputs are optional payload blocks.
An omitted block costs a report section; a partial block is rejected outright.
This makes it cheaper to omit than to invent.
DEC-033 — Price history must be marked adjusted for corporate actions. An
unadjusted series is flagged, because it produces readings that are wrong rather
than merely stale.
DEC-034 — Reported figures are rounded before differences are taken, so the
arithmetic printed on the report is self-consistent. A page where 88.18 minus
23.71 reads as 64.46 undermines every other number on it.
DEC-035 — Browser storage is wrapped, never used directly. Refused or full
storage degrades to in-memory for the session and says so, rather than failing.
DEC-036 — A thesis breaker is marked observed by the user, never judged by the
app. The app records and surfaces; the person decides.
DEC-037 — Run comparison attributes a score move to the pillar that moved most,
and says the cause is not identifiable when the two payloads cannot support an
attribution.
DEC-038 — Saved runs stay on the device and are never uploaded.
DEC-039 — Every scored component carries a written anchor tied to an observable.
Ratings without anchors are unstable between runs and incomparable between
companies, which makes a ranking built on them noise presented as order.
DEC-040 — A rating must arrive with an evidence sentence of at least twenty
characters or it is treated as null. No evidence, no score.
DEC-041 — Overall scores within 3 points share a rank and are reported as tied.
Ranking to one decimal claims a precision the inputs do not have. The band does
not chain, so a ladder of small gaps cannot collapse into a single rank.
DEC-042 — The payload supplies drivers, not finished cash flows. The app builds
revenue from volume and realisation, the cost structure, working capital, capex
and the debt schedule, and computes FCFF and FCFE itself.
DEC-043 — Sensitivity runs on operating drivers, not on the discount rate.
Flexing WACC measures the model; flexing volume, realisation, margin and capex
intensity measures the business.
DEC-044 — The model reconciles itself: segment revenue sums to total, fixed
assets and debt roll forward, cash movement ties to the cash flow statement, and
the FCFE bridge holds. Five checks per forecast year, and a failure is reported
rather than hidden.
DEC-045 — Share counts are fully diluted, including ESOPs, warrants and
convertibles. Chronic omission on Indian small caps and it moves per-share value.
DEC-046 — Methodology version moved to 2.0.0. Scores from 1.x are not comparable.
DEC-047 — Payload schema v2. A payload built for v1 is rejected outright rather
than partly read, because a silently half-read contract is worse than a refusal.
DEC-048 — Forensic findings and litigation coverage feed the kill switch on the
same footing as a flag stated in the payload. A finding the app computed is not
weaker evidence than one the payload asserted.
DEC-049 — A company with no forensic block, no litigation search, or any
essential register left unsearched cannot enter the Top 3, however it scores.
DEC-050 — A forensic score is refused below four computed tests. A score built
on three checks launders an absence of work into a number.
DEC-051 — Consensus, where it exists, is compared line by line against the model
output. Where it does not exist, the report says so and falls back to the
reverse DCF against the price.
DEC-052 — Liquidity is converted into days to build a position at 20% of daily
volume, because on microcaps that is the binding constraint, not valuation.
DEC-053 — The prompt ships the rubric anchors, the register battery and the
search discipline, all generated from the engine's own constants.
DEC-054 — The product is named Equity Analyst throughout: package, repository,
manifest, headers, footers, file names and documentation.
DEC-055 — English only. The Gujarati edition was removed from the engine, the
app, the prompt and the framework. Roughly 2,300 lines came out of the renderer.
DEC-056 — Six documents: Sector Research Report, three Company Research Reports
one per Top 3 rank, Executive Summary and Score Card. The three company reports
are one builder pointed at a different rank. The Investment Summary is retired.
DEC-057 — Naming a company switches the app to Company mode: one report, a
two-page segment backdrop instead of a sector study, no universe screened and
nothing ranked. The segment stays required, because a company cannot be judged
without its industry, its policy regime and its peers.
DEC-058 — Charts are inline SVG written for this app, not a library. html2canvas
rasterises SVG faithfully at the 4x scale the PDF pipeline uses; a canvas library
would export soft at 600 DPI and a font-based one would need a network.
DEC-059 — Every figure carries its own number and source line. A figure without
a source is an assertion.
DEC-060 — A chart with no data returns a stated absence, never an empty frame.
Same discipline as a refused rating.
DEC-061 — The Sector Research Report leads with the segment and follows with the
companies. It previously opened on a funnel and a scoring table, which asked the
reader to accept a ranking before giving them a reason to care about the segment.
DEC-062 — Payload schema v3 carries the research doc 01 makes mandatory: global
context, macro, the Union Budget announced against spent, the Economic Survey,
policy schemes, regulation, geopolitics, industry, value chain, TAM, programmes
traced to listed suppliers, competition, sector valuation, monitorables and a
glossary; and per company the snapshot, shareholding, numbered theses, moat,
management with its guidance record, capital allocation, mispricing concerns,
peers and ESG. None of it changes a score, which is pinned by a test.
DEC-063 — Absent research is a stated gap on the page, never a silent omission.
A payload with no research at all still builds a report, and prints what is
missing.
DEC-064 — Page counts are ceilings. The packer distributes blocks across seeded
shells at print time and drops the shells nothing lands on, so a thin run
shortens by itself.
