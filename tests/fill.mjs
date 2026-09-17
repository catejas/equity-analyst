/* How full each page is. The previous version took the tallest single child of
   the page body instead of the content's actual extent, so a page holding two
   charts and a dense text block reported 10% full. I reported those pages to
   the user as near-empty on the strength of it. Measure the content box itself. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
for (const [name,file] of [['company','/tmp/company-new.html'],['sector','/tmp/sector-new.html'],
                           ['exec','/tmp/exec-new.html'],['coexec','/tmp/ex.html'],['scorecard','/tmp/sc.html']]) {
  const p = await b.newPage({ viewport:{width:1000,height:1400} });
  await p.setContent(fs.readFileSync(file,'utf8'), { waitUntil:'networkidle' });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => [...document.querySelectorAll('.page')].map(pg => {
    const bd = pg.querySelector('.body'); if (!bd) return 0;
    const box = pg.querySelector('.ir-box') || pg.querySelector('.sc-main')
             || pg.querySelector('.sc-spill') || bd;
    const kids = [...box.children].filter(c => c.className !== 'grow' && c.getBoundingClientRect().height);
    if (!kids.length) return 0;
    /* the extent of the content: first child's top to last child's bottom */
    const top = Math.min(...kids.map(c => c.getBoundingClientRect().top));
    const bot = Math.max(...kids.map(c => c.getBoundingClientRect().bottom));
    return Math.min(100, Math.round((bot - top) / bd.clientHeight * 100));
  }));
  const real = r.filter(x => x > 0);
  const avg = real.length ? Math.round(real.reduce((a,c)=>a+c,0)/real.length) : 0;
  const sparse = r.map((v,i)=>({v,p:i+1})).filter(x => x.v > 0 && x.v < 45);
  console.log(`${name.padEnd(10)} ${r.length} pages | average fill ${avg}% | per page: ${r.join(',')}`);
  if (sparse.length) console.log(`           under 45%: ${sparse.map(s=>'p'+s.p+' '+s.v+'%').join(', ')}`);
  await p.close();
}
await b.close();
