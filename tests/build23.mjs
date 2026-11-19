/* Build 23 — Tejas's eleven points on the PNB independent report, the Banking
 * sector report and the score card (19 Nov 2026). The sector/independent
 * mix-up is tested in sectorisolation.mjs, with the real app in Chromium;
 * everything here is engine or chart arithmetic. */
import fs from 'node:fs';
import vm from 'node:vm';
import { entryContext } from '../src/core/technicals.js';
import { industryPanel, industryFamily, INDUSTRY_LINES, INDUSTRY_METRIC_SETS } from '../src/core/industry.js';
import { dimensionBases } from '../src/core/dimensions.js';
import { buildReport } from '../src/core/report.js';
import { buildResearchPrompt } from '../src/core/prompt-builder.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null ? '  — ' + d : ''}`); };
const load = (f) => { const t = fs.readFileSync(f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };
const near = (a, b, t = 0.01) => typeof a === 'number' && Math.abs(a - b) < t;

/* ---- 8. Entry context on a weekly series ---- */
{
  const closes = Array.from({ length: 106 }, (_, i) => 100 + i * 0.4);
  const t = entryContext({ closes, spacing: 'weekly',
    performance: { m12: 45, m12Relative: 22, benchmark: 'Nifty PSU Bank' } });
  ok('106 weekly closes give a 200 day average (40 weeks)', t.parts.sma200.available && t.parts.sma200.periods === 40,
    t.parts.sma200.reason || t.parts.sma200.value);
  ok('and a 50 day average from 10 weeks', t.parts.sma50.available && t.parts.sma50.periods === 10);
  ok('so the trend can be read', /200 day average/.test(t.trend), t.trend);
  ok('relative strength comes from the stated 12-month relative return',
    t.parts.relativeStrength.available && t.parts.relativeStrength.value === 22
      && t.parts.relativeStrength.benchmarkReturn === 23 && t.parts.relativeStrength.basis === 'stated');
  const d = entryContext({ closes: Array.from({ length: 260 }, (_, i) => 50 + i * 0.1), spacing: 'daily' });
  ok('a daily series still uses 200 daily closes', d.parts.sma200.periods === 200);
  ok('with no benchmark and no stated return it says so in words',
    !d.parts.relativeStrength.available && /relative return/.test(d.parts.relativeStrength.reason));
}

/* ---- 7. The industry engine computes what the accounts contain ---- */
{
  const bank = { sector: 'Banking', financials: { annual: [
    { period: 'FY25', revenue: 120000, interestExpense: 75000, totalAssets: 1500000, netProfit: 10000,
      shareholdersEquity: 100000, advances: 900000, deposits: 1300000 },
    { period: 'FY26', revenue: 128000, interestExpense: 80000, totalAssets: 1600000, netProfit: 16900,
      shareholdersEquity: 120000, advances: 1000000, grossAdvances: 1040000, deposits: 1400000,
      casaDeposits: 518000, grossNpa: 26520, netNpa: 2500, provisions: 4750, freshSlippages: 7000,
      riskWeightedAssets: 900000, tier1Capital: 140000, tier2Capital: 21000 },
  ] } };
  const p = industryPanel(bank, {});
  const by = Object.fromEntries(p.metrics.map((m) => [m.key, m]));
  ok('CASA is computed from CASA and total deposits', near(by.casa?.value, 37) && by.casa.basis === 'derived', by.casa?.value);
  ok('gross NPA from gross NPAs over gross advances', near(by.gnpa?.value, 2.55), by.gnpa?.value);
  ok('net NPA from net NPAs over advances', near(by.nnpa?.value, 0.25), by.nnpa?.value);
  ok('provision coverage from gross and net NPA', near(by.pcr?.value, (26520 - 2500) / 26520 * 100), by.pcr?.value);
  ok('capital adequacy from tier 1 and tier 2 over RWA', near(by.car?.value, 161000 / 900000 * 100), by.car?.value);
  ok('slippage from fresh slippages over opening advances', near(by.slippage?.value, 7000 / 900000 * 100), by.slippage?.value);
  ok('credit cost from provisions over average advances', near(by.creditCost?.value, 4750 / 950000 * 100), by.creditCost?.value);
  ok('net interest margin from interest income less expense', near(by.nim?.value, 48000 / 1600000 * 100), by.nim?.value);
  /* A name the research uses that was never in the alias list. */
  const named = industryPanel({ sector: 'Banking', industryMetrics: [
    { key: 'creditToDeposit', value: 75.5, period: 'Q2 FY27' },
    { key: 'Provision Coverage Ratio', value: 97.3 }] }, {});
  ok('"creditToDeposit" is recognised as credit to deposit', named.metrics.some((m) => m.key === 'cdRatio' && m.value === 75.5));
  ok('a name written in words is recognised too', named.metrics.some((m) => m.key === 'pcr' && m.value === 97.3));
}
{
  const cases = [
    [{ sector: 'Aviation', subSector: 'Airlines' }, 'airlines'],
    [{ sector: 'Healthcare', subSector: 'Hospitals' }, 'hospitals'],
    [{ sector: 'Oil and Gas', subSector: 'Refining and marketing' }, 'refining'],
    [{ sector: 'Mining', subSector: 'Coal' }, 'mining'],
    [{ sector: 'Food', subSector: 'Packaged foods' }, 'fmcg'],
    [{ sector: 'Capital markets', subSector: 'Asset management' }, 'amc'],
    [{ sector: 'Sugar' }, 'sugar'],
    [{ sector: 'Textiles' }, 'textiles'],
    [{ sector: 'City gas distribution' }, 'gasdist'],
    [{ sector: 'Defence' }, 'construction'],
    [{ sector: 'Transport', subSector: 'Logistics' }, 'logistics'],
    [{ sector: 'Retail' }, 'retail'],
    [{ sector: 'Telecom' }, 'telecom'],
  ];
  cases.forEach(([c, want]) => ok(`${(c.subSector || c.sector)} → ${want}`, industryFamily(c, {}).key === want, industryFamily(c, {}).key));
  const air = industryPanel({ sector: 'Airlines', financials: { annual: [
    { period: 'FY26', revenue: 80000, ebit: 4000, ask: 160000, rpk: 138000, fuelCost: 28000 }] } }, {});
  const a = Object.fromEntries(air.metrics.map((m) => [m.key, m]));
  ok('an airline\'s load factor is RPK over ASK', near(a.loadFactor?.value, 138000 / 160000 * 100), a.loadFactor?.value);
  ok('and its cost per seat-km is computed', near(a.cask?.value, 76000 / 160000), a.cask?.value);
  const hos = industryPanel({ sector: 'Hospitals', financials: { annual: [
    { period: 'FY26', revenue: 5000, ebitda: 1100, beds: 4000, occupiedBedDays: 1000000 }] } }, {});
  const h = Object.fromEntries(hos.metrics.map((m) => [m.key, m]));
  ok('a hospital\'s occupancy is occupied bed-days over bed-days available', near(h.occupancy?.value, 1000000 / (4000 * 365) * 100), h.occupancy?.value);
  ok('every non-financial family also carries the general measures', hos.metrics.some((m) => m.key === 'ebitdaMargin'));
  ok('every family with raw lines has them listed for the brief',
    Object.keys(INDUSTRY_LINES).every((k) => INDUSTRY_METRIC_SETS[k]));
  const P = buildResearchPrompt({ sector: 'Banking', company: 'PNB', mode: 'company' });
  ok('the brief asks for the raw lines on every reported year', /ALSO PUT THE RAW LINES ON EVERY REPORTED YEAR/.test(P)
    && P.includes('"casaDeposits"') && P.includes('"rpk"'));
  ok('the peer schema asks for a bank\'s own comparison figures', /"pb": 0.0/.test(P) && /"nim": 0.0/.test(P));
}

/* ---- 7. Financial metrics fall back to the industry panel ---- */
{
  const d = load('tests/fixtures/psu.json');
  d.companies[0].sector = 'Banking';
  d.companies[0].industryMetrics = [{ key: 'casa', value: 36.6, period: 'Q2 FY27', source: 'PNB results' },
    { key: 'pcr', value: 97.32, period: 'Q2 FY27' }, { key: 'nim', value: 2.58, period: 'Q2 FY27' }];
  const c = buildReport(d).report.full[0];
  const v = c.metrics.values;
  ok('a company filed as "Banking" is read with the banking set', c.metrics.sector === 'banking', c.metrics.sector);
  ok('CASA reaches the financial metrics', v.casaRatio?.available && v.casaRatio.value === 36.6);
  ok('provision coverage reaches them', v.provisionCoverageRatio?.available && v.provisionCoverageRatio.value === 97.32);
  ok('net interest margin reaches them, with its period', v.netInterestMargin?.available && v.netInterestMargin.period === 'Q2 FY27');
  ok('nothing prints the names of missing variables',
    Object.values(v).every((x) => x.available || !/Missing or non-numeric input/.test(x.reason)));
}

/* ---- 11. The four dimensions, with their bases ---- */
{
  const d = load('tests/fixtures/psu.json');
  const c = buildReport(d).report.full[0];
  const db = c.dimensionBases;
  ok('each of the four dimensions has its bases',
    ['financialQuality', 'managementGovernance', 'technicalEntry', 'catalysts'].every((k) => db[k] && db[k].bases.length >= 4));
  ok('every basis has points out of a weight, or a reason',
    Object.values(db).every((x) => x.bases.every((b) => (typeof b.points === 'number' && b.points <= b.of) || b.reading)));
  ok('the dimension score is the bases that ran, rescaled to 100',
    Object.values(db).every((x) => {
      const r = x.bases.filter((b) => typeof b.points === 'number');
      const w = r.reduce((a, b) => a + b.of, 0);
      return !w || near(x.score, r.reduce((a, b) => a + b.points, 0) / w * 100, 0.02);
    }));
  ok('and that score is what the overall is built from', near(c.dimensions.financialQuality, db.financialQuality.score));
  /* With nothing but the research's rating, the dimension is that rating. */
  const only = dimensionBases({ c: {}, dm: { catalysts: { score: 70, evidence: 'x' } } });
  ok('a dimension with only the research rating keeps that rating', near(only.catalysts.score, 70), only.catalysts.score);
}

/* ---- charts: points never leave the plot; reference lines; shareholding ---- */
{
  const ctx = { window: {}, document: undefined, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('charts.js', 'utf8'), ctx);
  const K = ctx.window.EQCharts;
  const svg = K.scatter({ points: [{ x: 40, y: 300, title: 'Treasury' }, { x: 20, y: 10, title: 'NIM' }],
    xRange: [0, 100], yRange: [0, 100], xLabel: 'Likelihood', yLabel: 'Impact' });
  const cys = [...svg.matchAll(/<circle[^>]*cy="([\d.-]+)"/g)].map((m) => +m[1]);
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  ok('a point outside the stated range is drawn inside the chart (Fig 11 overlap)', cys.every((y) => y >= 0 && y <= +vb[2]), cys.join(','));
  const col = K.columns({ title: 't', categories: ['1-3', '3-5'], series: [{ name: '3x', values: [44, 25] }],
    refLines: [{ value: 12.8, label: 'PNB ROE 12.8%' }] });
  ok('the multibagger chart can carry the company\'s own rate as a line', /stroke-dasharray/.test(col) && /PNB ROE 12.8%/.test(col));
  const sh = K.columns({ title: 's', stacked: true, total: false, categories: ['Q1', 'Q2'],
    vFmt: (v) => v + '%', series: [{ name: 'Promoter 70%', values: [70, 70] }, { name: 'FII 6.7%', values: [6.1, 6.7] }] });
  ok('stacked shares print with % signs and the holder\'s share in the legend', /70%/.test(sh) && /FII 6.7%/.test(sh));
  ok('and no meaningless total above each bar', !/>76.7</.test(sh) && !/>76.1</.test(sh));
}

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
