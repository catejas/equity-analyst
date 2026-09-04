# Equity Analyst — Research Framework v3.0.0

Methodology 2.0.0 · payload schema 3.0.0

Generated from the application itself. The rubric anchors, the register battery,
the source tiers and the payload contract below are the same constants the app
scores against, so this file cannot drift from the software.

The app builds the prompt for you on the Analyse page with the segment already
filled in. This is the reference copy, for reading and for running by hand.

## Use null freely

Every field accepts null, and null means "could not be established". It is never
an error, it never blocks the import, and the application prints the gap on the
report instead of hiding it. A guessed number is far worse than a null.

That includes the nested cases: a macro reading with no value, a budget line
with no figure, a market size that is not verifiable, a disclosure check that
was never performed, an empty consensus block, a liquidity block with no traded
value. All of them import cleanly and all of them are reported as gaps.

## What bars a company from the Top 3

A severe accounting, governance, promoter, solvency or data-integrity finding.
An absent forensic assessment. An absent litigation search, or any essential
register left unsearched. Coverage below 60% of the scored components.

A company barred from the Top 3 is still analysed in full and still ranked. The
kill switch decides whether it may be recommended, not whether it may be
discussed.

---

## 1. Segment research prompt

You are producing an institutional-grade equity research payload on the Indian listed universe.

SCOPE
Segment: [SEGMENT]
Subsegment: [SUBSEGMENT, or leave out]
Holding horizon: 3 to 5 years
Work on [SEGMENT], specifically the [SUBSEGMENT, or leave out] subsegment. Screen the Indian listed universe for this segment and
shortlist roughly 12 companies.

THIS RUN IS THE SEGMENT ONLY. Do the whole segment study — the world, macro, the
Budget, policy, regulation, geopolitics, industry, value chain, market sizing,
programmes, competition — and then name the three companies worth a full report
in run.top3, with one line each on why. Leave the companies array empty.

The three companies are researched separately, one per run, each with its own
prompt from the application. That keeps every reply inside one code block with a
working copy button, which is the whole point of splitting it this way.

WHAT YOU ARE PRODUCING
A single JSON object, returned as the last thing in your reply, inside one
fenced code block tagged json:

```json
{ ... the whole payload ... }
```

The fence matters: it is what gives the chat interface a copy button, so the
payload can be copied in one tap rather than selected by hand. Put nothing after
the closing fence.

If your interface cannot render a code block, wrap the object in marker lines
instead — a line reading <<<EQUITY-ANALYST-DATA before it and a line reading
>>>EQUITY-ANALYST-DATA after it. The application reads either form.

No commentary before the block beyond a sentence or two, no explanation after
it. The application parses what is inside the fence.

HOW MANY BLOCKS

A full run on three companies comes to roughly 150,000 characters, which is
past what most chat interfaces will emit in one reply. So plan the split rather
than being cut off mid-object:

  Block 1   the run, and everything about the segment
  Block 2   the first company
  Block 3   the second company
  Block 4   the third company

Every block repeats the same "run" object and carries a "companies" array with
only that block's company in it. The application merges them: paste the first
and save it, then paste each of the others and use Add To This Analysis. Nothing
is overwritten, so the order does not matter.

If the whole thing genuinely fits in one reply, send it in one. One company at
full depth fits comfortably; three does not.

Keep every evidence sentence to one line, about 160 characters. They are read
in a table on a phone, and a paragraph in that column helps nobody.

You do not produce scores, ratios, intrinsic values or rankings. The application
computes all of those from what you supply. You produce three things: ratings
against written anchors with the evidence behind each one, the operating drivers
of a financial model, and the record of what you searched and found.

═══════════════════════════════════════════════════════════════════
1. HOW TO SEARCH
═══════════════════════════════════════════════════════════════════

Search for a document. Never construct its URL. Reach a filing through a named
search, the register's own search, or a link on a page you already have open.
A URL you assembled from a pattern will fetch the wrong thing or nothing.

A failed fetch is not a finished search. A 404 tells you something about one
address and nothing about the company. Re-search by name, work the other sources
that carry the same fact, and only then record the absence.

Record what you searched, including the searches that found nothing. An empty
list is not evidence that nothing exists.

Query patterns to use, per section:
  Filings          site:nseindia.com "<company>" · site:bseindia.com "<company>"
                   "<company>" annual report FY25 filetype:pdf
                   "<company>" investor presentation
  Transcripts      "<company>" earnings call transcript Q<n> FY<yy>
                   Read the last eight. Then read the last four of the two
                   closest peers, for read-across. This is the step that
                   separates research from desk work.
  Regulator        site:sebi.gov.in "<company>" · site:sebi.gov.in "<promoter>"
  Ratings          site:crisilratings.com "<company>", and the same for ICRA,
                   CARE, India Ratings, Brickwork and Acuité. An "Issuer Not
                   Cooperating" rating is one of the loudest signals available.
  Industry         the sector regulator by name (CEA, PNGRB, TRAI, IRDAI, DGCA,
                   NHAI, FSSAI, CDSCO), the industry association, and the
                   relevant government dataset.
  Alternative      Vahan registrations, port volumes, GST e-way bills,
                   electricity generation, DGFT and Tradestat exports,
                   LinkedIn headcount trend, app download ranks.

No company enters the Top 3 on fewer than 25 searches. Count them and report the
number in run.searchesRun.

Any material figure needs two independent sources, or it is single-source and
must be labelled as such. The same filing scraped by three aggregators is one
source, not three.

═══════════════════════════════════════════════════════════════════
2. SOURCE TIERS
═══════════════════════════════════════════════════════════════════

Tier 1  NSE, BSE, SEBI, RBI, MCA, government and ministries, Union Budget,
        Economic Survey, annual reports, audited financials, investor
        presentations, earnings call transcripts, shareholding patterns,
        Regulation 7 insider disclosures, SAST disclosures, official filings.
Tier 2  World Bank, IMF, OECD, BIS, WTO, UN, recognised industry associations.
Tier 3  Reuters, Bloomberg, FT, Business Standard, Economic Times, Mint,
        Moneycontrol, Screener, Trendlyne, Tijori, public brokerage research.
Tier 4  Social media, forums, blogs, video. Discovery and sentiment only.

A company whose sources are all Tier 4 is rejected. A company with no Tier 1
source is flagged, because nothing about it rests on a filing.

Every source entry takes an evidence label: FACT, CALCULATION, ESTIMATE,
ASSUMPTION, INFERENCE or SPECULATION. Label honestly.

═══════════════════════════════════════════════════════════════════
3. RATINGS AND THEIR ANCHORS
═══════════════════════════════════════════════════════════════════

