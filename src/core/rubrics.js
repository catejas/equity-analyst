// rubrics.js — anchors for every scored component.
//
// A rating with no anchor is a feeling with two significant figures. Each
// component below carries four bands described by something you could go and
// check. The prompt ships these anchors; the payload returns the band chosen
// and the evidence sentence; the report prints the anchor beside the score.
//
// Bands are floors: 85+, 60-84, 35-59, 0-34.

export const BANDS = Object.freeze([85, 60, 35, 0]);
export const BAND_LABELS = Object.freeze(['Strong', 'Adequate', 'Weak', 'Poor']);

const a = (strong, adequate, weak, poor) => [strong, adequate, weak, poor];

export const RUBRICS = Object.freeze({
  businessQuality: {
    moat: a(
      'A named, durable barrier — regulatory licence, network effect, switching cost with evidence of low churn, or a cost position at the bottom of the industry curve — that has held share or margin through at least one downturn.',
      'A real advantage that is visible in the numbers but replicable within three to five years by a determined competitor.',
      'Advantage rests on scale or relationships that have not been tested by a downturn or a new entrant.',
      'No identifiable barrier; returns are explained by the cycle or by a single customer.'),
    industryPosition: a(
      'Number one or two by share in a defined market, with share stable or rising over five years.',
      'Top five with defensible niche share; share flat.',
      'Fragmented position, share drifting down, or share not measurable from any source.',
      'Marginal player losing share to larger competitors.'),
    revenueQuality: a(
      'Majority recurring, contracted or annuity revenue with disclosed renewal rates; low order-to-revenue volatility.',
      'Repeat customers with visible order book covering more than six months.',
      'Project or tender revenue with lumpy recognition and no visibility past a quarter.',
      'Single-shot or trading revenue; revenue recognition policy itself is a question.'),
    pricingPower: a(
      'Raised realisations above input-cost inflation in four of the last five years; gross margin flat or up through a full input cycle.',
      'Passed through most cost inflation with a one to two quarter lag; margin recovered.',
      'Passed through partially; margin reset permanently lower after the last cycle.',
      'Price taker; margin tracks the input commodity with no lag or buffer.'),
    customerQuality: a(
      'Investment-grade or government counterparties, top ten under 30% of revenue, receivable days under industry median.',
      'Reputable counterparties, top ten under 50%, receivables in line with the industry.',
      'Top ten above 50%, or receivable days rising faster than revenue.',
      'Single customer above 30%, or counterparties with known payment problems.'),
    productQuality: a(
      'Approved or qualified on standards that take years to obtain, with third-party validation of performance.',
      'Established product accepted by demanding customers; no material quality recalls.',
      'Commodity product competing largely on price.',
      'Recurring quality failures, recalls or warranty provisions.'),
    tamRunway: a(
      'Addressable market at least ten times current revenue, sized from an official or industry-association source, growing above nominal GDP.',
      'Addressable market three to ten times revenue with a credible growth path.',
      'Addressable market under three times revenue, or sized only from a commissioned study.',
      'Saturated market, or the market size is asserted with no source.'),
    management: a(
      'Guidance given publicly and met or beaten in four of the last five years; tenure through a downturn; capital decisions explained in advance.',
      'Guidance broadly met; management has run the business more than five years.',
      'Guidance given and missed, or no guidance and little disclosure.',
      'Repeated missed guidance, sudden senior departures, or a promoter running the business as a personal account.'),
    governance: a(
      'Independent majority board, independent audit chair, Big Six or established auditor with clean reports, related-party transactions under 2% of revenue and fully disclosed.',
      'Compliant board, credible auditor, related-party transactions disclosed and explicable.',
      'Board independence nominal, auditor small or recently changed, related-party transactions material.',
      'Auditor resignation, adverse internal-control opinion, undisclosed related-party dealing, or a regulatory action against a director.'),
    capitalAllocation: a(
      'Ten-year record of reinvesting at returns above cost of capital; acquisitions earned their price; dividends and buybacks funded from free cash flow.',
      'Sensible reinvestment, no value-destroying acquisition, distribution policy consistent.',
      'Capital deployed into unrelated ventures or at returns below cost of capital.',
      'Cash lent to related parties, acquisitions written off, or distributions funded by borrowing.'),
    resilience: a(
      'Stayed profitable and cash-generative through the last two industry downturns with net cash or low leverage.',
      'Profitability fell but the balance sheet held; no equity raised in distress.',
      'Loss-making in the last downturn, or needed refinancing to get through.',
      'Required rescue equity, restructuring or a lender standstill.'),
  },

  growthMultibagger: {
    tam: a(
      'Headroom of ten times or more, sourced officially, with the company holding under 10% share.',
      'Headroom of three to ten times with a defensible path to more share.',
      'Headroom under three times, or the company already holds most of the market.',
      'No headroom; growth must come from taking share in a shrinking market.'),
    revenueRunway: a(
      'Contracted order book, committed capacity or a signed pipeline covering more than two years of revenue.',
      'Visibility of six to twenty-four months.',
      'Visibility under six months.',
      'No visibility; revenue is rebuilt every quarter.'),
    epsGrowth: a(
      'Earnings per share compounded above 20% over five years, on a fully diluted count, without one-off gains.',
      'Compounded 12 to 20%, or above 20% but only over three years.',
      'Compounded under 12%, or growth driven by other income or lower tax.',
      'Flat or falling earnings per share, or growth reversed by dilution.'),
    marketShare: a(
      'Share gained in each of the last three years, with the source and the definition stated.',
      'Share held within 50bp over three years, measured on a stated definition.',
      'Share drifting down, or not measurable.',
      'Share lost to a structurally advantaged competitor.'),
    reinvestment: a(
      'Reinvests more than half of operating cash flow into the core business at incremental returns above 20%.',
      'Reinvests a meaningful share at returns above the cost of capital.',
      'Reinvestment low relative to opportunity, or into low-return assets.',
      'Cash accumulating idle, or reinvested outside the business.'),
    incrementalReturns: a(
      'Incremental return on invested capital above 25% across rolling five-year windows.',
      'Incremental returns of 15 to 25%.',
      'Incremental returns between the cost of capital and 15%.',
      'Incremental returns below the cost of capital; growth destroys value.'),
    operatingLeverage: a(
      'Fixed costs above 40% of the cost base; incremental EBITDA margin has run at least 500bp above the reported margin as volume rose.',
      'Some operating leverage visible over a cycle; incremental margin above reported but by less than 500bp.',
      'Largely variable cost base; EBITDA margin flat within 100bp across a doubling of volume.',
      'Negative leverage; costs have grown faster than revenue in three of the last five years.'),
    marginExpansion: a(
      'A named driver of expansion — mix, backward integration, scale or price — quantified in basis points with a stated commissioning or delivery date.',
      'A named driver stated with a direction but no size or date attached to it.',
      'Expansion assumed in the forecast with no driver named anywhere in the filings or the calls.',
      'Margin fell in three of the last five years and the cause is structural rather than cyclical.'),
    newProductsMarkets: a(
      'New products or geographies already contributing more than 10% of revenue with disclosed economics.',
      'Launched and contributing, economics not yet clear.',
      'Announced but not launched.',
      'No pipeline, or a record of failed launches.'),
    exports: a(
      'Exports above 25% of revenue into demanding regulated markets, with approvals or qualifications in hand.',
      'Exports 10 to 25%, or growing from a small base with customers named.',
      'Exports under 10% and opportunistic.',
      'No exports and no qualification path.'),
    capacity: a(
      'Capacity in place or funded for the modelled revenue, with utilisation disclosed and commissioning dates given.',
      'Expansion announced and funded; timeline plausible.',
      'Expansion needed but not funded.',
      'Already at capacity with no plan, or capital work in progress ageing without commissioning.'),
    execution: a(
      'Every one of the last three expansions commissioned within two quarters of the announced date and within 10% of the announced cost, verifiable in the fixed-asset schedule.',
      'Most projects delivered; delays under four quarters and explained in the calls at the time.',
      'Two or more projects delayed beyond four quarters, or costs overrun by more than 25%.',
      'A project abandoned or written off, or capital work in progress ageing beyond three years without commissioning.'),
    longevity: a(
      'The product or service is very likely to be needed in fifteen years, with no visible technological substitute.',
      'Needed in ten years, with a substitute possible but distant.',
      'Demand depends on a policy or subsidy that could lapse.',
      'Facing a known technological or regulatory obsolescence.'),
  },

  valuationOpportunity: {
    dcf: a(
      'Driver-based model gives intrinsic value more than 50% above price, with the drivers inside historical base rates.',
      'Intrinsic value 20 to 50% above price.',
      'Intrinsic value within 20% of price.',
      'Intrinsic value below price on base-case drivers.'),
    relativeValuation: a(
      'Trades at a material discount to the sector on the metric that suits the sector, with no quality reason for the discount.',
      'Trades in line with the sector while earning above-sector returns.',
      'Trades at a premium justified only by recent growth.',
      'Trades at a premium with returns below the sector.'),
    historicalValuation: a(
      'Below its own ten-year median multiple while fundamentals are unchanged or better.',
      'Around its own median.',
      'Above its median with no improvement in returns.',
      'At or near an all-time high multiple.'),
    peerValuation: a(
      'Cheapest in a peer set defined by economics rather than by sector label, on at least two metrics.',
      'Mid-range against economic peers.',
      'Expensive against economic peers on most metrics.',
      'Most expensive in the peer set with the weakest returns.'),
    growthAdjustedValuation: a(
      'PEG below 1 on earnings growth the base rates support.',
      'PEG between 1 and 1.5.',
      'PEG between 1.5 and 2.5, or growth rate not supported by base rates.',
      'PEG above 2.5, or growth is negative so the ratio is meaningless.'),
    fcfYield: a(
      'Free cash flow yield above the ten-year government bond yield.',
      'Yield positive but below the bond yield.',
      'Free cash flow near zero.',
      'Free cash flow persistently negative.'),
    marginOfSafety: a(
      'Price is more than 40% below base-case intrinsic value, and below the bear case is still a limited loss.',
      'Price 20 to 40% below base-case value.',
      'Price within 20% of base-case value.',
      'Price above base-case value.'),
    impliedExpectations: a(
      'Reverse DCF shows the price assumes revenue growth at least 500bp below the five-year delivered rate.',
      'Price assumes growth within 500bp of the five-year delivered rate.',
      'Price assumes growth above the delivered rate but inside the top quartile of the base-rate distribution.',
      'Price assumes growth beyond the ninetieth percentile of what companies in this situation have historically achieved.'),
    scenarioAsymmetry: a(
      'Bull upside is more than three times bear downside, with probabilities stated.',
      'Upside two to three times downside.',
      'Upside roughly equal to downside.',
      'Downside exceeds upside.'),
    catalystAdjusted: a(
      'Two or more dated catalysts inside the horizon, each with the mechanism and the earnings or multiple effect stated.',
      'One dated catalyst, or several identified without dates.',
      'No catalyst named; re-rating depends on sentiment alone.',
      'Every identifiable catalyst inside the horizon points the wrong way.'),
  },

  riskQuality: {
    balanceSheet: a(
      'Net cash, or net debt to EBITDA below one with interest cover above eight, on lease-adjusted figures.',
      'Net debt to EBITDA of one to two, cover above four.',
      'Net debt to EBITDA of two to three and a half, or a near-term maturity wall.',
      'Above three and a half times, cover below two, or covenant headroom exhausted.'),
    accounting: a(
      'Cumulative operating cash flow exceeds cumulative profit after tax over ten years; clean audit reports; accruals low and stable; cash yields a market rate of interest.',
      'Cash conversion adequate over a cycle; no qualifications; accruals unremarkable.',
      'Cash conversion persistently below 70%, rising accruals, or an emphasis of matter.',
      'Auditor resigned or was replaced under dispute, adverse internal-control opinion, cash on the books yielding far below market, or profit that has never become cash.'),
    governance: a(
      'Independent board with genuine oversight, long-tenured credible auditor, immaterial and fully disclosed related-party dealing, no regulatory action.',
      'Compliant with the listing rules; nothing adverse on the record.',
      'Independence nominal, related-party transactions material, or minor compliance penalties.',
      'Regulatory enforcement, debarment, undisclosed related-party dealing, or an Issuer Not Cooperating rating.'),
    promoter: a(
      'No pledge, promoter holding stable or rising through open-market purchases, clean record across every register searched.',
      'No pledge, holding stable, nothing adverse found.',
      'Pledge under 25%, or steady promoter selling without explanation.',
      'Pledge above 50%, pledge invoked, or any register showing enforcement against a promoter.'),
    customerConcentration: a(
      'Largest customer under 10% of revenue; top ten under 30%.',
      'Largest under 20%; top ten under 50%.',
      'Largest 20 to 30%, or top ten above 50%.',
      'Largest above 30%, or dependence on a single government programme.'),
    regulatory: a(
      'Stable regime; the company benefits from the direction of policy; no pending adverse proposals.',
      'Stable regime with normal compliance obligations.',
      'Regime under review, or a material pending proposal that could change economics.',
      'Regime hostile or changing against the company; a licence is at risk.'),
    cyclicality: a(
      'Demand largely non-discretionary; revenue fell less than 10% in the last downturn.',
      'Moderately cyclical; recovered within a year.',
      'Strongly cyclical; earnings fell by more than half in the last downturn.',
      'Deep commodity cyclicality with losses at the trough.'),
    competition: a(
      'Few credible competitors; structural barriers to entry; no new entrant in five years.',
      'Competitive but rational; pricing discipline holds.',
      'Intensifying competition or new capacity entering the market.',
      'Price war under way, or a much larger entrant has arrived.'),
    technology: a(
      'The company sets the technical standard, or the core technology has been stable for ten years with no substitute in development.',
      'Keeps pace; research spend within 100bp of the industry median and no capability gap named by customers.',
      'Behind on one technology shift that is already visible, with no funded programme to close it.',
      'A substitute is already cheaper or better on the specification customers buy on.'),
    execution: a(
      'Consistent delivery on stated plans over five years, verifiable in the accounts.',
      'Mostly delivers; delays explained and recovered.',
      'A record of missed timelines or cost overruns.',
      'Repeated failures; projects abandoned or written off.'),
    liquidity: a(
      'Average daily traded value comfortably supports a full position; a position can be exited in days at 20% of daily volume.',
      'Adequate liquidity; exit in a few weeks.',
      'Thin; exit would take more than a month, or the impact cost is material.',
      'Illiquid; the position could not be exited without moving the price, or the stock is under a surveillance measure.'),
    geopolitics: a(
      'No material exposure to sanctions, single-country supply chains or contested trade routes.',
      'Some import or export exposure, diversified.',
      'Dependent on one country for supply or demand.',
      'Exposed to sanctions, export controls or an active conflict.'),
    valuationRisk: a(
      'Multiple below the ten-year median; a de-rating from here would be modest.',
      'Multiple near the median.',
      'Multiple above the median; a return to median costs materially.',
      'Multiple near an all-time high; a return to median wipes out several years of earnings growth.'),
    dilution: a(
      'No dilution in five years; no outstanding options, warrants or convertibles of significance.',
      'Modest employee options, under 2% of the diluted count.',
      'Outstanding instruments of 2 to 8% of the diluted count, or a stated intention to raise.',
      'Above 8% overhang, a repeated record of raising equity, or a preferential issue to related parties.'),
  },
});

