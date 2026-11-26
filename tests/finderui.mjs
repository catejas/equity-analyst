import { REAL } from './_paths.mjs';
/* The Sector page rebuilt around the Sector Finder, and the Company page's
 * picker (build 28), in the real app in Chrome.
 *
 * Tejas, 22-11-2026: Sector Finder at the top of the Sector page; Top 3
 * Sectors like the Top 3 companies; Independent Sector Research like the
 * independent company; remove "Saved company research"; a "Top 3 companies
 * of" line on the Company page. Upstox is mocked for the Nifty 50 and Nifty
 * Bank; every other price call fails, as it would offline. The screen is
 * TEST DATA (tests/_finderfix.mjs). */
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { finderFixture } from './_finderfix.mjs';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const bank = JSON.parse(fs.readFileSync(REAL + '/banking-psb-merged-16-11-2026.json', 'utf8'));

/* Banking made the strongest sector, so it is in the Top 3 and can be linked
   to the real Banking study. */
const fx = finderFixture({ thin: ['Retail', 'Aviation'] });
const B = fx.sectors.find((s) => s.name === 'Banking');
B.subSector = 'Public sector banks';
B.returns = { m3: 12, m6: 25, y1: 40, asOf: '20-11-2026', source: 'test data' };
B.business = { revenueGrowth: 30, profitGrowth: 40, period: 'four quarters to Q2 FY27', basis: 'test', source: 'test data' };
B.outlook.earningsGrowth3y = 40; B.outlook.demandGrowth3y = 30;
B.valuation = { pe: 8, pe5yAvg: 30, asOf: '20-11-2026', source: 'test data' };

const candles = (start, end) => {
  const out = []; const d0 = Date.parse('2025-11-01T00:00:00Z');
  for (let i = 0; i <= 386; i += 1) {
    const t = new Date(d0 + i * 86400000).toISOString().slice(0, 10) + 'T00:00:00+05:30';
    const c = start + (end - start) * i / 386; out.push([t, c, c, c, c, 1000, 0]);
  }
  return out.reverse();     /* Upstox sends newest first */
};

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
const upstoxAsked = [];
await page.route('**/api.upstox.com/**', (route) => {
  const key = decodeURIComponent(route.request().url().split('/historical-candle/')[1].split('/')[0]);
  upstoxAsked.push(key);
  if (key === 'NSE_INDEX|Nifty 50') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { candles: candles(100, 110) } }) });
  if (key === 'NSE_INDEX|Nifty Bank') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { candles: candles(100, 130) } }) });
  return route.fulfill({ status: 404, body: '{}' });
});
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await page.route('**/bharatstockapi.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => window.EQ && window.EQ.finder && window.EQDocs && window.EQDocTools, null, { timeout: 15000 });
await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.resolve(); });
const sleep = (m) => page.waitForTimeout(m);
const ev = (fn, arg) => page.evaluate(fn, arg);
const imp = async (obj, btn) => {
  await ev(([o, id]) => { document.getElementById(id).click(); document.getElementById('importText').value = '```json\n' + JSON.stringify(o) + '\n```'; }, [obj, btn]);
  await sleep(300); await ev(() => document.getElementById('btnDoImport').click()); await sleep(700);
  const review = await ev(() => document.getElementById('reviewBox').innerText);
  await ev(() => document.getElementById('btnSaveImport').click()); await sleep(1500);
  return review;
};

console.log('\nThe Sector page, top to bottom');
const order = await ev(() => [...document.querySelectorAll('#tab-sector > .card, #tab-sector > #secBoxes')].map((x) => x.id));
ok('Sector Finder, Top 3 Sectors, Independent Sector Research, then the AI tools',
  order.join(',') === 'finderBox,secBoxes,segBox,toolBox', order.join(','));
ok('the independent box is named Independent Sector Research', await ev(() => document.getElementById('segBoxName').textContent) === 'Independent Sector Research');
ok('the Company page no longer has the Saved company research picker',
  await ev(() => !document.getElementById('coPick') && !/Saved company research/.test(document.getElementById('tab-company').innerText)));
ok('the Company page keeps its AI tool buttons', await ev(() => document.querySelectorAll('#toolRowCo [data-tool]').length === 4));

console.log('\nFind Sectors');
await ev(() => document.getElementById('btnFinderRun').click()); await sleep(600);
const fp = await ev(() => ({ p: LAST_PROMPT, armed: document.getElementById('toolRow').classList.contains('armed') }));
ok('copies the Sector Finder prompt', /^SECTOR FINDER/.test(fp.p) && /Banking/.test(fp.p) && /Emerging themes/.test(fp.p));
ok('with each sector\'s sub-sectors from the app\'s list', /sub-sectors: .*Public sector banks/.test(fp.p));
ok('and frames the tool buttons in gold', fp.armed);

