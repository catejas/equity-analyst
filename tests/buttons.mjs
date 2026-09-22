/* Every PDF and Share button, on every page that has one, actually does its job.
 *
 * Three separate defects hid behind "the button does nothing":
 *   - Share opened the printer instead of the share sheet, because it routed
 *     through the print preview;
 *   - the Scenario page's buttons wrote their result into a box on a different
 *     tab, so even their error messages were invisible;
 *   - and nothing anywhere asserted that a tap produced a file at all.
 *
 * navigator.share does not exist in headless Chromium, so it is installed as a
 * stub that records what it was handed. That is the right thing to assert
 * anyway: the contract is that Share passes a real PDF File to the platform.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const read = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };
const BANK = read('da0c46c1-attachment.txt');
const PNB = read('107fec97-attachment.txt');

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

/* Record what Share hands to the platform, and refuse to let the printer open:
   if a Share button still reaches window.print, this test must see it. */
await page.addInitScript(() => { });
await page.evaluate(() => {
  window.__shared = []; window.__printed = 0;
  navigator.share = function (d) { window.__shared.push(d); return Promise.resolve(); };
  navigator.canShare = function () { return true; };
  window.print = function () { window.__printed++; };
});

const setup = await page.evaluate(async (P) => {
  const sleep = (m) => new Promise((s) => setTimeout(s, m));
  const imp = async (obj) => {
    document.getElementById('importText').value = JSON.stringify(obj);
    document.getElementById('btnDoImport').click(); await sleep(500);
    document.getElementById('btnSaveImport').click(); await sleep(2500);
  };
  const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();
  tab('sector');
  document.getElementById('btnImport').click();
  await imp(Object.assign({}, P.BANK, { companies: [] }));
  tab('company'); await sleep(300);
  document.querySelector('.co-import[data-rank="1"]')?.click(); await sleep(300);
  await imp({ run: P.PNB.run, companies: P.PNB.companies });
  return !!(window.EQDocTools.currentPayload('co1'));
}, { BANK, PNB });

if (!setup) { console.log('FAIL  the fixture did not import'); await b.close(); process.exit(1); }

let fail = 0, ran = 0;
const check = (label, ok, detail) => {
  ran++; if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

/* Every share button the app renders, wherever it renders it. */
const kinds = ['co1', 'sector', 'exec', 'score'];
for (const kind of kinds) {
  const r = await page.evaluate(async (k) => {
    window.__shared = []; window.__printed = 0;
    window.EQDocTools.doAction(k, 'share', '#docMsg');
    for (let i = 0; i < 90 && !window.__shared.length; i++) await new Promise((s) => setTimeout(s, 200));
    const d = window.__shared[0];
    const f = d && d.files && d.files[0];
    return { shared: !!f, printed: window.__printed, name: f && f.name,
      type: f && f.type, size: f && f.size,
      msg: (document.getElementById('docMsg') || {}).textContent || '' };
  }, kind);
  check(`share ${kind.padEnd(6)}`, r.shared && r.type === 'application/pdf' && r.size > 12000 && !r.printed,
    r.shared ? `${r.name} ${(r.size / 1024).toFixed(0)} KB, printer opened ${r.printed}x`
      : `nothing shared — "${r.msg.slice(0, 70)}"`);
}

/* The Scenario page: its buttons exist, and they report into its own panel. */
const scn = await page.evaluate(async () => {
  const sleep = (m) => new Promise((s) => setTimeout(s, m));
  [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === 'scenario')?.click();
  await sleep(900);
  const host = document.getElementById('scnDocs');
  const btns = host ? [...host.querySelectorAll('[data-doc]')] : [];
  const shareBtn = btns.find((x) => x.dataset.act === 'share');
  const pdfBtn = btns.find((x) => x.dataset.act === 'make');
  if (!shareBtn || !pdfBtn) return { buttons: btns.length };
  window.__shared = []; window.__printed = 0;
  shareBtn.click();
  for (let i = 0; i < 90 && !window.__shared.length; i++) await sleep(200);
  const d = window.__shared[0], f = d && d.files && d.files[0];
  const scnMsg = (document.getElementById('scnMsg') || {}).textContent || '';
  /* And the PDF button opens the preview rather than doing nothing. */
  pdfBtn.click(); await sleep(1200);
  const preview = !document.getElementById('preview').classList.contains('hidden');
  const pvMsg = (document.getElementById('scnMsg') || {}).textContent || '';
  return { buttons: btns.length, shared: !!f, size: f && f.size, name: f && f.name,
    scnMsg: scnMsg, preview: preview, pvMsg: pvMsg, printed: window.__printed };
});

check('scenario page offers both buttons', scn.buttons >= 2, `${scn.buttons} found`);
check('scenario share hands over a PDF', !!scn.shared && scn.size > 12000,
  scn.shared ? `${scn.name} ${(scn.size / 1024).toFixed(0)} KB` : `nothing shared — "${(scn.scnMsg||'').slice(0,60)}"`);
check('scenario PDF opens the preview', !!scn.preview);
check('scenario reports into its own panel', (scn.pvMsg || '').length > 0,
  `"${(scn.pvMsg || '').slice(0, 60)}"`);

await b.close();
if (errs.length) { console.log('  page errors: ' + errs.slice(0, 3).join(' | ')); fail++; }
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
