/* Regression guard: printed sheets must equal DOM pages, at every margin.
 *
 * Tejas reported that sharing a report from the iPhone opened the printer and
 * came back with the page numbers doubled. He was right about the cause — it
 * was the footer, or rather the space around it. `.page` was height:297mm,
 * exactly A4. Safari's print dialogue adds its own header/footer margin
 * (12.7mm by default), so the 297mm box no longer fits the printable area and
 * the engine fragments every single page: 24 DOM pages became 48 sheets, the
 * even ones carrying nothing but a stranded line of the disclaimer.
 *
 * The fix is slack: --pageh is 263mm, 34mm shorter than the sheet. This test
 * prints each fixture at a range of insets, including Safari's default, and
 * fails if any of them produces more sheets than there are .page boxes. It
 * must keep passing whatever else changes about the footer.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DOCS = ['co1', 'sector', 'score', 'exec'];
const INSETS = [0, 6, 12.7, 16];   /* 12.7mm is Safari's out-of-the-box margin */

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0, ran = 0;

for (const kind of DOCS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) {
    console.log(`FAIL  ${kind}: /tmp/doc-${kind}.html missing — run gen-fixtures first.`);
    fail++; continue;
  }
  const age = (Date.now() - fs.statSync(f).mtimeMs) / 3600000;
  if (age > 6) {
    console.log(`FAIL  ${kind}: fixture is ${age.toFixed(1)}h old — stale, regenerate it.`);
    fail++; continue;
  }
  const html = fs.readFileSync(f, 'utf8');

  for (const inset of INSETS) {
    const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
    await p.setContent(html, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    const dom = await p.evaluate(() => document.querySelectorAll('.page').length);
    /* Simulate the browser chrome adding its own margin to the sheet, the way
       Safari's print dialogue does. preferCSSPageSize would hide the problem,
       so it is deliberately off here. */
    await p.addStyleTag({ content:
      `@page{ size:A4; margin:${inset}mm 0mm ${inset + 2}mm 0mm !important }` });
    await p.waitForTimeout(200);
    const buf = await p.pdf({ printBackground: true, preferCSSPageSize: false, format: 'A4' });
    await p.close();

    const sheets = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ran++;
    const ok = sheets === dom;
    if (!ok) fail++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${kind.padEnd(7)} inset ${String(inset).padStart(4)}mm   DOM ${dom} -> ${sheets} sheets`);
  }
}

await b.close();
if (!ran) { console.log('FAIL  nothing was measured'); process.exit(1); }
console.log(fail ? `\nFAIL  ${fail} of ${ran} prints fragmented` : `\nPASS  ${ran} prints, no fragmentation`);
process.exit(fail ? 1 : 0);
