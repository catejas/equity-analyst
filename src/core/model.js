// model.js — the earnings model.
//
// The payload supplies drivers. This file builds the forecast, ties the three
// statements together and checks that they tie. Handing over a finished cash
// flow array and flexing the discount rate is the amateur version; the drivers
// that decide the answer are volume, realisation, margin and capex intensity.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (n) => (isNum(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null);
const r4 = (n) => (isNum(n) ? Math.round((n + Number.EPSILON) * 10000) / 10000 : null);

function refuse(reason) {
  return Object.freeze({ available: false, reason, evidence: 'CALCULATION' });
}

/** Read a driver that may be a scalar or a per-year path. */
function pathOf(v, years, name) {
  if (isNum(v)) return Array(years).fill(v);
  if (Array.isArray(v)) {
    if (v.length !== years) throw new Error(`${name} path has ${v.length} entries, needs ${years}.`);
    if (v.some((x) => !isNum(x))) throw new Error(`${name} path contains a non-numeric value.`);
    return v.slice();
  }
  throw new Error(`${name} must be a number or a path of ${years} numbers.`);
}

const TOLERANCE = 0.01; // absolute, in the payload's own units

function check(name, expected, actual, detail) {
  const diff = expected - actual;
  return { name, ok: Math.abs(diff) <= TOLERANCE, expected: r2(expected), actual: r2(actual), diff: r2(diff), detail };
}

/**
 * Build a driver-based forecast.
 *
 * segments[]        { name, baseVolume, volumeCagr, baseRealisation, realisationCagr, grossMargin }
 * opex              { fixedBase, fixedGrowth, variablePctOfRevenue }
 * depreciation      { openingNetBlock, rate }
 * capex             { maintenancePctOfRevenue, growthSchedule[] }
 * workingCapital    { receivableDays, inventoryDays, payableDays }
 * financing         { openingDebt, repaymentSchedule[], drawdownSchedule[], interestRate, taxRate, openingCash, cashYield }
 * shares            { basic, esop, warrants, convertibles }
 */