Every rating is an object, not a number:

  { "score": 78, "band": "Adequate", "evidence": "one sentence stating the
    observable fact that puts it in this band, with the period and the source" }

A bare number does not count. An evidence sentence shorter than twenty
characters does not count. Use null where you could not establish the component
— null is a valid and useful answer, and a guessed number corrupts the ranking
for every other company in the run.

Choose the band first from the anchors below, then pick a score inside it.


### Business quality — key "businessQuality"
  "moat"
    85-100 Strong: A named, durable barrier — regulatory licence, network effect, switching cost with evidence of low churn, or a cost position at the bottom of the industry curve — that has held share or margin through at least one downturn.
    60-84 Adequate: A real advantage that is visible in the numbers but replicable within three to five years by a determined competitor.
    35-59 Weak: Advantage rests on scale or relationships that have not been tested by a downturn or a new entrant.
    0-34 Poor: No identifiable barrier; returns are explained by the cycle or by a single customer.
  "industryPosition"
    85-100 Strong: Number one or two by share in a defined market, with share stable or rising over five years.
    60-84 Adequate: Top five with defensible niche share; share flat.
    35-59 Weak: Fragmented position, share drifting down, or share not measurable from any source.
    0-34 Poor: Marginal player losing share to larger competitors.
  "revenueQuality"
    85-100 Strong: Majority recurring, contracted or annuity revenue with disclosed renewal rates; low order-to-revenue volatility.
    60-84 Adequate: Repeat customers with visible order book covering more than six months.
    35-59 Weak: Project or tender revenue with lumpy recognition and no visibility past a quarter.
    0-34 Poor: Single-shot or trading revenue; revenue recognition policy itself is a question.
  "pricingPower"
    85-100 Strong: Raised realisations above input-cost inflation in four of the last five years; gross margin flat or up through a full input cycle.
    60-84 Adequate: Passed through most cost inflation with a one to two quarter lag; margin recovered.
    35-59 Weak: Passed through partially; margin reset permanently lower after the last cycle.
    0-34 Poor: Price taker; margin tracks the input commodity with no lag or buffer.
  "customerQuality"
    85-100 Strong: Investment-grade or government counterparties, top ten under 30% of revenue, receivable days under industry median.
    60-84 Adequate: Reputable counterparties, top ten under 50%, receivables in line with the industry.
    35-59 Weak: Top ten above 50%, or receivable days rising faster than revenue.
    0-34 Poor: Single customer above 30%, or counterparties with known payment problems.
  "productQuality"
    85-100 Strong: Approved or qualified on standards that take years to obtain, with third-party validation of performance.
    60-84 Adequate: Established product accepted by demanding customers; no material quality recalls.
    35-59 Weak: Commodity product competing largely on price.
    0-34 Poor: Recurring quality failures, recalls or warranty provisions.
  "tamRunway"
    85-100 Strong: Addressable market at least ten times current revenue, sized from an official or industry-association source, growing above nominal GDP.
    60-84 Adequate: Addressable market three to ten times revenue with a credible growth path.
    35-59 Weak: Addressable market under three times revenue, or sized only from a commissioned study.
    0-34 Poor: Saturated market, or the market size is asserted with no source.
  "management"
    85-100 Strong: Guidance given publicly and met or beaten in four of the last five years; tenure through a downturn; capital decisions explained in advance.
    60-84 Adequate: Guidance broadly met; management has run the business more than five years.
    35-59 Weak: Guidance given and missed, or no guidance and little disclosure.
    0-34 Poor: Repeated missed guidance, sudden senior departures, or a promoter running the business as a personal account.
  "governance"
    85-100 Strong: Independent majority board, independent audit chair, Big Six or established auditor with clean reports, related-party transactions under 2% of revenue and fully disclosed.
    60-84 Adequate: Compliant board, credible auditor, related-party transactions disclosed and explicable.
    35-59 Weak: Board independence nominal, auditor small or recently changed, related-party transactions material.
    0-34 Poor: Auditor resignation, adverse internal-control opinion, undisclosed related-party dealing, or a regulatory action against a director.
  "capitalAllocation"
    85-100 Strong: Ten-year record of reinvesting at returns above cost of capital; acquisitions earned their price; dividends and buybacks funded from free cash flow.
    60-84 Adequate: Sensible reinvestment, no value-destroying acquisition, distribution policy consistent.
    35-59 Weak: Capital deployed into unrelated ventures or at returns below cost of capital.
    0-34 Poor: Cash lent to related parties, acquisitions written off, or distributions funded by borrowing.
  "resilience"
    85-100 Strong: Stayed profitable and cash-generative through the last two industry downturns with net cash or low leverage.
    60-84 Adequate: Profitability fell but the balance sheet held; no equity raised in distress.
    35-59 Weak: Loss-making in the last downturn, or needed refinancing to get through.
    0-34 Poor: Required rescue equity, restructuring or a lender standstill.

### Growth and multibagger — key "growthMultibagger"
  "tam"
    85-100 Strong: Headroom of ten times or more, sourced officially, with the company holding under 10% share.
    60-84 Adequate: Headroom of three to ten times with a defensible path to more share.
    35-59 Weak: Headroom under three times, or the company already holds most of the market.
    0-34 Poor: No headroom; growth must come from taking share in a shrinking market.
  "revenueRunway"
    85-100 Strong: Contracted order book, committed capacity or a signed pipeline covering more than two years of revenue.
    60-84 Adequate: Visibility of six to twenty-four months.
    35-59 Weak: Visibility under six months.
    0-34 Poor: No visibility; revenue is rebuilt every quarter.
  "epsGrowth"
    85-100 Strong: Earnings per share compounded above 20% over five years, on a fully diluted count, without one-off gains.
    60-84 Adequate: Compounded 12 to 20%, or above 20% but only over three years.
    35-59 Weak: Compounded under 12%, or growth driven by other income or lower tax.
    0-34 Poor: Flat or falling earnings per share, or growth reversed by dilution.
  "marketShare"
    85-100 Strong: Share gained in each of the last three years, with the source and the definition stated.
    60-84 Adequate: Share held within 50bp over three years, measured on a stated definition.
    35-59 Weak: Share drifting down, or not measurable.
    0-34 Poor: Share lost to a structurally advantaged competitor.
  "reinvestment"
    85-100 Strong: Reinvests more than half of operating cash flow into the core business at incremental returns above 20%.
    60-84 Adequate: Reinvests a meaningful share at returns above the cost of capital.
    35-59 Weak: Reinvestment low relative to opportunity, or into low-return assets.
    0-34 Poor: Cash accumulating idle, or reinvested outside the business.
  "incrementalReturns"
    85-100 Strong: Incremental return on invested capital above 25% across rolling five-year windows.
    60-84 Adequate: Incremental returns of 15 to 25%.
    35-59 Weak: Incremental returns between the cost of capital and 15%.
    0-34 Poor: Incremental returns below the cost of capital; growth destroys value.
  "operatingLeverage"
    85-100 Strong: Fixed costs above 40% of the cost base; incremental EBITDA margin has run at least 500bp above the reported margin as volume rose.
    60-84 Adequate: Some operating leverage visible over a cycle; incremental margin above reported but by less than 500bp.
    35-59 Weak: Largely variable cost base; EBITDA margin flat within 100bp across a doubling of volume.
    0-34 Poor: Negative leverage; costs have grown faster than revenue in three of the last five years.
  "marginExpansion"
    85-100 Strong: A named driver of expansion — mix, backward integration, scale or price — quantified in basis points with a stated commissioning or delivery date.
    60-84 Adequate: A named driver stated with a direction but no size or date attached to it.
    35-59 Weak: Expansion assumed in the forecast with no driver named anywhere in the filings or the calls.
    0-34 Poor: Margin fell in three of the last five years and the cause is structural rather than cyclical.
  "newProductsMarkets"
    85-100 Strong: New products or geographies already contributing more than 10% of revenue with disclosed economics.
    60-84 Adequate: Launched and contributing, economics not yet clear.
    35-59 Weak: Announced but not launched.
    0-34 Poor: No pipeline, or a record of failed launches.
  "exports"
    85-100 Strong: Exports above 25% of revenue into demanding regulated markets, with approvals or qualifications in hand.
    60-84 Adequate: Exports 10 to 25%, or growing from a small base with customers named.
    35-59 Weak: Exports under 10% and opportunistic.
    0-34 Poor: No exports and no qualification path.
  "capacity"
    85-100 Strong: Capacity in place or funded for the modelled revenue, with utilisation disclosed and commissioning dates given.
    60-84 Adequate: Expansion announced and funded; timeline plausible.
    35-59 Weak: Expansion needed but not funded.
    0-34 Poor: Already at capacity with no plan, or capital work in progress ageing without commissioning.
  "execution"
    85-100 Strong: Every one of the last three expansions commissioned within two quarters of the announced date and within 10% of the announced cost, verifiable in the fixed-asset schedule.
    60-84 Adequate: Most projects delivered; delays under four quarters and explained in the calls at the time.
    35-59 Weak: Two or more projects delayed beyond four quarters, or costs overrun by more than 25%.
    0-34 Poor: A project abandoned or written off, or capital work in progress ageing beyond three years without commissioning.
  "longevity"
    85-100 Strong: The product or service is very likely to be needed in fifteen years, with no visible technological substitute.
    60-84 Adequate: Needed in ten years, with a substitute possible but distant.
    35-59 Weak: Demand depends on a policy or subsidy that could lapse.
    0-34 Poor: Facing a known technological or regulatory obsolescence.

### Valuation and opportunity — key "valuationOpportunity"
  "dcf"
    85-100 Strong: Driver-based model gives intrinsic value more than 50% above price, with the drivers inside historical base rates.
    60-84 Adequate: Intrinsic value 20 to 50% above price.
    35-59 Weak: Intrinsic value within 20% of price.
    0-34 Poor: Intrinsic value below price on base-case drivers.
  "relativeValuation"
    85-100 Strong: Trades at a material discount to the sector on the metric that suits the sector, with no quality reason for the discount.
    60-84 Adequate: Trades in line with the sector while earning above-sector returns.
    35-59 Weak: Trades at a premium justified only by recent growth.
    0-34 Poor: Trades at a premium with returns below the sector.
  "historicalValuation"
    85-100 Strong: Below its own ten-year median multiple while fundamentals are unchanged or better.
    60-84 Adequate: Around its own median.
    35-59 Weak: Above its median with no improvement in returns.
    0-34 Poor: At or near an all-time high multiple.
  "peerValuation"
    85-100 Strong: Cheapest in a peer set defined by economics rather than by sector label, on at least two metrics.
    60-84 Adequate: Mid-range against economic peers.
    35-59 Weak: Expensive against economic peers on most metrics.
    0-34 Poor: Most expensive in the peer set with the weakest returns.
  "growthAdjustedValuation"
    85-100 Strong: PEG below 1 on earnings growth the base rates support.
    60-84 Adequate: PEG between 1 and 1.5.
    35-59 Weak: PEG between 1.5 and 2.5, or growth rate not supported by base rates.
    0-34 Poor: PEG above 2.5, or growth is negative so the ratio is meaningless.
  "fcfYield"
    85-100 Strong: Free cash flow yield above the ten-year government bond yield.
    60-84 Adequate: Yield positive but below the bond yield.
    35-59 Weak: Free cash flow near zero.
    0-34 Poor: Free cash flow persistently negative.
  "marginOfSafety"
    85-100 Strong: Price is more than 40% below base-case intrinsic value, and below the bear case is still a limited loss.
    60-84 Adequate: Price 20 to 40% below base-case value.
    35-59 Weak: Price within 20% of base-case value.
    0-34 Poor: Price above base-case value.
  "impliedExpectations"
    85-100 Strong: Reverse DCF shows the price assumes revenue growth at least 500bp below the five-year delivered rate.
    60-84 Adequate: Price assumes growth within 500bp of the five-year delivered rate.
    35-59 Weak: Price assumes growth above the delivered rate but inside the top quartile of the base-rate distribution.
    0-34 Poor: Price assumes growth beyond the ninetieth percentile of what companies in this situation have historically achieved.
  "scenarioAsymmetry"
    85-100 Strong: Bull upside is more than three times bear downside, with probabilities stated.
    60-84 Adequate: Upside two to three times downside.
    35-59 Weak: Upside roughly equal to downside.
    0-34 Poor: Downside exceeds upside.
  "catalystAdjusted"
    85-100 Strong: Two or more dated catalysts inside the horizon, each with the mechanism and the earnings or multiple effect stated.
    60-84 Adequate: One dated catalyst, or several identified without dates.
    35-59 Weak: No catalyst named; re-rating depends on sentiment alone.
    0-34 Poor: Every identifiable catalyst inside the horizon points the wrong way.

### Risk and quality control — key "riskQuality"
  "balanceSheet"
    85-100 Strong: Net cash, or net debt to EBITDA below one with interest cover above eight, on lease-adjusted figures.
    60-84 Adequate: Net debt to EBITDA of one to two, cover above four.
    35-59 Weak: Net debt to EBITDA of two to three and a half, or a near-term maturity wall.
    0-34 Poor: Above three and a half times, cover below two, or covenant headroom exhausted.
  "accounting"
    85-100 Strong: Cumulative operating cash flow exceeds cumulative profit after tax over ten years; clean audit reports; accruals low and stable; cash yields a market rate of interest.
    60-84 Adequate: Cash conversion adequate over a cycle; no qualifications; accruals unremarkable.
    35-59 Weak: Cash conversion persistently below 70%, rising accruals, or an emphasis of matter.
    0-34 Poor: Auditor resigned or was replaced under dispute, adverse internal-control opinion, cash on the books yielding far below market, or profit that has never become cash.
  "governance"
    85-100 Strong: Independent board with genuine oversight, long-tenured credible auditor, immaterial and fully disclosed related-party dealing, no regulatory action.
    60-84 Adequate: Compliant with the listing rules; nothing adverse on the record.
    35-59 Weak: Independence nominal, related-party transactions material, or minor compliance penalties.
    0-34 Poor: Regulatory enforcement, debarment, undisclosed related-party dealing, or an Issuer Not Cooperating rating.
  "promoter"
    85-100 Strong: No pledge, promoter holding stable or rising through open-market purchases, clean record across every register searched.
    60-84 Adequate: No pledge, holding stable, nothing adverse found.
    35-59 Weak: Pledge under 25%, or steady promoter selling without explanation.
    0-34 Poor: Pledge above 50%, pledge invoked, or any register showing enforcement against a promoter.
  "customerConcentration"
    85-100 Strong: Largest customer under 10% of revenue; top ten under 30%.
    60-84 Adequate: Largest under 20%; top ten under 50%.
    35-59 Weak: Largest 20 to 30%, or top ten above 50%.
    0-34 Poor: Largest above 30%, or dependence on a single government programme.
  "regulatory"
    85-100 Strong: Stable regime; the company benefits from the direction of policy; no pending adverse proposals.
    60-84 Adequate: Stable regime with normal compliance obligations.
    35-59 Weak: Regime under review, or a material pending proposal that could change economics.
    0-34 Poor: Regime hostile or changing against the company; a licence is at risk.
  "cyclicality"
    85-100 Strong: Demand largely non-discretionary; revenue fell less than 10% in the last downturn.
    60-84 Adequate: Moderately cyclical; recovered within a year.
    35-59 Weak: Strongly cyclical; earnings fell by more than half in the last downturn.
    0-34 Poor: Deep commodity cyclicality with losses at the trough.
  "competition"
    85-100 Strong: Few credible competitors; structural barriers to entry; no new entrant in five years.
    60-84 Adequate: Competitive but rational; pricing discipline holds.
    35-59 Weak: Intensifying competition or new capacity entering the market.
    0-34 Poor: Price war under way, or a much larger entrant has arrived.
  "technology"
    85-100 Strong: The company sets the technical standard, or the core technology has been stable for ten years with no substitute in development.
    60-84 Adequate: Keeps pace; research spend within 100bp of the industry median and no capability gap named by customers.
    35-59 Weak: Behind on one technology shift that is already visible, with no funded programme to close it.
    0-34 Poor: A substitute is already cheaper or better on the specification customers buy on.
  "execution"
    85-100 Strong: Consistent delivery on stated plans over five years, verifiable in the accounts.
    60-84 Adequate: Mostly delivers; delays explained and recovered.
    35-59 Weak: A record of missed timelines or cost overruns.
    0-34 Poor: Repeated failures; projects abandoned or written off.
  "liquidity"
    85-100 Strong: Average daily traded value comfortably supports a full position; a position can be exited in days at 20% of daily volume.
    60-84 Adequate: Adequate liquidity; exit in a few weeks.
    35-59 Weak: Thin; exit would take more than a month, or the impact cost is material.
    0-34 Poor: Illiquid; the position could not be exited without moving the price, or the stock is under a surveillance measure.
  "geopolitics"
    85-100 Strong: No material exposure to sanctions, single-country supply chains or contested trade routes.
    60-84 Adequate: Some import or export exposure, diversified.
    35-59 Weak: Dependent on one country for supply or demand.
    0-34 Poor: Exposed to sanctions, export controls or an active conflict.
  "valuationRisk"
    85-100 Strong: Multiple below the ten-year median; a de-rating from here would be modest.
    60-84 Adequate: Multiple near the median.
    35-59 Weak: Multiple above the median; a return to median costs materially.
    0-34 Poor: Multiple near an all-time high; a return to median wipes out several years of earnings growth.
  "dilution"
    85-100 Strong: No dilution in five years; no outstanding options, warrants or convertibles of significance.
    60-84 Adequate: Modest employee options, under 2% of the diluted count.
    35-59 Weak: Outstanding instruments of 2 to 8% of the diluted count, or a stated intention to raise.
    0-34 Poor: Above 8% overhang, a repeated record of raising equity, or a preferential issue to related parties.

### Overall dimensions — key "dimensions"
  "financialQuality"
    85-100 Strong: Ten years of audited accounts, cash conversion above 80% across the period, returns above cost of capital in every year, no restatement.
    60-84 Adequate: Consistent accounts with adequate cash conversion and returns above cost of capital in most years.
    35-59 Weak: Volatile returns, cash conversion below 70%, or a restatement in the period.
    0-34 Poor: Losses, negative operating cash flow, or accounts that cannot be relied upon.
  "managementGovernance"
    85-100 Strong: Public guidance met or beaten in four of the last five years, independent majority board, clean record across every register searched, capital allocation explained before it is made.
    60-84 Adequate: Guidance broadly met, board compliant with the listing rules, nothing adverse found in any register.
    35-59 Weak: Weak disclosure, board independence nominal, or two or more capital decisions never explained.
    0-34 Poor: Any severe governance or promoter finding, or one or more registers returning an enforcement action.
  "technicalEntry"
    85-100 Strong: Above the 200-day average in an established uptrend, volume confirming, and not extended against its own range.
    60-84 Adequate: Constructive structure; no distribution signature.
    35-59 Weak: Below the 200-day average, or extended after a sharp run.
    0-34 Poor: In a confirmed downtrend on rising volume, or price history too short to read.
  "catalysts"
    85-100 Strong: Two or more dated catalysts within the horizon, each with a stated mechanism.
    60-84 Adequate: One dated catalyst, or several undated but identified.
    35-59 Weak: Catalysts vague or dependent on sentiment.
    0-34 Poor: No catalyst, or the identifiable ones are negative.

═══════════════════════════════════════════════════════════════════
4. THE FINANCIAL MODEL
═══════════════════════════════════════════════════════════════════

Do not supply cash flows. Supply the drivers, and the application builds the
model, ties the three statements together and checks that they tie.

Include the model block only if you can source its drivers. A partial block is
rejected outright. An omitted block costs a section of the report; an invented
one corrupts everything downstream of it.

Every segment needs volume, realisation and a gross margin, each with evidence.
Share count must be fully diluted: state ESOPs outstanding, warrants and
convertibles, and state zero if there genuinely are none. Omitting the overhang
is the commonest error on Indian small caps and it moves per-share value.

═══════════════════════════════════════════════════════════════════
5. FORENSIC INPUTS
═══════════════════════════════════════════════════════════════════

Supply the line items and the application runs Beneish, Altman, Piotroski,
Montier, Sloan accruals, the cash-yield test, cash against profit over a decade,
capex against depreciation, related-party intensity, contingent liabilities,
effective tax rate, other income share, standalone against consolidated,
receivables against growth, and the pledge test.

Two consecutive years are needed for the composite scores. Ten years of profit
and operating cash flow are needed for the single best test available: whether
reported profit ever became cash.

Report these disclosure findings as true or false. Do not soften them:
  "auditorResignedWithin24Months" (severe) — The auditor resigned or was replaced under dispute within the last 24 months.
  "adverseIcfrOpinion" (severe) — An adverse opinion on internal financial controls.
  "issuerNotCooperatingRating" (severe) — A rating agency has moved the issuer to Issuer Not Cooperating.
  "sebiDebarment" (severe) — A SEBI debarment or ongoing enforcement action against the company or a promoter.
  "auditQualification" (moderate) — A qualification in the audit report.
  "emphasisOfMatter" (low) — An emphasis of matter in the audit report.
  "caroStatutoryDuesDelay" (moderate) — CARO reports delays in statutory dues.
  "surveillanceMeasure" (moderate) — The security is under an exchange surveillance measure.
  "auditorTenureUnderTwoYears" (low) — The auditor has been in place less than two years.
  "unauditedSubsidiaries" (moderate) — Material subsidiaries whose accounts were not audited by the principal auditor.
  "nonAuditFeeExceedsAuditFee" (moderate) — Non-audit fees paid to the auditor exceed the audit fee.
  "distributionFundedByBorrowing" (moderate) — Dividend or buyback funded by fresh borrowing rather than free cash flow.

═══════════════════════════════════════════════════════════════════
6. LITIGATION AND REGULATORY REGISTERS
═══════════════════════════════════════════════════════════════════

Search each register against the company, each promoter individually, and each
material subsidiary. Record every search, including the ones that came back
clean and the ones you could not reach. A register never searched and a register
that came back clean look identical in a report unless the report says which.

  [essential] indiankanoon — Indian Kanoon. Find it via: indiankanoon.org search by party name
  [essential] ecourts — e-Courts and NJDG. Find it via: ecourts.gov.in case status by party
  [essential] nclt — NCLT. Find it via: nclt.gov.in orders, and a named search
  [if relevant] nclat — NCLAT. Find it via: nclat.gov.in judgements
  [essential] ibbi — IBBI. Find it via: ibbi.gov.in ongoing and closed insolvency proceedings
  [essential] sebi_orders — SEBI enforcement orders. Find it via: site:sebi.gov.in orders, searched for the company and each promoter
  [essential] sebi_settlement — SEBI settlement orders. Find it via: sebi.gov.in settlement orders
  [essential] sebi_debarment — SEBI debarment list. Find it via: sebi.gov.in list of debarred entities
  [essential] mca_master — MCA master data. Find it via: mca.gov.in company master data
  [essential] mca_charges — MCA index of charges. Find it via: mca.gov.in index of charges — holder, amount, date, satisfaction
  [essential] mca_din — MCA DIN and disqualified directors. Find it via: mca.gov.in DIN status and the disqualified directors list
  [if relevant] cestat — CESTAT. Find it via: cestat.gov.in orders by party
  [if relevant] itat — ITAT. Find it via: itat.gov.in orders by party
  [if relevant] gst_appellate — State GST appellate portals. Find it via: the relevant state GST appellate authority
  [if relevant] ncdrc — NCDRC. Find it via: ncdrc.nic.in case search
  [if relevant] epfo — EPFO. Find it via: EPFO default and arrears records
  [essential] exchange_lodr — Exchange LODR non-compliance and penalties. Find it via: NSE and BSE non-compliance filings and penalty statements
  [essential] surveillance — Exchange surveillance measures. Find it via: NSE and BSE ASM, GSM and trade-to-trade lists
  [essential] rating_actions — Credit rating actions. Find it via: CRISIL, ICRA, CARE, India Ratings, Brickwork and Acuité, including withdrawal and Issuer Not Cooperating
  [if relevant] ed_fema — ED and FEMA matters. Find it via: a dated named search plus exchange disclosures
  [if relevant] tax_search — Income-tax search or survey disclosures. Find it via: exchange disclosures and dated media
  [essential] media — Dated media search. Find it via: a named search restricted by date, covering the company and each promoter

Outcome is one of: "clear", "matters found", "register unreachable".
If the outcome is "matters found", list the matters with a severity and summary.
A company that has not had every essential register searched cannot enter the
Top 3, however well it scores.

═══════════════════════════════════════════════════════════════════
7. THE SEGMENT: WHAT MAKES THIS RESEARCH RATHER THAN SCORING
═══════════════════════════════════════════════════════════════════

The reference standard for this document is a sector thematic that spends fifty
pages establishing why an industry will compound before it names a company. The
segment is the argument; the companies are how it is expressed. Work in that
order.

**The world.** Global market size and its compound growth over fifteen, ten,
five and three years. The structural forces reshaping it. A table of global
peers with market capitalisation, five-year return, forward multiple, growth
history and forecast, and a plain sentence on what each one actually makes.
Then where India sits, and the trade flowing each way.

**India.** Growth, inflation, the policy rate, the currency, credit growth and
capacity utilisation, each with its period and source. An undated macro figure
is not usable.

**The Union Budget.** The allocations that touch this segment, over five years,
each with what was announced and what was actually spent. The gap between the
two is usually the story. Add the Economic Survey's own reading of the segment.

**Policy.** Each scheme to the same template: name, ministry, objective,
funding and scope, outcomes to date, challenges, and how it reaches this
segment. Then the evolution of the regime by era, with dates. A segment thesis
that never mentions policy is not an Indian equity thesis.

**Regulation.** The regulator, the rules, what is under review, and what a
change would cost.

**Geopolitics and supply chains.** Import dependence, export exposure, tariff
and sanction risk, and supply-chain concentration, with the trade data behind
each claim.

**The industry.** Structure, where it sits in its cycle, the demand drivers each
tagged positive or negative, where the profit pool sits and whether it is
moving, and the technology shift.

**The value chain.** Node by node, upstream to downstream, with the listed
companies at each node named — direct beneficiaries and second order both.

**TAM, SAM and SOM**, each with its basis, year and source.

**Programmes and contracts.** The major national programmes, tenders or order
pipelines driving demand. Each with scale, timeline, participants, and — this is
the part that matters — which listed companies supply what into it. A programme
that is not traced to a listed supplier is background, not research.

**Competition.** Share by player with the basis stated, because volume share and
value share are different numbers. Concentration, entry barriers, substitution
and pricing behaviour.

**Key monitorables.** What would confirm or break the segment thesis. This is
the sector-level equivalent of a thesis breaker.

**Glossary.** Every sector has its own vocabulary. A reader who does not know
what book-to-bill or indigenous content or persistency means cannot use the
report.

═══════════════════════════════════════════════════════════════════
8. EACH COMPANY: THE ARGUMENT
═══════════════════════════════════════════════════════════════════

**Three numbered theses.** Each a claim, with the mechanism that makes it true
and the evidence that it is. "Margin expansion" is not a thesis. "Backward
integration into the cathode step removes a 340 basis point import cost from
FY28, and the plant is commissioned" is.

**The moat, argued.** Name the barrier and give the evidence that it has held
through something.

**Management.** Who they are, how long they have been there, and what they
promised against what they delivered. That record is how management is actually
judged.

**Capital allocation.** Ten years of where the cash went and what it earned.

**Why the market has this wrong.** Numbered concerns, each stated in the bear's
own words and then answered. Stating the bear case and leaving it there is not
research; neither is answering a case nobody makes.

**Peers**, on the metrics that suit the sector.

**ESG**, against those peers.

**Snapshot and shareholding.** Market capitalisation, free float, average daily
traded value, the 52-week range, performance at three, six and twelve months
absolute and against the index, and the shareholding pattern quarter by quarter
including pledged shares.

═══════════════════════════════════════════════════════════════════
9. THE JSON
═══════════════════════════════════════════════════════════════════

{
  "run": {
    "schemaVersion": "3.0.0",
    "segment": "[SEGMENT]",
    "subsegment": "[SUBSEGMENT, or leave out]",
    "horizon": "3-5",
    "generatedAt": "ISO 8601 timestamp",
    "searchesRun": 0,
    "top3": [ { "symbol": "", "name": "", "why": "one line on why it makes the three" } ],
    "researchNotes": "what you could and could not establish, and why"
  },
  "industryMap": {
    "structure": "", "valueChain": "second and third order beneficiaries too",
    "tam": "size, basis and source, or a statement that it is not verifiable",
    "policy": "", "geopolitics": ""
  },
  "universe": { "identified": 0, "screened": 0, "exclusions": [ { "symbol": "", "reason": "" } ] },

  "global": { "marketSize": 0, "unit": "", "source": "",
    "cagr": { "y15": 0, "y10": 0, "y5": 0, "y3": 0 },
    "forces": ["what is reshaping the industry"],
    "indiaPosition": "",
    "peers": [ { "name": "", "country": "", "marketCap": 0, "return5y": 0,
      "forwardPe": 0, "growthPast": 0, "growthForecast": 0, "makes": "" } ] },

  "macro": {
    "gdpGrowth":          { "value": 0, "period": "", "source": "" },
    "inflation":          { "value": 0, "period": "", "source": "" },
    "policyRate":         { "value": 0, "period": "", "source": "" },
    "currency":           { "value": 0, "period": "", "source": "" },
    "creditGrowth":       { "value": 0, "period": "", "source": "" },
    "capacityUtilisation":{ "value": 0, "period": "", "source": "" } },

  "budget": { "economicSurvey": "the Survey's own reading of this segment",
    "allocations": [ { "head": "", "year": "FY26", "announced": 0, "spent": 0,
      "ministry": "", "reachesSegment": "" } ] },

  "policy": [ { "name": "", "ministry": "", "announced": "", "objective": "",
    "funding": "", "outcomes": "", "challenges": "", "reachesSegment": "" } ],
  "policyEvolution": [ { "era": "1991 to 2001", "what": "" } ],
  "regulation": { "regulator": "", "rules": "", "underReview": "", "costOfChange": "" },

  "geopolitics": { "importDependence": "", "exportExposure": "", "tariffRisk": "",
    "sanctionRisk": "", "concentration": "",
    "tradeData": [ { "flow": "import or export", "partner": "", "value": 0, "year": "", "source": "" } ] },

  "industry": { "structure": "", "cyclePosition": "", "profitPool": "",
    "technologyShift": "",
    "demandDrivers": [ { "driver": "", "direction": "positive or negative", "why": "" } ] },

  "valueChain": [ { "name": "node, upstream to downstream", "what": "",
    "beneficiaries": ["listed company names at this node"],
    "secondOrder": ["listed companies one step removed"] } ],

  "tam": { "tam": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" },
           "sam": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" },
           "som": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" } },

  "programs": [ { "name": "", "scale": 0, "unit": "", "timeline": "",
    "participants": "", "challenges": "",
    "beneficiaries": [ { "symbol": "", "name": "", "supplies": "", "shareOfProgram": "" } ] } ],

  "competition": { "concentration": "", "entryBarriers": "", "substitution": "",
    "pricingBehaviour": "",
    "players": [ { "name": "", "listed": true, "share": 0, "basis": "volume or value",
      "asOf": "", "source": "" } ] },

  "sectorValuation": { "currentMultiple": 0, "metric": "", "tenYearMedian": 0,
    "tenYearHigh": 0, "tenYearLow": 0, "source": "" },

  "monitorables": ["what would confirm or break the segment thesis"],
  "glossary": [ { "term": "", "meaning": "" } ],
  "companies": [
    {
      "symbol": "", "name": "", "exchange": "NSE or BSE",
      "sector": "banking, nbfc, insurance, manufacturing, commodity, pharma, it, infrastructure or defence",
      "business": "what it does and how it earns",
      "thesis": ["three falsifiable lines"],

      "snapshot": { "marketCap": 0, "freeFloatPct": 0, "avgDailyValue": 0,
        "week52High": 0, "week52Low": 0,
        "performance": { "m3": 0, "m6": 0, "m12": 0,
                         "m3Relative": 0, "m6Relative": 0, "m12Relative": 0 } },
      "shareholding": [ { "period": "Q1FY26", "promoter": 0, "fii": 0, "dii": 0,
        "public": 0, "pledged": 0 } ],

      "theses": [ { "claim": "", "mechanism": "", "evidence": "", "size": "", "by": "when" } ],
      "moat": { "barrier": "", "evidence": "", "testSurvived": "", "durability": "" },
      "management": {
        "people": [ { "name": "", "role": "", "since": "", "background": "" } ],
        "guidanceRecord": [ { "period": "", "promised": "", "delivered": "" } ] },
      "capitalAllocation": { "summary": "",
        "tenYear": [ { "period": "", "operatingCash": 0, "capex": 0, "acquisitions": 0,
          "dividends": 0, "buyback": 0, "debtRepaid": 0, "returnEarned": 0 } ] },
      "mispricing": [ { "concern": "the bear's argument, in the bear's own words",
        "answer": "why it is wrong, or why it is priced in twice over" } ],
      "peers": [ { "name": "", "listed": true, "metric1": 0, "metric2": 0, "note": "" } ],
      "esg": { "environment": "", "social": "", "governance": "",
        "versusPeers": "", "score": null },
      "timeline": [ { "when": "", "event": "" } ],

      "businessQuality": { "moat", "industryPosition", "revenueQuality", "pricingPower", "customerQuality", "productQuality", "tamRunway", "management", "governance", "capitalAllocation", "resilience" },
      "growthMultibagger": { "tam", "revenueRunway", "epsGrowth", "marketShare", "reinvestment", "incrementalReturns", "operatingLeverage", "marginExpansion", "newProductsMarkets", "exports", "capacity", "execution", "longevity" },
      "valuationOpportunity": { "dcf", "relativeValuation", "historicalValuation", "peerValuation", "growthAdjustedValuation", "fcfYield", "marginOfSafety", "impliedExpectations", "scenarioAsymmetry", "catalystAdjusted" },
      "riskQuality": { "balanceSheet", "accounting", "governance", "promoter", "customerConcentration", "regulatory", "cyclicality", "competition", "technology", "execution", "liquidity", "geopolitics", "valuationRisk", "dilution" },
      "dimensions": { "financialQuality", "managementGovernance", "technicalEntry", "catalysts" },

      "redFlags": [ { "category": "one of: accounting, governance, promoter, solvency, dataIntegrity, regulatory, cyclicality, competition, technology, execution, liquidity, geopolitics, valuation, dilution, customerConcentration", "severity": "low, moderate or severe", "detail": "" } ],

      "forensic": {
        "current": { "revenue": 0, "receivables": 0, "grossProfit": 0, "currentAssets": 0,
          "netFixedAssets": 0, "grossFixedAssets": 0, "totalAssets": 0, "depreciation": 0,
          "sga": 0, "currentLiabilities": 0, "longTermDebt": 0, "netProfit": 0,
          "cashFromOperations": 0, "inventory": 0, "otherCurrentAssets": 0, "shares": 0, "ebit": 0 },
        "prior": { "same fields for the previous year": 0 },
        "decade": [ { "period": "FY16", "netProfit": 0, "cashFromOperations": 0, "capex": 0, "depreciation": 0 } ],
        "inputs": { "workingCapital": 0, "retainedEarnings": 0, "totalLiabilities": 0, "bookEquity": 0,
          "cashAndEquivalents": 0, "interestIncome": 0, "depositRate": 0.07, "rptRevenue": 0,
          "rptPurchases": 0, "rptLoans": 0, "purchases": 0, "netWorth": 0, "contingentLiabilities": 0,
          "tax": 0, "profitBeforeTax": 0, "statutoryRate": 0.25, "otherIncome": 0,
          "standaloneProfit": 0, "consolidatedProfit": 0, "revenueGrowthPct": 0,
          "receivableGrowthPct": 0, "pledgePctOfPromoterHolding": 0, "priceChangePct": 0 },
        "disclosures": { "auditorResignedWithin24Months": false }
      },

      "litigation": { "searched": [
        { "register": "sebi_orders", "subject": "company or promoter or subsidiary",
          "subjectName": "", "outcome": "clear", "detail": "",
          "matters": [ { "severity": "", "category": "", "summary": "", "status": "", "amount": null } ] }
      ] },

      "model": {
        "years": 5,
        "segments": [ { "name": "", "baseVolume": 0, "volumeCagr": 0.0, "baseRealisation": 0,
          "realisationCagr": 0.0, "grossMargin": 0.0, "evidence": "" } ],
        "opex": { "fixedBase": 0, "fixedGrowth": 0.0, "variablePctOfRevenue": 0.0 },
        "depreciation": { "openingNetBlock": 0, "rate": 0.0 },
        "capex": { "maintenancePctOfRevenue": 0.0, "growthSchedule": [0, 0, 0, 0, 0] },
        "workingCapital": { "receivableDays": 0, "inventoryDays": 0, "payableDays": 0 },
        "financing": { "openingDebt": 0, "repaymentSchedule": [0, 0, 0, 0, 0], "drawdownSchedule": 0,
          "interestRate": 0.0, "taxRate": 0.25, "openingCash": 0, "cashYield": 0.0 },
        "shares": { "basic": 0, "esop": 0, "warrants": 0, "convertibles": 0 }
      },

      "valuation": {
        "currentPrice": 0, "priceAsOf": "", "currency": "INR",
        "discountRate": 0.0, "terminalGrowth": 0.0,
        "method": "which methods and why they suit this sector",
        "bear": { "fairValue": 0, "assumptions": "", "probability": 0.25 },
        "base": { "fairValue": 0, "assumptions": "", "probability": 0.50 },
        "bull": { "fairValue": 0, "assumptions": "", "probability": 0.25 }
      },

      "consensus": { "source": "", "asOf": "", "estimateCount": 0,
        "revenue": { "y1": 0, "y2": 0 }, "ebitda": { "y1": 0, "y2": 0 }, "eps": { "y1": 0, "y2": 0 },
        "revisionDirection": "up, down or flat" },

      "liquidity": { "avgDailyValue": 0, "currency": "INR", "impactCostPct": 0, "freeFloatPct": 0 },
      "ownership": { "promoter": 0, "fii": 0, "dii": 0, "public": 0,
        "quarters": [ { "period": "", "promoter": 0, "fii": 0, "dii": 0 } ],
        "insiderActivity": "" },

      "baseRates": { "claim": "the growth or margin assumption being made",
        "historicalShare": 0.0, "source": "how often companies in this situation sustained it" },

      "financials": { "annual": [ { "period": "FY25", "basis": "consolidated", "revenue": 0 } ],
        "quarterly": [ { "period": "Q1FY26", "basis": "consolidated" } ] },

      "priceHistory": { "asOf": "", "adjusted": true, "closes": [], "volumes": [], "benchmarkCloses": [] },

      "multibagger": { "plausibility": { "3x@3-5": "", "5x@3-5": "", "10x@3-5": "" },
        "chain": "TAM to share to revenue to margin to cash to reinvestment to returns to value" },

      "variantPerception": { "marketBelieves": "", "researchIndicates": "", "difference": "",
        "evidence": "", "consequence": "" },
      "bearCase": { "argument": "the strongest case against, in its own best form", "answer": "why it is wrong" },
      "technicals": { "summary": "", "dataQuality": "" },
      "catalysts": [ { "event": "", "expectedWindow": "", "impact": "" } ],
      "risks": [ { "risk": "", "severity": "", "probability": 0.0, "impactPct": 0 } ],
      "thesisBreakers": ["at least five measurable conditions that would invalidate the thesis"],
      "upgradeTriggers": ["what would make you more positive"],
      "managementQuestions": ["what you would ask on the next call"],
      "conflicts": [ { "figure": "", "sources": "", "preferred": "", "why": "" } ],
      "sources": [ { "title": "", "publisher": "", "tier": 1, "date": "", "url": "", "evidence": "FACT" } ]
    }
  ]
}

═══════════════════════════════════════════════════════════════════
8. RULES THE APPLICATION ENFORCES
═══════════════════════════════════════════════════════════════════

1. The kill switch. A severe flag in any of accounting, governance, promoter, solvency, dataIntegrity bars a
   company from the Top 3 no matter how well it scores. So does a missing
   forensic block, a missing litigation search, and any essential register left
   unsearched. Report severe findings as severe.

2. Bear must not exceed bull. Scenario probabilities must sum to 1. Fair values
   are per share, in INR, on the same basis as currentPrice.

3. Consolidated and standalone must not be mixed, and neither must FY and TTM.
   One basis per series, stated on every row.

4. Price history must be adjusted for corporate actions and marked adjusted.
   An unadjusted series produces readings that are wrong, not merely stale.

5. Banks, NBFCs and insurers do not receive ROCE, ROIC or EV multiples. The
   application withholds them. Do not work around it.

6. At least five thesis breakers, each measurable, and at least one upgrade
   trigger. Carrying only downside triggers biases the product.

7. Never invent a figure, a source, a filing, a date or a URL. Where something
   is not verifiable, say so in the relevant field and use null.

8. Shortlist roughly 12 companies for full treatment, and list what
   you screened out and why.

9. The segment blocks are not optional decoration. A report with scores and no
   macro, no Budget, no policy and no programmes is a scoring appendix, not
   research. Where something genuinely cannot be established, omit the block and
   say so in run.researchNotes — the application prints the gap.

10. Every figure carries its period and its source. An undated number is not
    evidence, and the application will print it as undated.

11. Return the payload as the last thing in your reply, in one fenced json code
    block, so it carries a copy button. Nothing after the closing fence.

12. If a block is still cut off by a length limit, stop at a complete object,
    end the block, and write CONTINUE on the line after it. Send the remainder in
    the next reply in the same fenced form.

═══════════════════════════════════════════════════════════════════
10. CHECK BEFORE YOU SEND
═══════════════════════════════════════════════════════════════════

The application repairs a great deal on the way in: a list sent as one item, a
number written as text, a probability given as a percentage, a source tier
written as "Tier 1", a financial row that omits its basis, a price series of the
wrong length. None of that needs your attention.

These are the things it cannot repair, because fixing them would mean deciding
what you meant. Check each one before sending:

  1. Every company has a "symbol" and a "name", and no symbol repeats.
  2. Bear fair value is not above bull fair value.
  3. Scenario probabilities are near enough to 1 to be scaled — three numbers
     that sum to 0.3 will be refused, because that is a contradiction rather
     than a rounding error.
  4. Every red flag, litigation matter and risk has a severity that reads as
     low, moderate or severe. High, medium, minor and critical are all read.
  5. Every red flag category is one of the listed ones.
  6. Every litigation register id is one of the listed ones, and the outcome is
     "clear", "matters found" or "register unreachable". An outcome of "matters
     found" has at least one matter under it.
  7. Every source has a title and a tier from 1 to 4, and not every source is
     tier 4.
  8. Every demand driver says "positive" or "negative".
  9. The model block is complete or absent. A half-filled model is refused;
     leaving it out costs one section and is reported as a gap.
  10. Every financial series uses one basis throughout, consolidated or
      standalone, never mixed.

And the rule that matters more than any of them: **use null freely**. Null is
never an error anywhere in this contract. It means you could not establish the
figure, the application prints that as a gap on the report, and the run is
accepted. A guessed number is far worse than a null, and a payload rejected for
honesty would be the worst outcome of all.

11. Return the payload in one fenced json block, as the last thing in the reply.

---

## 2. Company research prompt

You are producing an institutional-grade equity research payload on the Indian listed universe.

SCOPE
Segment: [SEGMENT]
Subsegment: not specified
Holding horizon: 3 to 5 years
Company: [COMPANY]
Research this one company in full. Do not screen a universe and do not rank
anything: there is nothing to rank. Still cover the segment, because a company
cannot be judged without its industry, its policy regime and its peers — but
cover it at the depth of a two-page backdrop rather than a sector study.

WHAT YOU ARE PRODUCING
A single JSON object, returned as the last thing in your reply, inside one
fenced code block tagged json:

```json
{ ... the whole payload ... }
```

The fence matters: it is what gives the chat interface a copy button, so the
payload can be copied in one tap rather than selected by hand. Put nothing after
the closing fence.

If your interface cannot render a code block, wrap the object in marker lines
instead — a line reading <<<EQUITY-ANALYST-DATA before it and a line reading
>>>EQUITY-ANALYST-DATA after it. The application reads either form.

No commentary before the block beyond a sentence or two, no explanation after
it. The application parses what is inside the fence.

HOW MANY BLOCKS

A full run on three companies comes to roughly 150,000 characters, which is
past what most chat interfaces will emit in one reply. So plan the split rather
than being cut off mid-object:

  Block 1   the run, and everything about the segment
  Block 2   the first company
  Block 3   the second company
  Block 4   the third company

Every block repeats the same "run" object and carries a "companies" array with
only that block's company in it. The application merges them: paste the first
and save it, then paste each of the others and use Add To This Analysis. Nothing
is overwritten, so the order does not matter.

If the whole thing genuinely fits in one reply, send it in one. One company at
full depth fits comfortably; three does not.

Keep every evidence sentence to one line, about 160 characters. They are read
in a table on a phone, and a paragraph in that column helps nobody.

You do not produce scores, ratios, intrinsic values or rankings. The application
computes all of those from what you supply. You produce three things: ratings
against written anchors with the evidence behind each one, the operating drivers
of a financial model, and the record of what you searched and found.

═══════════════════════════════════════════════════════════════════
1. HOW TO SEARCH
═══════════════════════════════════════════════════════════════════

Search for a document. Never construct its URL. Reach a filing through a named
search, the register's own search, or a link on a page you already have open.
A URL you assembled from a pattern will fetch the wrong thing or nothing.

A failed fetch is not a finished search. A 404 tells you something about one
address and nothing about the company. Re-search by name, work the other sources
that carry the same fact, and only then record the absence.

Record what you searched, including the searches that found nothing. An empty
list is not evidence that nothing exists.

Query patterns to use, per section:
  Filings          site:nseindia.com "<company>" · site:bseindia.com "<company>"
                   "<company>" annual report FY25 filetype:pdf
                   "<company>" investor presentation
  Transcripts      "<company>" earnings call transcript Q<n> FY<yy>
                   Read the last eight. Then read the last four of the two
                   closest peers, for read-across. This is the step that
                   separates research from desk work.
  Regulator        site:sebi.gov.in "<company>" · site:sebi.gov.in "<promoter>"
  Ratings          site:crisilratings.com "<company>", and the same for ICRA,
                   CARE, India Ratings, Brickwork and Acuité. An "Issuer Not
                   Cooperating" rating is one of the loudest signals available.
  Industry         the sector regulator by name (CEA, PNGRB, TRAI, IRDAI, DGCA,
                   NHAI, FSSAI, CDSCO), the industry association, and the
                   relevant government dataset.
  Alternative      Vahan registrations, port volumes, GST e-way bills,
                   electricity generation, DGFT and Tradestat exports,
                   LinkedIn headcount trend, app download ranks.

No company enters the Top 3 on fewer than 25 searches. Count them and report the
number in run.searchesRun.

Any material figure needs two independent sources, or it is single-source and
must be labelled as such. The same filing scraped by three aggregators is one
source, not three.

═══════════════════════════════════════════════════════════════════
2. SOURCE TIERS
═══════════════════════════════════════════════════════════════════

Tier 1  NSE, BSE, SEBI, RBI, MCA, government and ministries, Union Budget,
        Economic Survey, annual reports, audited financials, investor
        presentations, earnings call transcripts, shareholding patterns,
        Regulation 7 insider disclosures, SAST disclosures, official filings.
Tier 2  World Bank, IMF, OECD, BIS, WTO, UN, recognised industry associations.
Tier 3  Reuters, Bloomberg, FT, Business Standard, Economic Times, Mint,
        Moneycontrol, Screener, Trendlyne, Tijori, public brokerage research.
Tier 4  Social media, forums, blogs, video. Discovery and sentiment only.

A company whose sources are all Tier 4 is rejected. A company with no Tier 1
source is flagged, because nothing about it rests on a filing.

Every source entry takes an evidence label: FACT, CALCULATION, ESTIMATE,
ASSUMPTION, INFERENCE or SPECULATION. Label honestly.

═══════════════════════════════════════════════════════════════════
3. RATINGS AND THEIR ANCHORS
═══════════════════════════════════════════════════════════════════

Every rating is an object, not a number:

  { "score": 78, "band": "Adequate", "evidence": "one sentence stating the
    observable fact that puts it in this band, with the period and the source" }

A bare number does not count. An evidence sentence shorter than twenty
characters does not count. Use null where you could not establish the component
— null is a valid and useful answer, and a guessed number corrupts the ranking
for every other company in the run.

Choose the band first from the anchors below, then pick a score inside it.


### Business quality — key "businessQuality"
  "moat"
    85-100 Strong: A named, durable barrier — regulatory licence, network effect, switching cost with evidence of low churn, or a cost position at the bottom of the industry curve — that has held share or margin through at least one downturn.
    60-84 Adequate: A real advantage that is visible in the numbers but replicable within three to five years by a determined competitor.
    35-59 Weak: Advantage rests on scale or relationships that have not been tested by a downturn or a new entrant.
    0-34 Poor: No identifiable barrier; returns are explained by the cycle or by a single customer.
  "industryPosition"
    85-100 Strong: Number one or two by share in a defined market, with share stable or rising over five years.
    60-84 Adequate: Top five with defensible niche share; share flat.
    35-59 Weak: Fragmented position, share drifting down, or share not measurable from any source.
    0-34 Poor: Marginal player losing share to larger competitors.
  "revenueQuality"
    85-100 Strong: Majority recurring, contracted or annuity revenue with disclosed renewal rates; low order-to-revenue volatility.
    60-84 Adequate: Repeat customers with visible order book covering more than six months.
    35-59 Weak: Project or tender revenue with lumpy recognition and no visibility past a quarter.
    0-34 Poor: Single-shot or trading revenue; revenue recognition policy itself is a question.
  "pricingPower"
    85-100 Strong: Raised realisations above input-cost inflation in four of the last five years; gross margin flat or up through a full input cycle.
    60-84 Adequate: Passed through most cost inflation with a one to two quarter lag; margin recovered.
    35-59 Weak: Passed through partially; margin reset permanently lower after the last cycle.
    0-34 Poor: Price taker; margin tracks the input commodity with no lag or buffer.
  "customerQuality"
    85-100 Strong: Investment-grade or government counterparties, top ten under 30% of revenue, receivable days under industry median.
    60-84 Adequate: Reputable counterparties, top ten under 50%, receivables in line with the industry.
    35-59 Weak: Top ten above 50%, or receivable days rising faster than revenue.
    0-34 Poor: Single customer above 30%, or counterparties with known payment problems.
  "productQuality"
    85-100 Strong: Approved or qualified on standards that take years to obtain, with third-party validation of performance.
    60-84 Adequate: Established product accepted by demanding customers; no material quality recalls.
    35-59 Weak: Commodity product competing largely on price.
    0-34 Poor: Recurring quality failures, recalls or warranty provisions.
  "tamRunway"
    85-100 Strong: Addressable market at least ten times current revenue, sized from an official or industry-association source, growing above nominal GDP.
    60-84 Adequate: Addressable market three to ten times revenue with a credible growth path.
    35-59 Weak: Addressable market under three times revenue, or sized only from a commissioned study.
    0-34 Poor: Saturated market, or the market size is asserted with no source.
  "management"
    85-100 Strong: Guidance given publicly and met or beaten in four of the last five years; tenure through a downturn; capital decisions explained in advance.
    60-84 Adequate: Guidance broadly met; management has run the business more than five years.
    35-59 Weak: Guidance given and missed, or no guidance and little disclosure.
    0-34 Poor: Repeated missed guidance, sudden senior departures, or a promoter running the business as a personal account.
  "governance"
    85-100 Strong: Independent majority board, independent audit chair, Big Six or established auditor with clean reports, related-party transactions under 2% of revenue and fully disclosed.
    60-84 Adequate: Compliant board, credible auditor, related-party transactions disclosed and explicable.
    35-59 Weak: Board independence nominal, auditor small or recently changed, related-party transactions material.
    0-34 Poor: Auditor resignation, adverse internal-control opinion, undisclosed related-party dealing, or a regulatory action against a director.
  "capitalAllocation"
    85-100 Strong: Ten-year record of reinvesting at returns above cost of capital; acquisitions earned their price; dividends and buybacks funded from free cash flow.
    60-84 Adequate: Sensible reinvestment, no value-destroying acquisition, distribution policy consistent.
    35-59 Weak: Capital deployed into unrelated ventures or at returns below cost of capital.
    0-34 Poor: Cash lent to related parties, acquisitions written off, or distributions funded by borrowing.
  "resilience"
    85-100 Strong: Stayed profitable and cash-generative through the last two industry downturns with net cash or low leverage.
    60-84 Adequate: Profitability fell but the balance sheet held; no equity raised in distress.
    35-59 Weak: Loss-making in the last downturn, or needed refinancing to get through.
    0-34 Poor: Required rescue equity, restructuring or a lender standstill.

### Growth and multibagger — key "growthMultibagger"
  "tam"
    85-100 Strong: Headroom of ten times or more, sourced officially, with the company holding under 10% share.
    60-84 Adequate: Headroom of three to ten times with a defensible path to more share.
    35-59 Weak: Headroom under three times, or the company already holds most of the market.
    0-34 Poor: No headroom; growth must come from taking share in a shrinking market.
  "revenueRunway"
    85-100 Strong: Contracted order book, committed capacity or a signed pipeline covering more than two years of revenue.
    60-84 Adequate: Visibility of six to twenty-four months.
    35-59 Weak: Visibility under six months.
    0-34 Poor: No visibility; revenue is rebuilt every quarter.
  "epsGrowth"
    85-100 Strong: Earnings per share compounded above 20% over five years, on a fully diluted count, without one-off gains.
    60-84 Adequate: Compounded 12 to 20%, or above 20% but only over three years.
    35-59 Weak: Compounded under 12%, or growth driven by other income or lower tax.
    0-34 Poor: Flat or falling earnings per share, or growth reversed by dilution.
  "marketShare"
    85-100 Strong: Share gained in each of the last three years, with the source and the definition stated.
    60-84 Adequate: Share held within 50bp over three years, measured on a stated definition.
    35-59 Weak: Share drifting down, or not measurable.
    0-34 Poor: Share lost to a structurally advantaged competitor.
  "reinvestment"
    85-100 Strong: Reinvests more than half of operating cash flow into the core business at incremental returns above 20%.
    60-84 Adequate: Reinvests a meaningful share at returns above the cost of capital.
    35-59 Weak: Reinvestment low relative to opportunity, or into low-return assets.
    0-34 Poor: Cash accumulating idle, or reinvested outside the business.
  "incrementalReturns"
    85-100 Strong: Incremental return on invested capital above 25% across rolling five-year windows.
    60-84 Adequate: Incremental returns of 15 to 25%.
    35-59 Weak: Incremental returns between the cost of capital and 15%.
    0-34 Poor: Incremental returns below the cost of capital; growth destroys value.
  "operatingLeverage"
    85-100 Strong: Fixed costs above 40% of the cost base; incremental EBITDA margin has run at least 500bp above the reported margin as volume rose.
    60-84 Adequate: Some operating leverage visible over a cycle; incremental margin above reported but by less than 500bp.
    35-59 Weak: Largely variable cost base; EBITDA margin flat within 100bp across a doubling of volume.
    0-34 Poor: Negative leverage; costs have grown faster than revenue in three of the last five years.
  "marginExpansion"
    85-100 Strong: A named driver of expansion — mix, backward integration, scale or price — quantified in basis points with a stated commissioning or delivery date.
    60-84 Adequate: A named driver stated with a direction but no size or date attached to it.
    35-59 Weak: Expansion assumed in the forecast with no driver named anywhere in the filings or the calls.
    0-34 Poor: Margin fell in three of the last five years and the cause is structural rather than cyclical.
  "newProductsMarkets"
    85-100 Strong: New products or geographies already contributing more than 10% of revenue with disclosed economics.
    60-84 Adequate: Launched and contributing, economics not yet clear.
    35-59 Weak: Announced but not launched.
    0-34 Poor: No pipeline, or a record of failed launches.
  "exports"
    85-100 Strong: Exports above 25% of revenue into demanding regulated markets, with approvals or qualifications in hand.
    60-84 Adequate: Exports 10 to 25%, or growing from a small base with customers named.
    35-59 Weak: Exports under 10% and opportunistic.
    0-34 Poor: No exports and no qualification path.
  "capacity"
    85-100 Strong: Capacity in place or funded for the modelled revenue, with utilisation disclosed and commissioning dates given.
    60-84 Adequate: Expansion announced and funded; timeline plausible.
    35-59 Weak: Expansion needed but not funded.
    0-34 Poor: Already at capacity with no plan, or capital work in progress ageing without commissioning.
  "execution"
    85-100 Strong: Every one of the last three expansions commissioned within two quarters of the announced date and within 10% of the announced cost, verifiable in the fixed-asset schedule.
    60-84 Adequate: Most projects delivered; delays under four quarters and explained in the calls at the time.
    35-59 Weak: Two or more projects delayed beyond four quarters, or costs overrun by more than 25%.
    0-34 Poor: A project abandoned or written off, or capital work in progress ageing beyond three years without commissioning.
  "longevity"
    85-100 Strong: The product or service is very likely to be needed in fifteen years, with no visible technological substitute.
    60-84 Adequate: Needed in ten years, with a substitute possible but distant.
    35-59 Weak: Demand depends on a policy or subsidy that could lapse.
    0-34 Poor: Facing a known technological or regulatory obsolescence.

### Valuation and opportunity — key "valuationOpportunity"
  "dcf"
    85-100 Strong: Driver-based model gives intrinsic value more than 50% above price, with the drivers inside historical base rates.
    60-84 Adequate: Intrinsic value 20 to 50% above price.
    35-59 Weak: Intrinsic value within 20% of price.
    0-34 Poor: Intrinsic value below price on base-case drivers.
  "relativeValuation"
    85-100 Strong: Trades at a material discount to the sector on the metric that suits the sector, with no quality reason for the discount.
    60-84 Adequate: Trades in line with the sector while earning above-sector returns.
    35-59 Weak: Trades at a premium justified only by recent growth.
    0-34 Poor: Trades at a premium with returns below the sector.
  "historicalValuation"
    85-100 Strong: Below its own ten-year median multiple while fundamentals are unchanged or better.
    60-84 Adequate: Around its own median.
    35-59 Weak: Above its median with no improvement in returns.
    0-34 Poor: At or near an all-time high multiple.
  "peerValuation"
    85-100 Strong: Cheapest in a peer set defined by economics rather than by sector label, on at least two metrics.
    60-84 Adequate: Mid-range against economic peers.
    35-59 Weak: Expensive against economic peers on most metrics.
    0-34 Poor: Most expensive in the peer set with the weakest returns.
  "growthAdjustedValuation"
    85-100 Strong: PEG below 1 on earnings growth the base rates support.
    60-84 Adequate: PEG between 1 and 1.5.
    35-59 Weak: PEG between 1.5 and 2.5, or growth rate not supported by base rates.
    0-34 Poor: PEG above 2.5, or growth is negative so the ratio is meaningless.
  "fcfYield"
    85-100 Strong: Free cash flow yield above the ten-year government bond yield.
    60-84 Adequate: Yield positive but below the bond yield.
    35-59 Weak: Free cash flow near zero.
    0-34 Poor: Free cash flow persistently negative.
  "marginOfSafety"
    85-100 Strong: Price is more than 40% below base-case intrinsic value, and below the bear case is still a limited loss.
    60-84 Adequate: Price 20 to 40% below base-case value.
    35-59 Weak: Price within 20% of base-case value.
    0-34 Poor: Price above base-case value.
  "impliedExpectations"
    85-100 Strong: Reverse DCF shows the price assumes revenue growth at least 500bp below the five-year delivered rate.
    60-84 Adequate: Price assumes growth within 500bp of the five-year delivered rate.
    35-59 Weak: Price assumes growth above the delivered rate but inside the top quartile of the base-rate distribution.
    0-34 Poor: Price assumes growth beyond the ninetieth percentile of what companies in this situation have historically achieved.
  "scenarioAsymmetry"
    85-100 Strong: Bull upside is more than three times bear downside, with probabilities stated.
    60-84 Adequate: Upside two to three times downside.
    35-59 Weak: Upside roughly equal to downside.
    0-34 Poor: Downside exceeds upside.
  "catalystAdjusted"
    85-100 Strong: Two or more dated catalysts inside the horizon, each with the mechanism and the earnings or multiple effect stated.
    60-84 Adequate: One dated catalyst, or several identified without dates.
    35-59 Weak: No catalyst named; re-rating depends on sentiment alone.
    0-34 Poor: Every identifiable catalyst inside the horizon points the wrong way.

### Risk and quality control — key "riskQuality"
  "balanceSheet"
    85-100 Strong: Net cash, or net debt to EBITDA below one with interest cover above eight, on lease-adjusted figures.
    60-84 Adequate: Net debt to EBITDA of one to two, cover above four.
    35-59 Weak: Net debt to EBITDA of two to three and a half, or a near-term maturity wall.
    0-34 Poor: Above three and a half times, cover below two, or covenant headroom exhausted.
  "accounting"
    85-100 Strong: Cumulative operating cash flow exceeds cumulative profit after tax over ten years; clean audit reports; accruals low and stable; cash yields a market rate of interest.
    60-84 Adequate: Cash conversion adequate over a cycle; no qualifications; accruals unremarkable.
    35-59 Weak: Cash conversion persistently below 70%, rising accruals, or an emphasis of matter.
    0-34 Poor: Auditor resigned or was replaced under dispute, adverse internal-control opinion, cash on the books yielding far below market, or profit that has never become cash.
  "governance"
    85-100 Strong: Independent board with genuine oversight, long-tenured credible auditor, immaterial and fully disclosed related-party dealing, no regulatory action.
    60-84 Adequate: Compliant with the listing rules; nothing adverse on the record.
    35-59 Weak: Independence nominal, related-party transactions material, or minor compliance penalties.
    0-34 Poor: Regulatory enforcement, debarment, undisclosed related-party dealing, or an Issuer Not Cooperating rating.
  "promoter"
    85-100 Strong: No pledge, promoter holding stable or rising through open-market purchases, clean record across every register searched.
    60-84 Adequate: No pledge, holding stable, nothing adverse found.
    35-59 Weak: Pledge under 25%, or steady promoter selling without explanation.
    0-34 Poor: Pledge above 50%, pledge invoked, or any register showing enforcement against a promoter.
  "customerConcentration"
    85-100 Strong: Largest customer under 10% of revenue; top ten under 30%.
    60-84 Adequate: Largest under 20%; top ten under 50%.
    35-59 Weak: Largest 20 to 30%, or top ten above 50%.
    0-34 Poor: Largest above 30%, or dependence on a single government programme.
  "regulatory"
    85-100 Strong: Stable regime; the company benefits from the direction of policy; no pending adverse proposals.
    60-84 Adequate: Stable regime with normal compliance obligations.
    35-59 Weak: Regime under review, or a material pending proposal that could change economics.
    0-34 Poor: Regime hostile or changing against the company; a licence is at risk.
  "cyclicality"
    85-100 Strong: Demand largely non-discretionary; revenue fell less than 10% in the last downturn.
    60-84 Adequate: Moderately cyclical; recovered within a year.
    35-59 Weak: Strongly cyclical; earnings fell by more than half in the last downturn.
    0-34 Poor: Deep commodity cyclicality with losses at the trough.
  "competition"
    85-100 Strong: Few credible competitors; structural barriers to entry; no new entrant in five years.
    60-84 Adequate: Competitive but rational; pricing discipline holds.
    35-59 Weak: Intensifying competition or new capacity entering the market.
    0-34 Poor: Price war under way, or a much larger entrant has arrived.
  "technology"
    85-100 Strong: The company sets the technical standard, or the core technology has been stable for ten years with no substitute in development.
    60-84 Adequate: Keeps pace; research spend within 100bp of the industry median and no capability gap named by customers.
    35-59 Weak: Behind on one technology shift that is already visible, with no funded programme to close it.
    0-34 Poor: A substitute is already cheaper or better on the specification customers buy on.
  "execution"
    85-100 Strong: Consistent delivery on stated plans over five years, verifiable in the accounts.
    60-84 Adequate: Mostly delivers; delays explained and recovered.
    35-59 Weak: A record of missed timelines or cost overruns.
    0-34 Poor: Repeated failures; projects abandoned or written off.
  "liquidity"
    85-100 Strong: Average daily traded value comfortably supports a full position; a position can be exited in days at 20% of daily volume.
    60-84 Adequate: Adequate liquidity; exit in a few weeks.
    35-59 Weak: Thin; exit would take more than a month, or the impact cost is material.
    0-34 Poor: Illiquid; the position could not be exited without moving the price, or the stock is under a surveillance measure.
  "geopolitics"
    85-100 Strong: No material exposure to sanctions, single-country supply chains or contested trade routes.
    60-84 Adequate: Some import or export exposure, diversified.
    35-59 Weak: Dependent on one country for supply or demand.
    0-34 Poor: Exposed to sanctions, export controls or an active conflict.
  "valuationRisk"
    85-100 Strong: Multiple below the ten-year median; a de-rating from here would be modest.
    60-84 Adequate: Multiple near the median.
    35-59 Weak: Multiple above the median; a return to median costs materially.
    0-34 Poor: Multiple near an all-time high; a return to median wipes out several years of earnings growth.
  "dilution"
    85-100 Strong: No dilution in five years; no outstanding options, warrants or convertibles of significance.
    60-84 Adequate: Modest employee options, under 2% of the diluted count.
    35-59 Weak: Outstanding instruments of 2 to 8% of the diluted count, or a stated intention to raise.
    0-34 Poor: Above 8% overhang, a repeated record of raising equity, or a preferential issue to related parties.

### Overall dimensions — key "dimensions"
  "financialQuality"
    85-100 Strong: Ten years of audited accounts, cash conversion above 80% across the period, returns above cost of capital in every year, no restatement.
    60-84 Adequate: Consistent accounts with adequate cash conversion and returns above cost of capital in most years.
    35-59 Weak: Volatile returns, cash conversion below 70%, or a restatement in the period.
    0-34 Poor: Losses, negative operating cash flow, or accounts that cannot be relied upon.
  "managementGovernance"
    85-100 Strong: Public guidance met or beaten in four of the last five years, independent majority board, clean record across every register searched, capital allocation explained before it is made.
    60-84 Adequate: Guidance broadly met, board compliant with the listing rules, nothing adverse found in any register.
    35-59 Weak: Weak disclosure, board independence nominal, or two or more capital decisions never explained.
    0-34 Poor: Any severe governance or promoter finding, or one or more registers returning an enforcement action.
  "technicalEntry"
    85-100 Strong: Above the 200-day average in an established uptrend, volume confirming, and not extended against its own range.
    60-84 Adequate: Constructive structure; no distribution signature.
    35-59 Weak: Below the 200-day average, or extended after a sharp run.
    0-34 Poor: In a confirmed downtrend on rising volume, or price history too short to read.
  "catalysts"
    85-100 Strong: Two or more dated catalysts within the horizon, each with a stated mechanism.
    60-84 Adequate: One dated catalyst, or several undated but identified.
    35-59 Weak: Catalysts vague or dependent on sentiment.
    0-34 Poor: No catalyst, or the identifiable ones are negative.

═══════════════════════════════════════════════════════════════════
4. THE FINANCIAL MODEL
═══════════════════════════════════════════════════════════════════

Do not supply cash flows. Supply the drivers, and the application builds the
model, ties the three statements together and checks that they tie.

Include the model block only if you can source its drivers. A partial block is
rejected outright. An omitted block costs a section of the report; an invented
one corrupts everything downstream of it.

Every segment needs volume, realisation and a gross margin, each with evidence.
Share count must be fully diluted: state ESOPs outstanding, warrants and
convertibles, and state zero if there genuinely are none. Omitting the overhang
is the commonest error on Indian small caps and it moves per-share value.

═══════════════════════════════════════════════════════════════════
5. FORENSIC INPUTS
═══════════════════════════════════════════════════════════════════

Supply the line items and the application runs Beneish, Altman, Piotroski,
Montier, Sloan accruals, the cash-yield test, cash against profit over a decade,
capex against depreciation, related-party intensity, contingent liabilities,
effective tax rate, other income share, standalone against consolidated,
receivables against growth, and the pledge test.

Two consecutive years are needed for the composite scores. Ten years of profit
and operating cash flow are needed for the single best test available: whether
reported profit ever became cash.

Report these disclosure findings as true or false. Do not soften them:
  "auditorResignedWithin24Months" (severe) — The auditor resigned or was replaced under dispute within the last 24 months.
  "adverseIcfrOpinion" (severe) — An adverse opinion on internal financial controls.
  "issuerNotCooperatingRating" (severe) — A rating agency has moved the issuer to Issuer Not Cooperating.
  "sebiDebarment" (severe) — A SEBI debarment or ongoing enforcement action against the company or a promoter.
  "auditQualification" (moderate) — A qualification in the audit report.
  "emphasisOfMatter" (low) — An emphasis of matter in the audit report.
  "caroStatutoryDuesDelay" (moderate) — CARO reports delays in statutory dues.
  "surveillanceMeasure" (moderate) — The security is under an exchange surveillance measure.
  "auditorTenureUnderTwoYears" (low) — The auditor has been in place less than two years.
  "unauditedSubsidiaries" (moderate) — Material subsidiaries whose accounts were not audited by the principal auditor.
  "nonAuditFeeExceedsAuditFee" (moderate) — Non-audit fees paid to the auditor exceed the audit fee.
  "distributionFundedByBorrowing" (moderate) — Dividend or buyback funded by fresh borrowing rather than free cash flow.

═══════════════════════════════════════════════════════════════════
6. LITIGATION AND REGULATORY REGISTERS
═══════════════════════════════════════════════════════════════════

Search each register against the company, each promoter individually, and each
material subsidiary. Record every search, including the ones that came back
clean and the ones you could not reach. A register never searched and a register
that came back clean look identical in a report unless the report says which.

  [essential] indiankanoon — Indian Kanoon. Find it via: indiankanoon.org search by party name
  [essential] ecourts — e-Courts and NJDG. Find it via: ecourts.gov.in case status by party
  [essential] nclt — NCLT. Find it via: nclt.gov.in orders, and a named search
  [if relevant] nclat — NCLAT. Find it via: nclat.gov.in judgements
  [essential] ibbi — IBBI. Find it via: ibbi.gov.in ongoing and closed insolvency proceedings
  [essential] sebi_orders — SEBI enforcement orders. Find it via: site:sebi.gov.in orders, searched for the company and each promoter
  [essential] sebi_settlement — SEBI settlement orders. Find it via: sebi.gov.in settlement orders
  [essential] sebi_debarment — SEBI debarment list. Find it via: sebi.gov.in list of debarred entities
  [essential] mca_master — MCA master data. Find it via: mca.gov.in company master data
  [essential] mca_charges — MCA index of charges. Find it via: mca.gov.in index of charges — holder, amount, date, satisfaction
  [essential] mca_din — MCA DIN and disqualified directors. Find it via: mca.gov.in DIN status and the disqualified directors list
  [if relevant] cestat — CESTAT. Find it via: cestat.gov.in orders by party
  [if relevant] itat — ITAT. Find it via: itat.gov.in orders by party
  [if relevant] gst_appellate — State GST appellate portals. Find it via: the relevant state GST appellate authority
  [if relevant] ncdrc — NCDRC. Find it via: ncdrc.nic.in case search
  [if relevant] epfo — EPFO. Find it via: EPFO default and arrears records
  [essential] exchange_lodr — Exchange LODR non-compliance and penalties. Find it via: NSE and BSE non-compliance filings and penalty statements
  [essential] surveillance — Exchange surveillance measures. Find it via: NSE and BSE ASM, GSM and trade-to-trade lists
  [essential] rating_actions — Credit rating actions. Find it via: CRISIL, ICRA, CARE, India Ratings, Brickwork and Acuité, including withdrawal and Issuer Not Cooperating
  [if relevant] ed_fema — ED and FEMA matters. Find it via: a dated named search plus exchange disclosures
  [if relevant] tax_search — Income-tax search or survey disclosures. Find it via: exchange disclosures and dated media
  [essential] media — Dated media search. Find it via: a named search restricted by date, covering the company and each promoter

Outcome is one of: "clear", "matters found", "register unreachable".
If the outcome is "matters found", list the matters with a severity and summary.
A company that has not had every essential register searched cannot enter the
Top 3, however well it scores.

═══════════════════════════════════════════════════════════════════
7. THE SEGMENT: WHAT MAKES THIS RESEARCH RATHER THAN SCORING
═══════════════════════════════════════════════════════════════════

The reference standard for this document is a sector thematic that spends fifty
pages establishing why an industry will compound before it names a company. The
segment is the argument; the companies are how it is expressed. Work in that
order.

**The world.** Global market size and its compound growth over fifteen, ten,
five and three years. The structural forces reshaping it. A table of global
peers with market capitalisation, five-year return, forward multiple, growth
history and forecast, and a plain sentence on what each one actually makes.
Then where India sits, and the trade flowing each way.

**India.** Growth, inflation, the policy rate, the currency, credit growth and
capacity utilisation, each with its period and source. An undated macro figure
is not usable.

**The Union Budget.** The allocations that touch this segment, over five years,
each with what was announced and what was actually spent. The gap between the
two is usually the story. Add the Economic Survey's own reading of the segment.

**Policy.** Each scheme to the same template: name, ministry, objective,
funding and scope, outcomes to date, challenges, and how it reaches this
segment. Then the evolution of the regime by era, with dates. A segment thesis
that never mentions policy is not an Indian equity thesis.

**Regulation.** The regulator, the rules, what is under review, and what a
change would cost.

**Geopolitics and supply chains.** Import dependence, export exposure, tariff
and sanction risk, and supply-chain concentration, with the trade data behind
each claim.

**The industry.** Structure, where it sits in its cycle, the demand drivers each
tagged positive or negative, where the profit pool sits and whether it is
moving, and the technology shift.

**The value chain.** Node by node, upstream to downstream, with the listed
companies at each node named — direct beneficiaries and second order both.

**TAM, SAM and SOM**, each with its basis, year and source.

**Programmes and contracts.** The major national programmes, tenders or order
pipelines driving demand. Each with scale, timeline, participants, and — this is
the part that matters — which listed companies supply what into it. A programme
that is not traced to a listed supplier is background, not research.

**Competition.** Share by player with the basis stated, because volume share and
value share are different numbers. Concentration, entry barriers, substitution
and pricing behaviour.

**Key monitorables.** What would confirm or break the segment thesis. This is
the sector-level equivalent of a thesis breaker.

**Glossary.** Every sector has its own vocabulary. A reader who does not know
what book-to-bill or indigenous content or persistency means cannot use the
report.

═══════════════════════════════════════════════════════════════════
8. EACH COMPANY: THE ARGUMENT
═══════════════════════════════════════════════════════════════════

**Three numbered theses.** Each a claim, with the mechanism that makes it true
and the evidence that it is. "Margin expansion" is not a thesis. "Backward
integration into the cathode step removes a 340 basis point import cost from
FY28, and the plant is commissioned" is.

**The moat, argued.** Name the barrier and give the evidence that it has held
through something.

**Management.** Who they are, how long they have been there, and what they
promised against what they delivered. That record is how management is actually
judged.

**Capital allocation.** Ten years of where the cash went and what it earned.

**Why the market has this wrong.** Numbered concerns, each stated in the bear's
own words and then answered. Stating the bear case and leaving it there is not
research; neither is answering a case nobody makes.

**Peers**, on the metrics that suit the sector.

**ESG**, against those peers.

**Snapshot and shareholding.** Market capitalisation, free float, average daily
traded value, the 52-week range, performance at three, six and twelve months
absolute and against the index, and the shareholding pattern quarter by quarter
including pledged shares.

═══════════════════════════════════════════════════════════════════
9. THE JSON
═══════════════════════════════════════════════════════════════════

{
  "run": {
    "schemaVersion": "3.0.0",
    "segment": "[SEGMENT]",
    "subsegment": null,
    "horizon": "3-5",
    "generatedAt": "ISO 8601 timestamp",
    "searchesRun": 0,
    "top3": [ { "symbol": "", "name": "", "why": "one line on why it makes the three" } ],
    "researchNotes": "what you could and could not establish, and why"
  },
  "industryMap": {
    "structure": "", "valueChain": "second and third order beneficiaries too",
    "tam": "size, basis and source, or a statement that it is not verifiable",
    "policy": "", "geopolitics": ""
  },
  "universe": { "identified": 0, "screened": 0, "exclusions": [ { "symbol": "", "reason": "" } ] },

  "global": { "marketSize": 0, "unit": "", "source": "",
    "cagr": { "y15": 0, "y10": 0, "y5": 0, "y3": 0 },
    "forces": ["what is reshaping the industry"],
    "indiaPosition": "",
    "peers": [ { "name": "", "country": "", "marketCap": 0, "return5y": 0,
      "forwardPe": 0, "growthPast": 0, "growthForecast": 0, "makes": "" } ] },

  "macro": {
    "gdpGrowth":          { "value": 0, "period": "", "source": "" },
    "inflation":          { "value": 0, "period": "", "source": "" },
    "policyRate":         { "value": 0, "period": "", "source": "" },
    "currency":           { "value": 0, "period": "", "source": "" },
    "creditGrowth":       { "value": 0, "period": "", "source": "" },
    "capacityUtilisation":{ "value": 0, "period": "", "source": "" } },

  "budget": { "economicSurvey": "the Survey's own reading of this segment",
    "allocations": [ { "head": "", "year": "FY26", "announced": 0, "spent": 0,
      "ministry": "", "reachesSegment": "" } ] },

  "policy": [ { "name": "", "ministry": "", "announced": "", "objective": "",
    "funding": "", "outcomes": "", "challenges": "", "reachesSegment": "" } ],
  "policyEvolution": [ { "era": "1991 to 2001", "what": "" } ],
  "regulation": { "regulator": "", "rules": "", "underReview": "", "costOfChange": "" },

  "geopolitics": { "importDependence": "", "exportExposure": "", "tariffRisk": "",
    "sanctionRisk": "", "concentration": "",
    "tradeData": [ { "flow": "import or export", "partner": "", "value": 0, "year": "", "source": "" } ] },

  "industry": { "structure": "", "cyclePosition": "", "profitPool": "",
    "technologyShift": "",
    "demandDrivers": [ { "driver": "", "direction": "positive or negative", "why": "" } ] },

  "valueChain": [ { "name": "node, upstream to downstream", "what": "",
    "beneficiaries": ["listed company names at this node"],
    "secondOrder": ["listed companies one step removed"] } ],

  "tam": { "tam": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" },
           "sam": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" },
           "som": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" } },

  "programs": [ { "name": "", "scale": 0, "unit": "", "timeline": "",
    "participants": "", "challenges": "",
    "beneficiaries": [ { "symbol": "", "name": "", "supplies": "", "shareOfProgram": "" } ] } ],

  "competition": { "concentration": "", "entryBarriers": "", "substitution": "",
    "pricingBehaviour": "",
    "players": [ { "name": "", "listed": true, "share": 0, "basis": "volume or value",
      "asOf": "", "source": "" } ] },

  "sectorValuation": { "currentMultiple": 0, "metric": "", "tenYearMedian": 0,
    "tenYearHigh": 0, "tenYearLow": 0, "source": "" },

  "monitorables": ["what would confirm or break the segment thesis"],
  "glossary": [ { "term": "", "meaning": "" } ],
  "companies": [
    {
      "symbol": "", "name": "", "exchange": "NSE or BSE",
      "sector": "banking, nbfc, insurance, manufacturing, commodity, pharma, it, infrastructure or defence",
      "business": "what it does and how it earns",
      "thesis": ["three falsifiable lines"],

      "snapshot": { "marketCap": 0, "freeFloatPct": 0, "avgDailyValue": 0,
        "week52High": 0, "week52Low": 0,
        "performance": { "m3": 0, "m6": 0, "m12": 0,
                         "m3Relative": 0, "m6Relative": 0, "m12Relative": 0 } },
      "shareholding": [ { "period": "Q1FY26", "promoter": 0, "fii": 0, "dii": 0,
        "public": 0, "pledged": 0 } ],

      "theses": [ { "claim": "", "mechanism": "", "evidence": "", "size": "", "by": "when" } ],
      "moat": { "barrier": "", "evidence": "", "testSurvived": "", "durability": "" },
      "management": {
        "people": [ { "name": "", "role": "", "since": "", "background": "" } ],
        "guidanceRecord": [ { "period": "", "promised": "", "delivered": "" } ] },
      "capitalAllocation": { "summary": "",
        "tenYear": [ { "period": "", "operatingCash": 0, "capex": 0, "acquisitions": 0,
          "dividends": 0, "buyback": 0, "debtRepaid": 0, "returnEarned": 0 } ] },
      "mispricing": [ { "concern": "the bear's argument, in the bear's own words",
        "answer": "why it is wrong, or why it is priced in twice over" } ],
      "peers": [ { "name": "", "listed": true, "metric1": 0, "metric2": 0, "note": "" } ],
      "esg": { "environment": "", "social": "", "governance": "",
        "versusPeers": "", "score": null },
      "timeline": [ { "when": "", "event": "" } ],

      "businessQuality": { "moat", "industryPosition", "revenueQuality", "pricingPower", "customerQuality", "productQuality", "tamRunway", "management", "governance", "capitalAllocation", "resilience" },
      "growthMultibagger": { "tam", "revenueRunway", "epsGrowth", "marketShare", "reinvestment", "incrementalReturns", "operatingLeverage", "marginExpansion", "newProductsMarkets", "exports", "capacity", "execution", "longevity" },
      "valuationOpportunity": { "dcf", "relativeValuation", "historicalValuation", "peerValuation", "growthAdjustedValuation", "fcfYield", "marginOfSafety", "impliedExpectations", "scenarioAsymmetry", "catalystAdjusted" },
      "riskQuality": { "balanceSheet", "accounting", "governance", "promoter", "customerConcentration", "regulatory", "cyclicality", "competition", "technology", "execution", "liquidity", "geopolitics", "valuationRisk", "dilution" },
      "dimensions": { "financialQuality", "managementGovernance", "technicalEntry", "catalysts" },

      "redFlags": [ { "category": "one of: accounting, governance, promoter, solvency, dataIntegrity, regulatory, cyclicality, competition, technology, execution, liquidity, geopolitics, valuation, dilution, customerConcentration", "severity": "low, moderate or severe", "detail": "" } ],

      "forensic": {
        "current": { "revenue": 0, "receivables": 0, "grossProfit": 0, "currentAssets": 0,
          "netFixedAssets": 0, "grossFixedAssets": 0, "totalAssets": 0, "depreciation": 0,
          "sga": 0, "currentLiabilities": 0, "longTermDebt": 0, "netProfit": 0,
          "cashFromOperations": 0, "inventory": 0, "otherCurrentAssets": 0, "shares": 0, "ebit": 0 },
        "prior": { "same fields for the previous year": 0 },
        "decade": [ { "period": "FY16", "netProfit": 0, "cashFromOperations": 0, "capex": 0, "depreciation": 0 } ],
        "inputs": { "workingCapital": 0, "retainedEarnings": 0, "totalLiabilities": 0, "bookEquity": 0,
          "cashAndEquivalents": 0, "interestIncome": 0, "depositRate": 0.07, "rptRevenue": 0,
          "rptPurchases": 0, "rptLoans": 0, "purchases": 0, "netWorth": 0, "contingentLiabilities": 0,
          "tax": 0, "profitBeforeTax": 0, "statutoryRate": 0.25, "otherIncome": 0,
          "standaloneProfit": 0, "consolidatedProfit": 0, "revenueGrowthPct": 0,
          "receivableGrowthPct": 0, "pledgePctOfPromoterHolding": 0, "priceChangePct": 0 },
        "disclosures": { "auditorResignedWithin24Months": false }
      },

      "litigation": { "searched": [
        { "register": "sebi_orders", "subject": "company or promoter or subsidiary",
          "subjectName": "", "outcome": "clear", "detail": "",
          "matters": [ { "severity": "", "category": "", "summary": "", "status": "", "amount": null } ] }
      ] },

      "model": {
        "years": 5,
        "segments": [ { "name": "", "baseVolume": 0, "volumeCagr": 0.0, "baseRealisation": 0,
          "realisationCagr": 0.0, "grossMargin": 0.0, "evidence": "" } ],
        "opex": { "fixedBase": 0, "fixedGrowth": 0.0, "variablePctOfRevenue": 0.0 },
        "depreciation": { "openingNetBlock": 0, "rate": 0.0 },
        "capex": { "maintenancePctOfRevenue": 0.0, "growthSchedule": [0, 0, 0, 0, 0] },
        "workingCapital": { "receivableDays": 0, "inventoryDays": 0, "payableDays": 0 },
        "financing": { "openingDebt": 0, "repaymentSchedule": [0, 0, 0, 0, 0], "drawdownSchedule": 0,
          "interestRate": 0.0, "taxRate": 0.25, "openingCash": 0, "cashYield": 0.0 },
        "shares": { "basic": 0, "esop": 0, "warrants": 0, "convertibles": 0 }
      },

      "valuation": {
        "currentPrice": 0, "priceAsOf": "", "currency": "INR",
        "discountRate": 0.0, "terminalGrowth": 0.0,
        "method": "which methods and why they suit this sector",
        "bear": { "fairValue": 0, "assumptions": "", "probability": 0.25 },
        "base": { "fairValue": 0, "assumptions": "", "probability": 0.50 },
        "bull": { "fairValue": 0, "assumptions": "", "probability": 0.25 }
      },

      "consensus": { "source": "", "asOf": "", "estimateCount": 0,
        "revenue": { "y1": 0, "y2": 0 }, "ebitda": { "y1": 0, "y2": 0 }, "eps": { "y1": 0, "y2": 0 },
        "revisionDirection": "up, down or flat" },

      "liquidity": { "avgDailyValue": 0, "currency": "INR", "impactCostPct": 0, "freeFloatPct": 0 },
      "ownership": { "promoter": 0, "fii": 0, "dii": 0, "public": 0,
        "quarters": [ { "period": "", "promoter": 0, "fii": 0, "dii": 0 } ],
        "insiderActivity": "" },

      "baseRates": { "claim": "the growth or margin assumption being made",
        "historicalShare": 0.0, "source": "how often companies in this situation sustained it" },

      "financials": { "annual": [ { "period": "FY25", "basis": "consolidated", "revenue": 0 } ],
        "quarterly": [ { "period": "Q1FY26", "basis": "consolidated" } ] },

      "priceHistory": { "asOf": "", "adjusted": true, "closes": [], "volumes": [], "benchmarkCloses": [] },

      "multibagger": { "plausibility": { "3x@3-5": "", "5x@3-5": "", "10x@3-5": "" },
        "chain": "TAM to share to revenue to margin to cash to reinvestment to returns to value" },

      "variantPerception": { "marketBelieves": "", "researchIndicates": "", "difference": "",
        "evidence": "", "consequence": "" },
      "bearCase": { "argument": "the strongest case against, in its own best form", "answer": "why it is wrong" },
      "technicals": { "summary": "", "dataQuality": "" },
      "catalysts": [ { "event": "", "expectedWindow": "", "impact": "" } ],
      "risks": [ { "risk": "", "severity": "", "probability": 0.0, "impactPct": 0 } ],
      "thesisBreakers": ["at least five measurable conditions that would invalidate the thesis"],
      "upgradeTriggers": ["what would make you more positive"],
      "managementQuestions": ["what you would ask on the next call"],
      "conflicts": [ { "figure": "", "sources": "", "preferred": "", "why": "" } ],
      "sources": [ { "title": "", "publisher": "", "tier": 1, "date": "", "url": "", "evidence": "FACT" } ]
    }
  ]
}

═══════════════════════════════════════════════════════════════════
8. RULES THE APPLICATION ENFORCES
═══════════════════════════════════════════════════════════════════

1. The kill switch. A severe flag in any of accounting, governance, promoter, solvency, dataIntegrity bars a
   company from the Top 3 no matter how well it scores. So does a missing
   forensic block, a missing litigation search, and any essential register left
   unsearched. Report severe findings as severe.

2. Bear must not exceed bull. Scenario probabilities must sum to 1. Fair values
   are per share, in INR, on the same basis as currentPrice.

3. Consolidated and standalone must not be mixed, and neither must FY and TTM.
   One basis per series, stated on every row.

4. Price history must be adjusted for corporate actions and marked adjusted.
   An unadjusted series produces readings that are wrong, not merely stale.

5. Banks, NBFCs and insurers do not receive ROCE, ROIC or EV multiples. The
   application withholds them. Do not work around it.

6. At least five thesis breakers, each measurable, and at least one upgrade
   trigger. Carrying only downside triggers biases the product.

7. Never invent a figure, a source, a filing, a date or a URL. Where something
   is not verifiable, say so in the relevant field and use null.

8. Shortlist roughly 12 companies for full treatment, and list what
   you screened out and why.

9. The segment blocks are not optional decoration. A report with scores and no
   macro, no Budget, no policy and no programmes is a scoring appendix, not
   research. Where something genuinely cannot be established, omit the block and
   say so in run.researchNotes — the application prints the gap.

10. Every figure carries its period and its source. An undated number is not
    evidence, and the application will print it as undated.

11. Return the payload as the last thing in your reply, in one fenced json code
    block, so it carries a copy button. Nothing after the closing fence.

12. If a block is still cut off by a length limit, stop at a complete object,
    end the block, and write CONTINUE on the line after it. Send the remainder in
    the next reply in the same fenced form.

═══════════════════════════════════════════════════════════════════
10. CHECK BEFORE YOU SEND
═══════════════════════════════════════════════════════════════════

The application repairs a great deal on the way in: a list sent as one item, a
number written as text, a probability given as a percentage, a source tier
written as "Tier 1", a financial row that omits its basis, a price series of the
wrong length. None of that needs your attention.

These are the things it cannot repair, because fixing them would mean deciding
what you meant. Check each one before sending:

  1. Every company has a "symbol" and a "name", and no symbol repeats.
  2. Bear fair value is not above bull fair value.
  3. Scenario probabilities are near enough to 1 to be scaled — three numbers
     that sum to 0.3 will be refused, because that is a contradiction rather
     than a rounding error.
  4. Every red flag, litigation matter and risk has a severity that reads as
     low, moderate or severe. High, medium, minor and critical are all read.
  5. Every red flag category is one of the listed ones.
  6. Every litigation register id is one of the listed ones, and the outcome is
     "clear", "matters found" or "register unreachable". An outcome of "matters
     found" has at least one matter under it.
  7. Every source has a title and a tier from 1 to 4, and not every source is
     tier 4.
  8. Every demand driver says "positive" or "negative".
  9. The model block is complete or absent. A half-filled model is refused;
     leaving it out costs one section and is reported as a gap.
  10. Every financial series uses one basis throughout, consolidated or
      standalone, never mixed.

And the rule that matters more than any of them: **use null freely**. Null is
never an error anywhere in this contract. It means you could not establish the
figure, the application prints that as a gap on the report, and the run is
accepted. A guessed number is far worse than a null, and a payload rejected for
honesty would be the worst outcome of all.

11. Return the payload in one fenced json block, as the last thing in the reply.
