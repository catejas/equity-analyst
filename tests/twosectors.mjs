import { ROOT, REAL } from './_paths.mjs';
/* A second sector study, and every one after it.
 *
 * Tejas: "After Power segment, I tried Chemical segment and segment payload got
 * imported with its Top 3 companies but when I try to import payload of Top 3
 * companies of Chemical segment, it is not saved. ... Also the second segment
 * Top 3 companies doesn't load in scorecard page."
 *
 * Two defects, and neither can appear with one study saved, which is why every
 * earlier test — all of which import one — passed.
 *
 *   The library was one localStorage key holding each record's finished report
 *   beside its payload: 536 KB for a 35 KB payload. Safari allows about 2.5
 *   million characters; one study with three companies is 1.7 million. The
 *   write failed, the failure was swallowed, and the alert said "Saved."
 *
 *   The Score Card built its report from the selected sector and looked in it
 *   for the selected company. Nothing kept the two in step, so a company from
 *   the second study was looked for in the first and the card fell back to
 *   the first study's first company.
 *
 * This drives the real page in a real browser through three studies of three
 * companies each, under a storage ceiling set where Safari's is.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const U = REAL + '/';
const rd = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };
const SEC = rd('da0c46c1-attachment.txt'), CO = rd('107fec97-attachment.txt');

let fail = 0, ran = 0;
const ok = (label, pass, detail) => { ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

import { top3For } from '../src/core/screen.js';

/* Each study is named as the app's own sector list names it, and each company
   reply labels its sector and spells its ticker and name the way research
   tools actually do — which is not the way the screen did. "Banking" against
   "banking" was the one case where the two matched, and the only one any
   earlier test used. */
const STUDIES = [
  ['Power and utilities', 'Thermal generation', [
    ['NTPC', 'NTPC', 'NTPC Limited', 'Power'],
    ['POWERGRID', 'POWERGRID.NS', 'Power Grid Corporation of India Limited', 'Power & Utilities'],
    ['TATAPOWER', 'NSE:TATAPOWER', 'The Tata Power Company Limited', 'Energy']]],
  ['Chemicals', 'Specialty chemicals', [
    ['PIDILITIND', 'PIDILITIND', 'Pidilite Industries Ltd.', 'Specialty Chemicals'],
    ['SRF', 'SRF-EQ', 'SRF Limited', 'Chemical'],
    ['AARTIIND', 'AARTIIND.BO', 'Aarti Industries Ltd', 'Materials']]],
  ['Cement and building materials', 'Cement', [
    ['ULTRACEMCO', 'ULTRACEMCO', 'UltraTech Cement Limited', 'Cement'],
    ['SHREECEM', 'SHREECEM', 'Shree Cement Ltd', 'Building Materials'],
    ['AMBUJACEM', 'AMBUJACEM', 'Ambuja Cements Limited', 'Construction Materials']]],
];
const SCREEN_NAMES = { NTPC: 'NTPC', POWERGRID: 'Power Grid', TATAPOWER: 'Tata Power',
  PIDILITIND: 'Pidilite Industries', SRF: 'SRF', AARTIIND: 'Aarti Industries',
  ULTRACEMCO: 'UltraTech Cement', SHREECEM: 'Shree Cement', AMBUJACEM: 'Ambuja Cements' };
/* The study's shortlist nominates its own three, under the screen's spelling. */
const sector = (name, sub, cos) => { const s = JSON.parse(JSON.stringify(SEC));
  s.run.sector = name; s.run.subSector = sub;
  const top = top3For(s).list.map((x) => x.symbol);
  top.forEach((sym, i) => { const e = s.shortlist.find((x) => x.symbol === sym);
    e.symbol = cos[i][0]; e.name = SCREEN_NAMES[cos[i][0]]; });
  return s; };
const company = (co) => { const c = JSON.parse(JSON.stringify(CO));
  c.run.sector = co[3]; c.run.subSector = null;
  c.companies[0].symbol = co[1]; c.companies[0].name = co[2]; c.companies[0].sector = co[3]; return c; };

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });

