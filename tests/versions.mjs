import { ROOT, REAL } from './_paths.mjs';
/* Versions and the Update button, in the real app (build 25).
 *
 * Tejas, 19-11-2026: an Update for a saved sector study, its Top 3 and an
 * independently researched company; keep every version; "new Top 3 entrant
 * automatically gets the full research prompt"; and "if I select an older
 * version, the Top 3 in that version must be displayed on the company page".
 *
 * The data:
 *   version 1 of the study — tests/fixtures/psu-banks-3.json, the September
 *     Banking study (its shortlist screens SBI, PNB, Bank of Baroda), with
 *     PNB and SBI imported into their slots;
 *   version 2 — the real 16-11-2026 Banking run with its three top-ups
 *     (tests/fixtures/real), whose screen picks SBI, Bank of India, Canara;
 *   an independent company — PNB as researched on 21-09-2026 (Gemini) and on
 *     16-11-2026 (Claude), both real.
 * The `changes` and `thesisCheck` blocks and the SBI version 2 below are
 * written here for the test, not research: they exist to exercise the
 * routing and the check of the tool's account against the app's numbers. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const rd = (f) => { const t = fs.readFileSync(f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };
const B3 = rd(ROOT + '/tests/fixtures/psu-banks-3.json');
const NOV = rd(REAL + '/banking-psb-merged-16-11-2026.json');
const PNB_SEP = rd(REAL + '/2f13d57b-PNB_gemini-code-1789969768806.json');
const PNB_NOV = rd(REAL + '/pnb-merged-16-11-2026.json');

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };

const v1 = Object.assign({}, JSON.parse(JSON.stringify(B3)), { companies: [] });
const coOf = (sym) => ({ run: JSON.parse(JSON.stringify(B3.run)), companies: [JSON.parse(JSON.stringify(B3.companies.find((c) => c.symbol === sym)))] });

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
const p = await ctx.newPage();
const alerts = [], errs = [];
p.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
p.on('dialog', async (d) => { alerts.push(d.message()); await d.accept(); });
await p.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await p.route('**/api.upstox.com/**', (r) => r.abort('failed'));
await p.goto('http://127.0.0.1:8848/index.html');
await p.waitForTimeout(1200);
await p.waitForFunction(() => window.EQ && window.EQ.update && window.EQLib);
await p.evaluate(() => window.EQLib.ready);
await p.waitForTimeout(300);

const tab = (t) => p.click(`nav button[data-tab="${t}"]`);
async function imp(obj, opener) {
  await opener();
  await p.fill('#importText', JSON.stringify(obj));
  await p.click('#btnDoImport'); await p.waitForTimeout(300);
  await p.click('#btnSaveImport'); await p.waitForTimeout(1300);
}
const lib = () => p.evaluate(() => window.EQLib.all());
const slots = () => p.evaluate(() => [...document.querySelectorAll('#coBoxes .runbox')].map((el) => ({
  rank: Number(el.dataset.rank), text: el.querySelector('h2').innerText.replace(/\s+/g, ' '),
  update: !!el.querySelector('.co-update'), research: !!el.querySelector('.co-search'),
  done: el.classList.contains('done'), note: (el.querySelector('.slotver') || {}).innerText || '',
  docs: [...el.querySelectorAll('.docrow .dn')].map((x) => x.textContent) })));
const heading = () => p.evaluate(() => (document.querySelector('#coBoxes > h2') || {}).innerText || '');

/* ---- version 1 of the study, with two of its Top 3 ---- */
await tab('sector');
await imp(v1, () => p.click('#btnImport'));
await tab('company'); await p.waitForTimeout(200);
let s1 = await slots();
const rankOf = (sl, word) => (sl.find((x) => x.text.includes(word)) || {}).rank;
const pnbRank = rankOf(s1, 'Punjab'), sbiRank = rankOf(s1, 'State Bank');
ok('version 1 screens SBI, PNB and Bank of Baroda', !!pnbRank && !!sbiRank && !!rankOf(s1, 'Baroda'), s1.map((x) => x.text).join(' | '));
await imp(coOf('PNB'), () => p.click(`.co-import[data-rank="${pnbRank}"]`));
await imp(coOf('SBIN'), () => p.click(`.co-import[data-rank="${sbiRank}"]`));
s1 = await slots();
ok('  PNB and SBI are imported into version 1', s1.filter((x) => x.done).length === 2, s1.map((x) => x.text).join(' | '));
ok('  a study with one version offers no version choice', await p.evaluate(() => document.querySelector('#segVer').disabled));
ok('  and no Update Summary yet', await p.evaluate(() => document.querySelector('#segUpdRow').classList.contains('hidden')));

