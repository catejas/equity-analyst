/* Price history end to end, on the payload shape the app actually receives.
 *
 * Tejas's device reported: instrument master blocked by CORS, but the Upstox
 * candle endpoint works and returned 105 bars. So the master is not on the
 * critical path and must not be allowed to block the fetch — the ISIN is in
 * the payload. This asserts the fetch works with the master unreachable. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SRC='/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/944cc4df-attachment.txt';
const raw=fs.readFileSync(SRC,'utf8');
const json=raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1);

/* 105 weekly candles, newest first, as Upstox returns them. */
const candles=[];
let t=Date.parse('2026-07-20T00:00:00+05:30'), px=110;
for(let i=0;i<105;i++){
  const d=new Date(t-i*7*86400000).toISOString();
  const c=px*(1-i*0.003);
  candles.push([d, c*0.99, c*1.02, c*0.97, c, 3.5e7, 0]);
}

let fail=0;
const ok=(l,c)=>{ if(!c){fail=1;console.log('FAIL  '+l);} else console.log('ok    '+l); };

const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
const page=await b.newPage({viewport:{width:430,height:930}});
const errs=[]; const hits=[];
page.on('pageerror',e=>errs.push(e.message.split('\n')[0]));
page.on('dialog',d=>d.accept());

/* The exchange master is CORS-blocked on the real device. Reproduce that. */
await page.route('**/data/nse-instruments.json', r=>r.abort('failed'));
await page.route('**/assets.upstox.com/**', r=>r.abort('failed'));
await page.route('**/api.upstox.com/**', r=>{
  hits.push(r.request().url());
  r.fulfill({ status:200, contentType:'application/json',
    headers:{'access-control-allow-origin':'*'},
    body: JSON.stringify({status:'success',data:{candles}}) });
});

await page.goto('http://127.0.0.1:8848/index.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);

const out=await page.evaluate(async(j)=>{
  const full=JSON.parse(j), co=full.companies[0];
  const so=Object.assign({},full,{companies:[]});
  const imp=async(o)=>{document.getElementById('importText').value=JSON.stringify(o);
    document.getElementById('btnDoImport').click();await new Promise(s=>setTimeout(s,700));
    document.getElementById('btnSaveImport').click();await new Promise(s=>setTimeout(s,3500));};
  const tab=t=>[...document.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();
  tab('sector');document.getElementById('btnImport').click();await imp(so);
  tab('company');await new Promise(s=>setTimeout(s,300));
  document.querySelector('.co-import[data-rank="1"]')?.click();
  await new Promise(s=>setTimeout(s,300));
  await imp({run:so.run,companies:[co]});
  await new Promise(s=>setTimeout(s,1200));
  const p=window.EQDocTools.currentPayload();
  const c=(p&&p.report.full||[])[0]||null;
  return { imported:!!c, symbol:c&&c.symbol,
    closes:(c&&c.priceHistory&&c.priceHistory.closes||[]).length,
    spacing:c&&c.priceHistory&&c.priceHistory.spacing,
    source:c&&c.priceHistory&&c.priceHistory.source,
    technicals: !!(c&&c.technicalPanel&&c.technicalPanel.available),
    indicators: c&&c.technicalPanel? Object.keys(c.technicalPanel).length : 0 };
}, json);

console.log('  upstox calls:', hits.length, hits[0]?hits[0].replace(/^https:\/\/[^/]+/,''):'');
console.log('  result:', JSON.stringify(out));
ok('the company imported', out.imported);
ok('the Upstox endpoint was called with the payload ISIN',
   hits.length>0 && /INE160A01022/.test(hits[0]));
ok('the candle endpoint is keyed NSE_EQ|ISIN', hits.length>0 && /NSE_EQ%7C|NSE_EQ\|/.test(hits[0]));
ok('price history landed on the company', out.closes >= 100);
ok('it is weekly', out.spacing==='weekly');
ok('the technical panel now computes', out.technicals);
ok('the series travels with the report, so a chart can be drawn from it',
   out.closes >= 100 && out.spacing === 'weekly');
ok('the blocked instrument master did not stop any of it', out.closes>=100);
ok('no page errors', errs.length===0);
if(errs.length) console.log('      '+errs.slice(0,3).join('\n      '));

await b.close();
console.log('\n'+(fail?'FAIL':'PASS'));
process.exit(fail?1:0);
