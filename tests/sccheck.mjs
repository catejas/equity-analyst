import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:900,height:1300} });
await p.setContent(fs.readFileSync('/tmp/sc.html','utf8'), { waitUntil:'networkidle' });
await p.waitForTimeout(600);
const r = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg,i) => {
  const box = pg.querySelector('.sc-main') || pg.querySelector('.sc-spill');
  if (!box) return null;
  return { page: i+1, blocks: [...box.children].map(c => {
    const ti = c.querySelector && c.querySelector('.ti');
    const cont = c.getAttribute && c.getAttribute('data-cont') ? ' [continuation]' : '';
    return ((ti ? ti.textContent.trim() : '(no heading)') + cont).slice(0,46);
  })};
}).filter(Boolean));
r.forEach(x => { console.log('page ' + x.page); x.blocks.forEach(t => console.log('    ' + t)); });
const splits = r.flatMap(x => x.blocks).filter(t => /continuation/.test(t));
console.log(splits.length ? 'STILL SPLITTING: ' + splits.join(', ') : 'no block is split across a page');
await b.close();
