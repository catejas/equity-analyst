/* The rupee rate, checked by the app itself when a sector study is saved.
 *
 * The rate source is answered by a stub (the workspace cannot reach it), the
 * sector study is imported and saved through the real buttons, and the saved
 * record and the printed macro table are read back. A second run with every
 * source failing checks the other half: the tool's figure is printed as
 * unchecked, in red, with the reason. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null ? '  — ' + d : ''}`); };
const raw = fs.readFileSync('tests/fixtures/psu.json', 'utf8');
const full = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const sectorOnly = Object.assign({}, full, { companies: [] });

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
async function run(answer) {
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const asked = [];
  await page.route(/frankfurter|currency-api|fawazahmed0/, (r) => {
    asked.push(r.request().url());
    return answer ? r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ amount: 1, base: 'USD', date: answer.date, rates: { INR: answer.rate } }) })
      : r.abort('failed');
  });
  await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
  /* The service worker reloads the page once on a first visit. */
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => window.EQ && window.EQ.fx, null, { timeout: 15000 });
  const rec = await page.evaluate(async (j) => {
    const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();
    tab('sector'); document.getElementById('btnImport').click();
    document.getElementById('importText').value = j;
    document.getElementById('btnDoImport').click();
    await new Promise((s) => setTimeout(s, 500));
    document.getElementById('btnSaveImport').click();
    await new Promise((s) => setTimeout(s, 4000));
    const lib = window.EQLib.all();
    const r = lib.find((x) => x.data && x.data.macro);
    return r ? { cur: r.data.macro.currency, chk: r.data.macro.currencyCheck || null, ts: r.ts } : null;
  }, JSON.stringify(sectorOnly));
  const row = await page.evaluate(() => {
    try {
      const p = window.EQDocTools.currentPayload('sector');
      const h = p ? window.EQDocTools.buildHTML(p, 'sector', 'en') : '';
      const d = new DOMParser().parseFromString(h, 'text/html');
      const tr = [...d.querySelectorAll('tr')].find((x) => /Rupee against the dollar/.test(x.textContent));
      const note = [...d.querySelectorAll('div.mut')].find((x) => /rupee/i.test(x.textContent) && /rate/.test(x.textContent));
      return (tr ? tr.textContent.replace(/\s+/g, ' ') : '') + ' || ' + (note ? note.textContent.replace(/\s+/g, ' ') : '');
    } catch (e) { return 'ERR ' + e.message; }
  });
  await ctx.close();
  return { rec, asked, row };
}

const today = new Date().toISOString().slice(0, 10);
{
  const r = await run({ date: today, rate: 94.1997 });
  ok('the app asks a rate source for the day the study is saved', r.asked.some((u) => u.includes(today)), r.asked[0]);
  ok('the saved study carries the checked rate', r.rec && r.rec.cur.value === 94.1997, r.rec && r.rec.cur.value);
  ok('marked verified, dated as the day, with its source',
    r.rec && r.rec.cur.verified && /\d\d-\d\d-\d{4}/.test(r.rec.cur.period) && /Central Bank/.test(r.rec.cur.source),
    r.rec && r.rec.cur.period);
  ok('the research tool\'s 83.50 is kept beside it, not lost', r.rec && r.rec.cur.stated && r.rec.cur.stated.value === 83.5);
  ok('the report prints the checked rate with its date', /94\.1997/.test(r.row) && /checked/.test(r.row), r.row.slice(0, 120));
  ok('and says what it replaced', /had written 83\.50/.test(r.row), r.row.slice(r.row.indexOf('||'), r.row.indexOf('||') + 160));
}
{
  const r = await run(null);
  ok('with every source down the study is still saved', !!r.rec);
  ok('the tool\'s rate is kept but not marked verified', r.rec && r.rec.cur.value === 83.5 && !r.rec.cur.verified);
  ok('and the failed check is recorded so the report can say so', r.rec && r.rec.chk && r.rec.chk.failed === true);
  ok('the report marks the rate not checked', /not checked/.test(r.row) && /could not be checked/.test(r.row), r.row.slice(0, 120));
}
await b.close();
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
