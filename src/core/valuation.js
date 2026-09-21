// valuation.js — intrinsic valuation (doc 01, doc 02).
// Pure. Every assumption must be passed in explicitly; nothing is defaulted,
// because a defaulted discount rate is an invented one.

const round2 = (n) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null);
const round4 = (n) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : null);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function refuse(reason, formula = null) {
  return Object.freeze({ available: false, value: null, reason, formula, evidence: 'CALCULATION' });
}

function need(inputs) {
  const missing = Object.entries(inputs).filter(([, v]) => !isNum(v)).map(([k]) => k);
  return missing.length ? `Missing or non-numeric input: ${missing.join(', ')}.` : null;
}

/**
 * Weighted average cost of capital.
 * Cost of equity comes from CAPM; the risk-free rate should be the Indian
 * 10-year government yield on a stated date, not a remembered number.
 */
export function wacc({ riskFreeRate, equityRiskPremium, beta, costOfDebt, taxRate, equityWeight, debtWeight }) {
  const formula = 'Ke x We + Kd x (1 - tax) x Wd, with Ke = Rf + beta x ERP';
  const gap = need({ riskFreeRate, equityRiskPremium, beta, costOfDebt, taxRate, equityWeight, debtWeight });
  if (gap) return refuse(gap, formula);
  if (taxRate < 0 || taxRate >= 1) return refuse('Tax rate must be a fraction between 0 and 1.', formula);
  if (Math.abs(equityWeight + debtWeight - 1) > 1e-9) {
    return refuse('Equity and debt weights must sum to 1.', formula);
  }
  if (equityWeight < 0 || debtWeight < 0) return refuse('Capital weights cannot be negative.', formula);
  const costOfEquity = riskFreeRate + beta * equityRiskPremium;
  const value = costOfEquity * equityWeight + costOfDebt * (1 - taxRate) * debtWeight;
  if (value <= 0) return refuse('WACC is zero or negative; the inputs are inconsistent.', formula);
  return Object.freeze({
    available: true, value: round4(value), unit: 'fraction', formula,
    inputs: { costOfEquity: round4(costOfEquity), equityWeight, debtWeight, taxRate },
    evidence: 'CALCULATION',
  });
}

/**
 * Discounted cash flow on free cash flow to the firm.
 * `explicitFcff` is the forecast period, oldest first. Terminal value uses
 * either perpetuity growth or an exit multiple, never both.
 */
