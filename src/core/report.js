// report.js — payload in, report model out.
// The payload supplies evidence and drivers. Every number here is computed.

import { scorePillar, overallScore, forensicBand, METHODOLOGY_VERSION, NOISE_BAND } from './scoring.js';
import { rankUniverse, rankByLens } from './ranking.js';
import { multibaggerGrid, HORIZONS } from './multibagger.js';
import { confidence } from './integrity.js';
import { validatePayload, DIRECT_DIMENSIONS } from './payload-schema.js';
import { screenShortlist, SCREEN_WEIGHTS, MIN_RATED } from './screen.js';
import { auditCompany, lenderLines, lenderForecast } from './audit.js';
import { industryPanel } from './industry.js';
import { readRating, anchorFor } from './rubrics.js';
import { entryContext } from './technicals.js';
import { panel as technicalPanel } from './indicators.js';
import { multibaggerModel, orderedAnnual } from './models.js';
import { dcf, sensitivityGrid, impliedGrowth, multipleBands, checkWaccBuildup } from './valuation.js';
import { buildModel, driverSensitivity, STANDARD_FLEXES } from './model.js';
import { assessLitigation } from './litigation.js';
import * as forensic from './forensic.js';
import * as metrics from './metrics.js';
import { PILLARS } from './scoring.js';

const r2 = (n) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null);

/* What the money figures are in.
 *
 * Nothing in the payload said. Tejas read a report full of bare numbers and
 * asked the only question that matters about them: "what is that? amount in
 * crore, amount in lacs or just the quantity number." There was no answer on
 * the page, because there was no answer in the data.
 *
 * The schema now asks for it. Where a payload predates that, the figures are
 * still labelled — as INR crore, which is what an Indian listed company
 * reports in and what these payloads have in fact always contained — and the
 * assumption is recorded as a gap rather than made silently. An unlabelled
 * number and a number labelled by assumption are different things, and the
 * reader is entitled to know which one is in front of them.
 */
const UNIT_LABEL = {
  crore: 'crore', cr: 'crore', lakh: 'lakh', lac: 'lakh', lacs: 'lakh',
  million: 'million', mn: 'million', billion: 'billion', bn: 'billion',
  thousand: 'thousand', absolute: '', units: '', unit: '', one: '',
};

