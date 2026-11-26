/* The Sector Screen report in the real app in Chrome (build 34): the real
 * screen of 22-11-2026 with its seven follow-ups, a TEST DATA deep dive and
 * macro block, and Upstox mocked. Checks that every new section, chart and
 * table is printed, that nothing reads NaN or undefined, and that the
 * stance, confidence, macro and sources reach the document. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT } from './_paths.mjs';
import { mergeTopUp } from '../src/core/completeness.js';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const dir = path.join(ROOT, 'tests/fixtures/real');
const ld = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
let d = ld('finder-22-11-2026-base.json');
for (const n of [1, 2, 3, 4, 5, 6, 7]) { const add = ld(`finder-22-11-2026-topup${n}.json`); if (!Array.isArray(add.companies)) add.companies = []; const mg = mergeTopUp(d, add); if (mg.ok) d = mg.merged; }
delete d.run.topUp; d.schema = 'equity-analyst/5';
/* TEST DATA deep dive for the shortlist, to see the layout. */
const dd = (i) => ({ flows: { fpiNet12mCr: 3000 - i * 900, fpiAucCr: 150000, asOf: '15-11-2026', source: 'NSDL (test)' },
  budget: ['FY23','FY24','FY25','FY26','FY27'].map((fy, k) => ({ fy, head: 'Ministry (test)', be: 1000 + k * (100 + i * 20), actual: k < 3 ? 950 + k * 100 : null })),
  schemes: [{ name: 'PLI (test)', outlay: 12000, disbursed: 3000 + i * 500, asOf: '31-10-2026' }],
  targets: [{ target: 'Capacity (test)', current: 520, goal: 900, by: 'FY32', unit: 'GW' }],
  policy: [{ event: 'Safeguard duty extended (test)', date: '01-09-2026', impact: 1 }, { event: 'Import quota (test)', date: '15-06-2026', impact: i % 2 ? -1 : 1 }, { event: 'Tax change (test)', date: '01-04-2026', impact: 0 }],
  global: { marketGrowth3y: 4 + i, indiaShareNow: 5 + i * 0.3, indiaSharePrev: 5, exportsCagr3y: 3 + i },
  drivers: [{ name: 'Input price (test)', unit: 'US$/t', now: 2500, yearAgo: 2300 + i * 50, effect: 'rising helps' }, { name: 'Freight (test)', unit: 'index', now: 100, yearAgo: 110, effect: 'rising hurts' }],
  risks: [{ risk: 'Regulatory change (test)', severity: 'medium' }, { risk: 'Concentration (test)', severity: i % 3 ? 'low' : 'high' }, { risk: 'Cycle (test)', severity: 'medium' }],
  commentary: { thesis: 'TEST thesis: demand visibility and capacity additions over three years support earnings growth ahead of the market.', bull: 'TEST bull case.', bear: 'TEST bear case.', catalysts: [{ event: 'Union Budget (test)', date: '01-02-2027' }, { event: 'Q3 results (test)', date: 'Jan-2027' }] } });