/* ---- Update on the study copies the update brief ---- */
await tab('sector');
await p.click('#btnSegUpdate'); await p.waitForTimeout(300);
const brief = await p.evaluate(() => LAST_PROMPT);
ok('Update copies the update brief, not a blank research prompt', /^UPDATE OF SAVED RESEARCH/.test(brief), brief.slice(0, 40));
ok('  carrying what version 1 said: its Top 3 and every shortlist rating',
  /Top 3 then/.test(brief) && /Punjab National Bank/.test(brief) && /Shortlist ratings then/.test(brief));
const line1 = await p.evaluate(() => recLine(segRecord()));
ok('  and the line the reply must name', brief.includes(JSON.stringify(line1)), line1);
ok('  followed by the full research brief', /BEFORE ANYTHING ELSE: run a web search/.test(brief) && brief.length > 60000, brief.length + ' characters');

/* ---- version 2: the real 16-11 run, as the tool would return it ---- */
const v2 = JSON.parse(JSON.stringify(NOV));
v2.run.update = { line: line1, previousAsOf: '2026-09-21', previousVersion: 1 };
v2.changes = [
  { area: 'macro', item: 'Policy rate', previous: '6.50% (Q1 FY27)', current: '5.50% (MPC 7 Oct 2026)', direction: 'neutral', significance: 'high',
    why: 'A 25bp hike on 7 Oct after two years of cuts; repo-linked loans reprice first.', source: 'RBI', date: '07-10-2026' },
  { area: 'macro', item: 'Inflation', previous: '4.5%', current: '7.0%', direction: 'worse', significance: 'high',
    why: 'Oil shock.', source: 'MoSPI', date: '12-11-2026' },
  { area: 'top3', item: 'Punjab National Bank', previous: 'rank 1', current: 'rank 7', direction: 'worse', significance: 'high',
    why: 'Growth and quality ratings cut on Q2 FY27 numbers.', source: 'PNB Q2 FY27 results', date: '16-10-2026' } ];
alerts.length = 0;
await tab('sector');
await imp(v2, () => p.click('#btnImport'));
let L = await lib();
const secs = L.filter((r) => r.kind !== 'company');
ok('version 2 is saved beside version 1, not over it', secs.length === 2, secs.length + ' sector records');
ok('  both in one line', await p.evaluate(() => { const s = sectorRecords(); return s.length === 2 && recLine(s[0]) === recLine(s[1]); }));
ok('  and version 1 keeps its two companies', L.filter((r) => r.kind === 'company' && r.parentId === secs.find((x) => x.data.run.generatedAt.startsWith('2026-09')).id).length === 2);
ok('  the save says which slots carry research and which are new',
  alerts.some((a) => /Saved as version 2/.test(a) && /press Update/.test(a) && /press Research for the full prompt/.test(a)), (alerts[0] || '').slice(0, 160));

await tab('company'); await p.waitForTimeout(250);
let s2 = await slots();
ok('the Company page now shows version 2’s Top 3: SBI, Bank of India, Canara',
  /State Bank/.test(s2[0].text) && /Bank of India/.test(s2[1].text) && /Canara/.test(s2[2].text), s2.map((x) => x.text).join(' | '));
ok('  its heading says which version', /version 2 of 2/.test(await heading()), await heading());
const sbi2 = s2.find((x) => /State Bank/.test(x.text));
ok('  SBI, researched under version 1, offers Update', sbi2.update && !sbi2.research && /update due/.test(sbi2.text), sbi2.text);
ok('  and says when it was researched', /under version 1/.test(sbi2.note), sbi2.note);
const fresh = s2.filter((x) => !/State Bank/.test(x.text));
ok('  the two new entrants get the full Research prompt instead', fresh.every((x) => x.research && !x.update && /new entrant/.test(x.text)),
  fresh.map((x) => x.text).join(' | '));

