import { chromium } from 'playwright-core'; import fs from 'node:fs';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
for (const k of process.argv.slice(2)) {
  const p = await b.newPage(); await p.setContent(fs.readFileSync(`/tmp/doc-${k}.html`,'utf8'),{waitUntil:'networkidle'}); await p.waitForTimeout(800);
  console.log(k, JSON.stringify(await p.evaluate(()=>{ const pg=document.querySelector('.page'); const P=pg.getBoundingClientRect(); const mm=v=>+(v/3.7795).toFixed(2);
    const rf=pg.querySelector('.rf').getBoundingClientRect(), rfn=pg.querySelector('.rfn'); const n=rfn.getBoundingClientRect();
    return { ruleFromBottom: mm(P.bottom-rf.top), noteTop: mm(n.top-P.top), noteBottomGap: mm(P.bottom-n.bottom), noteH: mm(n.height), clipped: rfn.scrollHeight>rfn.clientHeight+1, order: [...pg.querySelector('.rfw').children].map(c=>c.className).join('>') }; })));
  await p.close(); }
await b.close();
