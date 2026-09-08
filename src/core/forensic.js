// forensic.js — accounting quality.
//
// Composite scores first, then the tests that have actually caught Indian
// listed-company frauds. Every function refuses rather than guessing: a
// forensic score computed from half the inputs is worse than no score, because
// it launders an absence of work into a number.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (n) => (isNum(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null);
const r3 = (n) => (isNum(n) ? Math.round((n + Number.EPSILON) * 1000) / 1000 : null);

function refuse(name, reason) {
  return Object.freeze({ name, available: false, value: null, reason, evidence: 'CALCULATION' });
}
function need(name, inputs) {
  const missing = Object.entries(inputs).filter(([, v]) => !isNum(v)).map(([k]) => k);
  return missing.length ? refuse(name, `Missing or non-numeric: ${missing.join(', ')}.`) : null;
}
const safeDiv = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);

// ------------------------------------------------------- composite scores

/**
 * Beneish M-score. Above -1.78 flags a likely earnings manipulator.
 * Needs two consecutive years of the same eight line items.
 */
export function beneishMScore(cur, prior) {
  const name = 'Beneish M-score';
  if (!cur || !prior) return refuse(name, 'Two consecutive years are required.');
  const req = ['revenue', 'receivables', 'grossProfit', 'currentAssets', 'netFixedAssets',
    'totalAssets', 'depreciation', 'sga', 'currentLiabilities', 'longTermDebt',
    'netProfit', 'cashFromOperations', 'securities'];
  for (const y of [['current', cur], ['prior', prior]]) {
    const gap = need(name, Object.fromEntries(req.filter((k) => k !== 'securities').map((k) => [`${y[0]}.${k}`, y[1][k]])));
    if (gap) return gap;
  }

  const dsri = safeDiv(safeDiv(cur.receivables, cur.revenue), safeDiv(prior.receivables, prior.revenue));
  const gmCur = safeDiv(cur.grossProfit, cur.revenue);
  const gmPrior = safeDiv(prior.grossProfit, prior.revenue);
  const gmi = safeDiv(gmPrior, gmCur);
  const softCur = 1 - safeDiv(cur.currentAssets + cur.netFixedAssets + (cur.securities || 0), cur.totalAssets);
  const softPrior = 1 - safeDiv(prior.currentAssets + prior.netFixedAssets + (prior.securities || 0), prior.totalAssets);
  const aqi = safeDiv(softCur, softPrior);
  const sgi = safeDiv(cur.revenue, prior.revenue);
  const depRateCur = safeDiv(cur.depreciation, cur.depreciation + cur.netFixedAssets);
  const depRatePrior = safeDiv(prior.depreciation, prior.depreciation + prior.netFixedAssets);
  const depi = safeDiv(depRatePrior, depRateCur);
  const sgai = safeDiv(safeDiv(cur.sga, cur.revenue), safeDiv(prior.sga, prior.revenue));
  const levCur = safeDiv(cur.currentLiabilities + cur.longTermDebt, cur.totalAssets);
  const levPrior = safeDiv(prior.currentLiabilities + prior.longTermDebt, prior.totalAssets);
  const lvgi = safeDiv(levCur, levPrior);
  const tata = safeDiv(cur.netProfit - cur.cashFromOperations, cur.totalAssets);

  const parts = { dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata };
  const bad = Object.entries(parts).filter(([, v]) => !isNum(v)).map(([k]) => k);
  if (bad.length) return refuse(name, `Could not compute: ${bad.join(', ')}. A zero denominator, usually.`);

  const m = -4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi
    + 0.115 * depi - 0.172 * sgai + 4.679 * tata - 0.327 * lvgi;

  return Object.freeze({
    name, available: true, value: r3(m), threshold: -1.78,
    flagged: m > -1.78,
    reading: m > -1.78 ? 'Consistent with earnings manipulation. Investigate before anything else.' : 'No manipulation signature.',
    components: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r3(v)])),
    evidence: 'CALCULATION',
    note: 'A flag is a reason to look harder, not a finding of fraud. The components say where to look.',
  });
}

