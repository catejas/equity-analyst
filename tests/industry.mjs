/* The industry-focused financial intelligence engine.
 *
 * Tejas: "Include world class industry focused intelligence Engine which can
 * understand the financial information in a more meaningful way in our
 * analysis and make data more meaningful. Say for Telecom - ARPU, Banks - NIM,
 * Construction, Retail, IT and Tech Industry etc."
 *
 * Four things have to hold for that to be worth anything, and each is checked
 * here: the classification has to land on the right family; what the accounts
 * already contain has to be DERIVED rather than asked for again; what they do
 * not contain has to be READ from the payload; and what is neither has to be
 * NAMED as missing rather than silently dropped. The last is the one that
 * turns a metric table into an intelligence engine, so it gets the most
 * attention below.
 */
import fs from 'node:fs';
import { industryFamily, industryPanel, INDUSTRY_METRIC_SETS } from '../src/core/industry.js';
import { buildReport } from '../src/core/report.js';

let fail = 0, ran = 0;
const ok = (label, pass, detail) => {
  ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

/* ---- classification ---- */
{
  const cases = [
    [{ sector: 'Banking', subSector: 'Public Sector Banks' }, 'lender'],
    [{ sector: 'NBFC' }, 'lender'],
    [{ sector: 'Telecom', subSector: 'Wireless' }, 'telecom'],
    [{ sector: 'Construction', subSector: 'Roads and Highways' }, 'construction'],
    [{ sector: 'Retail', subSector: 'Apparel Retail' }, 'retail'],
    [{ sector: 'Information Technology', subSector: 'IT Services' }, 'it'],
    [{ sector: 'Pharmaceuticals' }, 'pharma'],
    [{ sector: 'Cement' }, 'cement'],
    [{ sector: 'Hotels' }, 'hotels'],
    [{ sector: 'Something Nobody Has Heard Of' }, 'general'],
  ];
  cases.forEach(([c, want]) => {
    const got = industryFamily(c, {});
    ok(`${(c.subSector || c.sector).padEnd(26)} → ${want}`, got.key === want, got.key);
  });
  /* The run's sector carries a company run whose own sector field is blank. */
  ok('the run\'s sector is used when the company has none',
    industryFamily({}, { sector: 'Telecom' }).key === 'telecom');
}

/* ---- derivation: what the accounts already contain is not asked for twice ---- */
{
  const bank = {
    sector: 'Banking',
    financials: { annual: [
      { period: 'FY24', revenue: 90, totalAssets: 1300, netProfit: 8, advances: 800, deposits: 1100 },
      { period: 'FY25', revenue: 100, totalAssets: 1500, netProfit: 12, advances: 900, deposits: 1200 },
    ] },
  };
  const p = industryPanel(bank, {}, { lenderLines: [
    { period: 'FY25', available: true, interestIncome: 100, netInterestIncome: 40,
      costToIncomePct: 48, provisions: 9 }] });
  const by = Object.fromEntries(p.metrics.map((m) => [m.key, m]));
  ok('a bank is classified as a lender', p.family === 'lender', p.label);
  ok('NIM is derived from the lender lines', by.nim && by.nim.basis === 'derived',
    by.nim && by.nim.value.toFixed(2));
  ok('cost to income comes through as reported by the audit',
    by.costToIncome && Math.abs(by.costToIncome.value - 48) < 0.01);
  ok('credit cost is provisions over advances',
    by.creditCost && Math.abs(by.creditCost.value - 1) < 0.01, by.creditCost && by.creditCost.value);
  ok('return on assets is profit over assets',
    by.roa && Math.abs(by.roa.value - 0.8) < 0.01, by.roa && by.roa.value);
  ok('advances growth is measured against the year before',
    by.advancesGrowth && Math.abs(by.advancesGrowth.value - 12.5) < 0.01,
    by.advancesGrowth && by.advancesGrowth.value);
  /* And the rest are NOT invented. */
  const missing = p.missing.map((m) => m.key);
  ok('CASA is named as missing rather than guessed', missing.includes('casa'));
  ok('gross NPA is named as missing rather than guessed', missing.includes('gnpa'));
  ok('every missing metric says what it would have told the reader',
    p.missing.every((m) => typeof m.why === 'string' && m.why.length > 40));
}

/* ---- reading: what the accounts cannot contain comes from the payload ---- */
{
  const telco = {
    sector: 'Telecom',
    industryMetrics: [
      { key: 'arpu', value: 208, unit: '₹ per month', period: 'Q1 FY27', source: 'Company presentation' },
      { key: 'churn', value: 2.9, unit: '%', period: 'Q1 FY27', source: 'Company presentation' },
      { key: 'subscribers', value: 279, unit: 'million', period: 'Q1 FY27', source: 'TRAI' },
    ],
    financials: { annual: [{ period: 'FY26', revenue: 1000, ebitda: 530,
      capitalExpenditure: -280, totalDebt: 2000, cashAndEquivalents: 100 }] },
  };
  const p = industryPanel(telco, {});
  const by = Object.fromEntries(p.metrics.map((m) => [m.key, m]));
  ok('a telco is classified as telecom', p.family === 'telecom', p.label);
  ok('ARPU is read from the payload', by.arpu && by.arpu.value === 208 && by.arpu.basis === 'stated');
  ok('and it keeps its own period and source',
    by.arpu && by.arpu.period === 'Q1 FY27' && /presentation/i.test(by.arpu.source));
  ok('churn comes through', by.churn && by.churn.value === 2.9);
  ok('capex intensity is derived, not asked for',
    by.capexIntensity && by.capexIntensity.basis === 'derived'
      && Math.abs(by.capexIntensity.value - 28) < 0.01, by.capexIntensity && by.capexIntensity.value);
  ok('EBITDA margin is derived', by.ebitdaMargin && Math.abs(by.ebitdaMargin.value - 53) < 0.01);
  ok('net debt to EBITDA is derived',
    by.netDebtEbitda && Math.abs(by.netDebtEbitda.value - 1900 / 530) < 0.001);
  /* An alias must find the same metric: a research tool writing
     "averageRevenuePerUser" has supplied ARPU. */
  const aliased = industryPanel({ sector: 'Telecom',
    industryMetrics: { averageRevenuePerUser: 199 } }, {});
  ok('an alias for ARPU is recognised',
    aliased.metrics.some((m) => m.key === 'arpu' && m.value === 199));
}

/* ---- the object form of the block, and a contractor's book-to-bill ---- */
{
  const epc = { sector: 'Construction',
    industryMetrics: { orderBook: 42000, orderInflow: 15000 },
    financials: { annual: [{ period: 'FY26', revenue: 14000, ebitda: 1400,
      receivables: 5000, inventory: 1000, payables: 3000, cashFromOperations: 700 }] } };
  const p = industryPanel(epc, {});
  const by = Object.fromEntries(p.metrics.map((m) => [m.key, m]));
  ok('a contractor is classified as construction', p.family === 'construction', p.label);
  ok('the order book is read from an object-shaped block', by.orderBook && by.orderBook.value === 42000);
  ok('book to bill is derived from the order book and revenue',
    by.bookToBill && Math.abs(by.bookToBill.value - 3) < 0.001, by.bookToBill && by.bookToBill.value);
  ok('working capital days are derived',
    by.workingCapitalDays && Math.abs(by.workingCapitalDays.value - (3000 / 14000) * 365) < 0.01);
  ok('cash conversion is derived', by.cashConversion && Math.abs(by.cashConversion.value - 50) < 0.01);
}

/* ---- nothing is invented from nothing ---- */
{
  const empty = industryPanel({ sector: 'Retail' }, {});
  ok('a company with no accounts produces no metrics', empty.metrics.length === 0);
  ok('and every metric in the set is listed as missing',
    empty.missing.length === INDUSTRY_METRIC_SETS.retail.length,
    `${empty.missing.length} of ${INDUSTRY_METRIC_SETS.retail.length}`);
  ok('the panel says it is unavailable', empty.available === false);
}

/* ---- and it reaches the report ---- */
{
  const raw = fs.readFileSync('/tmp/psu.json', 'utf8');
  const payload = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const r = buildReport(payload);
  const c = r.report.full[0];
  ok('the report carries an industry panel for each company', !!c.industry);
  ok('and it is the lender set', c.industry.family === 'lender', c.industry.label);
  ok('the panel names what the payload never supplied',
    c.industry.missing.some((m) => m.key === 'casa'),
    c.industry.missing.map((m) => m.key).join(','));
}

/* ---- a zero is not a reading ---- */
{
  /* The PSU payload reported "interestExpense": 0 for a bank with ₹1,47,017
     Crs of interest income. Believing it made net interest income equal
     interest income and printed a 7.5% net interest margin that was really
     the asset yield — the same shape of defect as the EBITDA on the tear
     sheet. A line nobody filled in must not become a figure. */
  const p = industryPanel({ sector: 'Banking', financials: { annual: [
    { period: 'FY26', revenue: 147017, interestExpense: 0, totalAssets: 1950000,
      netProfit: 16904 }] } }, {});
  const by = Object.fromEntries(p.metrics.map((m) => [m.key, m]));
  ok('a zero interest expense does not become a net interest margin', !by.nim,
    by.nim && by.nim.value);
  ok('and NIM is named as missing instead',
    p.missing.some((m) => m.key === 'nim'));
  ok('what the row does support is still derived', !!by.roa, by.roa && by.roa.value);
  /* A real interest expense derives normally. */
  const real = industryPanel({ sector: 'Banking', financials: { annual: [
    { period: 'FY26', revenue: 147017, interestExpense: 92000, totalAssets: 1950000 }] } }, {});
  const nim = real.metrics.find((m) => m.key === 'nim');
  ok('a stated interest expense derives a margin',
    nim && Math.abs(nim.value - ((147017 - 92000) / 1950000) * 100) < 0.001,
    nim && nim.value.toFixed(2));
}

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