export function reportingUnits(payload, note) {
  const r = payload?.run?.reporting || {};
  const rawUnit = String(r.unit ?? '').trim().toLowerCase();
  const stated = Object.prototype.hasOwnProperty.call(UNIT_LABEL, rawUnit);
  const currency = String(r.currency ?? '').trim().toUpperCase() || 'INR';
  const unit = stated ? UNIT_LABEL[rawUnit] : 'crore';
  if (!stated && typeof note === 'function') {
    note('The payload did not state what its money figures are in. They are '
      + 'printed as INR crore, which is how Indian listed companies report and '
      + 'what the figures in this payload are consistent with — but it is an '
      + 'assumption, not a statement, so check it against the filings.');
  }
  return {
    currency,
    unit,
    stated,
    /* What goes in a column header: "INR crore", or just "INR" for absolutes. */
    label: unit ? `${currency} ${unit}` : currency,
    basis: String(r.basis ?? '').trim() || null,
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);

function upside(fairValue, currentPrice) {
  if (!isNum(fairValue) || !isNum(currentPrice) || currentPrice <= 0) {
    return { available: false, value: null, reason: 'Price or fair value unavailable.' };
  }
  return { available: true, value: r2(((fairValue - currentPrice) / currentPrice) * 100), unit: '%',
    formula: '(fair value - price) / price', evidence: 'CALCULATION' };
}

function marginOfSafety(baseFairValue, currentPrice) {
  if (!isNum(baseFairValue) || !isNum(currentPrice) || baseFairValue <= 0) {
    return { available: false, value: null, reason: 'Base fair value unavailable.' };
  }
  return { available: true, value: r2(((baseFairValue - currentPrice) / baseFairValue) * 100), unit: '%',
    formula: '(base fair value - price) / base fair value', evidence: 'CALCULATION' };
}

/** Read the rating block, keeping the evidence and the anchor alongside the score. */
function readPillar(pillarKey, supplied) {
  const scores = {};
  const detail = {};
  if (!supplied || typeof supplied !== 'object') return { scores, detail, rejected: 0 };
  let rejected = 0;
  for (const key of Object.keys(PILLARS[pillarKey].weights)) {
    if (supplied[key] === undefined || supplied[key] === null) continue;
    const read = readRating(supplied[key]);
    if (read.score === null) { rejected++; detail[key] = { score: null, reason: read.reason }; continue; }
    scores[key] = read.score;
    detail[key] = { score: read.score, evidence: read.evidence, ...anchorFor(pillarKey, key, read.score) };
  }
  return { scores, detail, rejected };
}

function readDimensions(supplied) {
  const scores = {};
  const detail = {};
  if (!supplied || typeof supplied !== 'object') return { scores, detail };
  for (const key of DIRECT_DIMENSIONS) {
    if (supplied[key] === undefined || supplied[key] === null) continue;
    const read = readRating(supplied[key]);
    if (read.score === null) { detail[key] = { score: null, reason: read.reason }; continue; }
    scores[key] = read.score;
    detail[key] = { score: read.score, evidence: read.evidence, ...anchorFor('dimensions', key, read.score) };
  }
  return { scores, detail };
}

/** Run every forensic test the payload has inputs for. */
function runForensic(c) {
  const fx = c.forensic;
  if (!fx || typeof fx !== 'object') return null;
  /* Some tests mean something different for a lender. */
  const lender = isLender(c);
  const cur = fx.current, prior = fx.prior, decade = fx.decade, inp = fx.inputs || {};
  const computed = [];

  if (cur && prior) {
    computed.push(forensic.beneishMScore(cur, prior));
    computed.push(forensic.piotroskiF(cur, prior));
    computed.push(forensic.montierC(cur, prior));
    computed.push(forensic.sloanAccruals({
      netProfit: cur.netProfit, cashFromOperations: cur.cashFromOperations,
      totalAssets: cur.totalAssets, priorTotalAssets: prior.totalAssets,
    }));
  }
  if (cur) {
    computed.push(forensic.altmanZ({
      workingCapital: inp.workingCapital, retainedEarnings: inp.retainedEarnings,
      ebit: cur.ebit ?? inp.ebit, totalAssets: cur.totalAssets,
      totalLiabilities: inp.totalLiabilities, bookEquity: inp.bookEquity,
      marketCapEquity: inp.marketCapEquity, revenue: cur.revenue,
      variant: inp.altmanVariant || 'emerging',
    }));
  }
  if (Array.isArray(decade)) {
    computed.push(forensic.cashVersusProfit(decade));
    computed.push(forensic.capexVersusDepreciation(decade));
  }
  computed.push(forensic.cashYieldTest({
    cashAndEquivalents: inp.cashAndEquivalents, interestIncome: inp.interestIncome,
    depositRate: inp.depositRate, priorCash: inp.priorCash,
  }));
  computed.push(forensic.relatedPartyIntensity({
    rptRevenue: inp.rptRevenue ?? 0, rptPurchases: inp.rptPurchases ?? 0, rptLoans: inp.rptLoans ?? 0,
    revenue: cur?.revenue ?? inp.revenue, purchases: inp.purchases, netWorth: inp.netWorth,
  }));
  computed.push(forensic.contingentToNetWorth({
    contingentLiabilities: inp.contingentLiabilities, netWorth: inp.netWorth, lender,
  }));
  computed.push(forensic.effectiveTaxRate({
    tax: inp.tax, profitBeforeTax: inp.profitBeforeTax, statutoryRate: inp.statutoryRate,
  }));
  computed.push(forensic.otherIncomeShare({
    otherIncome: inp.otherIncome, profitBeforeTax: inp.profitBeforeTax,
  }));
  computed.push(forensic.standaloneVersusConsolidated({
    standaloneProfit: inp.standaloneProfit, consolidatedProfit: inp.consolidatedProfit,
  }));
  computed.push(forensic.receivablesAgainstGrowth({
    revenueGrowthPct: inp.revenueGrowthPct, receivableGrowthPct: inp.receivableGrowthPct,
  }));
  computed.push(forensic.pledgeTest({
    pledgePctOfPromoterHolding: inp.pledgePctOfPromoterHolding, priceChangePct: inp.priceChangePct,
  }));

  return forensic.forensicAssessment({ computed, disclosures: fx.disclosures || {} });
}

/** Sector metric set, computed only where the payload supplied the inputs. */
/* The forensic block already carries most of a P&L and a balance sheet, and a
   payload that fills it but leaves `financials.annual` as a revenue line used
   to print six "missing input" rows in the metrics section while the numbers
   sat one key away. Anything the financial series does not state is taken from
   the forensic line items for the same year, which are on the same basis by
   contract. Nothing here invents a figure: every fallback is a field the
   payload supplied, or plain arithmetic over two of them. */
function financialsFor(c) {
  const series = c.financials?.annual;
  const stated = (Array.isArray(series) && series.length ? series[series.length - 1]
    : (c.financials && !Array.isArray(c.financials) ? c.financials : null)) || {};
  const fx = c.forensic || {};
  const cur = fx.current || {};
  const inp = fx.inputs || {};
  const dec = Array.isArray(fx.decade) && fx.decade.length ? fx.decade[fx.decade.length - 1] : {};
  const num = (...vals) => {
    for (const v of vals) if (typeof v === 'number' && isFinite(v)) return v;
    return undefined;
  };
  const ebit = num(stated.ebit, cur.ebit);
  const dep = num(stated.depreciation, cur.depreciation, dec.depreciation);
  const tax = num(stated.tax, inp.tax);
  const pbt = num(stated.profitBeforeTax, inp.profitBeforeTax);
  return {
    ...stated,
    basis: stated.basis ?? fx.basis ?? null,
    period: stated.period ?? dec.period ?? null,
    revenue: num(stated.revenue, cur.revenue),
    netProfit: num(stated.netProfit, cur.netProfit, inp.standaloneProfit),
    ebit,
    /* EBITDA is EBIT before depreciation. Two supplied numbers, one addition. */
    ebitda: num(stated.ebitda, (ebit !== undefined && dep !== undefined) ? ebit + dep : undefined),
    depreciation: dep,
    totalAssets: num(stated.totalAssets, cur.totalAssets),
    shareholdersEquity: num(stated.shareholdersEquity, inp.bookEquity, inp.netWorth),
    totalDebt: num(stated.totalDebt, inp.totalDebt, cur.longTermDebt),
    cashAndEquivalents: num(stated.cashAndEquivalents, inp.cashAndEquivalents),
    cashFromOperations: num(stated.cashFromOperations, cur.cashFromOperations),
    capitalExpenditure: num(stated.capitalExpenditure, stated.capex, dec.capex),
    interestExpense: num(stated.interestExpense, inp.interestExpense),
    receivables: num(stated.receivables, cur.receivables),
    inventory: num(stated.inventory, cur.inventory),
    payables: num(stated.payables, inp.payables),
    costOfGoodsSold: num(stated.costOfGoodsSold, inp.purchases),
    taxRate: num(stated.taxRate,
      (tax !== undefined && pbt !== undefined && pbt !== 0) ? tax / pbt : undefined,
      inp.statutoryRate),
  };
}

function computeMetrics(c) {
  const f = financialsFor(c);
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const sector = c.sector && metrics.SECTOR_METRICS[c.sector] ? c.sector : null;
  const wanted = sector ? metrics.SECTOR_METRICS[sector] : metrics.SECTOR_METRICS.manufacturing;

  const compute = {
    roe: () => metrics.roe(f.netProfit, f.shareholdersEquity),
    roa: () => metrics.roa(f.netProfit, f.totalAssets),
    roce: () => metrics.roce(f.ebit, f.shareholdersEquity, f.totalDebt),
    roic: () => metrics.roic(f.ebit, f.taxRate, f.shareholdersEquity, f.totalDebt, f.cashAndEquivalents),
    ebitdaMargin: () => metrics.ebitdaMargin(f.ebitda, f.revenue),
    ebitMargin: () => metrics.ebitMargin(f.ebit, f.revenue),
    netMargin: () => metrics.netMargin(f.netProfit, f.revenue),
    debtToEquity: () => metrics.debtToEquity(f.totalDebt, f.shareholdersEquity),
    netDebtToEbitda: () => metrics.netDebtToEbitda(f.totalDebt, f.cashAndEquivalents, f.ebitda),
    interestCoverage: () => metrics.interestCoverage(f.ebit, f.interestExpense),
    freeCashFlow: () => metrics.freeCashFlow(f.cashFromOperations, f.capitalExpenditure),
    cashConversionCycle: () => metrics.cashConversionCycle(f.receivables, f.inventory, f.payables, f.revenue, f.costOfGoodsSold),
    receivableDays: () => metrics.receivableDays(f.receivables, f.revenue),
    netInterestMargin: () => metrics.netInterestMargin(f.netInterestIncome, f.averageEarningAssets),
    casaRatio: () => metrics.casaRatio(f.currentDeposits, f.savingsDeposits, f.totalDeposits),
    provisionCoverageRatio: () => metrics.provisionCoverageRatio(f.provisions, f.grossNpa),
    creditCost: () => metrics.creditCost(f.provisionsForPeriod, f.averageAdvances),
  };

  const out = {};
  for (const name of wanted) {
    if (!compute[name]) continue;
    if (sector && !metrics.metricApplies(name, sector)) continue;
    out[name] = compute[name]();
  }
  out.accrualsRatio = metrics.accrualsRatio(f.netProfit, f.cashFromOperations, f.totalAssets);
  out.cashConversion = metrics.cashConversion(f.cashFromOperations, f.netProfit);
  return { sector: sector ?? 'unspecified', basis: f.basis ?? null, period: f.period ?? null, values: out };
}

/** Build the forecast, then value it. */
/* A free-cash-flow discount is not a valuation method for a lender.

   A bank's liabilities ARE its raw material: deposits are not debt to be
   netted off, they are the funding the business runs on. Netting them as net
   debt produced a value per share of MINUS 388 for a bank trading at 117 —
   a number that looks like a valuation and is not one. The research itself
   said so, giving its method as "Price to Book Value is standard for banking
   institutions"; the engine ran an FCFF discount over the top of that and
   printed the result anyway.

   So for lenders the forecast is still built — the income statement and the
   operating lines are real — and the discounted value is withheld, with the
   reason stated. The scenarios the analyst supplied, which are book-value
   based, carry the valuation instead. */
const LENDER_SECTORS = new Set(['banking', 'nbfc', 'insurance']);
function isLender(c) {
  return LENDER_SECTORS.has(String(c?.sector || '').trim().toLowerCase());
}

/* The last reported year, for the model to anchor its base year against. */
function reportedBase(c) {
  const rows = orderedAnnual(c.financials);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && isNum(r.revenue) && r.revenue > 0) return { revenue: r.revenue, period: r.period ?? null };
  }
  return null;
}

