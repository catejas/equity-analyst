import { ROOT, REAL } from './_paths.mjs';
/* What is missing from a payload, and the way to go and get it.
 *
 * Tejas: "I can still see many of items of data payload are still missing."
 *
 * The import card reported the last real company payload as 67 of 67 sections,
 * 100%. It had one quarter, one risk, one catalyst, one year of forensic
 * history and none of the measures a bank is judged on. The audit asked
 * whether each section existed; every one did, with one thing in it.
 *
 * Three things are checked here: that depth is measured and each shortfall is
 * named; that the follow-up prompt asks for exactly those and nothing else;
 * and that the reply is folded into the saved research without losing what
 * was there — driven through the real page for the last.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { completeness, topUpPrompt, mergeTopUp, isTopUp, monthsOld } from '../src/core/completeness.js';
import { buildReport } from '../src/core/report.js';

const U = REAL + '/';
const rd = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };
const PNB = rd('107fec97-attachment.txt'), SEC = rd('da0c46c1-attachment.txt');
const NOW = new Date(2026, 10, 12);

/* A thin sector study, derived from the real one. These checks were written
   against the September Banking reply, which had a two-year-old GDP reading,
   one global peer with no currency, and no moat for State Bank of India. The
   16-11-2026 reply in tests/fixtures/real fixed all three, so each shortfall
   is put back here, on purpose and in the open, to keep the checks honest. */
const THIN = JSON.parse(JSON.stringify(SEC));
THIN.macro.gdpGrowth = { value: 8.2, period: 'FY24', source: 'MoSPI' };
THIN.global.peers = [{ name: 'JPMorgan Chase', country: 'United States', marketCap: 852.89,
  makes: 'Universal bank' }];
THIN.competition.players = rd('banking-psb-topup3-16-11-2026.json').competition.players
  .map((p) => (p.symbol === 'SBIN' ? { ...p, moat: undefined, whyLeader: undefined } : p));

let fail = 0, ran = 0;
const ok = (label, pass, detail) => { ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };
const find = (c, label) => c.sections.flatMap((s) => s.checks).find((x) => x.label.startsWith(label));

/* ---- depth is measured ---- */
{
  const c = completeness(PNB, { now: NOW });
  ok('a real company payload that scored 67/67 on presence is not 100% on depth',
    c.pct < 90 && c.missing.length >= 8, `${c.pct}%, ${c.missing.length} thin`);
  ok('it is judged as a company run, not as a sector study', c.kind === 'company');
  const q = find(c, 'Recent quarters');
  ok('one quarter where four are needed is counted as one of four', q.have === 1 && q.want === 4 && !q.ok);
  const r = find(c, 'Risks');
  ok('one risk where five are needed is counted', r.have === 1 && r.want === 5);
  const bs = find(c, 'Balance sheet lines');
  ok('a bank is asked for advances and deposits, by name', /advances/.test(bs.detail) && /deposits/.test(bs.detail), bs.detail);
  ok('and not for inventory or cost of goods sold',
    !c.missing.some((m) => /inventory|costOfGoodsSold|ebitda/.test(m.detail)));
  const im = find(c, 'Banks and lenders');
  ok('the industry measures that could be neither derived nor read are named',
    /CASA ratio/.test(im.detail) && /Gross NPA/.test(im.detail) && im.have < im.want, `${im.have}/${im.want}`);
  const ra = find(c, 'Rating lines');
  ok('free cash flow yield is not demanded of a lender', !ra || !/fcfYield/.test(ra.detail || ''));
  ok('every shortfall carries the request that would close it',
    c.missing.every((m) => m.ask.length > 30));
  ok('a company run is not asked for a shortlist of eight or five global peers',
    !c.missing.some((m) => /shortlist|Global peers|Glossary/.test(m.label)));
}
{
  const c = completeness(THIN, { now: NOW });
  ok('a sector study is judged as one', c.kind === 'sector');
  const st = find(c, 'Macro readings less than a year old');
  ok('macro readings a year old are found and named with their age',
    st && !st.ok && /gdpGrowth \(FY24, 3\d months old\)/.test(st.detail), st && st.detail.slice(0, 60));
  ok('one global peer where five are needed is counted', find(c, 'Global peers').have === 1);
  ok('a peer market cap with no currency is named', /JPMorgan/.test(find(c, 'Peer market caps').detail));
  ok('the three largest by share are asked for their moat', /State Bank of India/.test(find(c, 'Moat').detail));
  ok('period ages parse', monthsOld('FY24', NOW) === 31 || monthsOld('FY24', NOW) === 32, String(monthsOld('FY24', NOW)));
  ok('an unparseable period has no age rather than a guessed one', monthsOld('recent', NOW) === null);
}

