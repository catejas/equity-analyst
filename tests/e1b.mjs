import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>errors.push('ALERT '+String(m).slice(0,150)); w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n').slice(0,2).join(' | '):e.message)); }});
const w=dom.window,d=w.document;
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],['report','core/report.js'],
  ['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
await new Promise(r=>setTimeout(r,200));

d.getElementById('segment').value='Defence and aerospace';
d.getElementById('segment').dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,100));
console.log('segment mode formVals:', JSON.stringify(w.formVals()));
try{ console.log('  buildPrompt ->', w.buildPrompt().length, 'chars'); }
catch(e){ console.log('  buildPrompt THREW:', e.message); }

d.getElementById('company').value='Punjab National Bank';
d.getElementById('company').dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,120));
console.log('\ncompany mode formVals:', JSON.stringify(w.formVals()));
try{ const p=w.buildPrompt();
  console.log('  buildPrompt ->', p.length, 'chars');
  console.log('  names the company:', p.includes('Punjab National Bank'));
  console.log('  company mode text:', p.includes('Do not screen a universe'));
}catch(e){ console.log('  buildPrompt THREW:', e.message); }

// with no segment at all — the case a user hits when they only want one company
d.getElementById('segment').value='';
d.getElementById('segment').dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,100));
console.log('\ncompany only, no segment:', JSON.stringify(w.formVals()));
try{ console.log('  buildPrompt ->', w.buildPrompt().length, 'chars'); }
catch(e){ console.log('  buildPrompt THREW:', e.message); }
d.getElementById('btnSearch').click(); await new Promise(r=>setTimeout(r,150));
console.log('  alerts:', errors.join(' | ')||'none');