function runModel(c) {
  if (!c.model || typeof c.model !== 'object') return null;
  const reported = reportedBase(c);
  /* The drivers travel with the result. Without them nothing downstream can
     re-run the model — the scenario page exists to move a driver and see the
     valuation move, and it was being handed the computed output with the
     inputs stripped out. */
  const drivers = { ...c.model, reported };
  const built = buildModel(drivers);
  if (!built.available) return { drivers, model: built, valuation: null, sensitivity: null };

  /* A discounted value off a base year that does not tie to reported revenue
     is not a valuation of this company. Reliance's drivers put the base year
     at 95,601 against 1,071,174 reported, and the report printed a target
     price off it. The forecast is still shown — it is what the research
     supplied, and the reader should see how far out it is — but the number
     that would be acted on is withheld until the drivers are corrected. */
  if (built.reconciled === false) {
    const rec = built.reconciliation || {};
    return {
      drivers,
      model: built,
      valuation: { available: false,
        reason: `The base year does not reconcile. The drivers produce revenue of ${rec.actual} `
          + `against ${rec.expected} reported${rec.period ? ` for ${rec.period}` : ''} — out by `
          + `${rec.offByPct}%, against a tolerance of 2%. Every figure downstream of the base year `
          + 'describes a company with the wrong starting point, so no intrinsic value is computed '
          + 'from it. Correct the base volume and realisation for each sector and re-import.' },
      rateGrid: null, impliedGrowth: null, sensitivity: null, terminalNetDebt: null,
      unreconciled: true,
    };
  }

  if (isLender(c)) {
    /* The model's PROJECTED INCOME STATEMENT is not usable for a lender
       either, and for the same reason the valuation is not.
   
       buildModel charges interest as a financing cost below EBIT, which is
       right for a manufacturer and wrong for a bank, where interest expense is
       the cost of the product. Run on PNB it projected an EBIT of ₹14,514 Crs
       against interest of ₹87,261 Crs and printed a loss of ₹65,547 Crs a year
       in the three statements — for a bank that earned ₹16,904 Crs. The
       declined DCF was never the whole of the problem; the projections behind
       it were being printed regardless.
   
       So they are marked unusable and the documents omit them, with the reason
       carried alongside. The reported years are unaffected. */
    const projectionsUsable = false;
    const projectionsReason = 'The driver model charges interest below the operating line, which '
      + 'is how a manufacturer is modelled and not how a bank is. Applied to a lender it '
      + 'subtracts the cost of deposits twice over and projects a loss whatever the business '
      + 'does, so the forecast columns are not shown. The reported years stand; the valuation '
      + 'runs on the research\'s own book-value scenarios.';
    return {
      drivers,
      model: Object.assign({}, built, { projectionsUsable, projectionsReason }),
      valuation: { available: false,
        reason: 'A discounted free-cash-flow value is not computed for a lender. Deposits are the '
          + 'funding a bank runs on, not debt to be netted off, so an FCFF discount treats the '
          + 'business as though its liabilities were a cost of acquiring it — which produces a '
          + 'confident negative number rather than an answer. The scenarios below, on the '
          + 'research\'s own book-value method, carry the valuation.' },
      rateGrid: null, impliedGrowth: null, sensitivity: null, terminalNetDebt: null,
      lender: true,
    };
  }

  const v = c.valuation || {};
  const rate = v.discountRate;
  const g = v.terminalGrowth;
  const netDebt = built.years[built.years.length - 1].debt - built.years[built.years.length - 1].closingCash;

  const value = (isNum(rate) && isNum(g))
    ? dcf({ explicitFcff: built.fcff, discountRate: rate, terminalGrowth: g,
        netDebt: c.model.financing?.openingDebt ?? 0, sharesOutstanding: built.dilutedShares, midYear: true })
    : { available: false, reason: 'No discount rate or terminal growth supplied, so the forecast was not valued.' };

  const grid = (isNum(rate) && isNum(g))
    ? sensitivityGrid({
        base: { explicitFcff: built.fcff, netDebt: c.model.financing?.openingDebt ?? 0, sharesOutstanding: built.dilutedShares },
        discountRates: [rate - 0.02, rate, rate + 0.02].filter((x) => x > 0 && x < 1),
        terminalGrowths: [g - 0.01, g, g + 0.01],
      })
    : null;

  const implied = (isNum(rate) && isNum(g) && isNum(v.currentPrice) && built.fcff[0] > 0)
    ? impliedGrowth({
        currentEquityValue: v.currentPrice * built.dilutedShares,
        baseFcff: built.fcff[0] / (1 + (c.model.sectors?.[0]?.volumeCagr ?? 0)),
        years: c.model.years, discountRate: rate, terminalGrowth: g,
        netDebt: c.model.financing?.openingDebt ?? 0,
      })
    : null;

  let sensitivity = null;
  try { sensitivity = driverSensitivity(c.model, STANDARD_FLEXES); } catch { sensitivity = null; }

  return { drivers, model: built, valuation: value, rateGrid: grid, impliedGrowth: implied, sensitivity, terminalNetDebt: r2(netDebt) };
}