d.sectors.forEach((x, i) => { x.deepDive = dd(i % 7); });
d.macro = { repoRate: 5.25, repoRatePrev: 6, cpi: 2.1, gdpGrowth: 7.2, crude: 66, crudeYearAgo: 74, usdInr: 94.1, usdInrYearAgo: 88.4, us10y: 4.1, fpiIndiaNet3mCr: 22000, msciIndia1y: 4, msciEm1y: 18, asOf: '25-11-2026', source: 'TEST' };
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 1300 } });
page.on('dialog', (x) => x.accept()); const errs=[]; page.on('pageerror', e=>errs.push(e.message)); page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
const t0 = Date.now();
const wk = (g, ph) => { const out=[]; for(let i=0;i<208;i++){ const t=new Date(t0-(207-i)*7*864e5).toISOString().slice(0,10)+'T00:00:00+05:30'; const c=100*Math.pow(1+g,i)*(1+0.05*Math.sin(i/6+ph)); out.unshift([t,c,c,c,c,1,0]); } return out; };
const months = () => { const out=[]; for(let i=0;i<72;i++){ const t=new Date(t0-(71-i)*30.44*864e5).toISOString().slice(0,10)+'T00:00:00+05:30'; const c=100+i; out.unshift([t,c,c,c,c,1,0]); } return out; };
await page.route('**/api.upstox.com/**', (route) => { const u = decodeURIComponent(route.request().url());
  const h = [...u].reduce((a,c)=>a+c.charCodeAt(0),0) % 13;
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status:'success', data:{ candles: /\/months\//.test(u) ? months() : wk(0.0005 + h*0.0004, h) } }) }); });
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
await page.waitForFunction(() => window.EQ && window.EQ.finder && window.EQDocTools, null, { timeout: 15000 });
await page.evaluate((o) => { document.getElementById('btnFinderImport').click(); document.getElementById('importText').value = '```json\n' + JSON.stringify(o) + '\n```'; }, d);
await page.waitForTimeout(300); await page.evaluate(() => document.getElementById('btnDoImport').click()); await page.waitForTimeout(800);
await page.evaluate(() => document.getElementById('btnSaveImport').click());
for (let i=0;i<120;i++){ await page.waitForTimeout(500); if (await page.evaluate(() => !FINDER_BUSY && !FINDER_AGAIN)) break; }
await page.waitForTimeout(800);
const html = await page.evaluate(() => EQDocTools.buildHTML(window.finderPayload(), 'finder', 'en'));
const pay = await page.evaluate(() => { const p = window.finderPayload(); return { st: p.analysis && Object.keys(p.analysis.stance).length, src: (p.sources || []).length, macro: !!p.macro }; });
ok('the payload carries a stance for every sector', pay.st === 41, pay.st);
ok('the payload carries the sources and the macro block', pay.src > 20 && pay.macro, JSON.stringify(pay));
for (const t of ['The Bottom Line', 'How the Ranking Is Reached', 'The Top 3 Sectors', 'Score Is Made Of', 'The Whole Field at a Glance',
  'Past Performance and the Risk Taken', 'Past Against Future', 'Valuation Against Growth', 'Why Not the Next Three',
  'Depends on the Weights', 'The Macro Backdrop', 'The Full Ranking', 'Method in Full', 'Sources'])
  ok(`section "${t}" is printed`, html.includes(t));
const figs = (html.match(/Fig \d+ –/g) || []).length;
/* Score breakdown, heat map, returns, relative strength, quadrant, valuation
   and a Budget chart for each of the Top 3 = 6 + 3. */
ok('nine charts or more', figs >= 9, figs);
ok('the Top 3 are marked Overweight', (html.match(/>Overweight</g) || []).length >= 3);
ok('each Top 3 block grades its confidence', (html.match(/Confidence (High|Medium|Low):/g) || []).length === 3);
ok('the deep-dive evidence is printed: targets, policy, drivers, catalysts, graded risks',
  ['Government targets and scheme money', 'Policy, regulation and trade measures', 'What drives its profits', 'Catalysts, next 12 months', 'Risks, graded'].every((t) => html.includes(t)));
ok('the macro reading is printed', html.includes('Repo rate') && html.includes('5.25%') && html.includes('22,000'));
const text = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/g, ' ');
ok('no NaN or undefined in the text', !/\bNaN\b|\bundefined\b/.test(text), (text.match(/.{40}(NaN|undefined).{40}/) || [''])[0]);

/* Build 35: weights, a review with notes, approval, and the report. */
await page.evaluate(() => { const b = document.querySelector('nav button[data-tab="sector"]'); if (b) b.click(); });
await page.waitForTimeout(400);
const app3 = await page.evaluate(() => finderTop3().map((x) => x.name));
ok('the review sits on the ranking: an Approve button and a call on each row', await page.evaluate(() => !!document.getElementById('btnFrApprove') && document.querySelectorAll('#finderTable .fedit').length >= 3 && !!document.getElementById('fwBox')));
/* A call without a note is refused. */
let alerts = [];
page.removeAllListeners('dialog'); page.on('dialog', (x) => { alerts.push(x.message()); x.accept(); });
const call = (n, note) => page.evaluate(([n, note]) => {
  document.querySelectorAll('.fedrow').forEach((r) => r.remove()); document.querySelector('#finderTable .fedit[data-fname="' + n + '"]').click();
  const box = document.querySelector('.fedrow .fedit-box'); box.querySelector('.fedsel').value = 'exclude'; box.querySelector('.fednote').value = note;
  box.querySelector('.fedsave').click(); }, [n, note]);
await call(app3[1], ''); await page.waitForTimeout(300);
ok('taking a sector out without a note is refused', alerts.some((a) => /Add a note/.test(a)) && (await page.evaluate(() => finderTop3().map((x) => x.name))).join() === app3.join());
await call(app3[1], 'TEST: valuation already full'); await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('btnFrApprove').click()); await page.waitForTimeout(400);
const after = await page.evaluate(() => finderTop3().map((x) => x.name));
ok('with a note, the sector leaves the Top 3', !after.includes(app3[1]) && after.includes(app3[0]), after.join());
ok('the row says what you did and why', await page.evaluate(() => /You took it out: TEST: valuation already full/.test(document.getElementById('finderTable').textContent)));
ok('the Top 3 is approved', alerts.some((a) => /Top 3 approved/.test(a)) && await page.evaluate(() => { const sc = finderScore(finderRecord()); return sc.review.approved.current; }));
ok('the review is stored with the screen', await page.evaluate(() => (finderRecord().data.review.overrides || []).length === 1));
/* Own weights: risk only. */
await page.evaluate(() => { document.getElementById('fwBox').open = true;
  document.querySelectorAll('.fwin').forEach((i) => { i.value = i.getAttribute('data-k') === 'risk' ? 100 : 0; }); document.getElementById('btnFwSave').click(); });
await page.waitForTimeout(500);
const wNow = await page.evaluate(() => finderWeights());
ok('weights are saved: risk alone is 100', wNow.risk === 100 && wNow.performance === 0, JSON.stringify(wNow));
const html2 = await page.evaluate(() => EQDocTools.buildHTML(window.finderPayload(), 'finder', 'en'));
ok('the report prints "Your Review", the call and its reason', html2.includes('Your Review') && html2.includes('TEST: valuation already full') && html2.includes('taken out of the Top 3'));
ok('the report says your own weights are in use', html2.includes('Your own weights are in use'));
ok('the picks are kept for the track record', await page.evaluate(() => finderPicks().length >= 1));
await page.evaluate(() => document.getElementById('btnFwReset').click()); await page.waitForTimeout(300);
ok('back to the defaults', await page.evaluate(() => EQ.finder.weightsAreDefault(finderWeights())));
await page.setViewportSize({ width: 860, height: 1200 });
await page.setContent(html, { waitUntil: 'load' }); await page.waitForTimeout(2500);
const pages = await page.evaluate(() => document.querySelectorAll('.page').length);
ok('the document lays out in 12 to 28 pages', pages >= 12 && pages <= 28, pages);
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].filter((p) => p.scrollHeight > p.clientHeight + 2).length);
ok('no page overflows', over === 0, over);
ok('no page error', !errs.filter((e) => !/ERR_TUNNEL|Failed to load resource/.test(e)).length, errs.join(' | '));
await b.close();
console.log(`\n${ran - fail}/${ran} checks pass`);
process.exit(fail ? 1 : 0);
