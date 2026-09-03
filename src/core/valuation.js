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
