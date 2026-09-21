/* Tier 0 #0 — does the browser's own print path produce a better PDF than the
   html2canvas/jsPDF raster path?
 *
 * page.pdf() in Chromium IS print-to-PDF: the same code path window.print()
 * reaches. So this measures the real candidate, not an approximation.
 *
 * Measured, not asserted: page count, file size, whether text is extractable,
 * whether any page's content overflows its 297mm box, and whether the browser
 * silently scaled a page to make it fit (which is what made score-card pages
 * disagree about type size).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const docs = ['co1', 'sector', 'exec', 'score'];
const rows = [];
let fail = 0;

for (const name of docs) {
  const file = `/tmp/doc-${name}.html`;
  if (!fs.existsSync(file)) { console.log(`${name}: no HTML, skipped`); continue; }

  const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  await page.setContent(fs.readFileSync(file, 'utf8'), { waitUntil: 'networkidle' });
  /* the document's own packer runs on load; give it room to finish */
  await page.waitForTimeout(900);

  /* Layout facts, read after pagination. Taken in print emulation because a
     print stylesheet can move things, and measuring the screen layout then
     printing something else is how six pagination fixes passed and failed. */
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const r = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')];
    const MM = 3.7795275591;
    const over = [];
    const scaled = [];
    pages.forEach((p, i) => {
      const box = p.querySelector('.ir-box') || p.querySelector('.body') || p;
      if (box.scrollHeight > box.clientHeight + 2) {
        over.push({ page: i + 1, by: Math.round(box.scrollHeight - box.clientHeight) });
      }
      const inner = p.querySelector('.body > *');
      if (inner && getComputedStyle(inner).transform !== 'none') scaled.push(i + 1);
      /* a page taller than A4 will be split by the printer in a place nobody
         chose, which is exactly the "block cut in half" complaint */
      const h = p.getBoundingClientRect().height;
      if (h > 297 * MM + 4) over.push({ page: i + 1, tallBy: Math.round(h / MM - 297) + 'mm' });
    });
    return { pages: pages.length, over, scaled };
  });

  const pdf = `/tmp/vec-${name}.pdf`;
  await page.pdf({
    path: pdf,
    width: '210mm', height: '297mm',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: true,
  });
  await page.close();

  const kb = Math.round(fs.statSync(pdf).size / 1024);
  const probe = execFileSync('python3', ['-c', `
from pypdf import PdfReader
r = PdfReader("${pdf}")
txt = "".join((p.extract_text() or "") for p in r.pages)
imgs = sum(len(p.images) for p in r.pages)
print(len(r.pages), len(txt), imgs)
`]).toString().trim().split(/\s+/).map(Number);

  const [pdfPages, chars, imgs] = probe;
  const bad = errs.length || r.over.length || r.scaled.length || pdfPages !== r.pages || chars < 500;
  if (bad) fail = 1;

  rows.push({ name, domPages: r.pages, pdfPages, kb, chars, imgs, over: r.over, scaled: r.scaled, errs });
  console.log(
    `${name.padEnd(7)} ${String(r.pages).padStart(3)} dom / ${String(pdfPages).padStart(3)} pdf | ` +
    `${String(kb).padStart(5)} KB | ${String(chars).padStart(6)} chars | ${String(imgs).padStart(3)} imgs | ` +
    `over ${r.over.length} | scaled ${r.scaled.length}` +
    (errs.length ? ` | ERRORS ${errs[0]}` : '')
  );
  if (r.over.length) console.log('        overflow:', JSON.stringify(r.over.slice(0, 6)));
}

await b.close();
console.log('\n' + (fail ? 'FAIL — see rows above' : 'PASS — vector path clean on every document'));
fs.writeFileSync('/tmp/vecreport.json', JSON.stringify(rows, null, 2));
process.exit(fail ? 1 : 0);