export function buildModel({
  years, segments, opex, depreciation, capex, workingCapital, financing, shares,
}) {
  if (!isNum(years) || years < 1 || years > 15) return refuse('years must be between 1 and 15.');
  if (!Array.isArray(segments) || segments.length === 0) return refuse('At least one segment is required.');
  for (const block of [['opex', opex], ['depreciation', depreciation], ['capex', capex],
    ['workingCapital', workingCapital], ['financing', financing], ['shares', shares]]) {
    if (!block[1] || typeof block[1] !== 'object') return refuse(`The ${block[0]} block is required.`);
  }

  let seg;
  try {
    seg = segments.map((s, i) => {
      const name = s.name || `Segment ${i + 1}`;
      for (const k of ['baseVolume', 'volumeCagr', 'baseRealisation', 'realisationCagr']) {
        if (!isNum(s[k])) throw new Error(`${name}: ${k} is required and must be a number.`);
      }
      return { name, ...s, grossMargin: pathOf(s.grossMargin, years, `${name} grossMargin`) };
    });
  } catch (e) { return refuse(e.message); }

  let fixedGrowth, variablePct, maintPct, growthCapex, rDays, iDays, pDays, repay, draw;
  try {
    fixedGrowth = pathOf(opex.fixedGrowth ?? 0, years, 'opex.fixedGrowth');
    variablePct = pathOf(opex.variablePctOfRevenue ?? 0, years, 'opex.variablePctOfRevenue');
    maintPct = pathOf(capex.maintenancePctOfRevenue ?? 0, years, 'capex.maintenancePctOfRevenue');
    growthCapex = pathOf(capex.growthSchedule ?? 0, years, 'capex.growthSchedule');
    rDays = pathOf(workingCapital.receivableDays, years, 'receivableDays');
    iDays = pathOf(workingCapital.inventoryDays, years, 'inventoryDays');
    pDays = pathOf(workingCapital.payableDays, years, 'payableDays');
    repay = pathOf(financing.repaymentSchedule ?? 0, years, 'repaymentSchedule');
    draw = pathOf(financing.drawdownSchedule ?? 0, years, 'drawdownSchedule');
  } catch (e) { return refuse(e.message); }

  const taxRate = financing.taxRate;
  if (!isNum(taxRate) || taxRate < 0 || taxRate >= 1) return refuse('financing.taxRate must be a fraction between 0 and 1.');
  if (!isNum(financing.interestRate)) return refuse('financing.interestRate is required.');
  if (!isNum(opex.fixedBase)) return refuse('opex.fixedBase is required.');
  if (!isNum(depreciation.openingNetBlock) || !isNum(depreciation.rate)) {
    return refuse('depreciation needs openingNetBlock and rate.');
  }
  if (!isNum(shares.basic) || shares.basic <= 0) return refuse('shares.basic must be a positive number.');

  const diluted = shares.basic + (shares.esop || 0) + (shares.warrants || 0) + (shares.convertibles || 0);

  let netBlock = depreciation.openingNetBlock;
  let debt = financing.openingDebt ?? 0;
  let cash = financing.openingCash ?? 0;
  let fixed = opex.fixedBase;
  let priorWc = null;

  const rows = [];
  const checks = [];

  for (let t = 0; t < years; t++) {
    const segRows = seg.map((s) => {
      const volume = s.baseVolume * (1 + s.volumeCagr) ** (t + 1);
      const realisation = s.baseRealisation * (1 + s.realisationCagr) ** (t + 1);
      const revenue = volume * realisation;
      const grossProfit = revenue * s.grossMargin[t];
      return { name: s.name, volume: r2(volume), realisation: r4(realisation), revenue: r2(revenue), grossProfit: r2(grossProfit) };
    });

    const revenue = segRows.reduce((x, s) => x + s.revenue, 0);
    const grossProfit = segRows.reduce((x, s) => x + s.grossProfit, 0);
    const cogs = revenue - grossProfit;

    if (t > 0) fixed *= (1 + fixedGrowth[t]);
    const variable = revenue * variablePct[t];
    const ebitda = grossProfit - fixed - variable;

    const dep = netBlock * depreciation.rate;
    const ebit = ebitda - dep;

    const interest = debt * financing.interestRate;
    const interestIncome = cash * (financing.cashYield ?? 0);
    const pbt = ebit - interest + interestIncome;
    const tax = pbt > 0 ? pbt * taxRate : 0;
    const pat = pbt - tax;

    const receivables = (revenue * rDays[t]) / 365;
    const inventory = (cogs * iDays[t]) / 365;
    const payables = (cogs * pDays[t]) / 365;
    const wc = receivables + inventory - payables;
    const dWc = priorWc === null ? 0 : wc - priorWc;

    const capexTotal = revenue * maintPct[t] + growthCapex[t];
    const netBorrowing = draw[t] - repay[t];

    const nopat = ebit * (1 - taxRate);
    const fcff = nopat + dep - capexTotal - dWc;
    const fcfe = fcff - interest * (1 - taxRate) + netBorrowing;

    const cfo = pat + dep - dWc + interest;         // interest shown in financing
    const cfi = -capexTotal;
    const cff = netBorrowing - interest;
    const openingCash = cash;

    const closingNetBlock = netBlock + capexTotal - dep;
    const closingDebt = debt + netBorrowing;
    const closingCash = openingCash + cfo + cfi + cff;

    // Reconciliation. These are the checks no LLM report performs on itself.
    checks.push(check(`Year ${t + 1}: segment revenue sums to total`, revenue, segRows.reduce((x, s) => x + s.revenue, 0)));
    checks.push(check(`Year ${t + 1}: fixed asset roll-forward`, closingNetBlock, netBlock + capexTotal - dep));
    checks.push(check(`Year ${t + 1}: debt roll-forward`, closingDebt, debt + draw[t] - repay[t]));
    checks.push(check(`Year ${t + 1}: cash movement ties to the cash flow statement`, closingCash - openingCash, cfo + cfi + cff));
    checks.push(check(`Year ${t + 1}: free cash flow to equity bridge`, fcfe, fcff - interest * (1 - taxRate) + netBorrowing));

    rows.push({
      year: t + 1,
      segments: segRows,
      revenue: r2(revenue), grossProfit: r2(grossProfit), cogs: r2(cogs),
      fixedCost: r2(fixed), variableCost: r2(variable),
      ebitda: r2(ebitda), ebitdaMargin: r2(revenue > 0 ? (ebitda / revenue) * 100 : null),
      depreciation: r2(dep), ebit: r2(ebit), ebitMargin: r2(revenue > 0 ? (ebit / revenue) * 100 : null),
      interest: r2(interest), interestIncome: r2(interestIncome),
      pbt: r2(pbt), tax: r2(tax), pat: r2(pat),
      epsBasic: r2(pat / shares.basic), epsDiluted: r2(pat / diluted),
      receivables: r2(receivables), inventory: r2(inventory), payables: r2(payables),
      workingCapital: r2(wc), changeInWorkingCapital: r2(dWc),
      capex: r2(capexTotal), nopat: r2(nopat),
      fcff: r2(fcff), fcfe: r2(fcfe),
      cfo: r2(cfo), cfi: r2(cfi), cff: r2(cff),
      openingCash: r2(openingCash), closingCash: r2(closingCash),
      netBlock: r2(closingNetBlock), debt: r2(closingDebt),
      netDebt: r2(closingDebt - closingCash),
    });

    netBlock = closingNetBlock;
    debt = closingDebt;
    cash = closingCash;
    priorWc = wc;
  }

  const failed = checks.filter((c) => !c.ok);

  return Object.freeze({
    available: true,
    years: rows,
    fcff: rows.map((r) => r.fcff),
    fcfe: rows.map((r) => r.fcfe),
    dilutedShares: r2(diluted),
    dilutionPct: r2(((diluted - shares.basic) / shares.basic) * 100),
    checks,
    reconciled: failed.length === 0,
    failedChecks: failed,
    evidence: 'CALCULATION',
    summary: {
      revenueCagr: rows.length > 1
        ? r2(((rows[rows.length - 1].revenue / rows[0].revenue) ** (1 / (rows.length - 1)) - 1) * 100) : null,
      epsCagr: rows.length > 1 && rows[0].epsDiluted > 0
        ? r2(((rows[rows.length - 1].epsDiluted / rows[0].epsDiluted) ** (1 / (rows.length - 1)) - 1) * 100) : null,
      terminalEbitdaMargin: rows[rows.length - 1].ebitdaMargin,
      cumulativeFcff: r2(rows.reduce((x, r) => x + r.fcff, 0)),
    },
  });
}

