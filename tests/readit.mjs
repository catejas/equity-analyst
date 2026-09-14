import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
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
  ['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js'],['screen','core/screen.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,screen:eng.screen,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
const pause=()=>new Promise(r=>setTimeout(r,220)); await pause();
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};
const visible=(el)=>{ while(el){ if(el.hidden||el.classList?.contains('hidden')) return false; el=el.parentElement; } return true; };

go('sector'); await pause();
d.getElementById('btnImport').click(); await pause();
const rd=d.getElementById('btnDoImport');
console.log('READ IT present :', !!rd, '| visible:', visible(rd), '| label:', rd && rd.textContent);
console.log('Cancel  visible :', visible(d.getElementById('btnCancelImport')));

d.getElementById('importText').value=fs.readFileSync('/tmp/psu.json','utf8');
rd.click(); await new Promise(r=>setTimeout(r,320));
console.log('after READ IT   :', d.getElementById('reviewBox').textContent.replace(/\s+/g,' ').trim().slice(0,72));
console.log('SAVE visible    :', visible(d.getElementById('btnSaveImport')));
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,320));
console.log('saved runs      :', JSON.parse(w.localStorage.getItem('eq.library')||'[]').length);

console.log('\nthe import card must not follow you around:');
for(const t of ['company','score','setup','sector']){
  go(t); await pause();
  console.log('  ', t.padEnd(7), 'import card visible:', visible(d.getElementById('importCard')));
}
console.log('\nCompany page READ IT:');
go('company'); await pause();
d.getElementById('btnSoloImport').click(); await pause();
console.log('   visible:', visible(d.getElementById('btnDoImport')));
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
