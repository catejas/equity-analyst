import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const seg=JSON.parse(JSON.stringify(full));
seg.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named'}));
seg.companies=[];
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
const pause=()=>new Promise(r=>setTimeout(r,220));
await pause();
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};
const imp=async(payload,click)=>{ click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await pause();
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,280)); };

go('segment'); await imp(seg, ()=>d.getElementById('btnImport').click());
go('company'); await pause();
for(let i=0;i<3;i++) await imp({run:seg.run,companies:[full.companies[i]]},
  ()=>d.querySelector('.co-import[data-rank="'+(i+1)+'"]').click());

// independent company, a different one entirely
const solo={run:{...seg.run,top3:undefined},
  companies:[{...full.companies[0], symbol:'INDIANB', name:'Indian Bank'}]};
await imp(solo, ()=>d.getElementById('btnSoloImport').click());

console.log('library:', JSON.parse(w.localStorage.getItem('eq.library')||'[]')
  .map(r=>r.kind+(r.standalone?'/solo':'')+':'+(r.company||r.segment)).join('\n         '));
console.log('\ncoPick options:', [...d.querySelectorAll('#coPick option')].map(o=>o.textContent.split('  ·')[0]).join(' | '));
w.renderScoreTab(); await pause();
console.log('scCompany options:', [...d.querySelectorAll('#scCompany option')].map(o=>o.textContent.split('  ·')[0]).join(' | '));

// pick the independent one and see which company the PDF button addresses
const opt=[...d.querySelectorAll('#coPick option')].find(o=>/Indian Bank/.test(o.textContent));
console.log('\nIndian Bank in coPick:', !!opt);
if(opt){
  d.getElementById('coPick').value=opt.value;
  d.getElementById('coPick').dispatchEvent(new w.Event('change',{bubbles:true}));
  await pause();
  const cp=w.EQDocTools.currentPayload();
  const html=w.EQDocTools.buildHTML(cp,'solo','en');
  const m=/<h1 class="en"[^>]*>([^<]*)</.exec(html);
  console.log('solo PDF builds for :', m?m[1]:'?');
  console.log('companyIndex used   :', cp.companyIndex, 'of', cp.report.counts.universe);
}
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