async function open(ctx, { noIdb = false, quota = 0 } = {}) {
  const p = await ctx.newPage();
  const alerts = [], errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', async (d) => { alerts.push(d.message()); await d.accept(); });
  await p.addInitScript(({ noIdb, quota }) => {
    if (noIdb) { try { Object.defineProperty(window, 'indexedDB', { value: undefined }); } catch (e) {} }
    if (quota) {
      /* Safari's ceiling: a write that would take the store past it throws. */
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        let total = String(v).length;
        for (let i = 0; i < this.length; i++) { const key = this.key(i);
          if (key !== k) total += (this.getItem(key) || '').length; }
        if (total > quota) { const e = new Error('The quota has been exceeded.');
          e.name = 'QuotaExceededError'; throw e; }
        return real.call(this, k, v);
      };
    }
  }, { noIdb, quota });
  await p.goto('http://127.0.0.1:8848/index.html');
  /* A first visit reloads itself once when the service worker takes over. */
  await p.waitForTimeout(1200);
  await p.waitForFunction(() => window.EQ && window.EQ.buildReport && window.EQLib);
  await p.evaluate(() => window.EQLib.ready);
  await p.waitForTimeout(300);
  return { p, alerts, errs };
}
const tab = (p, t) => p.click(`nav button[data-tab="${t}"]`);
async function imp(p, obj, opener) {
  await opener();
  await p.fill('#importText', JSON.stringify(obj));
  await p.click('#btnDoImport'); await p.waitForTimeout(250);
  await p.click('#btnSaveImport'); await p.waitForTimeout(1200);
}
const lib = (p) => p.evaluate(() => window.EQLib.all());
const card = async (p) => { await tab(p, 'score'); await p.waitForTimeout(250);
  return p.evaluate(() => ({
    doc: (document.querySelector('#scDocName') || {}).textContent || '',
    sheet: (document.querySelector('#sheet') || {}).innerText.slice(0, 160),
    tiles: (document.querySelector('#scTiles') || {}).innerText.replace(/\s+/g, ' ').slice(0, 60),
    picked: (() => { const s = document.querySelector('#scCompany');
      return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent : ''; })(),
    groups: [...document.querySelectorAll('#scCompany optgroup')].map((g) => g.label + ':' + g.children.length),
  })); };

/* ---- 1. three studies, three companies each, in the real store ---- */
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  const { p, alerts, errs } = await open(ctx, { quota: 2500000 });
  ok('the library is in IndexedDB', await p.evaluate(() => window.EQLib.backend()) === 'indexeddb');

  for (const [sec, sub, cos] of STUDIES) {
    await tab(p, 'sector');
    await imp(p, sector(sec, sub, cos), () => p.evaluate(() => document.querySelector('nav button[data-tab="solo"]').click()).then(() => p.click('#btnImport')));
    const afterSector = await card(p);
    ok(`${sec}: with no company in yet, the Score Card says so rather than showing another study's`,
      /none of its Top 3 has been imported/.test(afterSector.sheet), afterSector.sheet.slice(0, 70));
    let rank = 0;
    for (const co of cos) {
      rank++;
      await tab(p, 'company'); await p.waitForTimeout(150);
      const slotName = await p.evaluate((r) => document.querySelector(`#coBoxes .runbox[data-rank="${r}"] h2`).innerText, rank);
      ok(`${sec} #${rank}: the slot names the company the screen nominated`,
        slotName.includes(SCREEN_NAMES[co[0]]), slotName.replace(/\s+/g, ' '));
      await imp(p, company(co), () => p.click(`.co-import[data-rank="${rank}"]`));
      const l = await lib(p);
      const mine = l.find((r) => r.kind === 'company' && r.company === co[2]);
      const parent = mine && l.find((r) => r.id === mine.parentId);
      ok(`  "${co[2]}" (${co[1]}, sector "${co[3]}") is saved under the ${sec} study`,
        !!mine && !!parent && parent.sector === sec && mine.rank === rank,
        mine ? 'parent ' + (parent && parent.sector) : 'not in the library');
      await tab(p, 'company'); await p.waitForTimeout(150);
      const slot = await p.evaluate((r) => { const el = document.querySelector(`#coBoxes .runbox[data-rank="${r}"]`);
        return { done: el.classList.contains('done'), text: el.querySelector('h2').innerText.replace(/\s+/g, ' ') }; }, rank);
      ok(`  and its slot shows it as imported`, slot.done && /imported/.test(slot.text) && slot.text.includes(co[2]), slot.text);
      const c = await card(p);
      ok(`  and the Score Card shows it, in this study`, c.doc.includes(co[2]) && c.doc.includes(sec),
        c.doc || c.sheet.slice(0, 60));
    }
    /* All three are IN the study: none was set aside as belonging elsewhere. */
    const study = await p.evaluate(() => { const seg = segRecord();
      const b = EQ.buildReport(EQ.compose.composePayload(seg.data, coRecords().map((r) => r.data)));
      return { full: b.report.full.map((c) => c.symbol), foreign: (b.report.run.foreignImports || []).length }; });
    ok(`${sec}: all three are in the composed study and none was set aside`,
      study.full.length === 3 && study.foreign === 0, study.full.join(', ') + ' | set aside ' + study.foreign);
  }
  const l = await lib(p);
  ok('all twelve records are there', l.length === 12, l.length + ' records');
  ok('none was stored with a report or the raw paste',
    l.every((r) => !('report' in r) && !('text' in r) && !('warnings' in r)));
  const bytes = JSON.stringify(l).length;
  ok('twelve records take less room than one used to', bytes < 536000, bytes + ' characters');
  ok('nothing is left in localStorage for the library',
    await p.evaluate(() => localStorage.getItem('eq.library')) === null);
  ok('every save reported success and nothing else',
    alerts.length === 12 && alerts.every((a) => /saved/i.test(a) && !/NOT/.test(a)), alerts.length + ' alerts');

  /* ---- 2. moving between studies on the Score Card ---- */
  const pickSector = async (name) => { await tab(p, 'score');
    const id = await p.evaluate((n) => [...document.querySelectorAll('#scSector option')]
      .find((o) => o.textContent.startsWith(n)).value, name);
    await p.selectOption('#scSector', id); await p.waitForTimeout(250); return card(p); };
  for (const [sec, sub, cos] of STUDIES) {
    const c = await pickSector(sec);
    ok(`choosing the ${sec} study shows one of its own companies`,
      cos.some((x) => c.doc.includes(x[2])) && c.doc.includes(sec), c.doc);
    ok(`  and lists its three as its Top 3`, c.groups[0] === `Top 3 of ${sec} \u2014 ${sub}:3`, c.groups[0]);
  }
  /* A company from another study, chosen from the company list, brings its study with it. */
  await pickSector('Cement');
  const srf = await p.evaluate(() => [...document.querySelectorAll('#scCompany option')]
    .find((o) => o.textContent.includes('SRF Limited')).value);
  await p.selectOption('#scCompany', srf); await p.waitForTimeout(250);
  const c2 = await card(p);
  ok('choosing a company from another study switches to that study',
    c2.doc.includes('SRF Limited') && c2.doc.includes('Chemicals'), c2.doc);
  ok('and the sector picker follows',
    (await p.evaluate(() => document.querySelector('#scSector').selectedOptions[0].textContent)).startsWith('Chemicals'));
  /* The report rebuilt on demand is the one that used to be stored. */
  const rebuilt = await p.evaluate(() => { const r = libRead().find((x) => x.kind === 'company');
    return { has: !!r.report, full: r.report && r.report.full && r.report.full.length,
      enumerable: Object.keys(r).includes('report') }; });
  ok('a record still answers for its report, computed rather than stored',
    rebuilt.has && rebuilt.full === 1 && !rebuilt.enumerable, JSON.stringify(rebuilt));

  /* ---- 3. and it is all still there after the app is closed ---- */
  await p.close();
  const again = await open(ctx, { quota: 2500000 });
  const l2 = await lib(again.p);
  ok('after a reload all twelve records are still there', l2.length === 12, l2.length + ' records');
  const c3 = await card(again.p);
  ok('and the Score Card opens on a company of the selected study',
    STUDIES.some(([s, , cs]) => c3.doc.includes(s) && cs.some((x) => c3.doc.includes(x[2]))), c3.doc);
  ok('no page error in the whole run', errs.length === 0 && again.errs.length === 0,
    errs.concat(again.errs).join(' | ').slice(0, 200));
  await ctx.close();
}

