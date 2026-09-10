import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
function segRun(segment, sub, tool, names){
  const s=JSON.parse(JSON.stringify(full));
  s.run.segment=segment; s.run.subsegment=sub; s.run.tool=tool;
  s.run.top3=names.map((n,i)=>({symbol:'S'+i+n.slice(0,3).toUpperCase(),name:n,why:'named'}));
  s.companies=[]; return s;
}
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
const slots=()=>[...d.querySelectorAll('#coBoxes .runbox h2 span:nth-child(2)')].map(s=>s.textContent);

go('segment');
await imp(segRun('Banking','Public sector banks','Claude',
  ['State Bank of India','Bank of Baroda','Union Bank of India']),
  ()=>d.getElementById('btnImport').click());
go('company'); await pause();
console.log('Banking/Claude   ->', slots().join(' | '));

go('segment');
await imp(segRun('Defence and aerospace','Drones','Claude',
  ['Data Patterns','Ideaforge','Zen Technologies']),
  ()=>d.getElementById('btnImport').click());
go('company'); await pause();
console.log('Defence/Claude   ->', slots().join(' | '));

// same segment again, different tool
go('segment');
await imp(segRun('Banking','Public sector banks','Gemini',
  ['Indian Bank','Canara Bank','Bank of India']),
  ()=>d.getElementById('btnImport').click());
go('company'); await pause();
console.log('Banking/Gemini   ->', slots().join(' | '));

console.log('\nsaved segment runs:');
[...d.querySelectorAll('#segPick option')].forEach(o=>console.log('   ', o.textContent));

// switch back to each and confirm its own Top 3 loads
const opts=[...d.querySelectorAll('#segPick option')];
for(const o of opts){
  d.getElementById('segPick').value=o.value;
  d.getElementById('segPick').dispatchEvent(new w.Event('change',{bubbles:true}));
  await pause(); go('company'); await pause();
  console.log('selecting', JSON.stringify(o.textContent.slice(0,40)), '->', slots().join(' | '));
}
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
