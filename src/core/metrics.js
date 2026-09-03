// metrics.js — financial calculations (doc 08 calculation coverage).
// Pure. Every result carries its formula and inputs so the number can be
// audited back to source: input -> formula -> output (doc 07).
//
// Two rules run through this file:
//   1. A calculation with a missing input returns unavailable, never zero.
//   2. A calculation that is arithmetically possible but economically
//      meaningless (P/E on a loss, ROE on negative equity) says so explicitly
//      rather than returning a misleading number.

const round = (n, dp = 2) => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

function unavailable(reason, formula = null) {
  return Object.freeze({ available: false, value: null, reason, formula, evidence: 'CALCULATION' });
}

function calc(value, { formula, inputs, unit = null, dp = 2, note = null, meaningful = true }) {
  if (!Number.isFinite(value)) return unavailable('Result is not a finite number.', formula);
  return Object.freeze({
    available: true, value: round(value, dp), unit, formula, inputs,
    evidence: 'CALCULATION', meaningful, note,
  });
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Guard: every named input must be a finite number. */
function need(inputs) {
  const missing = Object.entries(inputs).filter(([, v]) => !num(v)).map(([k]) => k);
  return missing.length ? `Missing or non-numeric input: ${missing.join(', ')}.` : null;
}

// ---------------------------------------------------------------- growth

/** Compound annual growth rate. Undefined when the base is not positive. */
export function cagr(beginValue, endValue, years) {
  const formula = '(end / begin)^(1/years) - 1';
  const gap = need({ beginValue, endValue, years });
  if (gap) return unavailable(gap, formula);
  if (years <= 0) return unavailable('Years must be greater than zero.', formula);
  if (beginValue <= 0) {
    return unavailable('CAGR is undefined from a zero or negative base.', formula);
  }
  if (endValue < 0) {
    return unavailable('CAGR is undefined to a negative end value.', formula);
  }
  return calc(((endValue / beginValue) ** (1 / years) - 1) * 100, {
    formula, inputs: { beginValue, endValue, years }, unit: '%',
  });
}

/** Period-on-period growth. Sign flips are reported, not silently signed. */
export function growth(previous, current) {
  const formula = '(current - previous) / |previous|';
  const gap = need({ previous, current });
  if (gap) return unavailable(gap, formula);
  if (previous === 0) return unavailable('Growth is undefined from a base of zero.', formula);
  const meaningful = previous > 0;
  return calc(((current - previous) / Math.abs(previous)) * 100, {
    formula, inputs: { previous, current }, unit: '%', meaningful,
    note: meaningful ? null : 'Base period is negative; percentage growth is not meaningful.',
  });
}

// --------------------------------------------------------------- margins

function margin(name, numerator, revenue) {
  const formula = `${name} / revenue`;
  const gap = need({ [name]: numerator, revenue });
  if (gap) return unavailable(gap, formula);
  if (revenue <= 0) return unavailable('Revenue must be positive to compute a margin.', formula);
  return calc((numerator / revenue) * 100, {
    formula, inputs: { [name]: numerator, revenue }, unit: '%',
  });
}

export const grossMargin = (grossProfit, revenue) => margin('grossProfit', grossProfit, revenue);
export const ebitdaMargin = (ebitda, revenue) => margin('ebitda', ebitda, revenue);
export const ebitMargin = (ebit, revenue) => margin('ebit', ebit, revenue);
export const netMargin = (netProfit, revenue) => margin('netProfit', netProfit, revenue);

// --------------------------------------------------------------- returns

/** Return on equity. Negative equity makes the ratio meaningless, not negative. */
export function roe(netProfit, shareholdersEquity) {
  const formula = 'net profit / shareholders equity';
  const gap = need({ netProfit, shareholdersEquity });
  if (gap) return unavailable(gap, formula);
  if (shareholdersEquity <= 0) {
    return unavailable('ROE is not meaningful with zero or negative equity.', formula);
  }
  return calc((netProfit / shareholdersEquity) * 100, {
    formula, inputs: { netProfit, shareholdersEquity }, unit: '%',
    meaningful: netProfit >= 0,
    note: netProfit < 0 ? 'Loss-making period; the ratio is a rate of capital destruction.' : null,
  });
}

export function roa(netProfit, totalAssets) {
  const formula = 'net profit / total assets';
  const gap = need({ netProfit, totalAssets });
  if (gap) return unavailable(gap, formula);
  if (totalAssets <= 0) return unavailable('Total assets must be positive.', formula);
  return calc((netProfit / totalAssets) * 100, {
    formula, inputs: { netProfit, totalAssets }, unit: '%',
  });
}

/** Return on capital employed. Capital employed = equity + total debt. */
export function roce(ebit, shareholdersEquity, totalDebt) {
  const formula = 'EBIT / (equity + total debt)';
  const gap = need({ ebit, shareholdersEquity, totalDebt });
  if (gap) return unavailable(gap, formula);
  const capitalEmployed = shareholdersEquity + totalDebt;
  if (capitalEmployed <= 0) return unavailable('Capital employed is zero or negative.', formula);
  return calc((ebit / capitalEmployed) * 100, {
    formula, inputs: { ebit, shareholdersEquity, totalDebt, capitalEmployed }, unit: '%',
  });
}

/** Return on invested capital. Invested capital excludes surplus cash. */
export function roic(ebit, taxRate, shareholdersEquity, totalDebt, cashAndEquivalents) {
  const formula = 'EBIT x (1 - tax rate) / (equity + debt - cash)';
  const gap = need({ ebit, taxRate, shareholdersEquity, totalDebt, cashAndEquivalents });
  if (gap) return unavailable(gap, formula);
  if (taxRate < 0 || taxRate >= 1) {
    return unavailable('Tax rate must be a fraction between 0 and 1.', formula);
  }
  const investedCapital = shareholdersEquity + totalDebt - cashAndEquivalents;
  if (investedCapital <= 0) {
    return unavailable('Invested capital is zero or negative; ROIC is not meaningful.', formula);
  }
  const nopat = ebit * (1 - taxRate);
  return calc((nopat / investedCapital) * 100, {
    formula, inputs: { ebit, taxRate, nopat, investedCapital }, unit: '%',
  });
}

/**
 * Incremental return on invested capital: what the money reinvested since the
 * base period has actually earned. The single most informative number for the
 * multibagger question (doc 01 chain: reinvestment -> ROIC -> intrinsic value).
 */
export function incrementalRoic(nopatBegin, nopatEnd, investedCapitalBegin, investedCapitalEnd) {
  const formula = 'change in NOPAT / change in invested capital';
  const gap = need({ nopatBegin, nopatEnd, investedCapitalBegin, investedCapitalEnd });
  if (gap) return unavailable(gap, formula);
  const dCapital = investedCapitalEnd - investedCapitalBegin;
  if (dCapital === 0) return unavailable('No incremental capital was invested.', formula);
  if (dCapital < 0) {
    return unavailable('Invested capital shrank; incremental ROIC is not meaningful.', formula);
  }
  return calc(((nopatEnd - nopatBegin) / dCapital) * 100, {
    formula, inputs: { dNopat: nopatEnd - nopatBegin, dCapital }, unit: '%',
  });
}

// -------------------------------------------------------------- leverage

export function debtToEquity(totalDebt, shareholdersEquity) {
  const formula = 'total debt / shareholders equity';
  const gap = need({ totalDebt, shareholdersEquity });
  if (gap) return unavailable(gap, formula);
  if (shareholdersEquity <= 0) {
    return unavailable('Negative or zero equity; the ratio is not meaningful.', formula);
  }
  return calc(totalDebt / shareholdersEquity, {
    formula, inputs: { totalDebt, shareholdersEquity }, unit: 'x',
  });
}

export function netDebtToEbitda(totalDebt, cashAndEquivalents, ebitda) {
  const formula = '(total debt - cash) / EBITDA';
  const gap = need({ totalDebt, cashAndEquivalents, ebitda });
  if (gap) return unavailable(gap, formula);
  if (ebitda <= 0) return unavailable('EBITDA is zero or negative; leverage cover is undefined.', formula);
  const netDebt = totalDebt - cashAndEquivalents;
  return calc(netDebt / ebitda, {
    formula, inputs: { netDebt, ebitda }, unit: 'x',
    note: netDebt < 0 ? 'Net cash position.' : null,
  });
}

export function interestCoverage(ebit, interestExpense) {
  const formula = 'EBIT / interest expense';
  const gap = need({ ebit, interestExpense });
  if (gap) return unavailable(gap, formula);
  if (interestExpense <= 0) return unavailable('No interest expense to cover.', formula);
  return calc(ebit / interestExpense, {
    formula, inputs: { ebit, interestExpense }, unit: 'x',
    meaningful: ebit > 0,
    note: ebit <= 0 ? 'EBIT does not cover interest at all.' : null,
  });
}

// ------------------------------------------------------- working capital

const daysRatio = (name, numerator, denominator, formula, days = 365) => {
  const gap = need({ [name]: numerator, denominator });
  if (gap) return unavailable(gap, formula);
  if (denominator <= 0) return unavailable('Denominator must be positive.', formula);
  return calc((numerator / denominator) * days, {
    formula, inputs: { [name]: numerator, denominator, days }, unit: 'days', dp: 1,
  });
};

export const receivableDays = (receivables, revenue) =>
  daysRatio('receivables', receivables, revenue, 'receivables / revenue x 365');
export const inventoryDays = (inventory, costOfGoodsSold) =>
  daysRatio('inventory', inventory, costOfGoodsSold, 'inventory / COGS x 365');
export const payableDays = (payables, costOfGoodsSold) =>
  daysRatio('payables', payables, costOfGoodsSold, 'payables / COGS x 365');

export function cashConversionCycle(receivables, inventory, payables, revenue, costOfGoodsSold) {
  const formula = 'receivable days + inventory days - payable days';
  const r = receivableDays(receivables, revenue);
  const i = inventoryDays(inventory, costOfGoodsSold);
  const p = payableDays(payables, costOfGoodsSold);
  if (!r.available || !i.available || !p.available) {
    return unavailable('One or more working-capital components is unavailable.', formula);
  }
  return calc(r.value + i.value - p.value, {
    formula, inputs: { receivableDays: r.value, inventoryDays: i.value, payableDays: p.value },
    unit: 'days', dp: 1,
  });
}

// ------------------------------------------------------------- cash flow

export function freeCashFlow(cashFromOperations, capitalExpenditure) {
  const formula = 'cash from operations - capital expenditure';
  const gap = need({ cashFromOperations, capitalExpenditure });
  if (gap) return unavailable(gap, formula);
  const value = cashFromOperations - Math.abs(capitalExpenditure);
  return calc(value, {
    formula, inputs: { cashFromOperations, capitalExpenditure: Math.abs(capitalExpenditure) },
    note: value < 0 ? 'Negative free cash flow for the period.' : null,
  });
}

/**
 * How much reported profit turns into cash. Persistent readings well below
 * 100% are the classic accounting-quality warning (doc 03 forensic work).
 */
export function cashConversion(cashFromOperations, netProfit) {
  const formula = 'cash from operations / net profit';
  const gap = need({ cashFromOperations, netProfit });
  if (gap) return unavailable(gap, formula);
  if (netProfit <= 0) return unavailable('Cash conversion needs a positive profit base.', formula);
  return calc((cashFromOperations / netProfit) * 100, {
    formula, inputs: { cashFromOperations, netProfit }, unit: '%',
  });
}

/** Accruals ratio. High and rising accruals is a forensic red flag. */
export function accrualsRatio(netProfit, cashFromOperations, totalAssets) {
  const formula = '(net profit - cash from operations) / total assets';
  const gap = need({ netProfit, cashFromOperations, totalAssets });
  if (gap) return unavailable(gap, formula);
  if (totalAssets <= 0) return unavailable('Total assets must be positive.', formula);
  return calc(((netProfit - cashFromOperations) / totalAssets) * 100, {
    formula, inputs: { netProfit, cashFromOperations, totalAssets }, unit: '%',
  });
}

// ---------------------------------------------------- valuation multiples

/** Price to earnings. A loss makes this not meaningful, not negative. */
export function priceToEarnings(marketCap, netProfit) {
  const formula = 'market capitalisation / net profit';
  const gap = need({ marketCap, netProfit });
  if (gap) return unavailable(gap, formula);
  if (netProfit <= 0) {
    return unavailable('P/E is not meaningful for a loss-making or zero-profit company.', formula);
  }
  if (marketCap <= 0) return unavailable('Market capitalisation must be positive.', formula);
  return calc(marketCap / netProfit, { formula, inputs: { marketCap, netProfit }, unit: 'x' });
}

export function priceToBook(marketCap, shareholdersEquity) {
  const formula = 'market capitalisation / shareholders equity';
  const gap = need({ marketCap, shareholdersEquity });
  if (gap) return unavailable(gap, formula);
  if (shareholdersEquity <= 0) return unavailable('Book value is zero or negative.', formula);
  return calc(marketCap / shareholdersEquity, {
    formula, inputs: { marketCap, shareholdersEquity }, unit: 'x',
  });
}

export function enterpriseValue(marketCap, totalDebt, cashAndEquivalents, minorityInterest = 0) {
  const formula = 'market cap + total debt + minority interest - cash';
  const gap = need({ marketCap, totalDebt, cashAndEquivalents, minorityInterest });
  if (gap) return unavailable(gap, formula);
  return calc(marketCap + totalDebt + minorityInterest - cashAndEquivalents, {
    formula, inputs: { marketCap, totalDebt, minorityInterest, cashAndEquivalents },
  });
}

export function evToEbitda(ev, ebitda) {
  const formula = 'enterprise value / EBITDA';
  const gap = need({ ev, ebitda });
  if (gap) return unavailable(gap, formula);
  if (ebitda <= 0) return unavailable('EV/EBITDA is not meaningful with zero or negative EBITDA.', formula);
  if (ev <= 0) return unavailable('Enterprise value is zero or negative.', formula);
  return calc(ev / ebitda, { formula, inputs: { ev, ebitda }, unit: 'x' });
}

export function fcfYield(freeCashFlowValue, marketCap) {
  const formula = 'free cash flow / market capitalisation';
  const gap = need({ freeCashFlowValue, marketCap });
  if (gap) return unavailable(gap, formula);
  if (marketCap <= 0) return unavailable('Market capitalisation must be positive.', formula);
  return calc((freeCashFlowValue / marketCap) * 100, {
    formula, inputs: { freeCashFlowValue, marketCap }, unit: '%',
    meaningful: freeCashFlowValue > 0,
  });
}

/**
 * PEG. Deliberately strict: a negative or near-zero growth rate makes this
 * meaningless, and a low PEG built on an unsustainable growth rate is the
 * commonest way a value trap passes a screen (doc 03).
 */
export function pegRatio(peRatio, earningsGrowthPct) {
  const formula = 'P/E / earnings growth rate';
  const gap = need({ peRatio, earningsGrowthPct });
  if (gap) return unavailable(gap, formula);
  if (peRatio <= 0) return unavailable('P/E must be positive.', formula);
  if (earningsGrowthPct <= 0) {
    return unavailable('PEG is not meaningful without positive earnings growth.', formula);
  }
  return calc(peRatio / earningsGrowthPct, {
    formula, inputs: { peRatio, earningsGrowthPct }, unit: 'x',
    note: 'PEG assumes the growth rate is sustainable. Test that assumption separately.',
  });
}

// ------------------------------------------------- banking and financials

/** Net interest margin. Doc 03 requires bank-specific metrics. */
export function netInterestMargin(netInterestIncome, averageEarningAssets) {
  const formula = 'net interest income / average earning assets';
  const gap = need({ netInterestIncome, averageEarningAssets });
  if (gap) return unavailable(gap, formula);
  if (averageEarningAssets <= 0) return unavailable('Average earning assets must be positive.', formula);
  return calc((netInterestIncome / averageEarningAssets) * 100, {
    formula, inputs: { netInterestIncome, averageEarningAssets }, unit: '%',
  });
}

export function casaRatio(currentDeposits, savingsDeposits, totalDeposits) {
  const formula = '(current + savings deposits) / total deposits';
  const gap = need({ currentDeposits, savingsDeposits, totalDeposits });
  if (gap) return unavailable(gap, formula);
  if (totalDeposits <= 0) return unavailable('Total deposits must be positive.', formula);
  const casa = currentDeposits + savingsDeposits;
  if (casa > totalDeposits) {
    return unavailable('CASA exceeds total deposits; the inputs are inconsistent.', formula);
  }
  return calc((casa / totalDeposits) * 100, {
    formula, inputs: { casa, totalDeposits }, unit: '%',
  });
}

export function provisionCoverageRatio(provisions, grossNpa) {
  const formula = 'provisions held / gross NPA';
  const gap = need({ provisions, grossNpa });
  if (gap) return unavailable(gap, formula);
  if (grossNpa <= 0) return unavailable('No gross NPA to cover.', formula);
  return calc((provisions / grossNpa) * 100, {
    formula, inputs: { provisions, grossNpa }, unit: '%',
  });
}

export function creditCost(provisionsForPeriod, averageAdvances) {
  const formula = 'provisions for the period / average advances';
  const gap = need({ provisionsForPeriod, averageAdvances });
  if (gap) return unavailable(gap, formula);
  if (averageAdvances <= 0) return unavailable('Average advances must be positive.', formula);
  return calc((provisionsForPeriod / averageAdvances) * 100, {
    formula, inputs: { provisionsForPeriod, averageAdvances }, unit: '%',
  });
}

/** Which metric set applies to a sector (doc 03). */
export const SECTOR_METRICS = Object.freeze({
  banking: ['roa', 'roe', 'netInterestMargin', 'casaRatio', 'provisionCoverageRatio', 'creditCost'],
  nbfc: ['roa', 'roe', 'netInterestMargin', 'creditCost', 'debtToEquity'],
  insurance: ['netMargin', 'roe'],
  manufacturing: ['ebitdaMargin', 'roce', 'roic', 'freeCashFlow', 'cashConversionCycle', 'netDebtToEbitda'],
  commodity: ['ebitdaMargin', 'roce', 'netDebtToEbitda', 'freeCashFlow'],
  pharma: ['ebitdaMargin', 'roce', 'roic', 'freeCashFlow'],
  it: ['ebitMargin', 'roce', 'roic', 'freeCashFlow', 'receivableDays'],
  infrastructure: ['ebitdaMargin', 'roce', 'netDebtToEbitda', 'cashConversionCycle', 'interestCoverage'],
  defence: ['ebitdaMargin', 'roce', 'roic', 'freeCashFlow', 'cashConversionCycle', 'receivableDays'],
});

/** Banks and NBFCs have no meaningful EV or ROCE; the engine must not offer them. */
export const FINANCIAL_SECTORS = Object.freeze(['banking', 'nbfc', 'insurance']);

export function metricApplies(metricName, sector) {
  if (FINANCIAL_SECTORS.includes(sector)) {
    if (['roce', 'roic', 'evToEbitda', 'enterpriseValue', 'netDebtToEbitda', 'ebitdaMargin']
      .includes(metricName)) return false;
  }
  return true;
}
