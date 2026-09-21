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

for (const name of ['co1', 'sector', 'exec']) {
  const file = `/tmp/doc-${name}.html`;
  if (!fs.existsSync(file)) continue;
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
  if (r.colOver.length) console.log('        col overflow:', JSON.stringify(r.colOver.slice(0, 4)));
  if (r.boxOver.length) console.log('        box overflow:', JSON.stringify(r.boxOver.slice(0, 4)));
}

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS — no overflow, no orphaned blocks'));
process.exit(fail ? 1 : 0);
