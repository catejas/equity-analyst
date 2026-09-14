/* Pressing READ IT must leave the import panel standing. Four separate bugs
   have now been "a container held more than the thing being hidden", and every
   one of them survived because the tests only ever pressed the button once and
   only ever checked the review text. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const raw=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const solo={ run:{...raw.run, tool:'Claude', schemaVersion:'4.0.0', top3:undefined},
  companies:[{...raw.companies[0], symbol:'ANLON', name:'Anlon Healthcare Limited'}] };
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
const w=dom.window,d=w.document;
w.console.error=(...a)=>errors.push('console.error '+a.join(' '));
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],['report','core/report.js'],
  ['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js'],
  ['screen','core/screen.js'],['indicators','core/indicators.js'],['models','core/models.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,
  screen:eng.screen,indicators:eng.indicators,models:eng.models,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
const pause=()=>new Promise(r=>setTimeout(r,240)); await pause();
const vis=(id)=>{ let el=d.getElementById(id); while(el){ if(el.hidden||el.classList?.contains('hidden')) return false; el=el.parentElement; } return true; };
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};

go('company'); await pause();
d.getElementById('btnSoloImport').click(); await pause();
console.log('before press  — READ IT visible:', vis('btnDoImport'), '| Cancel:', vis('btnCancelImport'));

d.getElementById('importText').value=JSON.stringify(solo);
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,340));
console.log('after press 1 — READ IT visible:', vis('btnDoImport'), '| SAVE visible:', vis('btnSaveImport'));
console.log('  review says :', (d.getElementById('reviewBox').textContent||'').replace(/\s+/g,' ').trim().slice(0,70));
console.log('  message     :', (d.getElementById('importMsg').textContent||'(none)').slice(0,70));

/* press it again — the real user behaviour when nothing appears to happen */
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,340));
console.log('after press 2 — READ IT visible:', vis('btnDoImport'), '| SAVE visible:', vis('btnSaveImport'));

d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,340));
const lib=JSON.parse(w.localStorage.getItem('eq.library')||'[]');
console.log('saved         :', lib.length, lib.map(r=>r.kind+':'+r.company).join(', '));
console.log('standalone    :', lib[0] && lib[0].standalone);
console.log('errors:', errors.length?errors.join('\n'):'none');
