/* The sector's documents are built from the sector run, and only from it.
 *
 * Tejas, 19 Nov 2026: "I generated Banking Sector report but it got mixed with
 * JP Power Independent company search ... Fix this for Sector Report and
 * Sector Executive summary report both."
 *
 * The run was chosen from the selected company first. An independently
 * researched company — the newest import, or the one last picked on the Score
 * page — replaced the whole sector run, while the title, header and date still
 * came from the selected sector study. Reproduced here exactly: a Banking study
 * with PNB as its #1, then Reliance researched independently and selected. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null ? '  — ' + d : ''}`); };
const load = (f) => { const t = fs.readFileSync(f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };
const bank = load('tests/fixtures/psu.json');
const ril = load('tests/fixtures/ril.json');
const sectorOnly = Object.assign({}, bank, { companies: [] });
const pnb = { run: bank.run, companies: [bank.companies[0]] };
const solo = { run: Object.assign({}, ril.run, { top3: undefined }), companies: [ril.companies[0]] };

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage();
await page.route(/frankfurter|currency-api|fawazahmed0/, (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.waitForFunction(() => window.EQ && window.EQDocTools, null, { timeout: 15000 });
const out = await page.evaluate(async ([sec, co, so]) => {
  const wait = (ms) => new Promise((s) => setTimeout(s, ms));
  const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();
  const imp = async (obj) => {
    document.getElementById('importText').value = JSON.stringify(obj);
    document.getElementById('btnDoImport').click(); await wait(500);
    document.getElementById('btnSaveImport').click(); await wait(1500);
  };
  tab('sector'); document.getElementById('btnImport').click(); await imp(sec);
  tab('company'); await wait(300);
  document.querySelector('.co-import[data-rank="1"]').click(); await wait(300); await imp(co);
  document.getElementById('btnSoloImport').click(); await wait(300); await imp(so);
  /* Pick the independent company on the Score page, as a user would. */
  tab('score'); await wait(400);
  const sel = document.getElementById('scCompany');
  const o = [...sel.options].find((x) => /Reliance/i.test(x.textContent));
  if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  await wait(400);
  const text = (k) => {
    const p = window.EQDocTools.currentPayload(k);
    if (!p) return '';
    const h = window.EQDocTools.buildHTML(p, k, 'en');
    return new DOMParser().parseFromString(h, 'text/html').body.textContent;
  };
  const sector = text('sector'), exec = text('exec');
  /* And the independent company's own documents still build from its own run. */
  const soloHtml = text('solo:report');
  return { picked: !!o, sector, exec, soloHtml };
}, [sectorOnly, pnb, solo]);
await b.close();

ok('the independent company was selected on the Score page', out.picked);
ok('the sector report is about the Banking study', /Punjab National Bank|PNB/.test(out.sector));
ok('the sector report has nothing of the independent company in it', !/Reliance Industries|RELIANCE/.test(out.sector),
  (out.sector.match(/.{40}(Reliance Industries|RELIANCE).{40}/) || [''])[0]);
ok('the sector executive summary is about the Banking study', /Punjab National Bank|PNB/.test(out.exec));
ok('the sector executive summary has nothing of the independent company in it', !/Reliance Industries|RELIANCE/.test(out.exec),
  (out.exec.match(/.{40}(Reliance Industries|RELIANCE).{40}/) || [''])[0]);
ok('the independent company\'s own report is still about it', /Reliance/i.test(out.soloHtml) && !/Punjab National Bank/.test(out.soloHtml.slice(0, 3000)));
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
