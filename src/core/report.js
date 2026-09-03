// report.js — payload in, report model out.
// The payload supplies evidence and drivers. Every number here is computed.

import { scorePillar, overallScore, forensicBand, METHODOLOGY_VERSION, NOISE_BAND } from './scoring.js';
import { rankUniverse, rankByLens } from './ranking.js';
import { multibaggerGrid, HORIZONS } from './multibagger.js';
import { confidence } from './integrity.js';
import { validatePayload, DIRECT_DIMENSIONS } from './payload-schema.js';
import { readRating, anchorFor } from './rubrics.js';
import { entryContext } from './technicals.js';
import { dcf, sensitivityGrid, impliedGrowth } from './valuation.js';
import { buildModel, driverSensitivity, STANDARD_FLEXES } from './model.js';
import { assessLitigation } from './litigation.js';
import * as forensic from './forensic.js';
import * as metrics from './metrics.js';
import { PILLARS } from './scoring.js';

const r2 = (n) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

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
    contingentLiabilities: inp.contingentLiabilities, netWorth: inp.netWorth,
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
function computeMetrics(c) {
  const f = c.financials?.annual?.[c.financials.annual.length - 1] || c.financials;
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
function runModel(c) {
  if (!c.model || typeof c.model !== 'object') return null;
  const built = buildModel(c.model);
  if (!built.available) return { model: built, valuation: null, sensitivity: null };

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
        baseFcff: built.fcff[0] / (1 + (c.model.segments?.[0]?.volumeCagr ?? 0)),
        years: c.model.years, discountRate: rate, terminalGrowth: g,
        netDebt: c.model.financing?.openingDebt ?? 0,
      })
    : null;

  let sensitivity = null;
  try { sensitivity = driverSensitivity(c.model, STANDARD_FLEXES); } catch { sensitivity = null; }

  return { model: built, valuation: value, rateGrid: grid, impliedGrowth: implied, sensitivity, terminalNetDebt: r2(netDebt) };
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

function scoreCompany(c, horizonKey) {
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
    timeline: c.timeline ?? null,
    technicals: c.priceHistory?.closes
      ? { ...entryContext({ closes: c.priceHistory.closes, volumes: c.priceHistory.volumes ?? null,
            benchmarkCloses: c.priceHistory.benchmarkCloses ?? null }),
          asOf: c.priceHistory.asOf ?? null, adjusted: c.priceHistory.adjusted === true,
          summary: c.technicals?.summary ?? null }
      : (c.technicals ?? null),
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

  const horizonKey = payload.run?.horizon || '3-5';
  const horizon = HORIZONS.find((h) => h.key === horizonKey) || HORIZONS[1];
  const scored = payload.companies.map((c) => scoreCompany(c, horizonKey));
  const ranked = rankUniverse(scored);

  const lenses = {
    bestBusiness: rankByLens(scored, 'bestBusiness').slice(0, 3),
    bestInvestmentToday: rankByLens(scored, 'bestInvestmentToday').slice(0, 3),
    highestMultibagger: rankByLens(scored, 'highestMultibagger').slice(0, 3),
    bestValueGarp: rankByLens(scored, 'bestValueGarp').slice(0, 3),
  };

  const gaps = [];
  for (const c of ranked.top3) {
    if ((c.thesisBreakers?.length || 0) < 5) gaps.push(`${c.symbol} has fewer than five thesis breakers.`);
    if (!c.variantPerception) gaps.push(`${c.symbol} has no variant perception, which is mandatory for the Top 3.`);
    if (!c.model?.model?.available) gaps.push(`${c.symbol} has no working driver model, so its intrinsic value is asserted rather than built.`);
    if (c.model?.model?.available && !c.model.model.reconciled) {
      gaps.push(`${c.symbol}: the forecast does not reconcile. ${c.model.model.failedChecks.length} checks failed.`);
    }
    if (!c.consensus?.available) gaps.push(`${c.symbol} has no consensus to measure the variant perception against.`);
    if (!c.liquidity?.available) gaps.push(`${c.symbol} has no liquidity data, so position sizing is unassessed.`);
  }

  return {
    ok: true,
    errors: [],
    warnings: [...check.warnings, ...gaps, ...ranked.ties],
    report: {
      run: {
        segment: payload.run.segment,
        subsegment: payload.run.subsegment ?? null,
        horizon: horizon.label,
        horizonKey,
        payloadGeneratedAt: payload.run.generatedAt,
        reportBuiltAt: asOf.toISOString(),
        methodologyVersion: METHODOLOGY_VERSION,
        payloadSchemaVersion: payload.run.schemaVersion,
        researchNotes: payload.run.researchNotes ?? null,
        searchesRun: payload.run.searchesRun ?? null,
        noiseBand: NOISE_BAND,
      },
      industryMap: payload.industryMap ?? null,
      universe: payload.universe ?? null,

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