/**
 * Altman Z. The emerging-market variant is the right one for Indian companies
 * outside heavy manufacturing, and is the default here.
 */
export function altmanZ({ workingCapital, retainedEarnings, ebit, totalAssets, totalLiabilities,
  marketCapEquity = null, revenue = null, bookEquity = null, variant = 'emerging' }) {
  const name = `Altman Z (${variant})`;
  const gap = need(name, { workingCapital, retainedEarnings, ebit, totalAssets, totalLiabilities });
  if (gap) return gap;
  if (totalAssets <= 0 || totalLiabilities <= 0) return refuse(name, 'Total assets and liabilities must be positive.');

  const x1 = workingCapital / totalAssets;
  const x2 = retainedEarnings / totalAssets;
  const x3 = ebit / totalAssets;

  if (variant === 'manufacturing') {
    if (!isNum(marketCapEquity) || !isNum(revenue)) {
      return refuse(name, 'The manufacturing variant needs market capitalisation and revenue.');
    }
    const x4 = marketCapEquity / totalLiabilities;
    const x5 = revenue / totalAssets;
    const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
    return Object.freeze({
      name, available: true, value: r2(z),
      zone: z > 2.99 ? 'Safe' : z > 1.81 ? 'Grey' : 'Distress',
      flagged: z <= 1.81, components: { x1: r3(x1), x2: r3(x2), x3: r3(x3), x4: r3(x4), x5: r3(x5) },
      evidence: 'CALCULATION',
    });
  }

  if (!isNum(bookEquity)) return refuse(name, 'The emerging-market variant needs book equity.');
  const x4 = bookEquity / totalLiabilities;
  const z = 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  return Object.freeze({
    name, available: true, value: r2(z),
    zone: z > 5.85 ? 'Safe' : z > 4.15 ? 'Grey' : 'Distress',
    flagged: z <= 4.15, components: { x1: r3(x1), x2: r3(x2), x3: r3(x3), x4: r3(x4) },
    evidence: 'CALCULATION',
  });
}

/** Piotroski F-score. Nine binary signals; the signals matter more than the total. */
export function piotroskiF(cur, prior) {
  const name = 'Piotroski F-score';
  if (!cur || !prior) return refuse(name, 'Two consecutive years are required.');
  const signals = [];
  const add = (label, test, detail) => signals.push({ label, pass: test === true, testable: test !== null, detail });

  const roaCur = safeDiv(cur.netProfit, cur.totalAssets);
  const roaPrior = safeDiv(prior.netProfit, prior.totalAssets);
  add('Profitable', isNum(roaCur) ? roaCur > 0 : null, 'Return on assets above zero');
  add('Operating cash positive', isNum(cur.cashFromOperations) ? cur.cashFromOperations > 0 : null, 'CFO above zero');
  add('Returns improving', isNum(roaCur) && isNum(roaPrior) ? roaCur > roaPrior : null, 'Return on assets rose');
  add('Earnings backed by cash', isNum(cur.cashFromOperations) && isNum(cur.netProfit) && isNum(cur.totalAssets)
    ? safeDiv(cur.cashFromOperations, cur.totalAssets) > roaCur : null, 'CFO exceeds net profit');

  const levCur = safeDiv(cur.longTermDebt, cur.totalAssets);
  const levPrior = safeDiv(prior.longTermDebt, prior.totalAssets);
  add('Leverage falling', isNum(levCur) && isNum(levPrior) ? levCur < levPrior : null, 'Long-term debt to assets fell');

  const crCur = safeDiv(cur.currentAssets, cur.currentLiabilities);
  const crPrior = safeDiv(prior.currentAssets, prior.currentLiabilities);
  add('Liquidity improving', isNum(crCur) && isNum(crPrior) ? crCur > crPrior : null, 'Current ratio rose');
  add('No dilution', isNum(cur.shares) && isNum(prior.shares) ? cur.shares <= prior.shares : null, 'Share count did not rise');

  const gmCur = safeDiv(cur.grossProfit, cur.revenue);
  const gmPrior = safeDiv(prior.grossProfit, prior.revenue);
  add('Margin improving', isNum(gmCur) && isNum(gmPrior) ? gmCur > gmPrior : null, 'Gross margin rose');

  const atCur = safeDiv(cur.revenue, cur.totalAssets);
  const atPrior = safeDiv(prior.revenue, prior.totalAssets);
  add('Asset turnover improving', isNum(atCur) && isNum(atPrior) ? atCur > atPrior : null, 'Revenue per rupee of assets rose');

  const testable = signals.filter((s) => s.testable);
  if (testable.length < 5) return refuse(name, `Only ${testable.length} of 9 signals could be tested.`);
  const score = testable.filter((s) => s.pass).length;

  return Object.freeze({
    name, available: true, value: score, outOf: testable.length,
    reading: score >= 7 ? 'Strong' : score >= 4 ? 'Middling' : 'Weak',
    flagged: score <= 3, signals, evidence: 'CALCULATION',
  });
}

