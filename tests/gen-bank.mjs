/* The real case Tejas reported: a Banking sector run whose screen nominates
   SBI, Indian Bank and Bank of Maharashtra, with PNB researched in full but
   not among the three. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const read = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };
const BANK = read('da0c46c1-attachment.txt');
const PNB = read('107fec97-attachment.txt');

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('APP ERR', e.message.split('\n')[0]));
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const ok = await page.evaluate(async (P) => {
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
  await imp({ run: P.BANK.run, companies: P.PNB.companies });
  const p = window.EQDocTools.currentPayload('sector');
  return !!(p && p.report && p.report.screen);
}, { BANK, PNB });

if (!ok) { console.log('FAIL  no screen on the composed run'); await b.close(); process.exit(1); }

for (const kind of ['sector', 'exec', 'co1']) {
  const html = await page.evaluate((k) => {
    const p = window.EQDocTools.currentPayload(k);
    return p ? window.EQDocTools.buildHTML(p, k, 'en') : '';
  }, kind);
  fs.writeFileSync(`/tmp/bank-${kind}.html`, html);
  console.log(`  wrote /tmp/bank-${kind}.html  ${(html.length / 1024).toFixed(0)} KB`);
}
await b.close();
console.log('PASS');
