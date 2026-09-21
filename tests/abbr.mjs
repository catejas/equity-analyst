/* Financial abbreviations are capitals wherever they appear — heading, table
   header, label or payload prose. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const b=await chromium.launch({executablePath:'/opt/google/chrome/chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1000,height:1400}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message.split('\n')[0]));
await p.setContent(fs.readFileSync('/tmp/pnb-co1.html','utf8'),{waitUntil:'networkidle'});
await p.waitForTimeout(1100);
const r = await p.evaluate(() => {
  const t = document.body.innerText;
  const bad = [];
  /* Any of these in mixed or lower case is the defect. */
  ['Ebitda','ebitda','Roe','roe','Roic','roic','Wacc','wacc','Eps','Npa','Casa','Sotp','Cwip','Esg','Cagr','Nim','Pcr']
    .forEach(w => { if (new RegExp('\\b'+w+'\\b').test(t)) bad.push(w); });
  return {
    bad,
    hasEbitda: /\bEBITDA\b/.test(t), hasRoe: /\bROE\b/.test(t),
    hasWacc: /\bWACC\b/.test(t), hasPe: /P\/E/.test(t),
    hasEsg: /\bESG\b/.test(t),
    /* nothing may have been mangled inside a longer word */
    mangled: /[a-z](EBITDA|ROE|WACC)|(EBITDA|ROE|WACC)[a-z]/.test(t),
  };
});
await b.close();
let fail=0; const ok=(l,c)=>{ if(!c){fail=1;console.log('FAIL  '+l);} else console.log('ok    '+l); };
ok('no abbreviation left in mixed or lower case', r.bad.length===0);
if(r.bad.length) console.log('      still lowercase:', r.bad.join(' '));
ok('EBITDA appears in capitals', r.hasEbitda);
ok('ROE appears in capitals', r.hasRoe);
ok('WACC appears in capitals', r.hasWacc);
ok('P/E keeps its slash', r.hasPe);
ok('ESG survives', r.hasEsg);
ok('nothing mangled inside a longer word', r.mangled===false);
ok('no render errors', errs.length===0);
console.log('\n'+(fail?'FAIL':'PASS'));
process.exit(fail?1:0);