/** Montier C-score. Six earnings-manipulation flags; three or more is a warning. */
export function montierC(cur, prior) {
  const name = 'Montier C-score';
  if (!cur || !prior) return refuse(name, 'Two consecutive years are required.');
  const flags = [];
  const add = (label, test) => flags.push({ label, raised: test === true, testable: test !== null });

  const divCur = isNum(cur.netProfit) && isNum(cur.cashFromOperations) ? cur.netProfit - cur.cashFromOperations : null;
  const divPrior = isNum(prior.netProfit) && isNum(prior.cashFromOperations) ? prior.netProfit - prior.cashFromOperations : null;
  add('Profit and cash flow diverging', isNum(divCur) && isNum(divPrior) ? divCur > divPrior : null);

  const dsoCur = safeDiv(cur.receivables * 365, cur.revenue);
  const dsoPrior = safeDiv(prior.receivables * 365, prior.revenue);
  add('Receivable days rising', isNum(dsoCur) && isNum(dsoPrior) ? dsoCur > dsoPrior : null);

  const dsiCur = safeDiv(cur.inventory * 365, cur.revenue);
  const dsiPrior = safeDiv(prior.inventory * 365, prior.revenue);
  add('Inventory days rising', isNum(dsiCur) && isNum(dsiPrior) ? dsiCur > dsiPrior : null);

  const ocaCur = safeDiv(cur.otherCurrentAssets, cur.revenue);
  const ocaPrior = safeDiv(prior.otherCurrentAssets, prior.revenue);
  add('Other current assets rising against revenue', isNum(ocaCur) && isNum(ocaPrior) ? ocaCur > ocaPrior : null);

  const depCur = safeDiv(cur.depreciation, cur.grossFixedAssets);
  const depPrior = safeDiv(prior.depreciation, prior.grossFixedAssets);
  add('Depreciation rate falling', isNum(depCur) && isNum(depPrior) ? depCur < depPrior : null);

  const growth = safeDiv(cur.totalAssets, prior.totalAssets);
  add('Total assets growing above 10%', isNum(growth) ? growth > 1.10 : null);

  const testable = flags.filter((f) => f.testable);
  if (testable.length < 4) return refuse(name, `Only ${testable.length} of 6 flags could be tested.`);
  const score = testable.filter((f) => f.raised).length;

  return Object.freeze({
    name, available: true, value: score, outOf: testable.length,
    flagged: score >= 3, flags, evidence: 'CALCULATION',
    reading: score >= 4 ? 'Several manipulation flags raised together.' : score >= 3 ? 'Warning.' : 'Unremarkable.',
  });
}

