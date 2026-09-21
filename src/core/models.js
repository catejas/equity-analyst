// models.js — the named quantitative models.
//
// Two of these were already in the system but never shown as models. The
// multibagger test was spread across the 52 components, so a reader could see
// the score it contributed but not the reasoning. Naming a model and printing
// what it looked at is the difference between a number and an argument.
//
// Nothing here invents data. Every input is either a figure already in the
// payload or a value the engine computed from one, and every output says which
// inputs it had and which it did not.

import { multibaggerGrid, requiredCagr } from './multibagger.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* ==================== Multibagger detection ============================== */

/**
 * The five tests a multibagger candidate has to pass, scored on what the
 * payload actually carried. A test with no input is not a failed test — it is
 * an unrun one, and the two are reported separately so a company is never
 * marked down for a gap it was honest about.
 */
export const MULTIBAGGER_TESTS = Object.freeze([
  { key: 'revenueGrowth', label: 'Revenue growth',
    note: 'compound revenue growth over the years supplied' },
  { key: 'profitGrowth', label: 'Profit growth',
    note: 'compound profit growth, and whether it outpaced revenue' },
  { key: 'returnOnEquity', label: 'Return on equity',
    note: 'the return the business earns on the money left in it' },
  { key: 'debt', label: 'Debt',
    note: 'leverage, because a levered compounder is a different animal' },
  { key: 'priceTrend', label: 'Price trend',
    note: 'whether the market has begun to agree' },
]);

