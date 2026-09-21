/* The import audit must tell "nothing to report" from "did not report".
 *
 * On the PNB run it flagged three gaps that were not gaps: nothing had been
 * screened out, a domestic bank has no trade data, and the price history is
 * fetched by the app rather than transcribed by the research. Telling someone
 * to go and fix research that is already correct is worse than saying nothing,
 * because it teaches them to ignore the audit. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const SRC='/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/944cc4df-attachment.txt';
const raw=fs.readFileSync(SRC,'utf8');
const json=raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1);
let fail=0; const ok=(l,c)=>{ if(!c){fail=1;console.log('FAIL  '+l);} else console.log('ok    '+l); };
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:430,height:930}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message.split('\n')[0]));
await p.route('**/api.upstox.com/**', r=>r.abort('failed'));
await p.goto('http://127.0.0.1:8848/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1200);

const r=await p.evaluate((j)=>{
  const full=JSON.parse(j);
  const co=full.companies[0];
  const companyRun={run:full.run, companies:[co]};
  const a=auditPayload(full), c=auditPayload(companyRun);
  const flat=(x)=>x.groups.reduce((m,g)=>{ m[g.key]={gaps:g.gaps,noted:g.noted||[]}; return m; },{});
  /* And the negative control: strip what justifies each excuse and the gap
     must come back. */
  const noIsin=JSON.parse(JSON.stringify(companyRun)); delete noIsin.companies[0].isin;
  const skewed=JSON.parse(JSON.stringify(full)); skewed.universe.screened=0;
  const risky=JSON.parse(JSON.stringify(full)); risky.geopolitics.tariffRisk='High — 25% duty exposure';
  return { full:flat(a), co:flat(c),
    noIsinGaps: flat(auditPayload(noIsin)).mkt.gaps,
    skewedGaps: flat(auditPayload(skewed)).run.gaps,
    riskyGaps: flat(auditPayload(risky)).macro.gaps };
}, json);

const has=(arr,needle)=>arr.some(x=>x.indexOf(needle)>=0);
console.log('  run gaps   :', r.full.run.gaps);
console.log('  run noted  :', r.full.run.noted);
console.log('  macro gaps :', r.full.macro.gaps.slice(0,3));
console.log('  macro noted:', r.full.macro.noted);
console.log('  mkt gaps   :', r.co.mkt.gaps);
console.log('  mkt noted  :', r.co.mkt.noted);

ok('"what was screened out" is no longer a gap when nothing was screened out',
   !has(r.full.run.gaps,'screened out'));
ok('and it says why', has(r.full.run.noted,'nothing was screened out'));
ok('"trade data" is no longer a gap for a purely domestic business',
   !has(r.full.macro.gaps,'Trade data'));
ok('and it says why', has(r.full.macro.noted,'import, export, tariff and sanction'));
ok('price history is no longer demanded from the research when an ISIN is given',
   !has(r.co.mkt.gaps,'Price history'));
ok('and it says why', has(r.co.mkt.noted,'the app fetches the weekly series'));

ok('CONTROL: with no ISIN, price history is a gap again',
   has(r.noIsinGaps,'Price history'));
ok('CONTROL: when companies WERE screened out, the empty list is a gap again',
   has(r.skewedGaps,'screened out'));
ok('CONTROL: when tariff risk is real, missing trade data is a gap again',
   has(r.riskyGaps,'Trade data'));
ok('no page errors', errs.length===0);
if(errs.length) console.log('      '+errs.slice(0,3).join('\n      '));
await b.close();
console.log('\n'+(fail?'FAIL':'PASS'));
process.exit(fail?1:0);
