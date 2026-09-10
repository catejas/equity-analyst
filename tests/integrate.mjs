import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const mk=(top3)=>{ const s=JSON.parse(JSON.stringify(full));
  s.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named'}));
  s.run.tool='Claude'; s.companies=[]; return s; };
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
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
const pause=()=>new Promise(r=>setTimeout(r,220)); await pause();
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};
const imp=async(payload,click)=>{ click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await pause();
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,280)); };

const probe=(label)=>{
  const cp=w.EQDocTools.currentPayload();
  const sec=w.EQDocTools.buildHTML(cp,'sector','en');
  const ex=w.EQDocTools.buildHTML(cp,'exec','en');
  const names=['State Bank of India','Bank of Baroda','Punjab National Bank'];
  console.log(label);
  console.log('   sector : '+sec.length+' chars | companies named: '+names.filter(n=>sec.includes(n)).length+'/3');
  console.log('   exec   : '+ex.length+' chars | companies named: '+names.filter(n=>ex.includes(n)).length+'/3');
};

go('segment'); await imp(mk(), ()=>d.getElementById('btnImport').click());
probe('SEGMENT ONLY, no company imported yet');

go('company'); await pause();
await imp({run:{...full.run,tool:'Claude'},companies:[full.companies[0]]},
  ()=>d.querySelector('.co-import[data-rank="1"]').click());
probe('\nAFTER importing company 1');
for(let i=1;i<3;i++) await imp({run:{...full.run,tool:'Claude'},companies:[full.companies[i]]},
  ()=>d.querySelector('.co-import[data-rank="'+(i+1)+'"]').click());
probe('\nAFTER importing all three');

console.log('\ntool recorded from payload:',
  [...d.querySelectorAll('#segPick option')].map(o=>o.textContent).join(''));
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
