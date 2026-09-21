/* The case the bundled map exists for.
 *
 * When the research states an ISIN, nothing else is needed — that path is
 * covered by pricelive.mjs. This is the other one: a payload with no ISIN, no
 * way to recover one from its sources, and every remote list blocked, which is
 * what a phone with no signal looks like and also what a browser blocking a
 * cross-origin read looks like.
 *
 * The map ships with the app for exactly this, so the answer must come out of
 * the bundle with no network call at all. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const raw=fs.readFileSync('/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/944cc4df-attachment.txt','utf8');
const full=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));
delete full.companies[0].isin;                       // strip it
full.companies[0].sources = [];                      // and block repair's recovery path
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
const page=await b.newPage({viewport:{width:430,height:930}});
const hits=[]; const errs=[];
page.on('pageerror',e=>errs.push(e.message.split('\n')[0]));
page.on('dialog',d=>d.accept());
/* Every remote source blocked — only the bundled map can answer. */
await page.route('**/raw.githubusercontent.com/**', r=>r.abort('failed'));
await page.route('**/assets.upstox.com/**', r=>r.abort('failed'));
const candles=[]; const t0=Date.parse('2026-07-20');
for(let i=0;i<105;i++) candles.push([new Date(t0-i*7*86400000).toISOString(),110,112,108,110*(1-i*0.002),3e7,0]);
await page.route('**/api.upstox.com/**', r=>{ hits.push(r.request().url());
  r.fulfill({status:200,contentType:'application/json',
    headers:{'access-control-allow-origin':'*'},
    body:JSON.stringify({status:'success',data:{candles}})}); });
await page.goto('http://127.0.0.1:8848/index.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);
const out=await page.evaluate(async(f)=>{
  const co=f.companies[0], so=Object.assign({},f,{companies:[]});
  const imp=async(o)=>{document.getElementById('importText').value=JSON.stringify(o);
    document.getElementById('btnDoImport').click();await new Promise(s=>setTimeout(s,600));
    document.getElementById('btnSaveImport').click();await new Promise(s=>setTimeout(s,3000));};
  const tab=t=>[...document.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();
  tab('sector');document.getElementById('btnImport').click();await imp(so);
  tab('company');await new Promise(s=>setTimeout(s,300));
  document.querySelector('.co-import[data-rank="1"]')?.click();
  await new Promise(s=>setTimeout(s,300));await imp({run:so.run,companies:[co]});
  await new Promise(s=>setTimeout(s,800));
  const c=(window.EQDocTools.currentPayload().report.full||[])[0];
  return { symbol:c&&c.symbol, isin:c&&c.isin,
    closes:(c&&c.priceHistory&&c.priceHistory.closes||[]).length,
    bands: !!(c&&c.multipleBands&&c.multipleBands.available) };
}, full);
console.log('upstox called:', hits.length? hits[0].replace(/^https:\/\/[^/]+/,'') : 'NO');
console.log('result:', JSON.stringify(out));
console.log('errors:', errs.slice(0,2));
await b.close();
const ok = hits.length>0 && /INE160A01022/.test(hits[0]||'') && out.closes>=100;
console.log(ok?'\nPASS — resolved from the bundled map alone':'\nFAIL');
process.exit(ok?0:1);
