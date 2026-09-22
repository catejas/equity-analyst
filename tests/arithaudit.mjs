/* The arithmetic audit.
 *
 * The tear sheet printed "Pre-provision operating profit 1,22,190" against
 * "Interest income 1,28,206" for Punjab National Bank. Tejas: "this is not
 * possible, operating profit of 122,190 crores? You are not paying attention
 * to the details. Fix all such numerical errors and add rigorous audit
 * mechanism to re-verify the numbers you generate."
 *
 * He was right, and he was right that the first fix was not a fix: I had
 * relabelled the line and gone on reading the same field. The field held a
 * manufacturer's formula — revenue plus other income less operating costs,
 * with a bank's interest expense left below the line.
 *
 * So this tests the mechanism, not the symptom. Every check below is built
 * from a wrong payload constructed on purpose, because an audit that has never
 * caught anything is an audit nobody has tested.
 */
import fs from 'node:fs';
import { auditCompany, lenderLines, printable } from '../src/core/audit.js';
import { buildReport } from '../src/core/report.js';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const read = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };

let fail = 0, ran = 0;
const ok = (label, pass, detail) => {
  ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};
const has = (a, re) => a.findings.some((f) => re.test(f.message));

/* ---------------------------------------------------------- the real case */
const PNB = read('107fec97-attachment.txt');
const c = PNB.companies[0];

{
  const L = lenderLines(c.financials.annual[0]);   // FY26
  ok('net interest income is income less interest expense',
    L.netInterestIncome === 128206 - 92900, String(L.netInterestIncome));
  ok('pre-provision operating profit is the real one, not 1,22,190',
    L.preProvisionOperatingProfit === 29290, String(L.preProvisionOperatingProfit));
  /* The proof that the reconstruction is right rather than merely different:
     PPOP less provisions must come back to the profit before tax the payload
     itself states. */
  ok('and it reconciles to the stated profit before tax',
    L.profitBeforeTax === c.financials.annual[0].profitBeforeTax,
    `${L.preProvisionOperatingProfit} − ${L.provisions} = ${L.profitBeforeTax}`);
  ok('cost-to-income lands in the band Indian banks run at',
    L.costToIncomePct > 35 && L.costToIncomePct < 65, L.costToIncomePct.toFixed(1) + '%');
}

{
  const a = auditCompany(c, { lender: true });
  ok('the audit rejects the payload\'s operating profit', has(a, /does not deduct interest expense/));
  ok('on every year, not just the latest', a.counts.error >= 3, `${a.counts.error} errors`);
  ok('and refuses to print it', !printable(a, 'FY26', 'ebit') && !printable(a, 'FY26', 'ebitda'));
  ok('while leaving the lines it did not object to printable',
    printable(a, 'FY26', 'netProfit') && printable(a, 'FY26', 'revenue'));
}

/* --------------------------------------------- constructed wrong payloads */
const row = (over) => ({ period: 'FY26', revenue: 1000, ...over });

{
  const a = auditCompany({ financials: { annual: [row({
    costOfGoodsSold: 600, grossProfit: 500 })] } }, { lender: false });
  ok('gross profit that is not revenue less cost of sales is caught',
    has(a, /Gross profit is not revenue less cost of goods sold/));
}
{
  const a = auditCompany({ financials: { annual: [row({
    ebitda: 200, depreciation: 50, ebit: 175 })] } }, { lender: false });
  ok('EBIT that is not EBITDA less depreciation is caught',
    has(a, /EBIT is not EBITDA less depreciation/));
}
{
  const a = auditCompany({ financials: { annual: [row({
    profitBeforeTax: 200, tax: 50, netProfit: 160 })] } }, { lender: false });
  ok('net profit that is not pre-tax less tax is caught',
    has(a, /Net profit is not profit before tax less tax/));
}
{
  const a = auditCompany({ financials: { annual: [row({
    totalAssets: 5000, totalLiabilities: 4800 })] } }, { lender: false });
  ok('a balance sheet that does not balance is caught',
    has(a, /balance sheet does not balance/));
}
{
  const a = auditCompany({ financials: { annual: [row({
    openingCash: 100, netChangeInCash: 40, closingCash: 150 })] } }, { lender: false });
  ok('closing cash that does not follow from the movement is caught',
    has(a, /Closing cash is not opening cash plus the net change/));
}
{
  const a = auditCompany({ financials: { annual: [row({
    cashFromOperations: 100, cashFromInvesting: -60, cashFromFinancing: -10,
    netChangeInCash: 50 })] } }, { lender: false });
  ok('a net cash change that is not the three flows added up is caught',
    has(a, /not the three cash flows added up/));
}
{
  /* The share count in the wrong unit. No identity on the income statement can
     see this — only EPS times shares against net profit can. */
  const a = auditCompany({ financials: { annual: [row({
    netProfit: 16904, epsDiluted: 14.72, sharesOutstanding: 11480000000 })] } }, { lender: false });
  ok('a share count in the wrong unit is caught', has(a, /share count is in a different unit/));
}
{
  const a = auditCompany({ financials: { annual: [row({
    profitBeforeTax: 100, tax: 90, netProfit: 10 })] } }, { lender: false });
  ok('an impossible effective tax rate is flagged', has(a, /effective tax rate works out at/));
}
{
  const a = auditCompany({ snapshot: { week52High: 100, week52Low: 140 } }, { lender: false });
  ok('a 52-week low above the high is caught', has(a, /is above the high/));
}
{
  const a = auditCompany({ shareholding: [{ promoter: 70, fii: 5, dii: 10, public: 5 }] },
    { lender: false });
  ok('a shareholding pattern that does not add to 100 is flagged',
    has(a, /adds to 90\.0%, not 100%/));
}

