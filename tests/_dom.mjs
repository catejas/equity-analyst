import { chromium } from 'playwright-core';
import fs from 'node:fs';
const kind = process.argv[2] || 'co1'; const pg = Number(process.argv[3] || 3);
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1000,height:1400} });
p.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
await p.setContent(fs.readFileSync(`/tmp/doc-${kind}.html`,'utf8'), { waitUntil:'networkidle' });
await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate((pg) => {
  const pages=[...document.querySelectorAll('.page')];
  const fill = pages.map(x => { const bx=x.querySelector('.ir-box'); const bd=x.querySelector('.body'); if(!bx||!bd) return null;
    return Math.round(bx.getBoundingClientRect().height / bd.clientHeight * 100); });
  const box = pages[pg-1].querySelector('.ir-box');
  const kids = box ? [...box.children].map(k => ({ cls:k.className, cont:k.getAttribute('data-cont'), cut:k.getAttribute('data-cutid'),
    kids:[...k.children].map(c => c.tagName+'.'+String(c.className).slice(0,18)+':'+Math.round(c.getBoundingClientRect().height)) })) : null;
  const over = pages.map((x,i)=>{const bd=x.querySelector('.body'); return bd && bd.scrollHeight>bd.clientHeight+2 ? (i+1)+":"+(bd.scrollHeight-bd.clientHeight)+":"+(x.querySelector(".ir-box")?x.querySelector(".ir-box").scrollHeight:0)+"/"+bd.clientHeight : 0;}).filter(Boolean);
  return { n:pages.length, fill, over, last: kids && kids.slice(-2) };
}, pg)));
await b.close();
