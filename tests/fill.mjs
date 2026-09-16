/* How much of each page carries content. The blank space complaint needs a
   number, not an impression. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
for (const [name,file] of [['company','/tmp/company-new.html'],['coexec','/tmp/ex.html'],['scorecard','/tmp/sc.html']]) {
  const p = await b.newPage({ viewport:{width:1000,height:1400} });
  await p.setContent(fs.readFileSync(file,'utf8'), { waitUntil:'networkidle' });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => [...document.querySelectorAll('.page')].map(pg => {
    const bd = pg.querySelector('.body'); if (!bd) return 0;
    const inner = [...bd.children].filter(c => c.className !== 'grow');
    if (!inner.length) return 0;
    let used = 0;
    inner.forEach(c => { const box = c.querySelector('.ir-box, .sc-main, .sc-spill') || c;
      used = Math.max(used, box.scrollHeight); });
    return Math.min(100, Math.round(used / bd.clientHeight * 100));
  }));
  const avg = Math.round(r.reduce((a,c)=>a+c,0)/r.length);
  console.log(`${name.padEnd(10)} ${r.length} pages | average fill ${avg}% | per page: ${r.join(',')}`);
  await p.close();
}
await b.close();