console.log('\nImporting a screen');
const rv = await imp(fx, 'btnFinderImport');
ok('the review is the Finder\'s own', /Sector Finder — 41 of 41 sectors screened/.test(rv), rv.slice(0, 80));
ok('it lists what is thin with its state', /P\/E against its own history not yet searched/.test(rv));
const after = await ev(() => ({
  recs: libRead().filter((r) => r.kind === 'finder').length,
  asStudy: sectorRecords().length,
  tag: document.getElementById('finderTag').textContent,
  rows: document.querySelectorAll('#finderTable tr').length,
  slots: [...document.querySelectorAll('#secBoxes [data-srank] h2')].map((h) => h.innerText.replace(/\s+/g, ' ')),
  docs: !document.getElementById('finderDocs').classList.contains('hidden'),
}));
ok('it is saved as a screen, not as a sector study', after.recs === 1 && after.asStudy === 0 && after.tag === 'screened');
ok('the ranking lists all 41 sectors', after.rows === 41 + 2, after.rows);
ok('three Top 3 Sector boxes, Banking first', after.slots.length === 3 && /^1 Banking — Public sector banks to research/.test(after.slots[0]), after.slots[0]);
ok('the Sector Screen PDF row appears', after.docs);

console.log('\nThe app checks the returns itself');
await page.waitForFunction(() => /Returns checked by the app/.test(document.getElementById('finderMsg').innerText), null, { timeout: 30000 }).catch(() => {});
const vr = await ev(() => {
  const rec = libRead().filter((r) => r.kind === 'finder')[0];
  const sc = EQ.finder.scoreFinder(rec.data);
  const bk = sc.rows.find((r) => r.name === 'Banking');
  return { msg: document.getElementById('finderMsg').innerText, bench: sc.benchmark, bk: { ret: bk.returns, rel: bk.rel },
    cell: [...document.querySelectorAll('#finderTable tr')].find((tr) => /Banking/.test(tr.innerText)).innerText };
});
ok('Upstox was asked for the Nifty 50 and Nifty Bank', upstoxAsked.includes('NSE_INDEX|Nifty 50') && upstoxAsked.includes('NSE_INDEX|Nifty Bank'));
ok('the message says how many were checked', /checked by the app for 1 sector, against the Nifty 50/.test(vr.msg), vr.msg);
ok('the Nifty 50 figure is the app\'s (+10% over the year), not the research\'s (+6%)', vr.bench.checked && Math.abs(vr.bench.y1 - 9.5) < 1.5, vr.bench.y1);
ok('Banking\'s return is the index\'s (+30%), not the research\'s (+40%)', vr.bk.ret.checked && vr.bk.ret.basis === 'index' && Math.abs(vr.bk.ret.y1 - 28.5) < 3, vr.bk.ret.y1);
ok('the table marks it checked against the index', /✓ index/.test(vr.cell), vr.cell.replace(/\s+/g, ' '));

console.log('\nTop 3 Sectors: research, link and documents');
await ev(() => document.querySelector('.sec-search[data-rank="1"]').click()); await sleep(500);
const sp = await ev(() => LAST_PROMPT);
ok('Research on a Top 3 sector copies the full sector prompt for it', /"sector": "Banking"/.test(sp) && /"subSector": "Public sector banks"/.test(sp));
await imp(bank, 'btnImport');
const linked = await ev(() => ({
  h: document.querySelector('#secBoxes [data-srank="1"] h2').innerText.replace(/\s+/g, ' '),
  upd: !!document.querySelector('.sec-update[data-rank="1"]'),
  docs: document.querySelectorAll('#secBoxes [data-srank="1"] .fdoc').length,
  depth: !!document.querySelector('#secBoxes [data-srank="1"] .depth'),
  cos: !document.querySelector('.sec-cos[data-rank="1"]').disabled,
}));
ok('once the Banking study is saved, its box says researched', /researched/.test(linked.h), linked.h);
ok('and offers Update, the study\'s documents and its depth', linked.upd && linked.docs === 4 && linked.depth);
await ev(() => document.querySelector('.sec-cos[data-rank="1"]').click()); await sleep(500);
const co = await ev(() => ({
  tab: !document.getElementById('tab-company').classList.contains('hidden'),
  bar: (document.querySelector('.cosecbar') || {}).innerText || '',
  pick: (document.getElementById('coSectorPick') || {}).value,
  study: segRecord() && segRecord().id,
}));
ok('Top 3 companies → opens the Company page', co.tab);
ok('which says whose Top 3 it is, with a picker of researched sectors', /Top 3 companies of/.test(co.bar) && /Banking/.test(co.bar) && co.pick === co.study, co.bar.replace(/\s+/g, ' '));
await ev(() => { const nb = document.querySelector('nav button[data-tab="sector"]'); nb.click(); }); await sleep(300);
await ev(() => document.querySelector('#secBoxes .fdoc[data-fdoc="sector"][data-act="make"]').click()); await sleep(1500);
const prev = await ev(() => ({ open: document.body.classList.contains('previewing'), title: (document.querySelector('#preview .pvtitle, #preview .pvname') || {}).textContent || '' }));
ok('a Top 3 sector\'s PDF button opens its Sector Research Report', prev.open, prev.title);
await ev(() => { if (typeof closePreview === 'function') closePreview(); else { const x = document.querySelector('#preview .pvback, #preview button'); if (x) x.click(); } }); await sleep(400);

