import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1000,height:1400} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message.split('\n')[0]));
await p.setContent(fs.readFileSync('/tmp/sc.html','utf8'), { waitUntil:'networkidle' });
await p.waitForTimeout(600);
const r = await p.evaluate(() => {
  const pages=[...document.querySelectorAll('.page')];
  return { errs: [], pages: pages.length,
    boxes: pages.map(pg=>{
      const box = pg.querySelector('.sc-main') || pg.querySelector('.sc-spill');
      const bd = pg.querySelector('.body');
      return box ? { blocks: box.querySelectorAll('.sc-blk').length,
                     scroll: box.scrollHeight, client: box.clientHeight,
                     bodyClient: bd.clientHeight, over: box.scrollHeight - box.clientHeight }
                 : null; }),
    /* which sections are visibly inside the printable area */
    visible: [...document.querySelectorAll('.sc-blk')].map(el=>{
      const t = el.querySelector('.ti'); const pg = el.closest('.page');
      const pr = pg.getBoundingClientRect(); const er = el.getBoundingClientRect();
      return { title: t?t.textContent.trim().slice(0,34):'?',
               bottomWithin: Math.round(pr.bottom - er.bottom) };
    })
  };
});
console.log('script errors:', errs.length?errs.join(' | '):'none');
console.log('pages:', r.pages);
r.boxes.forEach((bx,i)=>console.log('  page',i+1, JSON.stringify(bx)));
console.log('blocks and how far their bottom sits above the page bottom:');
r.visible.forEach(v=>console.log('   ', v.title.padEnd(36), v.bottomWithin, v.bottomWithin<0 ? ' <-- BELOW THE PAGE, INVISIBLE' : ''));
await b.close();
