# Project Context

## Locked Product Decisions
- Horizons: 1–3, 3–5, 5–10, 10+ years
- Universe: entire Indian listed universe, including microcaps where data quality/liquidity permit
- Risk: balanced institutional risk
- Multibagger: 3x/5x/10x separately
- Styles: value, GARP and growth depending on sector/company
- Results: Top 3 + Top 10 + full screened universe
- Discovery: top-down + bottom-up hybrid
- Value chain: direct + indirect + second/third-order beneficiaries
- Severe red flags: hard exclusion from Top 3
- Valuation: bear/base/bull plus sensitivity/Monte Carlo where appropriate
- Forecast: five-year driver-based model for Top 3
- Technicals: integrated for entry context
- History: approximately 10-year financial history, 5-year price/technical history where available
- Recent developments: approximately 12–24 months
- Forecast: 5 years
- Structural view: 10 years
- Market expectations/variant perception: mandatory
- Sector-aware metrics and valuation: mandatory
- Evidence/source hierarchy: mandatory
- Thesis breakers: mandatory for Top 3

## Core Research Lenses
1. Best Business
2. Best Investment Today
3. Highest Multibagger Potential
4. Best Value/GARP Opportunity

These may produce different companies.

## Persistent Research Memory
Maintain:
- research history
- prior rankings
- methodology version
- evidence
- contradictions
- open questions
- monitoring items
- thesis
- thesis breakers
- changes since previous run

Never fabricate missing data.

## Implementation State (v0.1.0, 2026-09-02)
- No codebase was supplied with the handover. The application starts here.
- Built and tested: scoring engine, ranking engine with red-flag kill switch,
  multibagger arithmetic, data-integrity layer, installable offline PWA shell.
- Not built: everything downstream of a market-data feed.
- No market-data provider is connected. The app blocks research runs and states
  why, rather than displaying synthetic or placeholder figures.
- Methodology version 1.0.0. Every score carries this version.

## Open Questions
- OQ-001 Which market-data provider, on which licence tier, at what budget.
- OQ-002 Management and governance are double-counted at roughly 14% of the
  overall score. Keep as specified, or de-duplicate.
- OQ-003 Financial quality, technical entry and catalysts need component rubrics.
- OQ-004 Confirm 15 years as the modelling horizon for "10+ years".

## Research Workflow (v0.2.0)
1. Enter a segment in Research and generate the prompt.
2. Run that prompt in an assistant that can search the web.
3. Save its reply as a .json file.
4. Import the file. The app validates it, scores it, ranks it and renders a
   report you can save as PDF.

The app never trusts a score in the payload. It recomputes everything.

## Open Questions
- OQ-005 The IPO Analyst payload schema was not available from this project's
  memory, so the schema here was designed from the described workflow. If the
  two should be interchangeable, the IPO Analyst schema needs to be supplied.