/** Sloan accruals, both forms. High accruals predict poor future returns. */
export function sloanAccruals({ netProfit, cashFromOperations, cashFromInvesting = null, totalAssets, priorTotalAssets = null }) {
  const name = 'Sloan accruals';
  const gap = need(name, { netProfit, cashFromOperations, totalAssets });
  if (gap) return gap;
  const avgAssets = isNum(priorTotalAssets) ? (totalAssets + priorTotalAssets) / 2 : totalAssets;
  if (avgAssets <= 0) return refuse(name, 'Average total assets must be positive.');
  const cashFlowForm = (netProfit - cashFromOperations - (cashFromInvesting ?? 0)) / avgAssets;
  const simple = (netProfit - cashFromOperations) / avgAssets;
  return Object.freeze({
    name, available: true, value: r3(simple), cashFlowForm: r3(cashFlowForm),
    flagged: simple > 0.10,
    reading: simple > 0.10 ? 'Accruals above 10% of assets. Earnings are substantially non-cash.' : 'Accruals unremarkable.',
    evidence: 'CALCULATION',
  });
}

// ------------------------------------ tests that catch Indian frauds

/**
 * Cash on the books against the interest it earns. Large cash yielding far
 * below the deposit rate means the cash may not be there. This is the single
 * most productive test on Indian mid-caps and it has caught several.
 */
export function cashYieldTest({ cashAndEquivalents, interestIncome, depositRate, priorCash = null }) {
  const name = 'Cash yield';
  const gap = need(name, { cashAndEquivalents, interestIncome, depositRate });
  if (gap) return gap;
  if (cashAndEquivalents <= 0) return refuse(name, 'No cash balance to test.');
  const avg = isNum(priorCash) ? (cashAndEquivalents + priorCash) / 2 : cashAndEquivalents;
  const yieldPct = (interestIncome / avg) * 100;
  const expected = depositRate * 100;
  const shortfall = expected - yieldPct;
  return Object.freeze({
    name, available: true, value: r2(yieldPct), unit: '%',
    expected: r2(expected), shortfall: r2(shortfall),
    flagged: shortfall > 3,
    severity: shortfall > 5 ? 'severe' : shortfall > 3 ? 'moderate' : 'low',
    reading: shortfall > 5
      ? 'Cash is earning far less than a bank deposit would. Ask where it is held and why.'
      : shortfall > 3 ? 'Yield below the deposit rate by more than three points.' : 'Yield consistent with the balance.',
    evidence: 'CALCULATION',
  });
}

/**
 * Cumulative operating cash flow against cumulative profit over the long run.
 * One year proves nothing. A decade proves a great deal.
 */
export function cashVersusProfit(years) {
  const name = 'Cumulative cash against cumulative profit';
  if (!Array.isArray(years) || years.length < 5) {
    return refuse(name, `At least five years are required, received ${Array.isArray(years) ? years.length : 0}. A short window proves nothing.`);
  }
  const usable = years.filter((y) => isNum(y.netProfit) && isNum(y.cashFromOperations));
  if (usable.length < 5) return refuse(name, `Only ${usable.length} years carry both figures.`);
  const pat = usable.reduce((a, y) => a + y.netProfit, 0);
  const cfo = usable.reduce((a, y) => a + y.cashFromOperations, 0);
  if (pat <= 0) return refuse(name, 'Cumulative profit is not positive, so the ratio is not meaningful.');
  const ratio = cfo / pat;
  return Object.freeze({
    name, available: true, value: r2(ratio * 100), unit: '%',
    years: usable.length, cumulativeProfit: r2(pat), cumulativeCash: r2(cfo),
    flagged: ratio < 0.7,
    severity: ratio < 0.5 ? 'severe' : ratio < 0.7 ? 'moderate' : 'low',
    reading: ratio < 0.5
      ? `Over ${usable.length} years, less than half the reported profit became cash.`
      : ratio < 0.7 ? 'Cash conversion persistently below 70% across the period.' : 'Profit has converted to cash over the period.',
    evidence: 'CALCULATION',
  });
}

