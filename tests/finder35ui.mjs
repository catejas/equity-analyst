/* Build 35, in the real app in Chrome: Tejas's real replies of 26-11-2026
 * (seventeen blocks, with the tool's prose between them) imported one by one
 * on top of the 22-11-2026 screen. Every EPS figure and every deep dive must
 * be kept; the Companies and Solo pages must hold what they should. Upstox is
 * mocked. */
import fs from 'node:fs';
import { chromium } from 'playwright-core';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const dir='tests/fixtures/real/'; const ld=(f)=>JSON.parse(fs.readFileSync(dir+f,'utf8'));
const L=fs.readFileSync(dir+'finder-26-11-2026-replies.txt','utf8').split('\n');
const blocks=L.map((l,i)=>[i,l.trim()]).filter(([i,l])=>l.startsWith('{')).map(([i,l])=>[i,JSON.parse(l)]);
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage(); const dialogs=[]; page.on('dialog', (x) => { dialogs.push(x.message().slice(0,200)); x.accept(); });
const errs=[]; page.on('pageerror', e=>errs.push(e.message));
const t0=Date.now();
const candles=(n,monthly)=>{const o=[];for(let i=0;i<n;i++){const t=new Date(t0-i*(monthly?30.44:7)*864e5).toISOString().slice(0,10)+'T00:00:00+05:30';const c=100+((n-i)%17);o.push([t,c,c,c,c,1,0]);}return o;};
await page.route('**/api.upstox.com/**', (route)=>{ const u=decodeURIComponent(route.request().url()); const mo=/\/months\//.test(u); return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'success',data:{candles:candles(mo?72:210,mo)}})}); });
await page.route('**/bharatstockapi.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html'); await page.waitForTimeout(2500);
await page.waitForFunction(()=>window.EQ&&window.EQ.finder);
const ev=(f,a)=>page.evaluate(f,a);
const imp=async(o)=>{ await ev((o)=>{ document.getElementById('btnFinderImport').click(); document.getElementById('importText').value='```json\n'+JSON.stringify(o)+'\n```'; }, o);
  await page.waitForTimeout(300); await ev(()=>document.getElementById('btnDoImport').click()); await page.waitForTimeout(700);
  const has=await ev(()=>!!document.getElementById('btnSaveImport') && !document.getElementById('btnSaveImport').disabled);
  if(has) await ev(()=>document.getElementById('btnSaveImport').click()); await page.waitForTimeout(300);
  for(let i=0;i<120;i++){ await page.waitForTimeout(400); if(await ev(()=>!FINDER_BUSY&&!FINDER_AGAIN)) break; } return has; };
let base=ld('finder-22-11-2026-base.json');
await imp(base);
for(const n of ['1','2','3','4','5','6','7','8a','8b','9']) await imp(ld(`finder-22-11-2026-topup${n}.json`));
const state=()=>ev(()=>{ const r=finderRecord(); const d=r.data; let e=0,t=0; d.sectors.forEach(s=>(s.bellwethers||[]).forEach(b=>{t++; if(b.eps&&b.eps.length)e++;}));
  return { eps:e+'/'+t, deep:d.sectors.filter(s=>s.deepDive).map(s=>s.name).join(', '), vf:(d.verified&&d.verified.valuationFailed||[]).length, val:Object.keys(d.verified&&d.verified.valuation||{}).length }; });
const s0 = await state();
let allSaved = true, epsKept = true;
for(const [i,o] of blocks){ const saved=await imp(o); const s=await state(); if(!saved) allSaved=false; if(s.eps !== s0.eps) epsKept=false; }
const s1 = await state();
ok('all seventeen blocks are saved', allSaved && blocks.length === 17);
ok('no EPS figure is lost on the way', epsKept, s0.eps + ' → ' + s1.eps);
ok('eleven sectors keep their deep dive, Electronics manufacturing among them', s1.deep.split(', ').length === 11 && /Electronics manufacturing/.test(s1.deep), s1.deep);
const pe = await ev(() => EQ.finder.finderChecks(finderRecord().data).find((k) => /P\/E/.test(k.label)));
ok('with prices answering, the app works out P/E for 40 of 41 sectors', pe.have === 40, pe.have + '/' + pe.want);
ok('the follow-up asks no EPS of the sectors whose EPS was sent', !/Missing: [^.]*Electronics manufacturing \(EPS/.test(pe.ask) && !/Missing: [^.]*Railways \(EPS/.test(pe.ask));
/* The pages. */
await ev(() => document.querySelector('nav button[data-tab="company"]').click()); await page.waitForTimeout(400);
ok('Companies: with no Top 3 sector researched yet, it says where to start',
  await ev(() => /a Top 3 sector is researched on the Sectors page/.test(document.getElementById('coBoxes').textContent)));
await ev(() => document.querySelector('nav button[data-tab="solo"]').click()); await page.waitForTimeout(400);
ok('Solo holds the independent company and sector research',
  await ev(() => !document.getElementById('tab-solo').classList.contains('hidden') && !!document.querySelector('#tab-solo #segBox') && !!document.querySelector('#tab-solo #soloCoBox')));
ok('the steps show, with the next one marked', await ev(() => { document.querySelector('nav button[data-tab="sector"]').click(); return !!document.querySelector('#finderSteps .fsteplist li.now'); }));
ok('no page error', !errs.length, errs.join(' | '));
await b.close();
console.log(`\n${ran - fail}/${ran} checks pass`);
process.exit(fail ? 1 : 0);
