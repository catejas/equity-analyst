import { REAL } from './_paths.mjs';
/* Build 27, from Tejas's review of build 26 (22-11-2026).
 *
 * 1. Global past growth is asked over 5, 3 and 1 year. The Banking study of
 *    16-11-2026 could establish only the five-year rate; the depth check asked
 *    for 15-, 10- and 3-year rates on every follow-up, and the research tool
 *    said three times that no consistent series reaches back that far. Ten-
 *    and fifteen-year rates are no longer asked for, scored or printed.
 * 2. The Company page frames the AI tool buttons and the Import paste box in
 *    gold, exactly as the Sector page does. */
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { completeness, topUpPrompt } from '../src/core/completeness.js';
import { buildResearchPrompt } from '../src/core/prompt-builder.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const bank = JSON.parse(fs.readFileSync(REAL + '/banking-psb-merged-16-11-2026.json', 'utf8'));

const growthCheck = (pl) => completeness(pl).sections.flatMap((s) => s.checks || [])
  .find((c) => /^Global growth over/.test(c.label));

console.log('\nGlobal growth: 5, 3 and 1 year');
const g0 = growthCheck(bank);
ok('the check is named for 5, 3 and 1 year', g0 && g0.label === 'Global growth over 5, 3 and 1 year', g0 && g0.label);
ok('it wants three figures, not four', g0 && g0.want === 3, g0 && g0.want);
ok('the real Banking study (five-year rate only) has 1 of 3', g0 && g0.have === 1, g0 && `${g0.have}/${g0.want}`);
ok('it no longer asks for y15 or y10', g0 && !/y15|y10/.test(g0.ask + ' ' + g0.detail), g0 && g0.detail);
ok('it asks for y3 and y1', g0 && /y3/.test(g0.ask) && /y1/.test(g0.ask));

const full = JSON.parse(JSON.stringify(bank));
full.global.cagr = { y5: 4.3, y3: 5.1, y1: 6.0 };
const g1 = growthCheck(full);
ok('5, 3 and 1 year filled closes the check without 10 or 15', g1 && g1.ok, g1 && `${g1.have}/${g1.want}`);
const fu = topUpPrompt(full) || '';
ok('the follow-up no longer mentions global growth once it is filled', !/global\.cagr/.test(fu));
ok('the follow-up never asks for y15 or y10', !/y15|y10/.test(topUpPrompt(bank) || ''));

const rp = buildResearchPrompt({ sector: 'Banking', subSector: 'Public Sector Banks', mode: 'sector', horizon: '3-5' }) || '';
const rps = typeof rp === 'string' ? rp : JSON.stringify(rp);
ok('the research prompt template carries y5, y3 and y1', /"cagr": \{ "y5": 0, "y3": 0, "y1": 0 \}/.test(rps));
ok('the research prompt template no longer carries y15 or y10', !/"y15"|"y10"/.test(rps));
ok('the research prompt says not to give 10- or 15-year rates', /Do NOT give ten- or fifteen-year rates/.test(rps));

/* ---- in the browser: the world table and the gold frames ---- */
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
/* The service worker takes control on first load and the app reloads once;
   wait that out so the page under test is the one that stays. */
await page.waitForTimeout(2500);
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => window.EQ && window.EQ.buildPrompt && window.EQDocs, null, { timeout: 15000 });
await page.waitForTimeout(500);
await page.evaluate(() => {
  /* Copying needs a user gesture headless Chrome does not give. */
  navigator.clipboard.writeText = () => Promise.resolve();
});

console.log('\nThe world table');
const world = await page.evaluate((pl) => {
  const p = JSON.parse(JSON.stringify(pl));
  p.global.cagr = { y15: 9.9, y10: 8.8, y5: 4.3, y3: 5.1, y1: 6.0 };
  const built = window.EQ.buildReport(p);
  if (!built || !built.ok) return null;
  const h = window.EQDocs.buildSector({ meta: {}, report: built.report, warnings: built.warnings || [] }, 'en');
  const html = typeof h === 'string' ? h : (h && (h.html || h.body)) || '';
  /* Only the world section: from its heading to the next one. */
  const i = html.indexOf('Past growth');
  return i < 0 ? null : html.slice(i, i + 20000);
}, bank);
if (world == null) {
  ok('the world section can be rendered for the check', false, 'The world section not found');
} else {
  const txt = world.replace(/<[^>]+>/g, ' ');
  ok('past growth reads over 5 years, over 3 years and in the latest year',
    /4\.3% over 5 years/.test(txt) && /5\.1% over 3 years/.test(txt) && /6\.0% in the latest year/.test(txt), txt.match(/Past growth[^|]{0,120}/)?.[0]);
  ok('a 10- or 15-year rate in older research is not printed', !/over 15 years|over 10 years|8\.8%|9\.9%/.test(txt));
}

console.log('\nCompany page: gold frames');
const ui = await page.evaluate(async () => {
  const sleep = (m) => new Promise((s) => setTimeout(s, m));
  const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();
  tab('company'); await sleep(300);
  const box = document.getElementById('soloCo'); if (box) box.value = 'State Bank of India';
  document.getElementById('btnSoloSearch').click(); await sleep(800);
  const row = document.getElementById('toolRowCo');
  const cs = getComputedStyle(row);
  const btn = getComputedStyle(row.querySelector('.btn'));
  const hint = (document.getElementById('toolHintCo') || {}).textContent || '';
  document.getElementById('btnSoloImport').click(); await sleep(400);
  const ta = document.getElementById('importText');
  const tcs = getComputedStyle(ta);
  const r = {
    armed: row.classList.contains('armed'), outline: cs.outlineStyle + ' ' + cs.outlineWidth,
    outlineColor: cs.outlineColor, btnBorder: btn.borderTopColor, hint,
    taArmed: ta.classList.contains('armed'), taBorder: tcs.borderTopColor, taFocused: document.activeElement === ta,
  };
  document.getElementById('btnCancelImport').click(); await sleep(200);
  r.taCleared = !ta.classList.contains('armed');
  /* And the Sector page still does the same. */
  tab('sector'); await sleep(300);
  document.getElementById('btnImport').click(); await sleep(300);
  r.secArmed = ta.classList.contains('armed');
  r.secBorder = getComputedStyle(ta).borderTopColor;
  r.sectorRow = document.getElementById('toolRow').classList.contains('armed');
  return r;
});
const gold = (c) => /rgb\(\s*2[3-5]\d,\s*1[6-9]\d,\s*[0-9]{1,2}\)/.test(c);
ok('Research on the Company page arms its tool row', ui.armed);
ok('the Company tool row is framed in gold', /solid 2px/.test(ui.outline) && gold(ui.outlineColor), `${ui.outline} ${ui.outlineColor}`);
ok('its four buttons carry the gold border', gold(ui.btnBorder), ui.btnBorder);
ok('the Company hint says the prompt is copied', /prompt is copied/.test(ui.hint), ui.hint);
ok('Import on the Company page frames the paste box in gold', ui.taArmed && gold(ui.taBorder), ui.taBorder);
ok('and puts the cursor in it', ui.taFocused);
ok('Cancel takes the frame off', ui.taCleared);
ok('Import on the Sector page frames the same box in gold', ui.secArmed && gold(ui.secBorder), ui.secBorder);
ok('the Sector tool row is armed by the same Research press', ui.sectorRow);
ok('no script errors', errs.length === 0, errs.join(' | '));

await b.close();
console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