await p.click(`.co-search[data-rank="${fresh[0].rank}"]`); await p.waitForTimeout(300);
const full = await p.evaluate(() => LAST_PROMPT);
ok('  and Research on a new entrant copies the full research prompt', /^BEFORE ANYTHING ELSE/.test(full) && !/UPDATE OF SAVED/.test(full.slice(0, 200)));
await p.click(`.co-update[data-rank="${sbi2.rank}"]`); await p.waitForTimeout(300);
const coBrief = await p.evaluate(() => LAST_PROMPT);
ok('  while Update on SBI copies a company update brief', /^UPDATE OF SAVED RESEARCH/.test(coBrief) && /State Bank of India/.test(coBrief)
  && /"thesisCheck"/.test(coBrief) && /"line": "T\|/.test(coBrief));

/* ---- the SBI update comes back through the sector page's Import button ---- */
const sbiUp = coOf('SBIN');
sbiUp.run = JSON.parse(JSON.stringify(NOV.run));
sbiUp.run.update = { line: (coBrief.match(/"line": "(T\|[^"]+)"/) || [])[1], previousAsOf: '2026-09-21', previousVersion: 1 };
sbiUp.companies[0].valuation.currentPrice = Math.round(sbiUp.companies[0].valuation.currentPrice * 1.12 * 100) / 100;
await tab('sector');
await imp(sbiUp, () => p.click('#btnImport'));
await tab('company'); await p.waitForTimeout(250);
s2 = await slots();
const sbiNow = s2.find((x) => /State Bank/.test(x.text));
ok('an update reply goes to its own slot whichever Import was pressed', sbiNow.done && /imported/.test(sbiNow.text), sbiNow.text);
ok('  as version 2 of SBI, with an Update Summary among its documents', sbiNow.docs.includes('Update Summary'), sbiNow.docs.join(', '));
L = await lib();
ok('  and the sector study did not gain a stray version', L.filter((r) => r.kind !== 'company').length === 2);

/* ---- an older version brings back its own Top 3 ---- */
await tab('sector');
const v1id = await p.evaluate(() => sectorRecords().sort((a, b) => a.ts - b.ts)[0].id);
await p.selectOption('#segVer', v1id); await p.waitForTimeout(300);
await tab('company'); await p.waitForTimeout(250);
const sOld = await slots();
ok('choosing version 1 shows version 1’s Top 3 on the Company page: SBI, PNB, Bank of Baroda',
  sOld.some((x) => /Punjab/.test(x.text)) && sOld.some((x) => /Baroda/.test(x.text)) && sOld.some((x) => /State Bank/.test(x.text)),
  sOld.map((x) => x.text).join(' | '));
ok('  with the research imported under it', sOld.filter((x) => x.done).length === 2);
ok('  and the heading says it is the older version', /version 1 of 2/.test(await heading()) && /older version/.test(await heading()), await heading());
const docsOld = await p.evaluate(() => { const pl = window.EQDocTools.currentPayload('sector');
  return pl ? pl.report.full.map((c) => c.symbol) : []; });
ok('  and its sector documents are built from version 1 and its companies', docsOld.includes('PNB') && docsOld.includes('SBIN'), docsOld.join(', '));
await tab('sector');
const v2id = await p.evaluate(() => sectorRecords().sort((a, b) => b.ts - a.ts)[0].id);
await p.selectOption('#segVer', v2id); await p.waitForTimeout(300);

/* ---- the Update Summary for the study ---- */
ok('the Sector page offers the Update Summary', await p.evaluate(() => !document.querySelector('#segUpdRow').classList.contains('hidden')));
async function readDoc(kind) {
  const html = await p.evaluate((k) => { const pl = window.EQDocTools.currentPayload(k); return pl ? window.EQDocTools.buildHTML(pl, k, 'en') : ''; }, kind);
  if (!html) return { html: '', text: '' };
  const q = await ctx.newPage();
  const qe = [];
  q.on('pageerror', (e) => qe.push(e.message));
  await q.setViewportSize({ width: 1000, height: 1400 });
  await q.setContent(html, { waitUntil: 'networkidle' });
  await q.waitForTimeout(900);
  const r = await q.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')].filter((pg) => pg.innerText.trim().length > 40);
    return { text: document.body.innerText, pages: pages.length,
      over: pages.filter((pg) => { const bx = pg.querySelector('.ir-box'); return bx && bx.scrollHeight > bx.clientHeight + 2; }).length,
      foot: pages.every((pg) => pg.querySelector('.rfn') && /SEBI/.test(pg.querySelector('.rfn').textContent)),
      wmm: Math.round(document.querySelector('.page').getBoundingClientRect().width / 96 * 25.4) };
  });
  await q.close();
  return Object.assign(r, { html, errs: qe });
}
const sd = await readDoc('sector:update');
ok('it builds', sd.html.length > 5000, sd.html.length + ' characters');
ok('  names who entered and who left the Top 3', /Bank of India[\s\S]{0,80}Entered|Entered[\s\S]{0,80}Bank of India/.test(sd.text) && /Left/.test(sd.text) && /Punjab National Bank/.test(sd.text));
ok('  sets the macro readings side by side, on one scale', /Policy rate[\s\S]{0,60}6\.50%[\s\S]{0,80}5\.50%/.test(sd.text), (sd.text.match(/Policy rate[^\n]*/) || [''])[0]);
ok('  and checks the tool’s account against the numbers: inflation differs', /Inflation[\s\S]{0,400}Differs/.test(sd.text));
ok('  while the policy rate agrees', /Policy rate[\s\S]{0,400}Agrees/.test(sd.text));
ok('  states that market shares were measured differently', /measure share differently/.test(sd.text));
ok('  on A4, every page with the footnote, nothing overflowing', sd.wmm === 210 && sd.foot && sd.over === 0, `${sd.wmm}mm, ${sd.pages} pages, overflow ${sd.over}`);
ok('  with no code reaching the page', !/\bundefined\b|\bNaN\b|\[object Object\]/.test(sd.text) && !sd.errs.length, sd.errs.join('; '));

