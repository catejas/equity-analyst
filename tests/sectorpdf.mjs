import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[]; const msgs=[];
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const old=JSON.parse(JSON.stringify(full));
old.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named by the model'}));
old.run.tool='Claude'; old.companies=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>msgs.push('ALERT '+String(m).split('\n')[0]); w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
const w=dom.window,d=w.document;
w.console.error=(...a)=>errors.push('console.error '+a.join(' '));
for(const f of ['sectors.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],['report','core/report.js'],
  ['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js'],['screen','core/screen.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,screen:eng.screen,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
const pause=()=>new Promise(r=>setTimeout(r,240)); await pause();
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};
const vis=(el)=>{ while(el){ if(el.hidden||el.classList?.contains('hidden')) return false; el=el.parentElement; } return true; };

go('sector'); await pause();
d.getElementById('btnImport').click(); await pause();
d.getElementById('importText').value=JSON.stringify(old);
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,320));
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,340));
console.log('saved:', JSON.parse(w.localStorage.getItem('eq.library')||'[]').length, '| alert:', msgs.at(-1));

go('sector'); await pause();
const docBtns=[...d.querySelectorAll('#segDocs [data-doc]')];
console.log('document buttons:', docBtns.map(b=>b.dataset.doc+'/'+b.dataset.act).join(' '));
console.log('visible          :', docBtns.filter(vis).length, 'of', docBtns.length);
console.log('docTools hidden  :', d.getElementById('docTools').classList.contains('hidden'));

const cp=w.EQDocTools.currentPayload('sector');
console.log('\ncurrentPayload   :', cp? ('ok, companies '+cp.report.counts.universe) : 'NULL');
if(cp){
  for(const k of ['sector','exec','score']){
    try{ const h=w.EQDocTools.buildHTML(cp,k,'en');
      console.log('  '+k.padEnd(7), String(h.length).padStart(7), 'chars | pages', (h.match(/class="page"/g)||[]).length);
    }catch(e){ console.log('  '+k, 'THREW', e.message); }
  }
}
// press the actual PDF button
errors.length=0; msgs.length=0;
d.querySelector('#segDocs [data-doc="sector"][data-act="make"]').click();
await new Promise(r=>setTimeout(r,600));
console.log('\nafter pressing Sector PDF:');
console.log('  docMsg:', (d.getElementById('docMsg')||{textContent:''}).textContent.replace(/\s+/g,' ').trim().slice(0,90));
console.log('  alerts:', msgs.join(' | ')||'none');
console.log('  errors:', errors.join(' | ')||'none');
