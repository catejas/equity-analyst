import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
for(const n of ['co1','sector','score']){
  const p=await b.newPage({viewport:{width:1000,height:1400}});
  await p.setContent(fs.readFileSync(`/tmp/doc-${n}.html`,'utf8'),{waitUntil:'networkidle'});
  await p.waitForTimeout(900);
  const screen=await p.evaluate(()=>{const g=[...document.querySelectorAll('.page')];
    return {n:g.length, h:g.map(x=>Math.round(x.getBoundingClientRect().height)),
      boxes:g.map(x=>{const q=x.querySelector('.ir-box');return q?Math.round(q.scrollHeight):-1;})};});
  await p.emulateMedia({media:'print'}); await p.waitForTimeout(300);
  const print=await p.evaluate(()=>{const g=[...document.querySelectorAll('.page')];
    return {n:g.length, h:g.map(x=>Math.round(x.getBoundingClientRect().height)),
      boxes:g.map(x=>{const q=x.querySelector('.ir-box');return q?Math.round(q.scrollHeight):-1;})};});
  const same = screen.n===print.n && JSON.stringify(screen.h)===JSON.stringify(print.h)
            && JSON.stringify(screen.boxes)===JSON.stringify(print.boxes);
  console.log(`${n.padEnd(7)} screen ${screen.n}p  print ${print.n}p  identical layout: ${same}`);
  if(!same) console.log('   screen',JSON.stringify(screen.h),'\n   print ',JSON.stringify(print.h));
  await p.close();
}
await b.close();
