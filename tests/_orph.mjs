import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
for (const kind of ['sector','exec','co1','co2','co3','score']) {
  const p = await b.newPage({ viewport:{width:1000,height:1400} });
  await p.setContent(fs.readFileSync(`/tmp/doc-${kind}.html`,'utf8'), { waitUntil:'networkidle' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const out=[]; const pages=[...document.querySelectorAll('.page')];
    pages.forEach((pg,i)=>{
      const box = pg.querySelector('.ir-box,.sc-main,.sc-spill,.body'); if(!box) return;
      let el = box.lastElementChild;
      while(el && el.lastElementChild && !/^(H[1-6]|TABLE|FIGURE|UL|P)$/.test(el.tagName) && !/(sec|ir-sub|note)/.test(el.className)) el = el.lastElementChild;
      if(el && (/^H[1-6]$/.test(el.tagName) || /\b(sec|ir-sub|ir-grp)\b/.test(el.className))) out.push((i+1)+':'+el.textContent.trim().slice(0,40));
      const bd = pg.querySelector('.body'); if(bd && bd.scrollHeight>bd.clientHeight+2) out.push((i+1)+':OVERFLOW');
    });
    return { n: pages.length, out };
  });
  console.log(kind, JSON.stringify(r));
  await p.close();
}
await b.close();
