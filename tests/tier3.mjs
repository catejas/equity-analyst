/* Tier 3 — the institutional blocks must actually appear in the document.
   Two payloads: one carrying every block, one carrying none. The first must
   show them; the second must not grow an empty heading over a gap note, which
   reads as a rendering fault rather than as missing research. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const rich = JSON.parse(fs.readFileSync('/tmp/ril.json', 'utf8'));
const c = rich.companies[0];
c.valuation.waccBuildup = { riskFreeRate: 0.068, equityRiskPremium: 0.055, leveredBeta: 1.05,
  costOfEquity: 0.126, pretaxCostOfDebt: 0.08, taxRate: 0.25, afterTaxCostOfDebt: 0.06,
  equityWeight: 0.8, debtWeight: 0.2, wacc: 0.113, source: 'Damodaran, RBI' };
c.valuation.sotp = [
  { name: 'Jio', metric: 'EBITDA', metricValue: 60000, multiple: 12, enterpriseValue: 720000, stakePct: 100, perShare: 532, basis: 'telecom peers' },
  { name: 'Retail', metric: 'EBITDA', metricValue: 25000, multiple: 30, enterpriseValue: 750000, stakePct: 100, perShare: 554, basis: 'retail peers' }];
c.valuation.impliedExpectations = { impliedRevenueCagr: 0.07, impliedEbitMargin: 0.13,
  impliedYears: 10, reading: 'the price assumes mid-single-digit growth for a decade' };
/* Two peers minimum: a scatter of one point compares nothing, and the
   renderer correctly refuses to draw it. */
c.peers = [
  { name: 'Bharti Airtel', listed: true, marketCap: 1000000, pe: 45, evEbitda: 9.5,
    roe: 12, revGrowth: 14, ebitdaMargin: 52, asOf: 'FY25', note: 'telecom peer' },
  { name: 'Vodafone Idea', listed: true, marketCap: 60000, pe: 0, evEbitda: 14.2,
    roe: -35, revGrowth: 2, ebitdaMargin: 38, asOf: 'FY25', note: 'telecom peer' },
  { name: 'DMart', listed: true, marketCap: 280000, pe: 92, evEbitda: 55,
    roe: 14, revGrowth: 17, ebitdaMargin: 8, asOf: 'FY25', note: 'retail peer' }];
c.dupont = [{ period: 'FY24', netProfitMargin: 7.9, assetTurnover: 0.67, financialLeverage: 1.9, roe: 9.9, roic: 8.4, waccSpreadPct: -2.9 },
  { period: 'FY25', netProfitMargin: 7.6, assetTurnover: 0.63, financialLeverage: 1.9, roe: 9.0, roic: 8.1, waccSpreadPct: -3.2 }];
c.capitalCycle = [{ period: 'FY25', cwip: 120000, grossBlock: 1000000, cwipPctOfGrossBlock: 12, note: 'peaking' }];
c.historicalSectors = [
  { period: 'FY24', lines: [{ name: 'O2C', revenue: 570000 }, { name: 'Retail', revenue: 300000 }] },
  { period: 'FY25', lines: [{ name: 'O2C', revenue: 600000 }, { name: 'Retail', revenue: 330000 }] }];