/** Capex against depreciation over a decade. Persistent underspend is liquidation. */
export function capexVersusDepreciation(years) {
  const name = 'Capex against depreciation';
  if (!Array.isArray(years) || years.length < 5) return refuse(name, 'At least five years are required.');
  const usable = years.filter((y) => isNum(y.capex) && isNum(y.depreciation));
  if (usable.length < 5) return refuse(name, `Only ${usable.length} years carry both figures.`);
  const capex = usable.reduce((a, y) => a + Math.abs(y.capex), 0);
  const dep = usable.reduce((a, y) => a + y.depreciation, 0);
  if (dep <= 0) return refuse(name, 'Cumulative depreciation is not positive.');
  const ratio = capex / dep;
  return Object.freeze({
    name, available: true, value: r2(ratio), unit: 'x', years: usable.length,
    flagged: ratio < 0.8,
    reading: ratio < 0.8
      ? 'Capex has run below depreciation for years. The asset base is being consumed.'
      : ratio > 2.5 ? 'Heavy reinvestment. Check that it has commissioned and earned a return.' : 'Reinvestment in line with the asset base.',
    evidence: 'CALCULATION',
  });
}

/** Related-party transactions as a share of revenue and of purchases. */
export function relatedPartyIntensity({ rptRevenue = 0, rptPurchases = 0, rptLoans = 0, revenue, purchases = null, netWorth = null }) {
  const name = 'Related-party intensity';
  const gap = need(name, { revenue });
  if (gap) return gap;
  if (revenue <= 0) return refuse(name, 'Revenue must be positive.');
  const salesPct = (rptRevenue / revenue) * 100;
  const purchasePct = isNum(purchases) && purchases > 0 ? (rptPurchases / purchases) * 100 : null;
  const loanPct = isNum(netWorth) && netWorth > 0 ? (rptLoans / netWorth) * 100 : null;
  const worst = Math.max(salesPct, purchasePct ?? 0, loanPct ?? 0);
  return Object.freeze({
    name, available: true, value: r2(salesPct), unit: '%',
    purchasePct: r2(purchasePct), loansToNetWorthPct: r2(loanPct),
    flagged: worst > 10,
    severity: worst > 25 || (loanPct ?? 0) > 10 ? 'severe' : worst > 10 ? 'moderate' : 'low',
    reading: (loanPct ?? 0) > 10
      ? 'Lending to related parties above 10% of net worth. This is how cash leaves a listed company.'
      : worst > 25 ? 'Related-party dealing is a large share of the business.'
      : worst > 10 ? 'Related-party dealing is material and needs reading in full.' : 'Related-party dealing immaterial.',
    evidence: 'CALCULATION',
  });
}

export function contingentToNetWorth({ contingentLiabilities, netWorth }) {
  const name = 'Contingent liabilities to net worth';
  const gap = need(name, { contingentLiabilities, netWorth });
  if (gap) return gap;
  if (netWorth <= 0) return refuse(name, 'Net worth must be positive for the ratio to mean anything.');
  const pct = (contingentLiabilities / netWorth) * 100;
  return Object.freeze({
    name, available: true, value: r2(pct), unit: '%',
    flagged: pct > 25,
    severity: pct > 50 ? 'severe' : pct > 25 ? 'moderate' : 'low',
    reading: pct > 50 ? 'Contingent liabilities exceed half of net worth. Read every matter.' : pct > 25 ? 'Material contingent exposure.' : 'Contingent exposure modest.',
    evidence: 'CALCULATION',
  });
}

export function effectiveTaxRate({ tax, profitBeforeTax, statutoryRate }) {
  const name = 'Effective tax rate';
  const gap = need(name, { tax, profitBeforeTax, statutoryRate });
  if (gap) return gap;
  if (profitBeforeTax <= 0) return refuse(name, 'Not meaningful on a loss.');
  const etr = (tax / profitBeforeTax) * 100;
  const gapPts = statutoryRate * 100 - etr;
  return Object.freeze({
    name, available: true, value: r2(etr), unit: '%', statutory: r2(statutoryRate * 100),
    gap: r2(gapPts),
    flagged: Math.abs(gapPts) > 10,
    reading: gapPts > 10 ? 'Tax rate far below statutory. A stated reason is required — exemption, carried-forward loss or a disputed position.'
      : gapPts < -10 ? 'Tax rate above statutory, usually disallowances or prior-year demands.' : 'In line with statutory.',
    evidence: 'CALCULATION',
  });
}

