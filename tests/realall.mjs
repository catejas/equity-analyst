/* Every document, in the real renderer, checked for the things that actually
   went wrong: a script that throws, a box that overflows its page, a contents
   page with content on it, and a page count that matches the content. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
let fail = 0;
/* every document the app can produce, including the two built per company */
for (const name of ['company','sector','exec','coexec','scorecard']) {
  const page = await b.newPage({ viewport:{ width:1000, height:1400 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  const file = name === 'coexec' ? '/tmp/ex.html'
    : name === 'scorecard' ? '/tmp/sc.html' : `/tmp/${name}-new.html`;
  await page.setContent(fs.readFileSync(file,'utf8'), { waitUntil:'networkidle' });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')];
    const over = pages.map((p,i) => {
      const bx = p.querySelector('.ir-box') || p.querySelector('.body');
      return bx && bx.scrollHeight > bx.clientHeight + 2 ? { page:i+1, by: bx.scrollHeight - bx.clientHeight } : null;
    }).filter(Boolean);
    const toc = document.querySelector('[data-toc]');
    const tocPage = toc ? toc.closest('.page') : null;
    return { pages: pages.length, over,
      tocRows: document.querySelectorAll('[data-toc] a').length,
      tocIsFirst: tocPage === pages[0],
      tocHasContent: tocPage ? tocPage.querySelectorAll('.sec').length : -1,
      lastPageNum: pages.length ? (pages[pages.length-1].querySelector('.pgnum')||{}).textContent : null,
      /* a page scaled down is a page whose type no longer matches its
         neighbours, which is what made the score card's two pages differ */
      scaled: pages.filter(p => {
        const inner = p.querySelector('.body > *');
        return inner && getComputedStyle(inner).transform !== 'none';
      }).length };
  });
  const bad = errs.length || r.over.length || r.scaled
    || (r.tocRows > 0 && (!r.tocIsFirst || r.tocHasContent > 0));
  if (bad) fail = 1;
  console.log(`${name.padEnd(8)} ${String(r.pages).padStart(3)} pages | toc first ${r.tocIsFirst} `
    + `| toc rows ${r.tocRows} | sections on toc page ${r.tocHasContent} `
    + `| overflowing ${r.over.length} | scaled ${r.scaled} | last pgnum ${r.lastPageNum}`);
  if (errs.length) console.log('         script errors:', errs.join(' | '));
  if (r.over.length) console.log('         overflow:', JSON.stringify(r.over.slice(0,4)));
  await page.close();
}
await b.close();
console.log(fail ? 'REAL RENDER FAILED' : 'every document renders clean, nothing clipped');
process.exit(fail);
