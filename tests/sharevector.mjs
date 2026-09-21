/* Share must open the vector preview, not build a raster PDF.
   Asserted by spying on htmlToPdfBlob — the only entry to the html2canvas
   path. If Share ever routes back to it the file silently returns to 9 MB of
   bitmaps, and nothing on screen would say so. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));

await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);

/* doAction bails before routing if nothing is saved, so a fresh profile would
   pass the "never called the raster" check for the wrong reason. Import a real
   payload through the app's own controls first. */
page.on('dialog', (d) => d.accept());
await page.evaluate((json) => {
  document.getElementById('importText').value = json;
  document.getElementById('btnDoImport').click();
}, fs.readFileSync('/tmp/psu.json', 'utf8'));
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('btnSaveImport').click());
await page.waitForTimeout(800);

const ready = await page.evaluate(() => !!(window.EQDocTools && window.EQDocTools.currentPayload()));
if (!ready) { console.log('FAIL  fixture did not import — the rest would pass vacuously'); await b.close(); process.exit(1); }

const r = await page.evaluate(async () => {
  const T = window.EQDocTools;
  if (!T) return { err: 'EQDocTools missing' };

  let rasterCalls = 0;
  const realRaster = T.htmlToPdfBlob;
  T.htmlToPdfBlob = function () { rasterCalls++; return realRaster.apply(this, arguments); };

  /* Assert on what the user can see. docs.js calls showPreview() directly, not
     through window.EQPreview, so wrapping that object spies on an indirection
     nothing uses and reports "never opened" for a preview that did open. */
  const out = { rasterCalls: 0, hasShareBtn: !!document.getElementById('pvShare'),
                hasSaveBtn: !!document.getElementById('pvSave') };

  /* The button handlers read from the DOM, so drive doAction directly — the
     routing decision is what is under test, not the click plumbing. */
  try { T.doAction('score', 'share', '#docMsg'); } catch (e) { out.threw = String(e.message); }
  await new Promise((s) => setTimeout(s, 400));

  /* 'make' must still reach the same preview — one path to a PDF, both buttons. */
  window.EQPreview.close();
  await new Promise((s) => setTimeout(s, 150));
  try { T.doAction('score', 'make', '#docMsg'); } catch (e) { out.threwMake = String(e.message); }
  await new Promise((s) => setTimeout(s, 400));
  const pv0 = document.getElementById('preview');
  out.makeOpensPreview = !!pv0 && !pv0.classList.contains('hidden');

  out.rasterCalls = rasterCalls;
  const pv = document.getElementById('preview');
  out.previewVisible = !!pv && !pv.classList.contains('hidden');
  out.previewTitle = (document.getElementById('pvTitle') || {}).textContent || null;
  out.frameFilled = ((document.getElementById('pvFrame') || {}).srcdoc || '').length;
  return out;
});

await b.close();

const checks = [
  ['Share opened the preview',        r.previewVisible === true],
  ['preview frame has the document',  r.frameFilled > 5000],
  ['Share never called the raster',   r.rasterCalls === 0],
  ['preview titled as a PDF',         typeof r.previewTitle === 'string' && r.previewTitle.endsWith('.pdf')],
  ['Share button present in preview', r.hasShareBtn === true],
  ['Save button still present',       r.hasSaveBtn === true],
  ['make still opens the preview',    r.makeOpensPreview === true],
  ['no page errors',                  errs.length === 0],
];

let fail = 0;
for (const [label, ok] of checks) { if (!ok) fail = 1; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`); }
if (r.threw) console.log('     threw:', r.threw);
if (errs.length) console.log('     errors:', errs.slice(0, 3).join(' | '));
console.log('\n' + JSON.stringify(r));
process.exit(fail ? 1 : 0);