/* ---- an independent company, two real versions ---- */
alerts.length = 0;
await tab('company'); await p.waitForTimeout(150);
await imp(PNB_SEP, () => p.click('#btnSoloImport'));
const soloLine = await p.evaluate(() => recLine(soloRecord()));
await p.click('#btnSoloUpdate'); await p.waitForTimeout(300);
const soloBrief = await p.evaluate(() => LAST_PROMPT);
ok('Update on an independent company copies its update brief', /^UPDATE OF SAVED RESEARCH/.test(soloBrief)
  && /Share price \(21-09-2026\): 117\.39/.test(soloBrief) && soloBrief.includes(JSON.stringify(soloLine)), soloLine);
const nov = JSON.parse(JSON.stringify(PNB_NOV));
nov.run.update = { line: soloLine, previousAsOf: '2026-09-21', previousVersion: 1 };
nov.thesisCheck = [{ thesis: 'Asset quality keeps improving', status: 'holds', evidence: 'GNPA 2.55% in Q2 FY27' },
  { thesis: 'Valuation re-rates toward 1.2x book', status: 'broken', evidence: 'The price has run past the base-case value' }];
nov.changes = [{ area: 'price', item: 'Share price', previous: '117.39', current: '141.79', direction: 'neutral', significance: 'high',
  why: 'Re-rating after Q2.', source: 'NSE', date: '12-11-2026' },
  { area: 'valuation', item: 'Base case fair value', previous: '145', current: '150', direction: 'better', significance: 'medium', why: 'test', source: 'model', date: '16-11-2026' }];
await tab('sector');
await imp(nov, () => p.click('#btnImport'));
await tab('company'); await p.waitForTimeout(250);
const sv = await p.evaluate(() => ({ n: versionsOf(soloRecord()).length, opts: [...document.querySelectorAll('#soloVer option')].map((o) => o.textContent),
  dis: document.querySelector('#soloVer').disabled, docs: [...document.querySelectorAll('#soloDocs .dn')].map((x) => x.textContent),
  picks: document.querySelectorAll('#soloPick option').length }));
ok('the independent company now has two versions, one entry in its picker', sv.n === 2 && sv.picks === 1 && !sv.dis, JSON.stringify(sv.opts));
ok('  and an Update Summary among its documents', sv.docs.includes('Update Summary'));
const cd = await readDoc('solo:update');
ok('its Update Summary builds', cd.html.length > 5000);
ok('  price then and now, from the two payloads', /117\.39/.test(cd.text) && /141\.79/.test(cd.text));
ok('  the score moved, said in words', /Overall score fell from 72\.1 to 58\.7/.test(cd.text), (cd.text.match(/Overall score fell[^\n]*/) || [''])[0]);
ok('  consolidated against standalone is called a change of basis, not a fall', /Basis changed/.test(cd.text) && /different perimeters/.test(cd.text));
ok('  the thesis check is printed', /Broken/.test(cd.text) && /Holds/.test(cd.text));
ok('  and the tool’s fair-value claim is checked: it differs from the saved 129', /Base case fair value[\s\S]{0,300}Differs[\s\S]{0,120}129/.test(cd.text));
ok('  on A4, footnote on every page, nothing overflowing', cd.wmm === 210 && cd.foot && cd.over === 0, `${cd.pages} pages, overflow ${cd.over}`);
ok('  with no code reaching the page', !/\bundefined\b|\bNaN\b|\[object Object\]/.test(cd.text) && !cd.errs.length, cd.errs.join('; '));

/* ---- the same reply twice is not a third version ---- */
alerts.length = 0;
await tab('sector');
await imp(nov, () => p.click('#btnImport'));
ok('the identical reply pasted again is refused, not saved as version 3',
  await p.evaluate(() => versionsOf(soloRecord()).length) === 2 && alerts.some((a) => /already saved/.test(a)), alerts[0]);

/* ---- how current each saved version is ---- */
await tab('company'); await p.waitForTimeout(200);
const age = await p.evaluate(() => ({ solo: (document.querySelector('#soloAge') || {}).innerText || '' }));
ok('each saved version says how old it is and whether an update is due', /Researched \d\d-\d\d-\d{4}/.test(age.solo), age.solo.replace(/\s+/g, ' ').slice(0, 90));

ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
await b.close();
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
