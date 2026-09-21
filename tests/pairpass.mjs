/* Tier 0 #1 — prose column beside a figure rail.
   Checks the three ways this could go wrong:
     1. it silently does nothing (no pairs formed)
     2. it pairs but something now overflows its page or its column
     3. it pairs but the page count / fill did not actually improve
   Fill is measured as content extent within the box, not the tallest single
   child — measuring the tallest child is what once reported page 3 at 8% when
   a screenshot showed it at 95%. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0;

/* A missing fixture used to `continue`, silently. With all three absent this
   file printed its PASS line having measured nothing at all — and the "0
   pairs, 99% fill" reading that closed the two-column question came from here,
   so the one test standing between a layout decision and a wrong one could
   have been reporting on an empty room. It now refuses to run.

   The fixtures also go stale: they are written by an earlier run against the
   build of that moment, so a measurement taken against yesterday's HTML says
   nothing about today's. Anything older than the renderer is rejected. */
const DOCS = ['co1', 'sector', 'exec'];
{
  const missing = DOCS.filter((n) => !fs.existsSync(`/tmp/doc-${n}.html`));
  if (missing.length) {
    console.log('FAIL  no fixture for: ' + missing.join(', ')
      + ' — run tests/gen-fixtures.mjs first. Passing here would be vacuous.');
    await b.close();
    process.exit(1);
  }
  const renderer = fs.statSync('/home/claude/eqapp/render.js').mtimeMs;
  const stale = DOCS.filter((n) => fs.statSync(`/tmp/doc-${n}.html`).mtimeMs < renderer);
  if (stale.length) {
    console.log('FAIL  fixture older than render.js: ' + stale.join(', ')
      + ' — it measures a build that no longer exists. Regenerate first.');
    await b.close();
    process.exit(1);
  }
}

for (const name of DOCS) {
  const file = `/tmp/doc-${name}.html`;
  const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  await page.setContent(fs.readFileSync(file, 'utf8'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const r = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')];
    const boxes = pages.map((p) => p.querySelector('.ir-box')).filter(Boolean);
    const pairs = [...document.querySelectorAll('.ir-pair')];

    /* content extent: the bottom of the lowest child, relative to the box top */
    const fillOf = (box) => {
      const t = box.getBoundingClientRect().top;
      let low = t;
      [...box.querySelectorAll('.ir-blk')].forEach((k) => {
        const bt = k.getBoundingClientRect().bottom;
        if (bt > low) low = bt;
      });
      const h = box.clientHeight || 1;
      return Math.round(((low - t) / h) * 100);
    };

    /* a column whose content is wider than the column is the overflow that
       pushed sector labels off the left edge before */
    const colOver = [];
    pairs.forEach((p, i) => {
      [...p.children].forEach((c) => {
        if (c.scrollWidth > c.clientWidth + 2) {
          colOver.push({ pair: i, cls: c.className, by: c.scrollWidth - c.clientWidth });
        }
      });
    });

    const boxOver = [];
    boxes.forEach((bx, i) => {
      if (bx.scrollHeight > bx.clientHeight + 2) boxOver.push({ page: i + 1, by: bx.scrollHeight - bx.clientHeight });
    });

    return {
      pages: pages.length,
      pairs: pairs.length,
      stats: window.__pairStats || null,
      fills: boxes.map(fillOf),
      colOver, boxOver,
      /* every block must still be a direct child of a box — if the pair pass
         moved a block out of the box the packer is holding, this catches it */
      orphanBlocks: [...document.querySelectorAll('.ir-blk')].filter((k) => !k.closest('.ir-box')).length,
    };
  });
  await page.close();

  const lowPages = r.fills.filter((f) => f < 55).length;
  const bad = errs.length || r.colOver.length || r.boxOver.length || r.orphanBlocks;
  if (bad) fail = 1;

  console.log(
    `${name.padEnd(7)} ${String(r.pages).padStart(3)} pages | ${String(r.pairs).padStart(3)} pairs | ` +
    `fill avg ${String(Math.round(r.fills.reduce((a, c) => a + c, 0) / (r.fills.length || 1))).padStart(3)}% | ` +
    `under-55% pages ${lowPages} | col overflow ${r.colOver.length} | box overflow ${r.boxOver.length} | ` +
    `orphans ${r.orphanBlocks}` + (errs.length ? ` | ERR ${errs[0]}` : '')
  );
  console.log('        fills:', r.fills.join(' '));
  /* "0 pairs" on its own is ambiguous — it reads as "nothing to gain" and was
     read that way for a whole review cycle. The counters say which physical
     constraint refused each candidate. */
  if (r.stats) {
    const t = r.stats;
    console.log(`        pairing: ${t.candidates} candidates | kept ${t.kept} | `
      + `exhibit spilled when narrowed ${t.spill} | taller paired than stacked ${t.taller} | `
      + `no room on page ${t.noRoom}`);
  } else {
    console.log('        pairing: no candidates reached the pair stage');
  }
  if (r.colOver.length) console.log('        col overflow:', JSON.stringify(r.colOver.slice(0, 4)));
  if (r.boxOver.length) console.log('        box overflow:', JSON.stringify(r.boxOver.slice(0, 4)));
}

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS — no overflow, no orphaned blocks'));
process.exit(fail ? 1 : 0);