function cagr(first, last, years) {
  if (!isNum(first) || !isNum(last) || first <= 0 || last <= 0 || !years) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

/* Oldest first, always.

   financials.annual is written newest first — the schema shows FY26 before
   FY25, and every payload follows it. The compound growth below reads index 0
   as the OLDEST period, so it was computing every growth rate backwards: PNB's
   revenue, which rose from 138,000 to 147,017, came out as -6.1% because the
   two were the wrong way round. Profit growth had the same sign error.

   The rows are ordered by their period label where one can be read, and
   otherwise reversed on the schema's own convention. A series whose order
   cannot be established is left alone rather than guessed at. */
function periodKey(row) {
  const m = /FY\s*'?(\d{2,4})/i.exec(String((row && row.period) || ''));
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v < 100 ? 2000 + v : v;
}

export function orderedAnnual(financials) {
  const rows = (financials && Array.isArray(financials.annual)) ? financials.annual.slice() : [];
  if (rows.length < 2) return rows;
  const keys = rows.map(periodKey);
  if (keys.every((k) => k != null)) {
    return rows.sort((a, b) => periodKey(a) - periodKey(b));
  }
  /* No readable periods: fall back to the schema's stated order, newest first,
     and reverse it. */
  return rows.reverse();
}

function seriesOf(financials, field) {
  const rows = orderedAnnual(financials);
  const vals = rows.map((r) => (isObj(r) ? r[field] : null)).filter(isNum);
  return vals.length >= 2 ? vals : null;
}

/**
 * Run the model for one company.
 * @param {object} c        the company as the report carries it
 * @param {object} options  { technicalPanel } when one has been computed
 */
/* Return on equity and leverage, derived from the reported financials when
   they are not stated outright. Both tests reported "not supplied" on payloads
   that carried everything needed to compute them — net profit, equity and
   debt were all sitting in financials.annual. A test that declines to run on
   data it already has is not a missing input, it is a missing calculation. */
function latestAnnual(company) {
  const ann = orderedAnnual(company.financials);
  return ann.length ? ann[ann.length - 1] : null;
}
function derivedRoe(company) {
  const a = latestAnnual(company);
  if (!a || !isNum(a.netProfit) || !isNum(a.shareholdersEquity) || a.shareholdersEquity === 0) return null;
  return Math.round((a.netProfit / a.shareholdersEquity) * 1000) / 10;
}
function derivedDebtToEquity(company) {
  const a = latestAnnual(company);
  if (!a || !isNum(a.totalDebt) || !isNum(a.shareholdersEquity) || a.shareholdersEquity === 0) return null;
  return Math.round((a.totalDebt / a.shareholdersEquity) * 100) / 100;
}

export function multibaggerModel(c, { technicalPanel = null } = {}) {
  const company = isObj(c) ? c : {};
  const fin = company.financials || company.model || null;
  const tests = [];

  const rev = seriesOf(fin, 'revenue');
  const revC = rev ? cagr(rev[0], rev[rev.length - 1], rev.length - 1) : null;
  tests.push({
    key: 'revenueGrowth',
    ran: revC != null,
    value: revC == null ? null : Math.round(revC * 1000) / 10,
    unit: '%',
    passed: revC == null ? null : revC >= 0.15,
    evidence: revC == null ? 'no revenue series supplied'
      : `${rev.length} periods, ${Math.round(revC * 1000) / 10}% compound`,
  });

  const pat = seriesOf(fin, 'pat') || seriesOf(fin, 'profit') || seriesOf(fin, 'netProfit');
  const patC = pat ? cagr(pat[0], pat[pat.length - 1], pat.length - 1) : null;
  tests.push({
    key: 'profitGrowth',
    ran: patC != null,
    value: patC == null ? null : Math.round(patC * 1000) / 10,
    unit: '%',
    passed: patC == null ? null : patC >= 0.15,
    evidence: patC == null ? 'no profit series supplied'
      : `${Math.round(patC * 1000) / 10}% compound`
        + (revC != null ? (patC > revC ? ', ahead of revenue' : ', behind revenue') : ''),
  });

  const statedRoe = isNum(company.roe) ? company.roe
    : (isObj(company.snapshot) && isNum(company.snapshot.roe) ? company.snapshot.roe : null);
  const calcRoe = statedRoe == null ? derivedRoe(company) : null;
  const roe = statedRoe != null ? statedRoe : calcRoe;
  tests.push({
    key: 'returnOnEquity',
    ran: roe != null,
    value: roe,
    unit: '%',
    passed: roe == null ? null : roe >= 15,
    evidence: roe == null
      ? 'neither a return on equity nor the profit and equity to compute one'
      : `${roe}%` + (calcRoe != null ? ', computed from reported profit and equity' : ''),
  });

  const statedDe = isNum(company.debtToEquity) ? company.debtToEquity
    : (isObj(company.snapshot) && isNum(company.snapshot.debtToEquity) ? company.snapshot.debtToEquity : null);
  const calcDe = statedDe == null ? derivedDebtToEquity(company) : null;
  const de = statedDe != null ? statedDe : calcDe;
  tests.push({
    key: 'debt',
    ran: de != null,
    value: de,
    unit: '×',
    passed: de == null ? null : de <= 1,
    evidence: de == null
      ? 'neither a leverage figure nor the debt and equity to compute one'
      : `debt to equity ${de}×` + (calcDe != null ? ', computed from reported debt and equity' : ''),
  });

  const tp = technicalPanel || company.technicalPanel || null;
  const tr = tp && tp.available && tp.indicators ? tp.indicators.trend : null;
  const trendUp = tr && tr.available ? /Uptrend|Above every/.test(String(tr.value)) : null;
  tests.push({
    key: 'priceTrend',
    ran: trendUp != null,
    value: tr && tr.available ? tr.value : null,
    passed: trendUp,
    evidence: trendUp == null ? 'no price series, so the trend could not be read'
      : String(tr.value),
  });

  const ran = tests.filter((t) => t.ran);
  const passed = ran.filter((t) => t.passed === true);
  return {
    available: ran.length > 0,
    model: 'Multibagger detection',
    tests,
    ranCount: ran.length,
    of: tests.length,
    passedCount: passed.length,
    /* Scored on what ran, so a company with three tests is not compared against
       one with five as though both had been examined equally. */
    /* A score from two tests is not comparable with a score from five, so it is
       withheld below three rather than printed as though it meant the same
       thing. The tests that did run are still shown. */
    score: ran.length >= 3 ? Math.round((passed.length / ran.length) * 1000) / 10 : null,
    scoreWithheld: ran.length > 0 && ran.length < 3,
    verdict: !ran.length ? 'not enough supplied to run the model'
      : ran.length < 3 ? `only ${ran.length} of 5 tests could run`
      : passed.length === ran.length ? `passes all ${ran.length} tests that could run`
      : `passes ${passed.length} of the ${ran.length} tests that could run`,
    grid: isNum(company.currentPrice) || (isObj(company.valuation) && isNum(company.valuation.currentPrice))
      ? multibaggerGrid({ currentPrice: company.currentPrice
          || (company.valuation && company.valuation.currentPrice) })
      : null,
  };
}

/* ==================== Sector rotation ==================================== */

/**
 * Where capital has moved, read across the sector runs on this device.
 *
 * This one comes with a warning printed on it, because it is the only model
 * here whose weakness is structural rather than a matter of missing data.
 * Sectors are researched one at a time, days or weeks apart. Comparing them is
 * comparing snapshots taken at different moments, and the further apart they
 * are the less the comparison means. It is offered because a rough reading with
 * its staleness stated is more useful than nothing — but it is never presented
 * as a live picture of the market.
 */
export function sectorRotation(runs) {
  const rows = (Array.isArray(runs) ? runs : [])
    .filter((r) => isObj(r) && r.sector)
    .map((r) => {
      const panelOf = (co) => (co && co.technicalPanel) || null;
      const companies = Array.isArray(r.companies) ? r.companies : [];
      const moms = companies.map((co) => {
        const p = panelOf(co);
        const m = p && p.available && p.indicators ? p.indicators.momentum : null;
        return m && m.available ? m.value : null;
      }).filter(isNum);
      const median = moms.length
        ? moms.slice().sort((a, b) => a - b)[Math.floor(moms.length / 2)] : null;
      return {
        sector: r.sector,
        subSector: r.subSector || null,
        researchedAt: r.ts || null,
        companies: companies.length,
        withMomentum: moms.length,
        medianMomentum: median,
      };
    });

  const dated = rows.filter((r) => r.researchedAt);
  const span = dated.length > 1
    ? Math.round((Math.max(...dated.map((r) => r.researchedAt))
        - Math.min(...dated.map((r) => r.researchedAt))) / 86400000)
    : 0;

  const ranked = rows.filter((r) => isNum(r.medianMomentum))
    .sort((a, b) => b.medianMomentum - a.medianMomentum);

  return {
    available: ranked.length >= 2,
    model: 'Sector rotation',
    sectors: rows.length,
    comparable: ranked.length,
    ranked,
    spanDays: span,
    /* The caveat is part of the result, not a footnote someone might drop. */
    caveat: ranked.length < 2
      ? 'At least two sectors with a price series are needed before anything can be compared.'
      : `These sectors were researched ${span} days apart, so this compares snapshots taken at `
        + 'different moments rather than the market on one day. Treat the order as indicative, '
        + 'and re-run the sectors together if the comparison matters.',
    reliable: ranked.length >= 2 && span <= 7,
  };
}
