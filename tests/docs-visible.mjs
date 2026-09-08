import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp';
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null; }});
const w=dom.window,d=w.document;
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],
  ['report','core/report.js'],['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
await new Promise(r=>setTimeout(r,150));

d.getElementById('importText').value=fs.readFileSync('/tmp/psu.json','utf8');
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,200));
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,300));

// go to the Report tab, as the person does
[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab==='report')?.click();
await new Promise(r=>setTimeout(r,250));

const visible = (el) => { while(el){ if(el.hidden || el.classList?.contains('hidden')) return false; el=el.parentElement; } return true; };
const rows=[...d.querySelectorAll('[data-doc]')];
console.log('document buttons in the DOM:', rows.length);
console.log('visible to the user     :', rows.filter(visible).length);
rows.slice(0,4).forEach(b=>{
  let hiddenBy=null, el=b;
  while(el){ if(el.hidden||el.classList?.contains('hidden')){ hiddenBy = el.id || el.className; break; } el=el.parentElement; }
  console.log('  ', b.dataset.doc, b.dataset.act, '->', hiddenBy? ('HIDDEN by '+hiddenBy) : 'visible');
});
console.log('\nlibSel value:', d.getElementById('libSel')?.value);
console.log('library size:', JSON.parse(w.localStorage.getItem('eq.library')||'[]').length);