console.log('\nThe Sector Screen document');
const doc = await ev(() => EQDocTools.buildHTML(window.finderPayload(), 'finder', 'en'));
ok('it opens on the Top 3 Sectors and the bottom line', /Top 3 Sectors/.test(doc) && /The Bottom Line/.test(doc) && /Banking/.test(doc));
ok('it carries the full ranking and how the score is built', /The Full Ranking/.test(doc) && /How the Score Is Built/.test(doc) && /Government and policy/.test(doc) && /20%/.test(doc));
ok('Banking is shown as checked against its index', /checked by the application from the Nifty Bank index/.test(doc));
ok('the gaps are printed', /Gaps in This Research|Gaps in this research/i.test(doc) && /Retail/.test(doc));

console.log('\nA follow-up keeps asking, and says what was tried');
const fu = { schema: 'equity-analyst/5', run: { topUp: true, kind: 'sectorScreen',
  /* Build 31: valuation is asked of the companies (their EPS), so the search
     the tool logs is against that path. */
  searchLog: [{ path: 'sectors[Retail].bellwethers[AAA25].eps', searched: ['NSE index factsheet', 'Trendlyne sector page'], reason: 'no Retail index' }] },
  sectors: [{ name: 'Aviation', valuation: { pe: 30, pe5yAvg: 28, asOf: '21-11-2026', source: 'test data' } }] };
const rv2 = await imp(fu, 'btnFinderImport');
const fs2 = await ev(() => ({ recs: libRead().filter((r) => r.kind === 'finder').length,
  depth: document.getElementById('finderDepth').innerText, prompt: EQ.completeness.topUpPrompt(libRead().filter((r) => r.kind === 'finder')[0].data) }));
ok('the follow-up is added to the saved screen', /Follow-up added to the saved screen/.test(rv2) && fs2.recs === 1);
ok('Aviation\'s valuation is filled; Retail\'s is still asked for', /P\/E against its own history 40\/41/.test(fs2.depth), fs2.depth.replace(/\s+/g, ' '));
ok('the depth box shows it was searched and not found', /searched, not found ×1/.test(fs2.depth) && /1 searched and not found/.test(fs2.depth), fs2.depth.replace(/\s+/g, ' '));
ok('the next follow-up names the sources tried and others', /NSE index factsheet; Trendlyne sector page/.test(fs2.prompt) && /SEARCH AGAIN/.test(fs2.prompt));

console.log('\nAn update, and two versions');
const fx2 = JSON.parse(JSON.stringify(fx));
fx2.run.generatedAt = '2026-11-22T09:00:00Z';
const B2 = fx2.sectors.find((s) => s.name === 'Banking');
B2.outlook.earningsGrowth3y = 1; B2.outlook.demandGrowth3y = 1; B2.business.profitGrowth = 1; B2.business.revenueGrowth = 1;
B2.valuation = { pe: 60, pe5yAvg: 20, asOf: '21-11-2026', source: 'test data' };
fx2.sectors.find((s) => s.name === 'Banking').returns = { m3: -9, m6: -9, y1: -9 };
await ev(() => { verifyFinder.busy = false; });
await imp(fx2, 'btnFinderImport');
await sleep(1500);
const two = await ev(() => ({ n: libRead().filter((r) => r.kind === 'finder').length, ver: !document.getElementById('finderVer').disabled,
  doc: EQDocTools.buildHTML(window.finderPayload(), 'finder', 'en') }));
ok('the second screen is saved as the latest version', two.n === 2 && two.ver);
ok("the Sector Screen says what moved", /What Moved Since the Previous Screen/.test(two.doc) && /left it/.test(two.doc), (two.doc.match(/(Since the previous|same as in the previous)[^<]{0,200}/)||[""])[0] + " | " + /What Moved/.test(two.doc));
await ev(() => document.getElementById('btnFinderDelete').click()); await sleep(500);
ok('Delete removes one version', await ev(() => libRead().filter((r) => r.kind === 'finder').length) === 1);
ok('no script errors', errs.length === 0, errs.join(' | '));

await page.screenshot({ path: '/tmp/finder-page.png', fullPage: true });
await b.close();
console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
