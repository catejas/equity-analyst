/* A smaller body does not remove overflow risk: a long unbroken string in a
   fixed-width column still pushes past its cell. This looks for any element
   wider than its container or sticking out past the page edge. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
let bad = 0;
for (const [name,file] of [['company','/tmp/company-new.html'],['sector','/tmp/sector-new.html'],
                           ['exec','/tmp/exec-new.html'],['coexec','/tmp/ex.html'],['scorecard','/tmp/sc.html']]) {
  const p = await b.newPage({ viewport:{width:1000,height:1400} });
  await p.setContent(fs.readFileSync(file,'utf8'), { waitUntil:'networkidle' });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const out = { wideCells: [], pastPage: [], tallRows: 0 };
    document.querySelectorAll('.page').forEach((pg, pi) => {
      const pr = pg.getBoundingClientRect();
      pg.querySelectorAll('td,th').forEach(td => {
        if (td.scrollWidth > td.clientWidth + 1)
          out.wideCells.push({ page: pi+1, by: td.scrollWidth - td.clientWidth,
                               text: td.textContent.trim().slice(0,28) });
      });
      pg.querySelectorAll('.body *').forEach(el => {
        const r2 = el.getBoundingClientRect();
        if (r2.width && (r2.right > pr.right + 1 || r2.left < pr.left - 1))
          out.pastPage.push({ page: pi+1, tag: el.tagName,
                              over: Math.round(Math.max(r2.right - pr.right, pr.left - r2.left)) });
      });
    });
    return out;
  });
  const ok = !r.wideCells.length && !r.pastPage.length;
  if (!ok) bad = 1;
  console.log(`${name.padEnd(10)} cells overflowing ${r.wideCells.length} | elements past the page edge ${r.pastPage.length}`);
  r.wideCells.slice(0,3).forEach(c => console.log(`     p${c.page} +${c.by}px  "${c.text}"`));
  r.pastPage.slice(0,3).forEach(c => console.log(`     p${c.page} ${c.tag} +${c.over}px past the edge`));
  await p.close();
}
await b.close();
console.log(bad ? 'OVERFLOW FOUND' : 'no cell or element overflows anywhere');