/** Our numbers against consensus, where consensus exists. */
function consensusDelta(c, modelled) {
  const cs = c.consensus;
  if (!cs || typeof cs !== 'object') {
    return { available: false, reason: 'No consensus exists for this company, so the variant perception is against the price alone.' };
  }
  const out = { available: true, source: cs.source, asOf: cs.asOf ?? null, estimateCount: cs.estimateCount ?? null, lines: [] };
  const ours = modelled?.model?.years;
  const pairs = [
    ['revenue', 'revenue'], ['ebitda', 'ebitda'], ['eps', 'epsDiluted'],
  ];
  for (const [label, field] of pairs) {
    for (const yr of [1, 2]) {
      const theirs = cs[label]?.[`y${yr}`];
      const mine = ours?.[yr - 1]?.[field];
      if (!isNum(theirs) || !isNum(mine)) continue;
      out.lines.push({
        line: label, year: yr, consensus: r2(theirs), ours: r2(mine),
        deltaPct: r2(((mine - theirs) / Math.abs(theirs)) * 100),
      });
    }
  }
  out.revisionDirection = cs.revisionDirection ?? null;
  if (out.lines.length === 0) out.note = 'Consensus was supplied but no comparable line could be matched against the model.';
  return out;
}

/** Liquidity and what it means for a position. */
function liquidityAssessment(c) {
  const l = c.liquidity;
  if (!l || !isNum(l.avgDailyValue)) {
    return { available: false, reason: 'No liquidity data supplied, so position sizing cannot be assessed.' };
  }
  const participation = 0.20;
  const perDay = l.avgDailyValue * participation;
  const sizes = [1e6, 1e7, 1e8].map((size) => ({
    positionSize: size,
    daysToBuild: r2(size / perDay),
  }));
  return {
    available: true,
    avgDailyValue: r2(l.avgDailyValue),
    currency: l.currency ?? 'INR',
    impactCostPct: isNum(l.impactCostPct) ? r2(l.impactCostPct) : null,
    freeFloatPct: isNum(l.freeFloatPct) ? r2(l.freeFloatPct) : null,
    participationAssumed: `${participation * 100}% of daily volume`,
    sizes,
    caution: l.avgDailyValue < 5e6
      ? 'Thin. A position of any size takes weeks to build and longer to exit.'
      : null,
    evidence: 'CALCULATION',
  };
}

