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

/* What the contents page says, taken from the finished DOM. The PDF check
   compares its link destinations against this rather than against text scraped
   back out of the PDF: a two-column contents defeats every text extractor,
   which is how a link test came to compare a row's page number with the next
   column's section number and report 42 of 42 wrong. Here the answer is not
   in doubt — the anchor names the section, and the packer has already written
   the page it landed on into the row. */
for (const kind of ['co1', 'sector', 'exec', 'score']) {
  const pv = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await pv.setContent(fs.readFileSync(`/tmp/doc-${kind}.html`, 'utf8'), { waitUntil: 'networkidle' });
  await pv.waitForTimeout(1000);
  const rows = await pv.evaluate(() => {
    const pageOf = new Map();
    document.querySelectorAll('.page').forEach((pg, i) => pageOf.set(pg, i + 1));
    return [...document.querySelectorAll('a[href^="#"]')].map((a) => {
      const target = document.getElementById(a.getAttribute('href').slice(1));
      /* The page cell is addressed by the anchor it belongs to. It is
         usually inside the row's <a>, but not in every builder, so the
         data-for attribute — which the packer writes the page number into —
         is the reliable way to find it. */
      /* The page cell is addressed by the section, but not by the anchor's
         own id: the anchor is "#sec-7" and the cell is data-for="s7". Looking
         it up by the href verbatim found nothing and recorded every printed
         page number as null. */
      const id = a.getAttribute('href').slice(1);
      const no = (/(\d+)$/.exec(id) || [])[1];
      const cell = a.querySelector('.ir-toc-pg')
        || (no && document.querySelector(`.ir-toc-pg[data-for="s${no}"]`))
        || document.querySelector(`.ir-toc-pg[data-for="${id}"]`);
      const r = a.getBoundingClientRect();
      return {
        href: a.getAttribute('href'),
        title: (a.querySelector('b') || a).textContent.trim().slice(0, 60),
        /* What the reader sees at the end of the row. The dedicated cell is
           the usual carrier, but not every builder emits one, so the row's
           own trailing digits are the fallback — that is the number on the
           page either way. */
        /* What the reader sees at the right-hand end of the row. Two
           builders exist: one marks the cell with a class, the other lays the
           row out as four plain spans — section number, title, leader dots,
           page — so the last element is the page number. Reading the row's
           trailing digits instead put "Why This Company Is Barred from the
           Top 3" on page 324, because that title ends in a numeral. */
        printed: (() => {
          const box = cell && cell.textContent.trim() ? cell : a.lastElementChild;
          const t = box ? box.textContent.trim() : '';
          return /^\d{1,3}$/.test(t) ? Number(t) : null;
        })(),
        actual: target ? (pageOf.get(target.closest('.page')) || null) : null,
        x: Math.round(r.left), y: Math.round(r.top),
      };
    }).filter((x) => x.actual !== null);
  });
  await pv.close();
  fs.writeFileSync(`/tmp/toc-${kind}.json`, JSON.stringify(rows));
  console.log(`  wrote /tmp/toc-${kind}.json  ${rows.length} contents links`);
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
