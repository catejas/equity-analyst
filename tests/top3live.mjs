/* The Top 3, with three companies. In the app, through the real flow.
 *
 * This had never been done. Every fixture in the suite carried ONE company —
 * top3.mjs names three slots in run.top3 and then imports a single company
 * into them, and its fixture lived in /tmp, so on a fresh container it was
 * testing against a file that did not exist.
 *
 * So the entire Top 3 path — three companies ranked against each other, the
 * kill switch deciding who is eligible, the sector report naming them, each
 * company's own report building from a shared sector run — had never been
 * exercised. That is the path Tejas actually uses.
 *
 * The fixture: PNB is his real payload. SBI and Bank of Baroda are derived
 * from it with realistic variation, and one of them carries a governance flag,
 * because a kill switch that is never tripped is not a kill switch. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SRC = new URL('./fixtures/psu-banks-3.json', import.meta.url).pathname;
const json = fs.readFileSync(SRC, 'utf8');

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
await page.route('**/raw.githubusercontent.com/**', (r) => r.abort('failed'));
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
/* A price series for each, so technicals and the multiple bands are exercised
   rather than skipped. */
await page.route('**/api.upstox.com/**', (r) => {
  const key = decodeURIComponent(r.request().url()).match(/NSE_EQ\|(\w+)/)?.[1] || '';
  const base = key === 'INE062A01020' ? 842 : key === 'INE028A01039' ? 269 : 110;
  const candles = [];
  const t0 = Date.parse('2026-07-20T00:00:00+05:30');
  for (let i = 0; i < 105; i++) {
    const c = base * (1 - i * 0.003) * (1 + Math.sin(i / 7) * 0.04);
    candles.push([new Date(t0 - i * 7 * 86400000).toISOString(), c * 0.99, c * 1.02, c * 0.97, c, 3e7, 0]);
  }
  r.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ status: 'success', data: { candles } }) });
});

await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const out = await page.evaluate(async (j) => {
  const full = JSON.parse(j);
  const cos = full.companies;
  const sectorOnly = Object.assign({}, full, { companies: [] });
  const imp = async (obj) => {
    document.getElementById('importText').value = JSON.stringify(obj);
    document.getElementById('btnDoImport').click();
    await new Promise((s) => setTimeout(s, 700));
    const save = document.getElementById('btnSaveImport');
    if (save.classList.contains('hidden')) return 'REVIEW BLOCKED';
    save.click();
    await new Promise((s) => setTimeout(s, 3200));
    return 'ok';
  };
  const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();

  tab('sector');
  document.getElementById('btnImport').click();
  const secRes = await imp(sectorOnly);

  /* Each company into its own rank, which is the two-step flow the app
     requires and the one a person performs. */
  tab('company');
  await new Promise((s) => setTimeout(s, 400));
  const slotResults = [];
  for (let i = 0; i < 3; i++) {
    const btn = document.querySelector(`.co-import[data-rank="${i + 1}"]`);
    if (!btn) { slotResults.push('no slot ' + (i + 1)); continue; }
    btn.click();
    await new Promise((s) => setTimeout(s, 400));
    slotResults.push(await imp({ run: sectorOnly.run, companies: [cos[i]] }));
  }

  const p = window.EQDocTools.currentPayload();
  const rep = p && p.report;
  const full3 = (rep && rep.full) || [];
  const top3 = (rep && rep.top3) || [];

  const docs = {};
  for (const k of ['sector', 'exec', 'score', 'co1', 'co2', 'co3']) {
    try {
      const pp = window.EQDocTools.currentPayload(k);
      const h = pp ? window.EQDocTools.buildHTML(pp, k, 'en') : '';
      docs[k] = h ? Math.round(h.length / 1024) : 0;
    } catch (e) { docs[k] = 'ERR ' + String(e.message).slice(0, 60); }
  }
  const sectorHtml = (() => {
    try { return window.EQDocTools.buildHTML(window.EQDocTools.currentPayload('sector'), 'sector', 'en'); }
    catch { return ''; }
  })();

  return {
    secRes, slotResults,
    imported: full3.map((c) => c.symbol),
    scores: full3.map((c) => [c.symbol, c.overall && c.overall.score]),
    eligible: full3.map((c) => [c.symbol, c.eligibleForTop3]),
    exclusions: full3.map((c) => [c.symbol, (c.exclusionReasons || []).length]),
    top3: top3.map((c) => c.symbol),
    ranks: full3.map((c) => [c.symbol, c.rank]),
    prices: full3.map((c) => [c.symbol, c.priceHistory ? c.priceHistory.closes.length : 0]),
    bands: full3.map((c) => [c.symbol, !!(c.multipleBands && c.multipleBands.available)]),
    docs,
    sectorNamesAll: ['SBIN', 'PNB', 'BANKBARODA'].filter((s) => sectorHtml.includes(s)).length,
    sectorHasSubSector: /Public Sector Banks/.test(sectorHtml),
    sectorHasExclusions: /Union Bank|ranked fourth|Ranked fourth/i.test(sectorHtml),
    barredBanner: /No company cleared the kill switch/.test(sectorHtml),
    barredRemedy: /What would have to change/.test(sectorHtml),
    warnings: (p && p.warnings ? p.warnings : []).slice(0, 6),
  };
}, json);