export function dcf({
  explicitFcff, discountRate, terminalGrowth = null, exitMultiple = null,
  terminalMetric = null, netDebt = 0, sharesOutstanding = null, midYear = false,
}) {
  const formula = 'sum of discounted FCFF plus discounted terminal value, less net debt';
  if (!Array.isArray(explicitFcff) || explicitFcff.length === 0) {
    return refuse('An explicit forecast of at least one year is required.', formula);
  }
  if (explicitFcff.some((v) => !isNum(v))) return refuse('Every forecast year must be a number.', formula);
  if (!isNum(discountRate)) return refuse('A discount rate is required.', formula);
  if (discountRate <= 0 || discountRate >= 1) {
    return refuse('Discount rate must be a fraction between 0 and 1.', formula);
  }

  const usingGrowth = isNum(terminalGrowth);
  const usingMultiple = isNum(exitMultiple);
  if (usingGrowth && usingMultiple) {
    return refuse('Choose either a perpetuity growth rate or an exit multiple, not both.', formula);
  }
  if (!usingGrowth && !usingMultiple) {
    return refuse('A terminal value method is required.', formula);
  }
  if (usingGrowth && terminalGrowth >= discountRate) {
    return refuse('Terminal growth must be below the discount rate, or the model has no finite value.', formula);
  }
  if (usingMultiple && !isNum(terminalMetric)) {
    return refuse('An exit multiple needs a terminal metric to apply it to.', formula);
  }

  const n = explicitFcff.length;
  const offset = midYear ? 0.5 : 0;
  let pvExplicit = 0;
  const schedule = explicitFcff.map((cf, i) => {
    const t = i + 1 - offset;
    const df = 1 / (1 + discountRate) ** t;
    const pv = cf * df;
    pvExplicit += pv;
    return { year: i + 1, cashFlow: round2(cf), discountFactor: round4(df), presentValue: round2(pv) };
  });

  const terminalValue = usingGrowth
    ? (explicitFcff[n - 1] * (1 + terminalGrowth)) / (discountRate - terminalGrowth)
    : terminalMetric * exitMultiple;
  const pvTerminal = terminalValue / (1 + discountRate) ** (n - offset);

  const enterpriseValue = pvExplicit + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  const terminalShare = enterpriseValue !== 0 ? pvTerminal / enterpriseValue : null;

  const perShare = isNum(sharesOutstanding) && sharesOutstanding > 0
    ? round2(equityValue / sharesOutstanding) : null;

  return Object.freeze({
    available: true,
    value: perShare ?? round2(equityValue),
    enterpriseValue: round2(enterpriseValue),
    equityValue: round2(equityValue),
    perShare,
    pvExplicit: round2(pvExplicit),
    pvTerminal: round2(pvTerminal),
    terminalValue: round2(terminalValue),
    terminalShare: round4(terminalShare),
    terminalMethod: usingGrowth ? 'perpetuity growth' : 'exit multiple',
    schedule,
    formula,
    evidence: 'CALCULATION',
    warnings: terminalShare !== null && terminalShare > 0.75
      ? ['More than three quarters of the value sits in the terminal value. The result is an assumption about year eleven, not an analysis of years one to ten.']
      : [],
  });
}

/**
 * Two-way sensitivity grid across discount rate and terminal growth.
 * This is the honest way to present a DCF: a range, not a point.
 */
export function sensitivityGrid({ base, discountRates, terminalGrowths }) {
  if (!Array.isArray(discountRates) || !Array.isArray(terminalGrowths)) {
    return refuse('Both axes must be arrays of rates.');
  }
  if (!discountRates.length || !terminalGrowths.length) {
    return refuse('Both axes need at least one value.');
  }
  const rows = terminalGrowths.map((g) => ({
    terminalGrowth: g,
    cells: discountRates.map((r) => {
      const out = dcf({ ...base, discountRate: r, terminalGrowth: g, exitMultiple: null });
      return { discountRate: r, value: out.available ? out.value : null, reason: out.available ? null : out.reason };
    }),
  }));
  const values = rows.flatMap((r) => r.cells.map((c) => c.value)).filter(isNum);
  return Object.freeze({
    available: values.length > 0,
    discountRates, rows,
    low: values.length ? round2(Math.min(...values)) : null,
    high: values.length ? round2(Math.max(...values)) : null,
    evidence: 'CALCULATION',
    formula: 'DCF repeated across a grid of discount rates and terminal growth rates',
  });
}

/**
 * Reverse DCF: the growth rate the current price already assumes.
 * This is how the market-expectations work in doc 03 gets a number attached.
 */
