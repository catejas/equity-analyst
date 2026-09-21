/* Write the document fixtures the layout tests measure.
 *
 * The old generator ran under jsdom, which has no layout engine at all: it can
 * produce the HTML but every width, height and overflow it reports is zero.
 * Fixtures for a LAYOUT test have to come from something that lays out, so
 * this builds them through the real application in Chromium, by the same
 * two-step import a person performs.
 *
 * Usage:  node tests/gen-fixtures.mjs [payload.json]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const SRC = process.argv[2] || (U + '944cc4df-attachment.txt');
const raw = fs.readFileSync(SRC, 'utf8');
const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
/* Upstox works on the real device — Tejas verified 105 bars — so the fixtures
   are built with a price series present. Building them without one meant the
   tear sheet's price chart and the P/E bands were never exercised by any
   layout test. The exchange master stays blocked, because it is blocked for
   real. */
const candles = [];
{
  const t0 = Date.parse('2026-07-20T00:00:00+05:30');
  for (let i = 0; i < 105; i++) {
    const d = new Date(t0 - i * 7 * 86400000).toISOString();
    const c = 110 * (1 - i * 0.003) * (1 + Math.sin(i / 7) * 0.04);
    candles.push([d, c * 0.99, c * 1.02, c * 0.97, c, 3.5e7, 0]);
  }
}
await page.route('**/data/nse-instruments.json', (r) => r.abort('failed'));
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await page.route('**/api.upstox.com/**', (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify({ status: 'success', data: { candles } }) }));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const ready = await page.evaluate(async (j) => {
  const full = JSON.parse(j);
  const co = full.companies[0];
  const sectorOnly = Object.assign({}, full, { companies: [] });
  const imp = async (obj) => {
    document.getElementById('importText').value = JSON.stringify(obj);
    document.getElementById('btnDoImport').click();
    await new Promise((s) => setTimeout(s, 500));
    document.getElementById('btnSaveImport').click();
    await new Promise((s) => setTimeout(s, 3000));
  };
  const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();
  tab('sector');
  document.getElementById('btnImport').click();
  await imp(sectorOnly);
  tab('company');
  await new Promise((s) => setTimeout(s, 300));
  document.querySelector('.co-import[data-rank="1"]')?.click();
  await new Promise((s) => setTimeout(s, 300));
  await imp({ run: sectorOnly.run, companies: [co] });
  const p = window.EQDocTools.currentPayload();
  return !!(p && (p.report.full || []).length);
}, json);

if (!ready) {
  console.log('FAIL  the fixture payload did not import — every document below would be empty');
  await b.close();
  process.exit(1);
}

for (const kind of ['co1', 'co2', 'co3', 'sector', 'exec', 'score']) {
  const html = await page.evaluate((k) => {
    try {
      const p = window.EQDocTools.currentPayload(k);
      return p ? window.EQDocTools.buildHTML(p, k, 'en') : '';
    } catch (e) { return 'ERR ' + e.message; }
  }, kind);
  if (!html || html.startsWith('ERR') || html.length < 5000) {
    console.log(`FAIL  ${kind}: ${html ? html.slice(0, 90) : 'empty'}`);
    await b.close();
    process.exit(1);
  }
  fs.writeFileSync(`/tmp/doc-${kind}.html`, html);
  console.log(`  wrote /tmp/doc-${kind}.html  ${(html.length / 1024).toFixed(0)} KB`);
}

/* And the printed PDF, which toclinks.py reads. Printing is the only way to
   see what the link annotations and the destination table actually contain —
   the DOM says nothing about either. */
{
  const pp = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await pp.setContent(fs.readFileSync('/tmp/doc-co1.html', 'utf8'), { waitUntil: 'networkidle' });
  await pp.waitForTimeout(1200);
  await pp.pdf({ path: '/tmp/toc-plain.pdf', printBackground: true, preferCSSPageSize: true });
  await pp.close();
  console.log('  wrote /tmp/toc-plain.pdf');
}

if (errs.length) console.log('  page errors: ' + errs.slice(0, 3).join(' | '));
await b.close();
console.log(errs.length ? '\nFAIL' : '\nPASS');
process.exit(errs.length ? 1 : 0);
