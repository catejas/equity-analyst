import { chromium } from 'playwright-core';
import fs from 'node:fs';
const kind = process.argv[2] || 'sector';
const idx = Number(process.argv[3] || 3);
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1000,height:1400} });
await p.setContent(fs.readFileSync(`/tmp/doc-${kind}.html`,'utf8'), { waitUntil:'networkidle' });
await p.waitForTimeout(1200);
const info = await p.evaluate(() => {
  const pages=[...document.querySelectorAll('.page')];
  const fills=pages.map(pg=>{const body=pg.querySelector('.body'); if(!body)return 0;
    let last=0; body.querySelectorAll('*').forEach(el=>{const r=el.getBoundingClientRect();const br=body.getBoundingClientRect();last=Math.max(last,r.bottom-br.top);});
    return Math.round(last/body.getBoundingClientRect().height*100);});
  const pg=pages[2]||pages[0];
  const rfn=pg.querySelector('.rfn'), rf=pg.querySelector('.rf');
  const pr=pg.getBoundingClientRect();
  return { n:pages.length, fills, footnoteTop: rfn? Math.round(rfn.getBoundingClientRect().top-pr.top):null,
    footTop: rf?Math.round(rf.getBoundingClientRect().top-pr.top):null, pageH:Math.round(pr.height),
    footBottom: rf?Math.round(pr.bottom-rf.getBoundingClientRect().bottom):null };
});
console.log(JSON.stringify(info).slice(0,1200));
const pages = await p.$$('.page');
if (pages[idx-1]) await pages[idx-1].screenshot({ path:`/tmp/page-${kind}-${idx}.png` });
await b.close();