export function impliedGrowth({
  currentEquityValue, baseFcff, years, discountRate, terminalGrowth, netDebt = 0,
  low = -0.5, high = 1.0, tolerance = 1e-6, maxIterations = 200,
}) {
  const formula = 'solve for the explicit-period growth rate that makes DCF equal the market price';
  const gap = need({ currentEquityValue, baseFcff, years, discountRate, terminalGrowth });
  if (gap) return refuse(gap, formula);
  if (baseFcff <= 0) return refuse('Reverse DCF needs a positive base free cash flow.', formula);
  if (terminalGrowth >= discountRate) return refuse('Terminal growth must be below the discount rate.', formula);

  const valueAt = (g) => {
    const flows = [];
    let cf = baseFcff;
    for (let i = 0; i < years; i++) { cf *= (1 + g); flows.push(cf); }
    const out = dcf({ explicitFcff: flows, discountRate, terminalGrowth, netDebt });
    return out.available ? out.equityValue : NaN;
  };

  let lo = low, hi = high;
  const vLo = valueAt(lo), vHi = valueAt(hi);
  if (!isNum(vLo) || !isNum(vHi)) return refuse('The model did not converge at the search bounds.', formula);
  if ((vLo - currentEquityValue) * (vHi - currentEquityValue) > 0) {
    return refuse('The current price lies outside the searchable growth range.', formula);
  }

  let mid = 0;
  for (let i = 0; i < maxIterations; i++) {
    mid = (lo + hi) / 2;
    const diff = valueAt(mid) - currentEquityValue;
    if (Math.abs(diff) < tolerance * Math.abs(currentEquityValue)) break;
    if ((valueAt(lo) - currentEquityValue) * diff <= 0) hi = mid; else lo = mid;
  }

  return Object.freeze({
    available: true,
    value: round4(mid),
    valuePct: round2(mid * 100),
    unit: '%',
    formula,
    evidence: 'CALCULATION',
    note: 'This is what the price already assumes. Judge whether that is achievable, not whether it is high.',
  });
}

/** Probability-weighted value across scenarios. Probabilities must sum to 1. */
export function scenarioBlend(scenarios) {
  const formula = 'sum of scenario value x probability';
  if (!Array.isArray(scenarios) || scenarios.length === 0) return refuse('No scenarios supplied.', formula);
  if (scenarios.some((s) => !isNum(s.value) || !isNum(s.probability))) {
    return refuse('Every scenario needs a numeric value and probability.', formula);
  }
  const total = scenarios.reduce((a, s) => a + s.probability, 0);
  if (Math.abs(total - 1) > 1e-6) return refuse(`Probabilities must sum to 1, they sum to ${round4(total)}.`, formula);
  const value = scenarios.reduce((a, s) => a + s.value * s.probability, 0);
  return Object.freeze({
    available: true, value: round2(value), formula, evidence: 'CALCULATION',
    inputs: scenarios.map((s) => ({ ...s })),
  });
}

/* ------------------------------------------------ the multiple, over time --

   What a company has historically been worth, against what it is worth now.
   "It trades at 8x" means nothing on its own; "it trades at 8x against a
   two-year mean of 11x, a standard deviation below it" is an argument.

   Two decisions, both of which change the answer:

   WHICH MULTIPLE. A bank's earnings are a residual after provisioning, and
   provisioning is the most discretionary number a bank reports, so price to
   earnings on a lender compares a stable numerator with an unstable
   denominator. Lenders are therefore banded on price to BOOK, which is what
   the sector itself is quoted on. Everything else is banded on earnings.

   WHICH DENOMINATOR AT WHICH DATE. Using today's earnings for a price two
   years ago produces a series that is just the price chart rescaled, and a
   "band" computed from it says nothing except where the price went. Each point
   is therefore divided by the figure that had actually been REPORTED by that
   date — FY26 results are not available in January 2026, so a January price is
   divided by FY25. Where the reporting date is unknown it is taken as four
   months after the financial year end, which is the Indian listing norm. A
   point with no reported figure behind it is dropped rather than guessed. */

const FY_END_MONTH = 3;        // Indian financial year ends 31 March
const REPORTING_LAG_MONTHS = 4; // results are published by roughly end-July

function fyOf(period) {
  const m = /FY\s*'?(\d{2,4})/i.exec(String(period || ''));
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v < 100 ? 2000 + v : v;
}

/** When a financial year's results could first have been known. */
function availableFrom(fy) {
  return Date.UTC(fy, FY_END_MONTH - 1 + REPORTING_LAG_MONTHS, 1);
}