c.compensation = { period: 'FY25', fixedPct: 60, variablePct: 40, tiedTo: 'ROIC', ceoPayToMedian: 0, source: 'Annual Report' };
fs.writeFileSync('/tmp/ril-rich.json', JSON.stringify(rich));

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0;
const ok = (l, cond) => { if (!cond) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

async function build(file) {
  const page = await b.newPage({ viewport: { width: 430, height: 930 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  page.on('dialog', (d) => d.accept());
  /* No network: the price fetch must not gate this test. */
  await page.route('**/api.upstox.com/**', (r) => r.abort('failed'));
  await page.route('**/bharatstockapi.com/**', (r) => r.abort('failed'));
  await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  /* The app is used in two steps and the document depends on both: the sector
     run is imported first and the companies are imported into ranks after it.
     A payload with companies inline is still read as a sector-only run, so a
     one-step import produces a company report with no company in it — which
     is what made every assertion here fail against working code. */
  const html = await page.evaluate(async (json) => {
    const full = JSON.parse(json);
    const co = full.companies[0];
    const sectorOnly = Object.assign({}, full, { companies: [] });

    const imp = async (obj, fire) => {
      document.getElementById('importText').value = JSON.stringify(obj);
      document.getElementById('btnDoImport').click();
      await new Promise((s) => setTimeout(s, 500));
      document.getElementById('btnSaveImport').click();
      await new Promise((s) => setTimeout(s, 1800));
    };

    const tab = (t) => [...document.querySelectorAll('nav button')]
      .find((x) => x.dataset.tab === t)?.click();

    tab('sector');
    document.getElementById('btnImport').click();
    await imp(sectorOnly);

    tab('company');
    await new Promise((s) => setTimeout(s, 300));
    const slot = document.querySelector('.co-import[data-rank="1"]');
    if (slot) slot.click();
    await new Promise((s) => setTimeout(s, 300));
    await imp({ run: sectorOnly.run, companies: [co] });

    const p = window.EQDocTools.currentPayload();
    if (!p || !p.report || !(p.report.full || []).length) return 'NOCOMPANY';
    try { return window.EQDocTools.buildHTML(p, 'co1', 'en'); } catch (e) { return 'THREW ' + e.message; }
  }, fs.readFileSync(file, 'utf8'));
  await page.close();
  return { html, errs };
}

/* Title Case, as every heading in the report now is. */
const HEADINGS = ['Return on Capital, Deconstructed', 'The Capital Cycle',
  'Revenue by Operating Line', 'Pay and Alignment', 'How the Discount Rate Is Built',
  'Sum of the Parts', 'What the Price Already Assumes'];

const r = await build('/tmp/ril-rich.json');
ok('a company reached the report', r.html !== 'NOCOMPANY');
ok('document builds', !r.html.startsWith('THREW') && r.html.length > 20000);
for (const h of HEADINGS) ok('shows "' + h + '"', r.html.includes(h));
ok('peer matrix uses named columns', r.html.includes('EV/EBITDA') && r.html.includes('EBITDA margin'));
ok('peer matrix no longer says "Metric 1"', !r.html.includes('Metric 1'));
ok('ROIC minus WACC spread is shown', r.html.includes('ROIC − WACC'));
ok('a negative spread is called out', /consumes value/.test(r.html));
ok('SOTP totals', r.html.includes('Sum of the Parts') && /Total/.test(r.html));
/* The charts the new data enables. Assert on the figure captions, which is
   what a reader sees, not on SVG internals. */
ok('ROIC vs cost-of-capital chart drawn', /Return on invested capital against its cost/.test(r.html));
ok('revenue mix chart drawn', /Revenue by operating line<\/figcaption>|Revenue by operating line/.test(r.html));
ok('peer scatter drawn', /what you pay against what the business earns/i.test(r.html));
ok('charts are inline SVG, not images', /<svg/.test(r.html) && !/<img [^>]*src="data:image/.test(r.html));
ok('no page errors', r.errs.length === 0);
if (r.errs.length) console.log('      ' + r.errs.slice(0, 3).join('\n      '));

/* The other harnesses import companies inline, which the app reads as a
   sector-only run — so their company document has no company in it and cannot
   exercise these sections at all. Lay the rich document out here and check it
   for the failure the new sections could actually cause. */
{
  const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  const perrs = [];
  page.on('pageerror', (e) => perrs.push(e.message.split('\n')[0]));
  await page.setContent(r.html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const lay = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')];
    const over = [];
    pages.forEach((p, i) => {
      const box = p.querySelector('.ir-box');
      if (box && box.scrollHeight > box.clientHeight + 2) over.push(i + 1);
      [...p.querySelectorAll('table, .fig, svg')].forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 2) over.push('wide p' + (i + 1));
      });
    });
    return { pages: pages.length, over, figs: document.querySelectorAll('figure.fig').length };
  });
  await page.close();
  console.log('      rich document:', lay.pages, 'pages,', lay.figs, 'figures');
  ok('rich document paginates without overflow', lay.over.length === 0);
  if (lay.over.length) console.log('      overflow at:', lay.over.slice(0, 6).join(' '));
  ok('rich document renders without errors', perrs.length === 0);
}

const plain = await build('/tmp/ril.json');
ok('a payload without the blocks still builds',
   !plain.html.startsWith('THREW') && plain.html !== 'NOCOMPANY');
const leaked = HEADINGS.filter((h) => plain.html.includes(h));
ok('and grows no empty headings', leaked.length === 0);
if (leaked.length) console.log('      leaked:', leaked.join(' | '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
