# Critical Review — What Stands Between This and Institutional-Grade Research

Written against the v0.3.0 build and the handover specification, and against how
Bernstein, Redburn, Autonomous and the better buy-side desks actually work.

The build is sound engineering. The research model is not yet institutional. The
gap is not effort — it is that the specification asks for a *scored checklist*
where top-tier research produces a *falsifiable financial argument*. This
document says where that bites and what to change.

---

## PART A — THE THREE THINGS THAT MATTER MOST

### A1. The scoring system is precision without accuracy

The engine asks for 47 pillar component ratings plus 4 dimensions, each 0–100.
Nothing anchors those numbers to anything observable. "Moat: 78" is a feeling
with two significant figures. Two consequences follow, and both are fatal to a
ranking product:

- **Ratings will not be stable.** The same company researched twice will score
  differently by 10–20 points, because nothing pins the scale. A ranking built
  on unstable inputs is noise presented as order.
- **Ratings will not be comparable across companies.** A rater generous with one
  company and strict with the next produces a ranking that reflects the rater's
  drift, not the companies.

**Fix — anchored rubrics.** Every component gets 3–5 written anchors tied to
observables. Pricing power, for example:

| Score | Anchor |
|---|---|
| 85–100 | Raised realisations above input-cost inflation in 4 of the last 5 years; gross margin flat or up through a full input cost cycle |
| 60–84 | Passed through most cost inflation with a 1–2 quarter lag; margin recovered |
| 35–59 | Passed through partially; margin permanently reset lower after the last cycle |
| 0–34 | Price taker; margin tracks the input commodity with no lag or buffer |

The prompt carries the anchors. The payload carries, for each rating, the
**evidence sentence and the anchor band chosen**. The app prints the anchor
beside the score. A rating with no evidence sentence is treated as null.

**Fix — a noise band.** Two companies whose overall scores differ by less than
the measured rating noise are reported as tied, not ranked. Until noise is
measured, treat 3 points as the floor. Ranking to one decimal implies a
precision that does not exist.

**Fix — stability test.** Re-running the same segment should not move a rating
more than 10 points without a stated cause. The comparison engine already
computes this; it should flag unexplained drift as a data-quality warning rather
than reporting it as news.

### A2. There is no earnings model, and that is the whole job

The payload currently accepts `explicitFcff` — a finished array of cash flows.
That outsources the analyst's entire craft to a black box and then runs a
sensitivity on WACC and terminal growth, which is where amateur DCFs put it.

Top-tier research does not hand over cash flows. It builds:

```
volume or units  ×  realisation or ASP        →  revenue by segment
revenue  −  cost structure (fixed / variable) →  EBITDA
                                              →  D&A, interest, tax  → PAT
                                              →  working capital, capex → FCF
```

**Fix — the payload carries drivers, the app builds the model.** Replace the
`dcf` block with a `model` block:

```
segments[]: { name, base_volume, volume_cagr, base_realisation, realisation_cagr,
              gross_margin_path[], evidence, source }
opex: { fixed_base, fixed_growth, variable_pct_of_revenue }
capex: { maintenance_pct_of_revenue, growth_capex_schedule[], asset_turn }
working_capital: { receivable_days, inventory_days, payable_days, path }
financing: { debt_schedule[], rate, tax_rate }
shares: { basic, diluted, esop_outstanding, warrants, convertibles }
```

The app then computes revenue, EBITDA, PAT, FCFF, FCFE and the full three-
statement bridge, and runs sensitivity **on the drivers that matter** — volume
growth, realisation, gross margin, capex intensity — not on the discount rate.
A 200bp move in WACC is not an insight. A 300bp miss on terminal margin is.

This is the single largest upgrade available and it is entirely within the app's
control, because it is arithmetic.

**Fix — three-statement consistency is machine-testable.** The app should
verify: segment revenue sums to total; the balance sheet balances; the change in
cash equals CFO + CFI + CFF; PAT flows to reserves net of dividend; debt roll-
forward ties. No LLM report on the market does this. It is a decisive
differentiator and it is a few hundred lines of code.

### A3. Consensus is entirely absent, so there is no variant perception

Doc 03 makes variant perception mandatory, and the current implementation asks
for prose: "what the market believes." That is an assertion, not an analysis.

Real variant perception is arithmetic:

> Consensus FY28 EPS ₹42. We model ₹57, 36% above, driven by a gross-margin
> path consensus has not modelled because it assumes the import-duty relief
> lapses. If we are right, the stock re-rates on the FY27 result.