/* ---- 4. a library left by an older build is moved across, not lost ---- */
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  const seed = await ctx.newPage();
  await seed.goto('http://127.0.0.1:8848/manifest.webmanifest');
  await seed.evaluate(({ SEC, CO }) => {
    /* The old shape: report, warnings and the raw paste stored on the record. */
    localStorage.setItem('eq.library', JSON.stringify([
      { id: 'r2', ts: 2, kind: 'company', rank: 1, parentId: 'r1', sector: 'Banking', company: 'PNB',
        data: CO, report: { stale: true, pad: 'x'.repeat(5000) }, warnings: ['old'], text: 'raw paste' },
      { id: 'r1', ts: 1, kind: 'sector', rank: 0, parentId: null, sector: 'Banking',
        subSector: 'Public sector banks', data: SEC, report: { stale: true }, partial: true, text: 'raw' },
    ]));
  }, { SEC, CO });
  await seed.close();
  const { p, errs } = await open(ctx);
  const l = await lib(p);
  ok('both old records were carried into the new store', l.length === 2, l.length + ' records');
  ok('their stored reports and raw pastes were dropped on the way',
    l.every((r) => !('report' in r) && !('text' in r)));
  ok('and the old copy was removed once the new one was written',
    await p.evaluate(() => localStorage.getItem('eq.library')) === null);
  const c = await card(p);
  ok('the migrated company scores', /Punjab National Bank|PNB/.test(c.doc), c.doc);
  ok('no page error', errs.length === 0, errs.join(' | ').slice(0, 200));
  await ctx.close();
}

/* ---- 5. where a write really cannot be made, the app says so ---- */
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  const { p, alerts } = await open(ctx, { noIdb: true, quota: 30000 });
  ok('without IndexedDB the library falls back to localStorage',
    await p.evaluate(() => window.EQLib.backend()) === 'localstorage');
  await tab(p, 'sector');
  await imp(p, sector(...STUDIES[0]), () => p.evaluate(() => document.querySelector('nav button[data-tab="solo"]').click()).then(() => p.click('#btnImport')));
  await tab(p, 'company'); await p.waitForTimeout(150);
  alerts.length = 0;
  await imp(p, company(STUDIES[0][2][0]), () => p.click('.co-import[data-rank="1"]'));
  ok('a write that does not fit is reported as not stored',
    alerts.some((a) => /could NOT be stored/.test(a)), (alerts[0] || 'no alert').slice(0, 60));
  ok('and is never followed by "Saved"', !alerts.some((a) => /^Saved\./.test(a)));
  await ctx.close();
}

await b.close();
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