function scoreCompany(c, horizonKey, run) {
  const bq = readPillar('businessQuality', c.businessQuality);
  const gm = readPillar('growthMultibagger', c.growthMultibagger);
  const vo = readPillar('valuationOpportunity', c.valuationOpportunity);
  const rq = readPillar('riskQuality', c.riskQuality);
  const dm = readDimensions(c.dimensions);

  const pillars = {
    businessQuality: scorePillar('businessQuality', bq.scores),
    growthMultibagger: scorePillar('growthMultibagger', gm.scores),
    valuationOpportunity: scorePillar('valuationOpportunity', vo.scores),
    riskQuality: scorePillar('riskQuality', rq.scores),
  };

  const dimensions = {
    businessQuality: pillars.businessQuality.score,
    growthMultibagger: pillars.growthMultibagger.score,
    valuationExpectedReturn: pillars.valuationOpportunity.score,
    risk: pillars.riskQuality.score,
    financialQuality: dm.scores.financialQuality ?? null,
    managementGovernance: dm.scores.managementGovernance ?? null,
    technicalEntry: dm.scores.technicalEntry ?? null,
    catalysts: dm.scores.catalysts ?? null,
  };

  const overall = overallScore(dimensions, { sector: c.sector ?? null });

  const forensicResult = runForensic(c);
  const forensicScore = forensicResult?.available ? forensicResult.score : null;
  const litigation = c.litigation?.searched
    ? assessLitigation(c.litigation.searched, { listed: true })
    : { available: false, reason: 'No litigation search was recorded.' };

  const modelled = runModel(c);

  const v = c.valuation || {};
  const price = isNum(v.currentPrice) ? v.currentPrice : null;
  const scenarios = ['bear', 'base', 'bull'].map((k) => ({
    scenario: k,
    fairValue: isNum(v[k]?.fairValue) ? v[k].fairValue : null,
    assumptions: v[k]?.assumptions ?? null,
    probability: v[k]?.probability ?? null,
    upside: upside(v[k]?.fairValue, price),
  }));

  const bear = scenarios[0].fairValue, bull = scenarios[2].fairValue;
  const asymmetry = (isNum(bear) && isNum(bull) && isNum(price) && price > 0)
    ? { available: true, downside: r2(((bear - price) / price) * 100),
        upsideValue: r2(((bull - price) / price) * 100),
        ratio: bear < price ? r2((bull - price) / (price - bear)) : null,
        formula: 'bull upside / bear downside', evidence: 'CALCULATION' }
    : { available: false, reason: 'Scenario fair values or price unavailable.' };

  const tiers = (c.sources || []).map((s) => s.tier).filter((t) => [1, 2, 3, 4].includes(t));
  const dates = (c.sources || []).map((s) => s.date).filter(Boolean).sort();

  return {
    symbol: c.symbol,
    name: c.name,
    exchange: c.exchange ?? null,
    sector: c.sector ?? null,
    /* Banks, NBFCs and insurers do not have an EBITDA, a free cash flow or a
       net-debt position in the sense the rest of the model means them. The
       documents need to know that to label their own rows: the tear sheet was
       printing "EBITDA 1,23,290" against "Revenue 1,28,206" for PNB — a 96%
       margin, which is what you get when you subtract a bank's operating costs
       from its interest income and call the remainder EBITDA. */
    lender: isLender(c),

    /* THE AUDIT. Every derived figure, re-derived from its own components.
     *
     * The tear sheet printed "Pre-provision operating profit 1,22,190" against
     * "Interest income 1,28,206" for PNB. The payload's `ebit` held a
     * manufacturer's formula — revenue plus other income less operating costs,
     * with a bank's interest expense left below the line — and nothing in the
     * application disagreed, because nothing was checking.
     *
     * Now everything is checked, and a figure that fails is withheld rather
     * than printed. Errors go into the gaps so the reader sees what was
     * refused and why; nothing is silently corrected. */
    audit: auditCompany(c, { lender: isLender(c),
      modelYears: modelled?.model?.available ? modelled.model.years : null }),

    /* A lender's income statement, derived rather than read: net interest
       income, net total income, pre-provision operating profit, provisions.
       The payload's own operating lines are not trustworthy for a bank and are
       not used. */
    lenderLines: isLender(c)
      ? orderedAnnual(c.financials).map((r) => lenderLines(r)).filter(Boolean)
      : null,

    /* And a bank's forecast, built the way a bank is forecast — from its own
       reported ratios rather than from a driver block written for a factory.
       Withholding the manufacturer's projections was only half a fix: five
       years of statements were asked for, and a lender getting none of them is
       a different defect rather than the absence of one. */
    lenderForecast: isLender(c)
      ? lenderForecast(orderedAnnual(c.financials), 5)
      : null,
    /* The metrics that matter for THIS industry, rather than the same eleven
     * ratios for every company.
     *
     * Tejas: "Include world class industry focused intelligence Engine which
     * can understand the financial information in a more meaningful way in our
     * analysis and make data more meaningful." A bank read on EBITDA margin
     * and a telco read on receivable days are both correctly computed and both
     * beside the point. industry.js classifies the business and then derives,
     * reads or names as missing the measures an analyst covering it would
     * actually ask for — NIM and CASA for a lender, ARPU and churn for a
     * telco, the order book for a contractor, utilisation for IT services.
     *
     * The lender lines are handed in rather than recomputed: the audit has
     * already derived a bank's operating lines, and two derivations of the
     * same figure is how the tear sheet and the statements came to disagree. */
    industry: industryPanel(c, run, {
      lenderLines: isLender(c)
        ? orderedAnnual(c.financials).map((r) => lenderLines(r)).filter(Boolean)
        : null }),
    business: c.business ?? null,
    thesis: c.thesis ?? null,
    pillars,
    dimensions,
    ratings: { businessQuality: bq.detail, growthMultibagger: gm.detail, valuationOpportunity: vo.detail, riskQuality: rq.detail, dimensions: dm.detail },
    ratingsRejected: bq.rejected + gm.rejected + vo.rejected + rq.rejected,
    overall,
    forensic: forensicResult,
    forensicScore,
    forensicBand: forensicBand(forensicScore).band,
    litigation,
    redFlags: c.redFlags || [],
    model: modelled,
    metrics: computeMetrics(c),
    consensus: consensusDelta(c, modelled),
    liquidity: liquidityAssessment(c),
    ownership: c.ownership ?? null,
    baseRates: c.baseRates ?? null,
    valuation: {
      currentPrice: price, priceAsOf: v.priceAsOf ?? null, currency: v.currency ?? 'INR',
      method: v.method ?? null, discountRate: v.discountRate ?? null, terminalGrowth: v.terminalGrowth ?? null,
      scenarios, marginOfSafety: marginOfSafety(scenarios[1].fairValue, price), asymmetry,
      /* Stated by the analyst, alongside the scenarios the engine computes.
         This object is the engine's valuation, so anything the payload stated
         about how the discount rate was built, how the parts sum, or what the
         current price already assumes has to be attached here or it never
         leaves the payload. */
      waccBuildup: v.waccBuildup ?? null,
      /* The buildup, recomputed. It used to be printed exactly as supplied,
         which meant the one number a discounted valuation turns on was the
         only number in the report nothing checked. */
      waccCheck: checkWaccBuildup(v.waccBuildup, v.discountRate, { lender: isLender(c) }),
      sotp: Array.isArray(v.sotp) ? v.sotp : null,
      impliedExpectations: v.impliedExpectations ?? null,
    },
    multibagger: {
      required: multibaggerGrid({ plausibility: c.multibagger?.plausibility || {} }),
      chain: c.multibagger?.chain ?? null, horizon: horizonKey,
    },
    variantPerception: c.variantPerception ?? null,
    bearCase: c.bearCase ?? null,
    snapshot: c.snapshot ?? null,
    shareholding: c.shareholding ?? null,
    theses: c.theses ?? null,
    moat: c.moat ?? null,
    management: c.management ?? null,
    capitalAllocation: c.capitalAllocation ?? null,
    mispricing: c.mispricing ?? null,
    peers: c.peers ?? null,
    esg: c.esg ?? null,
    /* The institutional analysis blocks. Carried through to the documents as
       the model supplied them: these are stated figures with a stated basis,
       not something the engine derives, so recomputing them here would only
       introduce a second answer to the same question. The renderer decides
       what to show; the report's job is not to lose it on the way. */
    /* The reported financials themselves. The renderer needs them to put the
       subject company on the same axes as its peers and to name the forecast
       years after the last reported one — neither of which it could do while
       this was dropped. */
    financials: c.financials ?? null,
    dupont: c.dupont ?? null,
    capitalCycle: c.capitalCycle ?? null,
    historicalSectors: c.historicalSectors ?? null,
    compensation: c.compensation ?? null,
    timeline: c.timeline ?? null,
    /* What the market has paid for this company against what it pays now.
       Computed here, like everything else the documents display. A lender is
       banded on book rather than earnings — see multipleBands for why. */
    multipleBands: c.priceHistory?.closes
      ? multipleBands({
          closes: c.priceHistory.closes,
          dates: c.priceHistory.dates ?? null,
          annual: orderedAnnual(c.financials),
          sharesOutstanding: c.model?.shares?.basic ?? null,
          lender: isLender(c),
        })
      : { available: false, reason: 'No price series, so the multiple has no history to be read against.' },
    /* The ISIN identifies the security, so it belongs on the tear sheet beside
       the ticker — and repair.js recovers it from the sources when the research
       leaves it out, which is worth showing. */
    isin: c.isin ?? null,
    exchange: c.exchange ?? null,
    /* The series itself travels with the report now.

       The comment below used to say "the raw series does not travel with the
       report, which is why the renderer could never have done this itself" —
       true, and the reason the tear sheet had no price chart and the P/E bands
       could not be drawn. Everything COMPUTED from the series is still
       computed here; this carries the series so the documents can plot it. */
    priceHistory: c.priceHistory?.closes ? {
      closes: c.priceHistory.closes,
      highs: c.priceHistory.highs ?? null,
      lows: c.priceHistory.lows ?? null,
      volumes: c.priceHistory.volumes ?? null,
      dates: c.priceHistory.dates ?? null,
      spacing: c.priceHistory.spacing ?? 'daily',
      asOf: c.priceHistory.asOf ?? null,
      source: c.priceHistory.source ?? null,
      points: c.priceHistory.points ?? c.priceHistory.closes.length,
    } : null,
    technicals: c.priceHistory?.closes
      ? { ...entryContext({ closes: c.priceHistory.closes, volumes: c.priceHistory.volumes ?? null,
            benchmarkCloses: c.priceHistory.benchmarkCloses ?? null }),
          asOf: c.priceHistory.asOf ?? null, adjusted: c.priceHistory.adjusted === true,
          summary: c.technicals?.summary ?? null }
      : (c.technicals ?? null),
    /* The full technical panel, computed here rather than in the renderer: the
       report carries computed values and the documents display them. */
    /* The named model. The existing `multibagger` field is the required-CAGR
       grid and keeps its name; this is the five-test detection model and is a
       different thing. */
    multibaggerModel: multibaggerModel(c, {
      technicalPanel: c.priceHistory?.closes
        ? technicalPanel({
            closes: c.priceHistory.closes,
            highs: c.priceHistory.highs ?? null,
            lows: c.priceHistory.lows ?? null,
            volumes: c.priceHistory.volumes ?? null,
            spacing: c.priceHistory.spacing ?? 'daily',
            asOf: c.priceHistory.asOf ?? null,
            source: 'payload',
          })
        : null,
    }),
    technicalPanel: c.priceHistory?.closes
      ? technicalPanel({
          closes: c.priceHistory.closes,
          highs: c.priceHistory.highs ?? null,
          lows: c.priceHistory.lows ?? null,
          volumes: c.priceHistory.volumes ?? null,
          spacing: c.priceHistory.spacing ?? 'daily',
          asOf: c.priceHistory.asOf ?? null,
          source: 'payload',
        })
      : null,
    catalysts: c.catalysts || [],
    risks: c.risks || [],
    thesisBreakers: c.thesisBreakers || [],
    upgradeTriggers: c.upgradeTriggers || [],
    managementQuestions: c.managementQuestions || [],
    sources: c.sources || [],
    confidence: confidence({
      bestTier: tiers.length ? Math.min(...tiers) : 4,
      sourceDate: dates.length ? dates[dates.length - 1] : null,
      coverage: overall.coverage ?? 0,
      contradictions: (c.conflicts || []).length,
    }),
    conflicts: c.conflicts || [],
  };
}