/* The forecast, against the company it is a forecast of. The driver model
   charges interest below the operating line, which for PNB projected a loss of
   ₹65,547 Crs a year against a bank that earns ₹16,904 Crs — and those columns
   printed in the three statements. */
{
  const a = auditCompany(
    { financials: { annual: [{ period: 'FY26', netProfit: 16904 }] } },
    { modelYears: [{ pat: -65546 }, { pat: -65977 }] });
  ok('a forecast that reverses the sign of the business is caught',
    has(a, /into a loss in every one of its 2 projected years/));
  ok('and the projections are refused', !printable(a, '*', 'forecast'));
}
{
  /* A company that genuinely is loss-making must not trip it. */
  const a = auditCompany(
    { financials: { annual: [{ period: 'FY26', netProfit: -500 }] } },
    { modelYears: [{ pat: -300 }, { pat: -100 }] });
  ok('a genuinely loss-making company does not trip it',
    !has(a, /into a loss in every one/));
}

/* ---------------------------------------------- and it says nothing wrongly */
{
  /* A clean manufacturer. Nothing here should produce a single finding — an
     audit that fires on correct accounts is an audit people learn to ignore. */
  const clean = { financials: { annual: [{
    period: 'FY26', revenue: 1000, costOfGoodsSold: 600, grossProfit: 400,
    employeeCost: 100, otherExpenses: 50, ebitda: 250, depreciation: 50, ebit: 200,
    interestExpense: 20, profitBeforeTax: 180, tax: 45, netProfit: 135,
    epsDiluted: 13.5, sharesOutstanding: 10,
    totalAssets: 2000, totalLiabilities: 2000,
    shareCapital: 100, reservesAndSurplus: 900, shareholdersEquity: 1000,
    longTermDebt: 400, shortTermDebt: 200, totalDebt: 600,
    cashFromOperations: 200, cashFromInvesting: -120, cashFromFinancing: -30,
    netChangeInCash: 50, openingCash: 100, closingCash: 150 }] },
    snapshot: { week52High: 200, week52Low: 100, freeFloatPct: 40 },
    shareholding: [{ promoter: 60, fii: 15, dii: 15, public: 10, pledged: 0 }],
    valuation: { currentPrice: 150 } };
  const a = auditCompany(clean, { lender: false });
  ok('clean accounts produce no findings at all', a.counts.error === 0 && a.counts.warn === 0,
    JSON.stringify(a.findings.map((f) => f.field)));
}

/* ------------------------------------------------ and it reaches the report */
{
  const r = buildReport(PNB);
  const co = r.report.full[0];
  ok('the report carries the audit', !!co.audit && co.audit.counts.error >= 3);
  ok('and the derived lender lines', Array.isArray(co.lenderLines)
    && co.lenderLines[co.lenderLines.length - 1].preProvisionOperatingProfit === 29290);
  ok('every rejection is reported as a gap, not corrected silently',
    (r.warnings || []).filter((w) => /does not deduct interest expense/.test(w)).length >= 3);
}

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
