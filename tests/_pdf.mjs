/* Write a document's PDF through the app's own vector writer. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const kind = process.argv[2] || 'sector';
const out  = process.argv[3] || `/tmp/${kind}.pdf`;
const only = process.argv[4] ? Number(process.argv[4]) : 0;
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1000,height:1400} });
p.on('pageerror', e => console.log('PAGEERR', e.message.split('\n')[0]));
let html = fs.readFileSync(`/tmp/doc-${kind}.html`,'utf8');
for (const src of ['vendor/jspdf.umd.min.js','vendor/fonts/eqfont.js','vecpdf.js']) {
  if (!fs.existsSync(src)) { console.log('missing', src); process.exit(1); }
}
await p.setContent(html, { waitUntil:'networkidle' });
await p.waitForTimeout(1200);
if (only) await p.evaluate((n) => {
  [...document.querySelectorAll('.page')].forEach((pg,i)=>{ if(i!==n-1) pg.remove(); });
}, only);
for (const src of ['vendor/jspdf.umd.min.js','vendor/fonts/eqfont.js','vecpdf.js'])
  await p.addScriptTag({ content: fs.readFileSync(src,'utf8') });
await p.waitForTimeout(300);
const b64 = await p.evaluate(async () => {
  const blob = await window.EQVecPdf.writePdf(document, '.page');
  const buf = await (blob.arrayBuffer ? blob.arrayBuffer() : blob);
  let s=''; const u=new Uint8Array(buf);
  for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
  return btoa(s);
});
fs.writeFileSync(out, Buffer.from(b64,'base64'));
console.log('wrote', out, (fs.statSync(out).size/1024).toFixed(0)+'KB');
await b.close();