// The four overall dimensions that have no pillar of their own.
export const DIMENSION_RUBRICS = Object.freeze({
  financialQuality: a(
    'Ten years of audited accounts, cash conversion above 80% across the period, returns above cost of capital in every year, no restatement.',
    'Consistent accounts with adequate cash conversion and returns above cost of capital in most years.',
    'Volatile returns, cash conversion below 70%, or a restatement in the period.',
    'Losses, negative operating cash flow, or accounts that cannot be relied upon.'),
  managementGovernance: a(
    'Public guidance met or beaten in four of the last five years, independent majority board, clean record across every register searched, capital allocation explained before it is made.',
    'Guidance broadly met, board compliant with the listing rules, nothing adverse found in any register.',
    'Weak disclosure, board independence nominal, or two or more capital decisions never explained.',
    'Any severe governance or promoter finding, or one or more registers returning an enforcement action.'),
  technicalEntry: a(
    'Above the 200-day average in an established uptrend, volume confirming, and not extended against its own range.',
    'Constructive structure; no distribution signature.',
    'Below the 200-day average, or extended after a sharp run.',
    'In a confirmed downtrend on rising volume, or price history too short to read.'),
  catalysts: a(
    'Two or more dated catalysts within the horizon, each with a stated mechanism.',
    'One dated catalyst, or several undated but identified.',
    'Catalysts vague or dependent on sentiment.',
    'No catalyst, or the identifiable ones are negative.'),
});