**Fix.** The payload must carry `consensus`: estimate count, mean and range for
revenue, EBITDA and EPS for the next two years, the source and date, and the
recent revision direction. The app computes our-versus-consensus deltas and
prints them. Where consensus does not exist — true for most microcaps — the app
must say *no consensus exists, so the variant perception is against the price
alone*, and lean on the reverse DCF instead. That is honest and still useful.

---

## PART B — FRAMEWORK AND SEARCH STRATEGY

### B1. Port the IPO framework's search discipline wholesale

Three rules in the IPO framework are the best things in it and are missing here:

1. **Search for a document; never construct its URL.** Reach it by
   `site:nseindia.com "<company>" annual report`, the register's own search, or
   a named search. Fetch a bare URL only when a person, a search result or an
   already-open page gave it to you.
2. **A failed fetch is not a finished search.** A 404 says something about one
   address and nothing about the company. Re-search by name, then work the other
   sources carrying the same fact, and only then record the absence.
3. **Record the searches that found nothing.** An empty list is not evidence
   that nothing exists. The payload carries `searched[]` per register.

### B2. A named search battery per section, with minimums

The current framework describes what to research. It does not say how to find
it, so the model does what is easy. Specify, per section, the query patterns:

- Filings: `site:nseindia.com "<company>"`, `site:bseindia.com "<company>"`,
  `"<company>" annual report FY25 filetype:pdf`, `"<company>" investor presentation`
- Transcripts: `"<company>" earnings call transcript Q<n> FY<yy>` — and
  **read the last eight**, plus the last four of the two closest peers for
  read-across. This is what separates real research from desk research.
- Regulator: `site:sebi.gov.in "<promoter name>"`, `site:sebi.gov.in "<company>"`
- Ratings: `site:crisilratings.com "<company>"`, and the same for ICRA, CARE,
  India Ratings, Brickwork, Acuité
- Industry: the sector regulator by name (CEA, PNGRB, TRAI, IRDAI, DGCA, NHAI,
  FSSAI, CDSCO), the industry association, and the government dataset

Set a floor: no company enters the Top 3 on fewer than 25 searches, and the
count is recorded.

### B3. Cross-verification rule

Any material figure needs **two independent sources** or it is labelled
single-source and its confidence is capped at Medium. A number that appears in
Screener and in the annual report is verified. A number that appears in three
aggregators all scraping the same filing is one source, not three.

---

## PART C — DATA SOURCES

The current policy names tiers but almost no specific Indian sources, so the
model reaches for whatever a general search returns. Name them.

**Tier 1 — primary.** NSE and BSE corporate announcements and filings, SEBI
(orders, settlement orders, SCORES, LODR filings, informal guidance), RBI DBIE,
MCA21 (master data, index of charges, DIN, disqualified directors), annual
reports, audited standalone and consolidated financials, investor presentations,
**earnings call transcripts**, postal ballot and EGM notices, scheme documents,
shareholding patterns, Reg 7 insider disclosures, SAST disclosures.

**Sector regulators and government datasets.** CEA for power, PNGRB for gas,
TRAI for telecom, IRDAI for insurance, DGCA for aviation, NHAI for roads, Vahan
for automobile registrations, DGFT and Tradestat for exports, GSTN, CDSCO and
USFDA for pharma, IBEF for sector overviews.

**Tier 3 — professional.** Screener, Trendlyne, Tijori, MoneyControl, Business
Standard, Mint, Economic Times, plus brokerage initiating-coverage notes where
they are public.

**Alternative data — where the real edge is.** Vahan monthly registrations,
port and shipping volumes, GST e-way bill counts, electricity generation data,
LinkedIn headcount trend, app-download ranks, satellite-observable capacity,
Google Trends for consumer names. These are the datasets a top-3 shop pays for
and most of the Indian ones are free.

**Credit ratings, including the negative signal.** An "Issuer Not Cooperating"
rating is one of the strongest red flags available on an Indian listed company
and it is publicly listed on every agency's site. It should be an explicit
check, not something the model might notice.

---

## PART D — FORENSIC AND RED FLAGS

The current build has an accruals ratio and cash conversion. That is a start,
not a forensic layer. Every one of the following is computable from published
data and each has caught a real Indian fraud.

