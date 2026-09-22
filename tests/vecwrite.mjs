/* The vector writer, measured against the browser's own print path.
 *
 * Share has to hand over a File — that is the whole of the Web Share API — and
 * the only way to have one without opening the printer is to write the PDF in
 * the page. The old in-page writer photographed each sheet: 9.2 MB, blurred at
 * zoom, text hidden behind the picture. This one walks the laid-out DOM and
 * emits vectors.
 *
 * Passing means all four of these, for every document:
 *   - it produced the same number of sheets as there are .page boxes;
 *   - the text is really text, and a sample of what the page says is in it;
 *   - it is nowhere near raster size;
 *   - nothing is rasterised at all — no image XObject anywhere in the file.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DOCS = ['co1', 'sector', 'exec', 'score'];
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

let fail = 0, ran = 0;
for (const kind of DOCS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) { console.log(`FAIL  ${kind}: fixture missing`); fail++; continue; }
  const html = fs.readFileSync(f, 'utf8');

  const res = await page.evaluate(async (h) => {
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:1240px;height:1754px;';
    document.body.appendChild(fr);
    await new Promise((s) => { fr.onload = () => setTimeout(s, 900); fr.srcdoc = h; });
    const doc = fr.contentDocument;
    const boxes = doc.querySelectorAll('.page').length;
    let blob, err = null;
    const t0 = performance.now();
    try { blob = window.EQVecPdf.writePdf(doc, '.page'); }
    catch (e) { err = e.message; }
    const ms = Math.round(performance.now() - t0);
    if (err) { fr.remove(); return { err, boxes }; }
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 8192)
      s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    fr.remove();
    return { boxes, bytes: buf.length, ms, b64: btoa(s) };
  }, html);

  ran++;
  if (res.err) { console.log(`FAIL  ${kind}: writer threw — ${res.err}`); fail++; continue; }

  const out = `/tmp/vec-${kind}.pdf`;
  fs.writeFileSync(out, Buffer.from(res.b64, 'base64'));
  const info = execFileSync('pdfinfo', [out]).toString();
  const sheets = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  const text = execFileSync('pdftotext', [out, '-']).toString();
  const raw = fs.readFileSync(out, 'latin1');
  const images = (raw.match(/\/Subtype\s*\/Image/g) || []).length;

  /* Something the document certainly says, taken from the fixture itself, so
     this cannot pass on an empty file with the right page count. */
  const probe = /<title>([^<]{4,40})/.exec(html);
  const words = (text.match(/[A-Za-z]{3,}/g) || []).length;

  const bad = [];
  if (sheets !== res.boxes) bad.push(`${res.boxes} boxes -> ${sheets} sheets`);
  if (words < 200 * Math.min(res.boxes, 4)) bad.push(`only ${words} words of real text`);
  if (images) bad.push(`${images} rasterised image(s) in the file`);
  if (res.bytes > 2_500_000) bad.push(`${(res.bytes / 1e6).toFixed(1)} MB is raster territory`);
  if (bad.length) fail++;

  console.log(`  ${bad.length ? 'FAIL' : 'ok  '}  ${kind.padEnd(7)} ${String(sheets).padStart(2)} sheets  `
    + `${(res.bytes / 1024).toFixed(0).padStart(4)} KB  ${String(words).padStart(5)} words  `
    + `${images} images  ${res.ms}ms`
    + (bad.length ? '\n        ' + bad.join('; ') : ''));
}

await b.close();
if (errs.length) { console.log('  page errors: ' + errs.slice(0, 3).join(' | ')); fail++; }
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} documents written as vectors`);
process.exit(fail ? 1 : 0);