export function otherIncomeShare({ otherIncome, profitBeforeTax }) {
  const name = 'Other income share of profit';
  const gap = need(name, { otherIncome, profitBeforeTax });
  if (gap) return gap;
  if (profitBeforeTax <= 0) return refuse(name, 'Not meaningful on a loss.');
  const pct = (otherIncome / profitBeforeTax) * 100;
  return Object.freeze({
    name, available: true, value: r2(pct), unit: '%',
    flagged: pct > 25,
    reading: pct > 25 ? 'A quarter or more of pre-tax profit is not from operations.' : 'Profit is operating profit.',
    evidence: 'CALCULATION',
  });
}

export function standaloneVersusConsolidated({ standaloneProfit, consolidatedProfit }) {
  const name = 'Standalone against consolidated';
  const gap = need(name, { standaloneProfit, consolidatedProfit });
  if (gap) return gap;
  if (standaloneProfit === 0) return refuse(name, 'Standalone profit is zero.');
  const drop = ((standaloneProfit - consolidatedProfit) / Math.abs(standaloneProfit)) * 100;
  return Object.freeze({
    name, available: true, value: r2(drop), unit: '%',
    flagged: drop > 25,
    severity: drop > 50 ? 'severe' : drop > 25 ? 'moderate' : 'low',
    reading: drop > 25 ? 'Profit at the parent largely disappears on consolidation. The subsidiaries are losing money.' : 'Consolidation is not hiding losses.',
    evidence: 'CALCULATION',
  });
}

export function receivablesAgainstGrowth({ revenueGrowthPct, receivableGrowthPct }) {
  const name = 'Receivables against revenue growth';
  const gap = need(name, { revenueGrowthPct, receivableGrowthPct });
  if (gap) return gap;
  const spread = receivableGrowthPct - revenueGrowthPct;
  return Object.freeze({
    name, available: true, value: r2(spread), unit: 'percentage points',
    flagged: spread > 15,
    severity: spread > 30 ? 'severe' : spread > 15 ? 'moderate' : 'low',
    reading: spread > 15 ? 'Receivables growing well ahead of revenue. Either collection has deteriorated or the revenue is not real.' : 'Receivables in step with revenue.',
    evidence: 'CALCULATION',
  });
}

export function pledgeTest({ pledgePctOfPromoterHolding, priceChangePct = null }) {
  const name = 'Promoter pledge';
  const gap = need(name, { pledgePctOfPromoterHolding });
  if (gap) return gap;
  const falling = isNum(priceChangePct) && priceChangePct < -25;
  const severe = pledgePctOfPromoterHolding > 50 || (pledgePctOfPromoterHolding > 25 && falling);
  return Object.freeze({
    name, available: true, value: r2(pledgePctOfPromoterHolding), unit: '%',
    flagged: pledgePctOfPromoterHolding > 10,
    severity: severe ? 'severe' : pledgePctOfPromoterHolding > 25 ? 'moderate' : pledgePctOfPromoterHolding > 10 ? 'low' : 'low',
    reading: severe
      ? 'Pledge high enough that a further fall in the price can force a sale and take the company with it.'
      : pledgePctOfPromoterHolding > 10 ? 'Pledge material; track it every quarter.' : 'Pledge immaterial.',
    evidence: 'CALCULATION',
  });
}

// ------------------------------------------------- disclosure-based flags

/**
 * Findings that are read rather than computed. The payload states them; this
 * turns them into severities the kill switch can act on.
 */