export function multipleBands({ closes, dates, annual, sharesOutstanding, lender = false }) {
  const isA = (v) => Array.isArray(v) && v.length > 0;
  if (!isA(closes) || !isA(dates) || !isA(annual)) {
    return { available: false, reason: 'A price series with dates and at least one reported year are needed.' };
  }
  const metric = lender ? 'P/B' : 'P/E';
  const label = lender ? 'Price to book' : 'Price to earnings';

  /* Per-share denominator for each reported year, with the date it became
     knowable. */
  const marks = [];
  for (const row of annual) {
    const fy = fyOf(row?.period);
    if (fy === null) continue;
    let per = null;
    if (lender) {
      const eq = row.shareholdersEquity;
      const sh = row.sharesOutstanding ?? sharesOutstanding;
      if (isNum(eq) && isNum(sh) && sh > 0) per = eq / sh;
    } else {
      per = isNum(row.epsDiluted) ? row.epsDiluted
        : isNum(row.epsBasic) ? row.epsBasic
          : (isNum(row.netProfit) && isNum(row.sharesOutstanding ?? sharesOutstanding)
            && (row.sharesOutstanding ?? sharesOutstanding) > 0)
            ? row.netProfit / (row.sharesOutstanding ?? sharesOutstanding) : null;
    }
    if (!isNum(per) || per <= 0) continue;   // a loss year has no meaningful multiple
    marks.push({ fy, per, from: availableFrom(fy) });
  }
  if (!marks.length) {
    return { available: false,
      reason: lender
        ? 'No reported year carried both shareholders\' equity and a share count, so book value per share could not be built.'
        : 'No reported year carried positive earnings per share, so the multiple has no denominator.' };
  }
  marks.sort((a, b) => a.from - b.from);

  const points = [];
  const n = Math.min(closes.length, dates.length);
  for (let i = 0; i < n; i++) {
    const px = closes[i];
    const t = Date.parse(dates[i]);
    if (!isNum(px) || px <= 0 || !Number.isFinite(t)) continue;
    let use = null;
    for (const m of marks) { if (t >= m.from) use = m; }
    if (!use) continue;           // nothing had been reported by this date
    points.push({ date: dates[i], value: px / use.per, basis: `FY${String(use.fy).slice(2)}` });
  }
  if (points.length < 8) {
    return { available: false,
      reason: `Only ${points.length} price points fall after a reported result, which is too few to read a band from.` };
  }

  const vals = points.map((p) => p.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  /* Sample standard deviation: these are a sample of the company's history,
     not the whole population of it. */
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
  const sd = Math.sqrt(variance);
  const current = vals[vals.length - 1];
  const z = sd > 0 ? (current - mean) / sd : 0;

  const reading = sd <= 0
    ? `The multiple has not moved over the period, so there is no band to read it against.`
    : z <= -1
      ? `At ${round2(current)}x it is ${round2(Math.abs(z))} standard deviations BELOW its own `
        + `${round2(mean)}x mean — cheap against its own history, which is a different claim `
        + `from cheap against its peers or against what it is worth.`
      : z >= 1
        ? `At ${round2(current)}x it is ${round2(z)} standard deviations ABOVE its own `
          + `${round2(mean)}x mean. The rerating has already happened; what follows has to `
          + `come from the earnings rather than from the multiple.`
        : `At ${round2(current)}x it sits within one standard deviation of its own `
          + `${round2(mean)}x mean, so the multiple is not the argument here — the earnings are.`;

  return Object.freeze({
    available: true, metric, label,
    points, mean: round2(mean), sd: round2(sd), current: round2(current), z: round2(z),
    plusOne: round2(mean + sd), minusOne: round2(mean - sd),
    high: round2(Math.max(...vals)), low: round2(Math.min(...vals)),
    periods: marks.map((m) => `FY${String(m.fy).slice(2)}`),
    reading,
    note: `Each point is the closing price divided by the ${lender ? 'book value' : 'earnings'} `
      + `per share that had been reported by that date, so the series is not the price chart `
      + `rescaled. Bands are one sample standard deviation either side of the period mean.`,
    evidence: 'CALCULATION',
  });
}

/* ------------------------------------------------- the buildup, checked ----

   The research states a cost of capital and how it got there: risk-free rate,
   equity risk premium, beta, cost of debt, tax, and the weights. The report
   printed that table verbatim and the engine never touched it — which meant a
   `wacc` implementation sat in this file with no caller, while the number a
   reader saw as the cost of capital was unverified.

   Two different things are checked here, and they fail for different reasons.

   ARITHMETIC. Does the stated WACC follow from the stated inputs? This is a
   research error when it does not: somebody typed a number that its own
   workings do not produce.

   CONSISTENCY. Is the rate the valuation actually discounts at the same as the
   cost of capital the research built? A gap here is not necessarily an error —
   a lender is discounted at the cost of EQUITY, because you are valuing the
   equity cash flows and a bank's debt is its raw material — but it is always
   something the reader should be told rather than left to notice. */
export function checkWaccBuildup(buildup, discountRateUsed, { lender = false } = {}) {
  const b = buildup && typeof buildup === 'object' ? buildup : null;
  if (!b) return { available: false, reason: 'No cost-of-capital buildup was supplied.' };

  const beta = isNum(b.leveredBeta) ? b.leveredBeta : b.beta;
  const computed = wacc({
    riskFreeRate: b.riskFreeRate,
    equityRiskPremium: b.equityRiskPremium,
    beta,
    costOfDebt: isNum(b.pretaxCostOfDebt) ? b.pretaxCostOfDebt : b.costOfDebt,
    taxRate: b.taxRate,
    equityWeight: b.equityWeight,
    debtWeight: b.debtWeight,
  });
  if (!computed.available) {
    return { available: false, reason: `The buildup cannot be recomputed: ${computed.reason}` };
  }

  const notes = [];
  const stated = isNum(b.wacc) ? b.wacc : null;
  const statedKe = isNum(b.costOfEquity) ? b.costOfEquity : null;
  const ke = computed.inputs.costOfEquity;

  /* A tenth of a percentage point. Tighter than that and rounding in the
     research's own spreadsheet reads as an error. */
  const TOL = 0.001;

  if (isNum(statedKe) && Math.abs(statedKe - ke) > TOL) {
    notes.push(`The stated cost of equity of ${round2(statedKe * 100)}% does not follow from the `
      + `stated inputs: the risk-free rate plus beta times the equity risk premium is `
      + `${round2(ke * 100)}%.`);
  }
  if (isNum(stated) && Math.abs(stated - computed.value) > TOL) {
    notes.push(`The stated cost of capital of ${round2(stated * 100)}% does not follow from its own `
      + `workings, which give ${round2(computed.value * 100)}%.`);
  }

  let usedNote = null;
  if (isNum(discountRateUsed)) {
    const gapToWacc = Math.abs(discountRateUsed - computed.value);
    const gapToKe = Math.abs(discountRateUsed - ke);
    if (gapToWacc > 0.005) {
      usedNote = (gapToKe <= 0.005)
        ? `The valuation discounts at ${round2(discountRateUsed * 100)}%, which is the cost of `
          + `EQUITY rather than the blended cost of capital of ${round2(computed.value * 100)}%. `
          + (lender
            ? 'For a lender that is the right choice — the equity cash flows are what is being '
              + 'valued, and deposits are the business rather than a source of financing.'
            : 'That is the right choice only if what is being discounted is cash flow to equity '
              + 'rather than to the firm; read the two together before relying on the value.')
        : `The valuation discounts at ${round2(discountRateUsed * 100)}%, which matches neither the `
          + `blended cost of capital of ${round2(computed.value * 100)}% nor the cost of equity of `
          + `${round2(ke * 100)}%. Nothing in the buildup explains where it came from.`;
    }
  }

  return Object.freeze({
    available: true,
    computedWacc: round4(computed.value),
    computedCostOfEquity: round4(ke),
    statedWacc: stated,
    statedCostOfEquity: statedKe,
    discountRateUsed: isNum(discountRateUsed) ? discountRateUsed : null,
    ties: notes.length === 0,
    notes, usedNote,
    formula: computed.formula,
    evidence: 'CALCULATION',
  });
}