/** Which band a score falls in, and the anchor text for it. */
export function anchorFor(pillarKey, componentKey, score) {
  const set = pillarKey === 'dimensions'
    ? DIMENSION_RUBRICS[componentKey]
    : RUBRICS[pillarKey]?.[componentKey];
  if (!set) return null;
  if (score === null || score === undefined) return null;
  const i = BANDS.findIndex((floor) => score >= floor);
  return { band: BAND_LABELS[i], floor: BANDS[i], anchor: set[i] };
}

/** Every rubric key, for cross-checking against the scoring engine. */
export function rubricKeys() {
  const out = [];
  for (const [p, comps] of Object.entries(RUBRICS)) {
    for (const c of Object.keys(comps)) out.push(`${p}.${c}`);
  }
  for (const d of Object.keys(DIMENSION_RUBRICS)) out.push(`dimensions.${d}`);
  return out;
}

/**
 * A rating is only usable if it carries evidence. This is the gate that stops
 * an unsupported number entering the ranking: no evidence, no score.
 */
export function readRating(raw, { requireEvidence = true } = {}) {
  if (raw === null || raw === undefined) return { score: null, reason: 'Not assessed.' };
  if (typeof raw === 'number') {
    return requireEvidence
      ? { score: null, reason: 'Rating supplied without evidence, so it is not counted.' }
      : { score: raw, evidence: null };
  }
  if (typeof raw !== 'object') return { score: null, reason: 'Rating is not a number or a rating object.' };
  if (raw.score === null || raw.score === undefined) return { score: null, reason: 'Not assessed.' };
  if (typeof raw.score !== 'number' || !Number.isFinite(raw.score)) {
    return { score: null, reason: 'Rating score is not a number.' };
  }
  if (raw.score < 0 || raw.score > 100) return { score: null, reason: `Rating ${raw.score} is out of range.` };
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : '';
  if (requireEvidence && evidence.length < 20) {
    return { score: null, reason: 'Evidence sentence missing or too short to check, so the rating is not counted.' };
  }
  return { score: raw.score, evidence: evidence || null, band: raw.band ?? null, source: raw.source ?? null };
}