export const DISCLOSURE_CHECKS = Object.freeze({
  auditorResignedWithin24Months: { severity: 'severe', category: 'accounting',
    text: 'The auditor resigned or was replaced under dispute within the last 24 months.' },
  adverseIcfrOpinion: { severity: 'severe', category: 'accounting',
    text: 'An adverse opinion on internal financial controls.' },
  issuerNotCooperatingRating: { severity: 'severe', category: 'accounting',
    text: 'A rating agency has moved the issuer to Issuer Not Cooperating.' },
  sebiDebarment: { severity: 'severe', category: 'governance',
    text: 'A SEBI debarment or ongoing enforcement action against the company or a promoter.' },
  auditQualification: { severity: 'moderate', category: 'accounting',
    text: 'A qualification in the audit report.' },
  emphasisOfMatter: { severity: 'low', category: 'accounting',
    text: 'An emphasis of matter in the audit report.' },
  caroStatutoryDuesDelay: { severity: 'moderate', category: 'accounting',
    text: 'CARO reports delays in statutory dues.' },
  surveillanceMeasure: { severity: 'moderate', category: 'liquidity',
    text: 'The security is under an exchange surveillance measure.' },
  auditorTenureUnderTwoYears: { severity: 'low', category: 'accounting',
    text: 'The auditor has been in place less than two years.' },
  unauditedSubsidiaries: { severity: 'moderate', category: 'accounting',
    text: 'Material subsidiaries whose accounts were not audited by the principal auditor.' },
  nonAuditFeeExceedsAuditFee: { severity: 'moderate', category: 'governance',
    text: 'Non-audit fees paid to the auditor exceed the audit fee.' },
  distributionFundedByBorrowing: { severity: 'moderate', category: 'accounting',
    text: 'Dividend or buyback funded by fresh borrowing rather than free cash flow.' },
});

/**
 * Roll everything into a 0-100 forensic score and a flag register.
 * The score starts at 100 and is deducted from. Where too little was tested,
 * it refuses rather than returning a flattering number built on three checks.
 */
export function forensicAssessment({ computed = [], disclosures = {} } = {}) {
  const available = computed.filter((c) => c && c.available);
  const tested = available.length;
  const disclosureKeys = Object.keys(disclosures).filter((k) => disclosures[k] === true);
  const unknown = disclosureKeys.filter((k) => !DISCLOSURE_CHECKS[k]);
  if (unknown.length) throw new Error(`Unknown disclosure check: ${unknown.join(', ')}`);

  const flags = [];
  let deduction = 0;

  const WEIGHT = { severe: 30, moderate: 12, low: 4 };

  for (const c of available) {
    if (!c.flagged) continue;
    const severity = c.severity || (c.name.includes('M-score') || c.name.includes('Altman') ? 'moderate' : 'moderate');
    deduction += WEIGHT[severity] ?? 12;
    flags.push({ source: c.name, severity, detail: c.reading, value: c.value });
  }
  for (const k of disclosureKeys) {
    const d = DISCLOSURE_CHECKS[k];
    deduction += WEIGHT[d.severity];
    flags.push({ source: 'Disclosure', severity: d.severity, detail: d.text, category: d.category });
  }

  const totalPossible = computed.length + Object.keys(DISCLOSURE_CHECKS).length;
  const coverage = totalPossible ? (tested + (disclosureKeys.length ? 1 : 0)) / totalPossible : 0;

  if (tested < 4) {
    return Object.freeze({
      available: false, score: null,
      reason: `Only ${tested} forensic tests could be computed. A score built on this little is worse than none, because it launders an absence of work into a number.`,
      flags, tested, evidence: 'CALCULATION',
    });
  }

  const score = Math.max(0, Math.min(100, 100 - deduction));
  const severe = flags.filter((f) => f.severity === 'severe');

  return Object.freeze({
    available: true,
    score: r2(score),
    tested,
    testsAttempted: computed.length,
    notComputed: computed.filter((c) => c && !c.available).map((c) => ({ name: c.name, reason: c.reason })),
    flags,
    severeFlags: severe,
    killSwitchFlags: severe.map((f) => ({
      category: f.category || 'accounting', severity: 'severe', detail: f.detail,
    })),
    coverage: r2(coverage),
    evidence: 'CALCULATION',
  });
}