### D1. Named composite scores
Beneish M-score, Altman Z (use Z" for emerging markets), Piotroski F-score,
Montier C-score, Sloan accruals in both balance-sheet and cash-flow forms. Print
the components, not just the total — the components are the insight.

### D2. The tests that catch Indian small-cap frauds specifically

- **Cash on the books versus interest income earned.** Large cash yielding far
  below the deposit rate means the cash may not exist. This is the single most
  productive test on Indian mid-caps.
- **Cumulative CFO versus cumulative PAT over ten years.** Profit that never
  became cash is not profit. One year proves nothing; a decade proves a lot.
- **Auditor identity, tenure, and any resignation mid-term.** An auditor walking
  out before the term ends is the loudest signal on the market.
- **CARO qualifications, Emphasis of Matter, and Key Audit Matters**, read in
  full, plus any adverse ICFR opinion.
- **Related-party transactions as a percentage of revenue and of purchases**,
  and the trend. Rising RPT with rising receivables is the classic pattern.
- **Contingent liabilities as a percentage of net worth**, and guarantees given
  to related parties.
- **Promoter pledge percentage and its change**, plus any invocation.
- **Receivable days rising faster than revenue**; unbilled revenue growth;
  inventory growing faster than COGS.
- **Capitalised expenses and CWIP ageing.** Capex that never commissions is
  often capex that never happened.
- **Effective tax rate persistently below statutory** with no stated reason.
- **Other income as a share of PBT.**
- **Standalone versus consolidated divergence** — profit at the parent that
  disappears on consolidation.
- **Auditor fee versus non-audit fee** paid to the same firm.
- **Statutory dues delays** under CARO — GST, TDS, PF arrears.
- **Subsidiary and associate count, and how many are unaudited.**
- **Dividend or buyback funded by fresh borrowing.**
- **Exchange surveillance lists** — ASM, GSM, or a trade-to-trade move.

### D3. The kill switch should widen

Currently: severe accounting, governance, promoter, solvency, data integrity.
Add as severe by default: auditor resignation within the last 24 months, an ICFR
adverse opinion, an Issuer Not Cooperating rating, promoter pledge above 50%
with a falling price, and a SEBI debarment or ongoing enforcement action against
the promoter.

---

## PART E — LITIGATION AND REGULATORY

Port the IPO framework's register battery in full and extend it for listed
companies. Every register searched against **the company, each promoter
individually, and each material subsidiary**, with nil results recorded:

Indian Kanoon · e-Courts and NJDG · NCLT · NCLAT · IBBI · SEBI enforcement and
settlement orders · SEBI debarment list · MCA master data, index of charges and
DIN disqualification · CESTAT · ITAT · state GST appellate portals · NCDRC ·
EPFO · dated media search.

Listed-company additions the IPO version does not need: exchange LODR
non-compliance filings and penalties, ASM/GSM and surveillance actions, credit
rating actions including withdrawal and non-cooperation, ED and FEMA matters,
income-tax search or survey disclosures, and any class action or overseas
regulatory action where the company has foreign operations.

The report prints a **Registers searched** table, marks an unreachable register
in red, and names the registers never searched. Where nothing was recorded, the
section says so in place of the table.

---

## PART F — FINANCIAL STATEMENTS

### F1. Ten years, not three, and quarterly for the recent two
The specification says roughly ten years. The payload currently has no place to
put them. Add `financials.annual[]` for ten years and `financials.quarterly[]`
for the last eight, both with basis and period on every row. Ten years is what
reveals a cycle; three years is what a promoter shows you.

### F2. What is missing from the metric set

- **Segment-level revenue, EBIT and capital employed**, with segment ROCE.
  Group averages hide the business that matters.
- **DuPont decomposition** of ROE into margin, turnover and leverage, over ten
  years — the honest way to see whether returns come from operations or debt.
- **Lease-adjusted metrics.** Ind AS 116 moved leases onto the balance sheet;
  lease liabilities belong in net debt and lease payments distort EBITDA and
  CFO. Both adjusted and unadjusted figures should be shown.
- **Fully diluted share count** including ESOPs outstanding, warrants and
  convertibles. Chronic omission on Indian small caps and it moves per-share
  value materially.
- **Goodwill and intangibles as a share of net worth**, and any impairment.
- **Maintenance versus growth capex split**, so owner earnings can be computed.
- **Return on incremental invested capital over rolling five-year windows**, not
  a single pair of endpoints.

### F3. Sector models the current build lacks
The methodology names banking, NBFC, insurance, manufacturing, commodity,
pharma, IT, infrastructure and defence. Missing and needed for a full listed
universe: real estate (pre-sales, collections, net debt to operating cash flow,
inventory of unsold area), hotels (RevPAR, ARR, occupancy), retail (same-store
sales growth, sales per square foot, store economics and payback), telecom
(ARPU, subscriber churn, capex intensity), utilities and power (PLF, merchant
versus PPA mix, regulated equity, receivable days from discoms), capital goods
(order book to bill, execution cycle), chemicals (capacity utilisation, product
mix, China plus one exposure), FMCG (volume versus value growth, distribution
reach, advertising to sales), autos and ancillaries (content per vehicle,
customer OEM mix), and asset management (AUM mix, yield, flows).

---

## PART G — CASH FLOW

The current treatment is FCF equals CFO minus capex. Institutional treatment:

- **CFO to EBITDA over a five-year average**, not one year.
- **Cumulative CFO versus cumulative PAT over ten years** as a headline figure.
- **FCFF and FCFE stated separately**, with the bridge between them.
- **Working capital absorbed per rupee of incremental revenue** — this is what
  reveals growth that consumes more cash than it creates.
- **CFO before and after working capital movement**, shown separately.
- **Where interest paid sits.** Ind AS permits interest paid in operating or
  financing; putting it in financing flatters CFO and comparability. State which
  and normalise.
- **Lease payments** post Ind AS 116 flatter both EBITDA and CFO. Adjust.
- **Cash conversion cycle trend over ten years**, not a point reading.
- **Dividends received from associates** treated separately from operating cash.
- **Capex versus depreciation over a decade** — persistent capex below
  depreciation is a business quietly liquidating itself.

---

## PART H — OUTPUT AND REPORT CONTENT

### H1. Sections the reports currently lack

- **Thesis in three falsifiable lines**, at the very front.
- **Consensus versus our numbers**, with the delta and the reason.
- **Price target with method, horizon and the path** — what has to happen and
  by when.
- **Liquidity and position sizing.** Average daily traded value, impact cost,
  days to build and to exit at 20% of ADV, and the maximum sensible position.
  The specification explicitly includes microcaps, where this is the binding
  constraint, and the current build says nothing about it.
- **Ownership and flows.** Promoter, FII, DII and mutual fund holdings quarter
  over quarter, bulk and block deals, insider buying and selling. Promoters
  buying in the open market is among the most informative public signals there
  is.
- **Base rates.** Of Indian companies that grew earnings above 25% for three
  years, what share sustained it for five more? The IPO app does exactly this
  for listing gains. The equity version anchors every growth assumption against
  history instead of against optimism.
- **The bear case argued properly, then answered.** Real research states the
  strongest opposing argument in its own best form and then says why it is
  wrong. The current SWOT does not do this.
- **What would make us upgrade**, alongside the thesis breakers. Only having
  downside triggers biases the product.
- **Key questions for management**, ported from the IPO app.
- **Quantified risks.** Each risk with a probability and an EPS or valuation
  impact, not an adjective.
- **Debt maturity ladder and covenant headroom**, and a refinancing stress test.
- **Macro sensitivity** — the beta of earnings to rates, the rupee, crude and
  the key input commodity.
- **A data conflict log**, where sources disagree and which was preferred.
- **A source audit table** with tier and date per block, ported from the IPO
  app, which does this well.

### H2. Document set

Keep the five documents and the same generator. Map them to the run:

| Document | Content |
|---|---|
| Institutional Research Report | Industry map, funnel, macro and policy, value chain, full treatment of the Top 3, comparison table across the Top 10 |
| Company Research Report | One company at full depth, chosen from the run |
| Executive Summary | The run: verdict, Top 3, lenses, key risks |
| Score Card | One company, all component ratings with anchors and evidence |
| Investment Summary | Two pages, Top 3, for circulation |

The Company Research Report and Score Card need a company picker within the run.
That is the one interface addition the switch from IPO to segment forces.

---

## PART I — PROCESS AND QUALITY CONTROL

1. **A separate bear pass.** Run the thesis, then run a second prompt whose only
   job is to destroy it, and merge. One pass produces confirmation bias by
   construction.
2. **Automated reconciliation** at import: segments sum to total, balance sheet
   balances, cash movement ties, debt rolls forward, per-share figures tie to
   the share count. Reject or flag on failure. No competing tool does this.
3. **Peer table measured by filled cells**, not by columns present — ported from
   the IPO app, where a table of dashes passed every check.
4. **Confidence per section**, not only per company.
5. **A completeness audit** printed after the payload, with every empty field
   justified by a line in `sources.missing`.
6. **Two-run rating stability** reported as a data-quality measure.

---

## PART J — WHAT TO DO FIRST

In order of value per unit of work:

1. Anchored rubrics with evidence sentences, and the noise band on ranking.
   Without this the ranking is not defensible and everything else is decoration.
2. The driver-based model replacing the pre-computed cash flow array, with
   sensitivity on drivers and automated three-statement reconciliation.
3. The forensic battery and the widened kill switch.
4. The litigation register battery, ported from the IPO framework.
5. Ten-year annual and eight-quarter financials in the payload.
6. Consensus, liquidity, ownership and base rates.
7. The remaining sector models.
8. Report content additions.

Items 1, 2 and 3 change the payload contract, so they should land together
before the Gujarati layer is built, since every new prose field needs a
translation contract entry.
