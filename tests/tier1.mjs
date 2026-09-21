/* Tier 1 — the institutional analysis blocks.
   Every block must be asked for in the prompt AND survive import, because a
   key the prompt requests and the validator drops is worse than one that was
   never asked for: the model does the work and the app throws it away, which
   is exactly what happened to the driver model. */
import fs from 'node:fs';
import { buildResearchPrompt } from '../src/core/prompt-builder.js';
import { parsePayload } from '../src/core/payload-schema.js';
import { buildReport } from '../src/core/report.js';

const p = buildResearchPrompt({ sector: 'Conglomerate', horizon: '3-5' });
let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

/* --- asked for in the prompt ------------------------------------------- */
const ASKED = {
  'WACC buildup': ['waccBuildup', 'riskFreeRate', 'equityRiskPremium', 'leveredBeta', 'afterTaxCostOfDebt'],
  'SOTP': ['sotp', 'enterpriseValue', 'perShare', 'multiple'],
  'implied expectations (reverse DCF)': ['impliedExpectations', 'impliedRevenueCagr'],
  'DuPont and ROIC spread': ['dupont', 'netProfitMargin', 'assetTurnover', 'financialLeverage', 'waccSpreadPct'],
  'capital cycle / CWIP': ['capitalCycle', 'cwip', 'cwipPctOfGrossBlock'],
  'granular peer matrix': ['marketCap', 'pe', 'evEbitda', 'roe', 'revGrowth', 'ebitdaMargin'],
  'historical sector mix': ['historicalSectors'],
  'management compensation': ['compensation', 'fixedPct', 'variablePct', 'tiedTo'],
};
for (const [label, keys] of Object.entries(ASKED)) {
  const missing = keys.filter((k) => !p.includes('"' + k + '"'));
  ok('prompt asks for ' + label, missing.length === 0);
  if (missing.length) console.log('      missing:', missing.join(' '));
}

/* --- narrative, not fragments ------------------------------------------ */
ok('the 160-character cap is gone', !/160 characters/.test(p));
ok('narrative paragraphs are requested', /three or four sentences/.test(p));

/* --- and it survives a round trip -------------------------------------- */
const base = JSON.parse(fs.readFileSync('/tmp/ril.json', 'utf8'));
const c = base.companies[0];
c.valuation.waccBuildup = { riskFreeRate: 0.068, equityRiskPremium: 0.055, leveredBeta: 1.05,
  costOfEquity: 0.126, pretaxCostOfDebt: 0.08, taxRate: 0.25, afterTaxCostOfDebt: 0.06,
  equityWeight: 0.8, debtWeight: 0.2, wacc: 0.113, source: 'computed' };
c.valuation.sotp = [{ name: 'Jio', metric: 'EBITDA', metricValue: 60000, multiple: 12,
  enterpriseValue: 720000, stakePct: 100, perShare: 532, basis: 'telecom peers' }];
c.valuation.impliedExpectations = { impliedRevenueCagr: 0.07, impliedEbitMargin: 0.13,
  impliedYears: 10, reading: 'the price assumes mid-single-digit growth' };
c.peers = [{ name: 'Bharti Airtel', listed: true, marketCap: 1000000, pe: 45, evEbitda: 9.5,
  roe: 12, revGrowth: 14, ebitdaMargin: 52, asOf: 'FY25', note: 'telecom peer' }];
c.dupont = [{ period: 'FY25', netProfitMargin: 7.6, assetTurnover: 0.63, financialLeverage: 1.9,
  roe: 9.0, roic: 8.1, waccSpreadPct: -3.2 }];
c.capitalCycle = [{ period: 'FY25', cwip: 120000, grossBlock: 1000000, cwipPctOfGrossBlock: 12, note: 'peaking' }];
c.historicalSectors = [{ period: 'FY25', lines: [{ name: 'O2C', revenue: 600000, ebit: 40000, marginPct: 6.7 }] }];
c.compensation = { period: 'FY25', fixedPct: 60, variablePct: 40, tiedTo: 'ROIC', ceoPayToMedian: 0, source: 'AR' };

const res = parsePayload(JSON.stringify(base));
ok('payload with every new block still imports', (res.errors || []).length === 0);
if ((res.errors || []).length) console.log('      ' + res.errors.slice(0, 4).join('\n      '));

const c2 = res.payload?.companies?.[0];
const KEPT = [['valuation.waccBuildup', c2?.valuation?.waccBuildup],
  ['valuation.sotp', c2?.valuation?.sotp], ['valuation.impliedExpectations', c2?.valuation?.impliedExpectations],
  ['peers[0].evEbitda', c2?.peers?.[0]?.evEbitda], ['dupont', c2?.dupont],
  ['capitalCycle', c2?.capitalCycle], ['historicalSectors', c2?.historicalSectors],
  ['compensation', c2?.compensation]];
for (const [label, v] of KEPT) ok('import keeps ' + label, v != null);

const out = buildReport(res.payload);
ok('report still builds with the new blocks', !!out?.report);
ok('no new blocking errors', (out?.errors || []).length === 0);

/* The blocks must survive into the report object too, or the renderer can
   never show them however well the payload validated. */
const rc = out?.report?.full?.[0];
for (const k of ['dupont', 'capitalCycle', 'historicalSectors', 'compensation']) {
  ok('report carries ' + k, rc?.[k] != null);
}
ok('report carries the WACC buildup', rc?.valuation?.waccBuildup != null);
ok('report carries SOTP', Array.isArray(rc?.valuation?.sotp));
ok('report carries the six-field peer matrix', rc?.peers?.[0]?.evEbitda != null);

console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