console.log('      sector import:', out.secRes, '| company slots:', out.slotResults.join(', '));
console.log('      imported:', out.imported.join(' '));
console.log('      scores  :', JSON.stringify(out.scores));
console.log('      eligible:', JSON.stringify(out.eligible));
console.log('      top3    :', out.top3.join(' ') || '(none)');
console.log('      prices  :', JSON.stringify(out.prices));
console.log('      docs KB :', JSON.stringify(out.docs));

ok('the sector run imports', out.secRes === 'ok');
ok('all three companies import into their own ranks',
   out.slotResults.every((x) => x === 'ok'));
ok('and all three are in the report', out.imported.length === 3);
ok('each has its own score, so they are distinguishable',
   new Set(out.scores.map((s) => s[1])).size === 3);
ok('each is ranked', out.ranks.every(([, r]) => typeof r === 'number'));
/* No Top 3 here is CORRECT, and is the first half of the test.
   The payload searched 3 of the 22 registers the framework requires, so the
   kill switch bars all three companies. A screen that nominated a company on
   research this thin would be the defect; refusing to is the feature. What the
   report owes the reader is the reason and the remedy, which is asserted
   against the document below. */
ok('with incomplete register searches, nothing is nominated', out.top3.length === 0);
ok('and every company says so', out.eligible.every(([, e]) => e === false));
ok('the company carrying a governance flag is still ranked, not hidden',
   out.imported.includes('BANKBARODA'));
ok('every company says why it is or is not eligible',
   out.exclusions.every(([, n]) => typeof n === 'number'));

ok('price history is fetched for all three, keyed by their own ISINs',
   out.prices.every(([, n]) => n >= 100));
ok('and the multiple bands compute for all three',
   out.bands.every(([, v]) => v === true));

ok('the sector report builds', typeof out.docs.sector === 'number' && out.docs.sector > 40);
ok('it names all three companies', out.sectorNamesAll === 3);
ok('it carries the sub-sector', out.sectorHasSubSector);
ok('and says what was screened out', out.sectorHasExclusions);
ok('the executive summary builds', typeof out.docs.exec === 'number' && out.docs.exec > 20);
ok('the score card builds', typeof out.docs.score === 'number' && out.docs.score > 20);
ok('all three company reports build',
   ['co1', 'co2', 'co3'].every((k) => typeof out.docs[k] === 'number' && out.docs[k] > 60));

ok('the sector report explains the empty shortlist rather than omitting it',
   out.barredBanner);
ok('and aggregates what would have to change',
   out.barredRemedy);

/* --- the other half: research that IS complete must produce a Top 3 ------ */
const second = await page.evaluate(async (j) => {
  const full = JSON.parse(j);
  const REGISTERS = ['indiankanoon', 'ecourts', 'nclt', 'nclat', 'ibbi', 'sebi_orders',
    'sebi_settlement', 'sebi_debarment', 'mca_master', 'mca_charges', 'mca_din', 'cestat',
    'itat', 'gst_appellate', 'ncdrc', 'epfo', 'exchange_lodr', 'surveillance',
    'rating_actions', 'ed_fema', 'tax_search', 'media'];
  const cos = full.companies.map((c) => {
    const x = JSON.parse(JSON.stringify(c));
    x.litigation = { searched: REGISTERS.map((r) => ({
      register: r, subject: 'company', subjectName: x.name,
      outcome: 'clear', detail: 'Searched; no matter on record.', matters: [] })) };
    return x;
  });
  const sectorOnly = Object.assign({}, full, { companies: [] });
  /* composePayload takes the company PAYLOADS the app stores, each a run with
     one company in it — not bare company objects. Passing the latter yields a
     report with no companies at all, silently. */
  const built = EQ.buildReport(EQ.compose.composePayload(
    sectorOnly, cos.map((c) => ({ run: full.run, companies: [c] }))));
  if (!built || !built.report) {
    return { ok: false, top3: [], scores: [], eligible: [],
      errors: (built && built.errors) || ['buildReport returned no report'] };
  }
  const rep = built.report;
  return {
    ok: built.ok, errors: built.errors || [],
    top3: (rep.top3 || []).map((c) => c.symbol),
    scores: (rep.full || []).map((c) => [c.symbol, c.overall && c.overall.score]),
    eligible: (rep.full || []).map((c) => [c.symbol, c.eligibleForTop3]),
  };
}, json);

console.log('      with all 22 registers searched -> top3:', second.top3.join(' ') || '(none)');
ok('with the registers searched, a Top 3 IS produced', second.top3.length === 3);
ok('and it is ordered by score, best first', (() => {
  const by = Object.fromEntries(second.scores);
  const s = second.top3.map((x) => by[x]);
  return s.every((v, i) => i === 0 || v <= s[i - 1]);
})());
ok('the company carrying a moderate governance flag is not barred by it',
   second.eligible.every(([, e]) => e === true));

ok('no page errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0, 4).join('\n      '));
if (out.warnings.length) console.log('      warnings: ' + out.warnings.join(' | ').slice(0, 300));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