export function buildReport(payload, { asOf = new Date() } = {}) {
  const check = validatePayload(payload);
  if (!check.valid) return { ok: false, errors: check.errors, warnings: check.warnings, report: null };

  /* Percentages that arrived as fractions.
   *
   * Two AI tools answered the same fields two different ways. One gave
   * global.cagr.y15 = 5.5 meaning 5.5%; the other gave 0.11 meaning 11%, and
   * with it promoter holding 0.7008, free float 0.299, GDP growth 0.072. The
   * application printed them as given, so a state-owned bank whose promoter is
   * the Government of India at 70% appeared in the research report as
   * "Promoter holding 0.7%", and India's economy as growing at 0.07% a year.
   * For a reader checking a bank against its filings those are not small
   * errors; they are the kind that ends trust in the whole document.
   *
   * The scale is decided for the payload as a whole, not field by field,
   * because a research reply is internally consistent even when it disagrees
   * with the schema. Every percentage field named below is collected; the
   * payload is treated as fraction-scaled only when there are at least five of
   * them and EVERY one is below 1 in absolute value. One value of 5.5 or 70 is
   * enough to settle that the payload is already in percentage points, and
   * then nothing is touched — a genuine 0.08% credit cost is left alone.
   *
   * Nothing is rescaled silently: the change is recorded as a gap, so the
   * reader knows which numbers the application reinterpreted and can check
   * them against the source. */
  /* The scale is decided per BLOCK, not for the whole payload.
   *
   * A composed run is several replies stitched together: the sector study from
   * one, each company from another. They need not agree with each other, and
   * in practice they do not — a Banking sector payload that gave growth as 5.5
   * for 5.5% was merged with a PNB payload that gave promoter holding as
   * 0.7008 for 70%. Judging the whole payload at once meant the sector's
   * honest 5.5 vetoed the correction the company needed, and the report went
   * out saying the Government of India owns 0.7% of Punjab National Bank.
   *
   * So each block is judged on its own evidence: the run-level figures
   * together, and each company separately. Within a block the rule is
   * unchanged — at least five non-zero values, and every one of them below 1
   * in absolute value. A single value of 5.5 or 70 settles that its block is
   * already in percentage points, and nothing in it is touched. */
  const pctBlocks = (pl) => {
    const blocks = [];
    const bag = (label) => { const spots = []; blocks.push({ label, spots }); return spots; };
    const take = (spots, obj, key) => {
      if (obj && typeof obj[key] === 'number' && isFinite(obj[key])) spots.push([obj, key]);
    };

    const run = bag('the sector research');
    const g = pl.global?.cagr;
    if (g) for (const k of ['y15', 'y10', 'y5', 'y3']) take(run, g, k);
    const m = pl.macro;
    /* currency is a rate in rupees, not a percentage, and is never included. */
    if (m) {
      for (const k of ['gdpGrowth', 'inflation', 'policyRate', 'creditGrowth',
        'capacityUtilisation', 'unemployment', 'fiscalDeficit']) take(run, m[k], 'value');
    }

    for (const c of (pl.companies || [])) {
      const spots = bag(String(c.name || c.symbol || 'a company') + "'s research");
      const o = c.ownership;
      if (o) {
        for (const k of ['promoter', 'fii', 'dii', 'public', 'pledgedPct']) take(spots, o, k);
        for (const q of (o.quarters || [])) {
          for (const k of ['promoter', 'fii', 'dii', 'public']) take(spots, q, k);
        }
      }
      /* The quarter-by-quarter shareholding is a second, separate block in the
         payload, and the snapshot table reads it rather than ownership — which
         is why "Promoter holding 0.7%" survived a fix that had already
         corrected the ownership figures. */
      for (const q of (c.shareholding || [])) {
        for (const k of ['promoter', 'fii', 'dii', 'public', 'pledged']) take(spots, q, k);
      }
      /* The liquidity block carries its own copy of the free float, and the
         position-sizing section reads that one. Three blocks state the same
         percentage; all three have to be on the same scale. */
      if (c.liquidity) {
        for (const k of ['freeFloatPct', 'impactCostPct']) take(spots, c.liquidity, k);
      }
      const sn = c.snapshot;
      if (sn) {
        take(spots, sn, 'freeFloatPct');
        const pf = sn.performance;
        if (pf) {
          for (const k of ['m3', 'm6', 'm12', 'm3Relative', 'm6Relative', 'm12Relative']) {
            take(spots, pf, k);
          }
        }
      }
    }
    return blocks;
  };

  const unitGaps = [];
  {
    payload = JSON.parse(JSON.stringify(payload));
    for (const { label, spots } of pctBlocks(payload)) {
      const live = spots.filter(([o, k]) => o[k] !== 0);
      if (live.length < 5) continue;
      if (!live.every(([o, k]) => Math.abs(o[k]) < 1)) continue;
      /* Rounded, because 0.072 * 100 is 7.199999999999999 in binary floating
         point and that is not a number to print in a research report. */
      for (const [o, k] of spots) o[k] = Math.round(o[k] * 100 * 1e6) / 1e6;
      unitGaps.push(`Every percentage in ${label} arrived as a fraction — promoter holding as `
        + '0.7008-style decimals rather than percentage points. All '
        + `${spots.length} of them have been multiplied by 100 so the report reads in percent. `
        + 'Check them against the filings before quoting any of them.');
    }
  }

  /* THE SCREEN. What the sector run actually did.
   *
   * This never reached the report before, and its absence is why the sector
   * study read as a report about one company. The document had only `full` to
   * work from — the companies that came back from a full research run — so a
   * Banking study whose screen had nominated SBI, Indian Bank and Bank of
   * Maharashtra printed page after page about PNB, which is simply the company
   * that happened to be researched next.
   *
   * The screen is the sector study's subject: twelve companies rated on four
   * pillars against written anchors, ranked, and three nominated. A sector
   * report that does not show it is not showing its own work. It is built here,
   * before the partial branch, because a sector-only run — the run that has
   * nothing BUT a screen — is exactly the one that needs it most. */
  const screen = (() => {
    if (!Array.isArray(payload.shortlist) || !payload.shortlist.length) return null;
    const sc = screenShortlist(payload.shortlist);
    return {
      ...sc,
      weights: SCREEN_WEIGHTS,
      minRated: MIN_RATED,
      /* Stated here so the document does not have to know the rule. */
      basis: 'Each shortlisted company is rated 0-100 on four pillars against the same written '
        + 'anchors, with a sentence of evidence carrying a figure behind every rating. The four '
        + 'carry equal weight. A company rated on fewer than '
        + `${MIN_RATED} of them cannot be compared with one rated on all four, so it ranks below `
        + 'every fully rated company however high it scores. The three highest fully rated '
        + 'companies are nominated for full research.',
    };
  })();

  /* A partial run carries the sector work and no companies. It is saved so the
     rest of a split reply can be merged into it; the documents it can build say
     so plainly rather than coming out empty without explanation. */
  if (check.partial) {
    return {
      ok: true, partial: true, errors: [],
      warnings: [...check.warnings,
        'This run has no companies yet. Paste the rest of the reply with Add To This Analysis.'],
      report: {
        run: { sector: payload.run.sector, subSector: payload.run.subSector ?? null,
          horizon: (HORIZONS.find((h) => h.key === (payload.run.horizon || '3-5')) || HORIZONS[1]).label,
          horizonKey: payload.run.horizon || '3-5',
          payloadGeneratedAt: payload.run.generatedAt, reportBuiltAt: asOf.toISOString(),
          methodologyVersion: METHODOLOGY_VERSION, payloadSchemaVersion: payload.run.schemaVersion,
          researchNotes: payload.run.researchNotes ?? null,
          searchesRun: payload.run.searchesRun ?? null, noiseBand: NOISE_BAND,
          /* Set when the reader ran this on assumptions of their own. A report
             built on moved drivers that does not say so is the one output this
             application must never produce. */
          scenario: payload.run.scenario ?? null },
        industryMap: payload.industryMap ?? null, universe: payload.universe ?? null,
        screen,
        global: payload.global ?? null, macro: payload.macro ?? null, budget: payload.budget ?? null,
        policy: payload.policy ?? null, policyEvolution: payload.policyEvolution ?? null,
        regulation: payload.regulation ?? null, geopolitics: payload.geopolitics ?? null,
        industry: payload.industry ?? null, valueChain: payload.valueChain ?? null,
        tam: payload.tam ?? null, programs: payload.programs ?? null,
        competition: payload.competition ?? null, sectorValuation: payload.sectorValuation ?? null,
        monitorables: payload.monitorables ?? null, glossary: payload.glossary ?? null,
        top3: [], top10: [], full: [], excludedFromTop3: [], unscored: [],
        counts: { universe: 0, scored: 0, top3Eligible: 0 }, ties: [],
        lenses: { bestBusiness: [], bestInvestmentToday: [], highestMultibagger: [], bestValueGarp: [] },
      },
    };
  }

  const horizonKey = payload.run?.horizon || '3-5';
  const horizon = HORIZONS.find((h) => h.key === horizonKey) || HORIZONS[1];
  const scored = payload.companies.map((c) => scoreCompany(c, horizonKey, payload.run));
  const ranked = rankUniverse(scored);

  const lenses = {
    bestBusiness: rankByLens(scored, 'bestBusiness').slice(0, 3),
    bestInvestmentToday: rankByLens(scored, 'bestInvestmentToday').slice(0, 3),
    highestMultibagger: rankByLens(scored, 'highestMultibagger').slice(0, 3),
    bestValueGarp: rankByLens(scored, 'bestValueGarp').slice(0, 3),
  };

  const gaps = [...unitGaps];
  const reporting = reportingUnits(payload, (m) => gaps.push(m));


  /* A base year that does not tie to reported revenue is a fact about the
     company's model, not about its rank. Reliance's model was out by 91% and
     said nothing, because the gap loop below only reads the Top 3 and Reliance
     had been excluded from it — so the one company whose numbers were wrong
     was the one company not checked. */
  /* What the arithmetic audit refused.
   *
   * A figure the application declines to print is a fact about the research,
   * and the reader is owed it in the same place as every other gap. Errors are
   * reported for every company, not only the Top 3 — the one company whose
   * numbers are wrong is rarely the one being recommended. */
  for (const c of scored) {
    for (const f of (c.audit?.findings || [])) {
      if (f.severity !== 'error') continue;
      gaps.push(`${c.symbol}${f.period ? ' ' + f.period : ''}: ${f.message}`);
    }
  }

  for (const c of scored) {
    const m = c.model?.model;
    if (!m?.available) continue;
    if (m.reconciled === false) {
      const rec = m.reconciliation || {};
      gaps.push(`${c.symbol}: the model's base year does not reconcile to reported revenue — `
        + `${rec.actual} against ${rec.expected}, out by ${rec.offByPct}%. No intrinsic value `
        + 'is computed from it.');
    } else if (m.reconciled === null) {
      gaps.push(`${c.symbol}: no reported revenue was supplied, so the model's base year could `
        + 'not be checked against anything the company published.');
    }
  }

  for (const c of ranked.top3) {
    if ((c.thesisBreakers?.length || 0) < 5) gaps.push(`${c.symbol} has fewer than five thesis breakers.`);
    if (!c.variantPerception) gaps.push(`${c.symbol} has no variant perception, which is mandatory for the Top 3.`);
    if (!c.model?.model?.available) gaps.push(`${c.symbol} has no working driver model, so its intrinsic value is asserted rather than built.`);
    if (!c.consensus?.available) gaps.push(`${c.symbol} has no consensus to measure the variant perception against.`);
    if (!c.liquidity?.available) gaps.push(`${c.symbol} has no liquidity data, so position sizing is unassessed.`);
  }

  return {
    ok: true,
    errors: [],
    warnings: [...check.warnings, ...gaps, ...ranked.ties],
    report: {
      run: {
        sector: payload.run.sector,
        subSector: payload.run.subSector ?? null,
        horizon: horizon.label,
        horizonKey,
        payloadGeneratedAt: payload.run.generatedAt,
        reportBuiltAt: asOf.toISOString(),
        methodologyVersion: METHODOLOGY_VERSION,
        payloadSchemaVersion: payload.run.schemaVersion,
        /* Every money figure in every document is in these units. */
        reporting,
        researchNotes: payload.run.researchNotes ?? null,
        searchesRun: payload.run.searchesRun ?? null,
        noiseBand: NOISE_BAND,
        scenario: payload.run.scenario ?? null,
        /* Company replies that were about a different sector and so never
           entered this study. Carried so the document can say so. */
        foreignImports: payload.run.foreignImports ?? null,
      },
      industryMap: payload.industryMap ?? null,
      universe: payload.universe ?? null,

      screen,

      /* Research content. None of it touches a score; all of it is what makes
         the documents worth reading. Passed through unchanged, because the
         engine has no business rewriting research. */
      global: payload.global ?? null,
      macro: payload.macro ?? null,
      budget: payload.budget ?? null,
      policy: payload.policy ?? null,
      policyEvolution: payload.policyEvolution ?? null,
      regulation: payload.regulation ?? null,
      geopolitics: payload.geopolitics ?? null,
      industry: payload.industry ?? null,
      valueChain: payload.valueChain ?? null,
      tam: payload.tam ?? null,
      programs: payload.programs ?? null,
      competition: payload.competition ?? null,
      sectorValuation: payload.sectorValuation ?? null,
      monitorables: payload.monitorables ?? null,
      glossary: payload.glossary ?? null,
      top3: ranked.top3,
      top10: ranked.top10,
      full: ranked.full,
      excludedFromTop3: ranked.excludedFromTop3,
      unscored: ranked.unscored,
      counts: ranked.counts,
      ties: ranked.ties,
      lenses,
    },
  };
}