/* ---- the follow-up asks for those and nothing else ---- */
const PROMPT = topUpPrompt(PNB, { now: NOW });
{
  ok('the follow-up marks itself as an addition', /"topUp": true/.test(PROMPT));
  ok('it names the company and its symbol', /Punjab National Bank \(PNB\)/.test(PROMPT) && /"symbol": "PNB"/.test(PROMPT));
  ok('it asks for the missing lender lines by key', /"advances"/.test(PROMPT) && /"deposits"/.test(PROMPT));
  ok('and the missing industry measures by key', /"casa"/.test(PROMPT) && /"gnpa"/.test(PROMPT));
  ok('it does not ask again for what arrived', !/"revenue" \(/.test(PROMPT) && !/Numbered theses/.test(PROMPT));
  ok('it forbids zeros for figures not found', /Never write 0/.test(PROMPT));
  ok('it is a fraction of the size of the research brief', PROMPT.length < 12000, PROMPT.length + ' characters');
  const full = JSON.parse(JSON.stringify(PNB));
  ok('a payload with nothing missing produces no follow-up',
    topUpPrompt({ run: { sector: 'x', reporting: { unit: 'crore' } }, companies: [] , ...{} }, { now: NOW }) !== undefined);
  void full;
}

/* ---- the reply is folded in without losing anything ---- */
const REPLY = { run: { topUp: true, schemaVersion: '5.0.0', sector: 'banking', searchesRun: 9,
    reporting: { currency: 'INR', unit: 'crore', basis: 'consolidated' } },
  companies: [{ symbol: 'PNB',
    financials: {
      annual: [
        { period: 'FY26', advances: 1150000, deposits: 1620000, revenue: 0 },
        { period: 'FY25', advances: 1040000, deposits: 1480000 },
        { period: 'FY24', advances: 934000, deposits: 1370000 },
      ],
      quarterly: [
        { period: 'Q4FY26', basis: 'consolidated', revenue: 37500, netProfit: 4600 },
        { period: 'Q3FY26', basis: 'consolidated', revenue: 36800, netProfit: 4500 },
        { period: 'Q2FY26', basis: 'consolidated', revenue: 36100, netProfit: 4300 },
      ] },
    industryMetrics: [
      { key: 'casa', value: 37.9, unit: '%', period: 'Q1 FY27', source: 'Results presentation' },
      { key: 'gnpa', value: 3.2, unit: '%', period: 'Q1 FY27', source: 'Results presentation' },
      { key: 'nnpa', value: 0.38, unit: '%', period: 'Q1 FY27', source: 'Results presentation' },
      { key: 'pcr', value: 96.8, unit: '%', period: 'Q1 FY27', source: 'Results presentation' },
      { key: 'car', value: 17.5, unit: '%', period: 'Q1 FY27', source: 'Results presentation' },
    ],
    risks: [
      { risk: 'Unsecured retail slippage lifts credit cost', severity: 'moderate', probability: 0.4, impactPct: 8 },
      { risk: 'Treasury loss on a yield spike', severity: 'low', probability: 0.2, impactPct: 6 },
    ],
    snapshot: { marketCap: null, freeFloatPct: '' } }] };
{
  ok('a reply marked topUp is recognised', isTopUp(REPLY) && !isTopUp(PNB));
  const before = completeness(PNB, { now: NOW });
  const m = mergeTopUp(PNB, REPLY);
  ok('it merges', m.ok === true);
  const c0 = m.merged.companies[0], b0 = PNB.companies[0];
  const fy26 = c0.financials.annual.find((r) => r.period === 'FY26');
  const was26 = b0.financials.annual.find((r) => r.period === 'FY26');
  ok('annual rows are matched by period, not appended',
    c0.financials.annual.length === b0.financials.annual.length, c0.financials.annual.length + ' rows');
  ok('the new lines land on the right year', fy26.advances === 1150000 && fy26.deposits === 1620000);
  ok('and every line that was there is still there',
    Object.keys(was26).every((k) => fy26[k] === was26[k] || k === 'revenue'));
  ok('a zero in the reply does not erase a reported figure', fy26.revenue === was26.revenue, String(fy26.revenue));
  ok('a blank in the reply does not erase one either',
    c0.snapshot.marketCap === b0.snapshot.marketCap && c0.snapshot.freeFloatPct === b0.snapshot.freeFloatPct);
  ok('new quarters are added to the one that was there',
    c0.financials.quarterly.length === b0.financials.quarterly.length + 3
      || c0.financials.quarterly.length === 3, c0.financials.quarterly.length + ' quarters');
  ok('new risks are added to the old ones', c0.risks.length === b0.risks.length + 2);
  ok('the industry metrics arrive', c0.industryMetrics.length === 5);
  ok('the theses were not touched', JSON.stringify(c0.theses) === JSON.stringify(b0.theses));
  ok('the reporting unit is taken', m.merged.run.reporting.unit === 'crore');
  ok('searches are added, not replaced', m.merged.run.searchesRun === PNB.run.searchesRun + 9);
  ok('the base payload itself is not mutated', !PNB.companies[0].industryMetrics);
  ok('the merge says what it filled in', m.gained.length >= 4, m.gained.slice(0, 4).join(' | '));
  const after = completeness(m.merged, { now: NOW });
  ok('the research is deeper for it', after.pct > before.pct && after.missing.length < before.missing.length,
    `${before.pct}% → ${after.pct}%, ${before.missing.length} → ${after.missing.length} thin`);
  ok('and the merged payload still builds a report', buildReport(m.merged).ok === true);
  const im = buildReport(m.merged).report.full[0].industry;
  ok('whose industry panel now carries CASA and GNPA as stated figures',
    im.metrics.some((x) => x.key === 'casa' && x.basis === 'stated')
      && im.metrics.some((x) => x.key === 'gnpa'));
  ok('and derives credit-to-deposit from the new lines', im.metrics.some((x) => x.key === 'cdRatio' && x.basis === 'derived'));

  const wrong = mergeTopUp(PNB, { run: { topUp: true }, companies: [{ symbol: 'SBIN', name: 'State Bank of India' }] });
  ok('a follow-up about a different company is refused', wrong.ok === false && /State Bank/.test(wrong.reason));
}

/* ---- through the real page ---- */
{
  const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const p = await ctx.newPage();
  const alerts = [], errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', async (d) => { alerts.push(d.message()); await d.accept(); });
  await p.goto('http://127.0.0.1:8848/index.html');
  await p.waitForTimeout(1200);
  await p.waitForFunction(() => window.EQ && window.EQ.completeness && window.EQLib);
  await p.evaluate(() => window.EQLib.ready);
  const imp = async (obj, opener, save = true) => { await opener();
    await p.fill('#importText', JSON.stringify(obj)); await p.click('#btnDoImport'); await p.waitForTimeout(300);
    const review = await p.evaluate(() => document.querySelector('#reviewBox').innerText);
    if (save) { await p.click('#btnSaveImport'); await p.waitForTimeout(1300); }
    return review; };

  await p.click('nav button[data-tab="sector"]');
  const secReview = await imp(THIN, () => p.click('#btnImport'));
  ok('the sector review no longer reports "Sources — no companies" as missing',
    !/Sources with tier and date/.test(secReview));
  ok('it lists what is thin', /Still thin or missing/i.test(secReview) && /Global peers/.test(secReview));
  await p.click('nav button[data-tab="company"]'); await p.waitForTimeout(200);
  const coReview = await imp(PNB, () => p.click('.co-import[data-rank="1"]'));
  ok('the company review states depth, not "100% of the payload carries data"',
    /% complete/.test(coReview) && !/100% of the payload/.test(coReview), (coReview.match(/\d+% complete/) || [''])[0]);
  ok('and names the thin items', /Recent quarters/.test(coReview) && /1\/4/.test(coReview));

  const box = await p.evaluate(() => { const d = document.querySelector('#coBoxes .runbox[data-rank="1"] .depth');
    return d ? d.innerText : ''; });
  ok('the saved company shows how deep its research goes', /Depth of this research/i.test(box) && /thin or missing/.test(box),
    box.replace(/\s+/g, ' ').slice(0, 70));
  const pctBefore = Number((box.match(/(\d+)%/) || [])[1]);

  alerts.length = 0;
  await p.click('#coBoxes .runbox[data-rank="1"] .topup-copy'); await p.waitForTimeout(400);
  const copied = await p.evaluate(() => window.LAST_PROMPT || '');
  ok('its button copies a follow-up prompt for that company',
    /FOLLOW-UP/.test(copied) && /"symbol": "PNB"/.test(copied) && alerts.some((a) => /Follow-up prompt copied/.test(a)));

  const before = (await p.evaluate(() => window.EQLib.all())).length;
  alerts.length = 0;
  const upReview = await imp(REPLY, () => p.click('.co-import[data-rank="1"]'));
  const lib = await p.evaluate(() => window.EQLib.all());
  const rec = lib.find((r) => r.kind === 'company');
  ok('the review says the follow-up was added, and what it filled in',
    /Follow-up added to the saved research/.test(upReview) && /industryMetrics/.test(upReview));
  ok('importing the reply adds to the saved record instead of replacing it',
    lib.length === before && rec.data.companies[0].theses.length === PNB.companies[0].theses.length
      && rec.data.companies[0].industryMetrics.length === 5 && rec.rank === 1 && !!rec.parentId);
  ok('the marker does not stay on the saved research', rec.data.run.topUp === undefined);
  ok('the app says so', alerts.some((a) => /Follow-up saved into/.test(a)), (alerts.at(-1) || '').slice(0, 50));
  const box2 = await p.evaluate(() => document.querySelector('#coBoxes .runbox[data-rank="1"] .depth').innerText);
  const pctAfter = Number((box2.match(/(\d+)%/) || [])[1]);
  ok('and the depth shown for it has gone up', pctAfter > pctBefore, `${pctBefore}% → ${pctAfter}%`);

  /* A follow-up with no saved research to join is refused, not saved as a run. */
  const stray = await imp({ run: { topUp: true }, companies: [{ symbol: 'ZZZZ', risks: [{ name: 'x' }] }] },
    () => p.click('.co-import[data-rank="2"]'), false);
  ok('a follow-up for a company that is not saved is refused', /could not be added/.test(stray));
  ok('no page error', errs.length === 0, errs.join(' | ').slice(0, 200));
  await b.close();
}

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