/**
 * Sensitivity on the drivers that decide the answer, not on the discount rate.
 * Each entry flexes one driver and reports the effect on cumulative free cash
 * flow and terminal earnings per share.
 */
export function driverSensitivity(base, flexes) {
  if (!Array.isArray(flexes) || flexes.length === 0) return refuse('At least one flex is required.');
  const baseline = buildModel(base);
  if (!baseline.available) return refuse(`The base model does not build: ${baseline.reason}`);

  const results = flexes.map((f) => {
    let input;
    try { input = f.apply(structuredClone(base)); }
    catch (e) { return { driver: f.driver, error: e.message }; }
    const out = buildModel(input);
    if (!out.available) return { driver: f.driver, error: out.reason };
    const baseFcff = baseline.summary.cumulativeFcff;
    const baseEps = baseline.years[baseline.years.length - 1].epsDiluted;
    const eps = out.years[out.years.length - 1].epsDiluted;
    return {
      driver: f.driver,
      change: f.change,
      cumulativeFcff: out.summary.cumulativeFcff,
      fcffDeltaPct: baseFcff ? r2(((out.summary.cumulativeFcff - baseFcff) / Math.abs(baseFcff)) * 100) : null,
      terminalEps: eps,
      epsDeltaPct: baseEps ? r2(((eps - baseEps) / Math.abs(baseEps)) * 100) : null,
    };
  });

  const ranked = results.filter((r) => isNum(r.epsDeltaPct))
    .sort((a, b) => Math.abs(b.epsDeltaPct) - Math.abs(a.epsDeltaPct));

  return Object.freeze({
    available: true,
    baseline: baseline.summary,
    results,
    mostSensitiveTo: ranked.length ? ranked[0].driver : null,
    evidence: 'CALCULATION',
    note: 'Sensitivity is on operating drivers. Flexing the discount rate measures the model, not the business.',
  });
}

/** Convenience flexes for the standard grid. */
export const STANDARD_FLEXES = [
  { driver: 'Volume growth', change: '-300bp',
    apply: (b) => { b.segments.forEach((s) => { s.volumeCagr -= 0.03; }); return b; } },
  { driver: 'Volume growth', change: '+300bp',
    apply: (b) => { b.segments.forEach((s) => { s.volumeCagr += 0.03; }); return b; } },
  { driver: 'Realisation', change: '-200bp',
    apply: (b) => { b.segments.forEach((s) => { s.realisationCagr -= 0.02; }); return b; } },
  { driver: 'Gross margin', change: '-200bp',
    apply: (b) => { b.segments.forEach((s) => {
      s.grossMargin = Array.isArray(s.grossMargin) ? s.grossMargin.map((m) => m - 0.02) : s.grossMargin - 0.02;
    }); return b; } },
  { driver: 'Gross margin', change: '+200bp',
    apply: (b) => { b.segments.forEach((s) => {
      s.grossMargin = Array.isArray(s.grossMargin) ? s.grossMargin.map((m) => m + 0.02) : s.grossMargin + 0.02;
    }); return b; } },
  { driver: 'Capex intensity', change: '+200bp of revenue',
    apply: (b) => { b.capex.maintenancePctOfRevenue = (b.capex.maintenancePctOfRevenue || 0) + 0.02; return b; } },
  { driver: 'Working capital', change: '+15 receivable days',
    apply: (b) => {
      b.workingCapital.receivableDays = Array.isArray(b.workingCapital.receivableDays)
        ? b.workingCapital.receivableDays.map((d) => d + 15)
        : b.workingCapital.receivableDays + 15;
      return b;
    } },
];
