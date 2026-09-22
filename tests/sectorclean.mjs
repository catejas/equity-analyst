/* The sector study must be about the sector, and only about it.
 *
 * Tejas: "Sector Research Report is completely mess with Sector and unrelated
 * Company." The evidence was a document whose running header read BANKING —
 * PUBLIC SECTOR BANKS while its own title block read "Aviation — Airlines",
 * with one company analysed. He had built a company prompt while the Banking
 * run was selected; the AI answered for SpiceJet and stamped its own run block
 * with sector "Aviation". Importing that reply into a company slot let the
 * company's run block decide what the sector document said it was about.
 *
 * This reproduces that exact sequence from the three payloads he sent and
 * asserts the sector document can only ever describe the sector run.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const read = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };
const BANK = read('da0c46c1-attachment.txt');     /* Banking / Public sector banks */
const PNB = read('107fec97-attachment.txt');      /* PNB, a real PSB */
const SPICE = read('ffcba469-attachment.txt');    /* SpiceJet, run says Aviation */

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
page.on('dialog', (d) => d.accept());
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const out = await page.evaluate(async (P) => {
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

  /* The contaminating step: a company reply whose run block names a different
     sector, imported into rank 2 of the Banking run. */
  document.querySelector('.co-import[data-rank="2"]')?.click(); await sleep(300);
  await imp({ run: P.SPICE.run, companies: P.SPICE.companies });

  const p = window.EQDocTools.currentPayload('sector');
  const html = p ? window.EQDocTools.buildHTML(p, 'sector', 'en') : '';
  return {
    metaSector: p && p.meta && p.meta.sector,
    metaSub: p && p.meta && p.meta.subSector,
    runSector: p && p.report && p.report.run && p.report.run.sector,
    runSub: p && p.report && p.report.run && p.report.run.subSector,
    names: (p && p.report && p.report.full || []).map((c) => c.symbol || c.name),
    foreign: (p && p.report && p.report.run && p.report.run.foreignImports || []).map((x) => x.symbol),
    /* The document may name the rejected company once, inside the notice that
       explains why it was rejected — and nowhere else. Strip the notices, then
       look again: anything left is contamination. */
    banner: /was about a different sector|were about a different sector/.test(html),
    spiceElsewhere: /SpiceJet|SPICEJET/i.test(
      html.replace(/<div class="note warn">[\s\S]*?<\/div>\s*<div class="lead">[\s\S]*?<\/div>/g, '')
          .replace(/<div class="note warn">[\s\S]*?<\/div>/g, '')),
    len: html.length
  };
}, { BANK, PNB, SPICE });

await b.close();

const fails = [];
if (out.runSector !== 'Banking') fails.push(`report.run.sector is "${out.runSector}", not Banking`);
if (out.metaSector !== 'Banking') fails.push(`meta.sector is "${out.metaSector}", not Banking`);
if (out.runSub !== out.metaSub) fails.push(`header sub-sector "${out.metaSub}" != title sub-sector "${out.runSub}"`);
if (out.names.some((s) => /SPICE/i.test(s))) fails.push('SpiceJet was scored inside the Banking run');
if (!out.foreign.length) fails.push('the mismatched reply was dropped without being recorded');
if (!out.banner) fails.push('the sector document does not say a reply was rejected');
if (out.spiceElsewhere) fails.push('SpiceJet appears outside the rejection notice');

console.log(`  meta    ${out.metaSector} — ${out.metaSub}`);
console.log(`  run     ${out.runSector} — ${out.runSub}`);
console.log(`  full    ${JSON.stringify(out.names)}`);
console.log(`  foreign ${JSON.stringify(out.foreign)}`);
fails.forEach((f) => console.log('FAIL  ' + f));
console.log(fails.length ? '\nFAIL' : '\nPASS  the sector study describes only its own sector');
process.exit(fails.length ? 1 : 0);
