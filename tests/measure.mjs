/* The text measure.
 *
 * Prose ran at a median of 125 characters per line and reached 149. Typography
 * has settled on 55 to 75 for continuous text, and past about 90 the eye
 * starts losing its return to the left margin — you finish a line and re-read
 * the one you just finished. At 173mm and 7.4pt this report was half again
 * past that, and it got worse when the commentary layer landed, because there
 * was suddenly more continuous text to read across it.
 *
 * Two columns was the obvious fix and was measured and rejected four ways;
 * doc 24 has the numbers. What was left was to narrow the measure itself.
 *
 * The assertion that matters is the pair: prose narrow AND exhibits still
 * full-width. Narrowing everything would crush a seven-column financial
 * statement, which is the failure this is one edit away from. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DOCS = ['co1', 'sector', 'exec'];
for (const n of DOCS) {
  const f = `/tmp/doc-${n}.html`;
  if (!fs.existsSync(f)) { console.log('FAIL  no fixture ' + f + ' — run tests/gen-fixtures.mjs'); process.exit(1); }
  if (fs.statSync(f).mtimeMs < fs.statSync('/home/claude/eqapp/render.js').mtimeMs) {
    console.log('FAIL  fixture older than render.js — regenerate first'); process.exit(1);
  }
}

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
for (const name of DOCS) {
  const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  await page.setContent(fs.readFileSync(`/tmp/doc-${name}.html`, 'utf8'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const mm = (px) => px / (96 / 25.4);
    /* Characters per line from the real line boxes. Deriving it from
       height/lineHeight is wrong the moment text is narrowed or flowed, and
       gives an answer that looks authoritative and is not. */
    const lineRects = (el) => {
      const out = [];
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const rc of rg.getClientRects()) if (rc.width > 2 && rc.height > 2) out.push(rc);
      }
      return out;
    };
    const cpl = [];
    document.querySelectorAll('p.storyp,.sayt,.note,li').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (t.length < 200) return;
      const rs = lineRects(el);
      if (rs.length < 2) return;
      cpl.push(t.length / rs.length);
    });
    cpl.sort((a, b) => a - b);
    const q = (f) => (cpl.length ? Math.round(cpl[Math.floor(cpl.length * f)]) : null);
    const w = (el) => Math.round(mm(el.getBoundingClientRect().width));
    return {
      pages: document.querySelectorAll('.page').length,
      blocks: cpl.length, median: q(0.5),
      max: cpl.length ? Math.round(cpl[cpl.length - 1]) : null,
      over90: cpl.filter((x) => x > 90).length,
      widestTable: Math.max(0, ...[...document.querySelectorAll('table')].map(w)),
      widestFigure: Math.max(0, ...[...document.querySelectorAll('figure.fig')].map(w)),
      overflow: [...document.querySelectorAll('.page')].filter((pg) => {
        const bx = pg.querySelector('.ir-box');
        return bx && bx.scrollHeight > bx.clientHeight + 2;
      }).length,
      orphans: [...document.querySelectorAll('.ir-blk')].filter((k) => !k.closest('.ir-box')).length,
    };
  });
  await page.close();

  console.log(`${name.padEnd(7)} ${r.pages} pages | ${r.blocks} prose blocks | median ${r.median} cpl`
    + ` | max ${r.max} | over-90 ${r.over90} | widest table ${r.widestTable}mm`);

  ok(`${name}: prose reads at a sane line length`, r.median !== null && r.median <= 90);
  ok(`${name}: nothing runs past the point the eye loses its place`, r.max !== null && r.max <= 100);
  ok(`${name}: exhibits keep the full measure — the thing narrowing must not touch`,
     r.widestTable >= 150 || r.widestFigure >= 150);
  ok(`${name}: no box overflows`, r.overflow === 0);
  ok(`${name}: no block was moved out of its page box`, r.orphans === 0);
  ok(`${name}: no render errors`, errs.length === 0);
  if (errs.length) console.log('      ' + errs.slice(0, 2).join('\n      '));
}
await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
