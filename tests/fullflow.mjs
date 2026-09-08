import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://example.com/e/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>errors.push('ALERT: '+String(m).slice(0,200));
    w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push('ERROR: '+(e.error?e.error.stack.split('\n').slice(0,3).join(' | '):e.message))); }});
const w=dom.window, d=w.document;
w.console.error=(...a)=>errors.push('console.error: '+a.join(' '));
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],
  ['report','core/report.js'],['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={ scoring:eng.scoring, schema:eng.schema, report:eng.report, rubrics:eng.rubrics,compose:eng.compose,
  buildPrompt:eng.prompt.buildResearchPrompt, parsePayload:eng.schema.parsePayload, buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION} };
w.dispatchEvent(new w.CustomEvent('eq:ready'));
await new Promise(r=>setTimeout(r,200));

// import
d.getElementById('importText').value=fs.readFileSync('/tmp/psu.json','utf8');
d.getElementById('btnDoImport').click();
await new Promise(r=>setTimeout(r,200));
d.getElementById('btnSaveImport').click();
await new Promise(r=>setTimeout(r,300));
console.log('runs saved:', JSON.parse(w.localStorage.getItem('eq.library')||'[]').length);

// every tab
for(const tab of ['analyse','report','score','setup']){
  const b=[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===tab);
  if(b){ b.click(); await new Promise(r=>setTimeout(r,150)); }
  console.log('tab', tab, '->', d.getElementById('tab-'+tab)?.classList.contains('hidden')?'HIDDEN':'shown');
}
// segment picker
d.getElementById('segment').value='defence';
d.getElementById('segment').dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,120));
console.log('segment picker rows:', d.querySelectorAll('#segPanel .pk').length);
// company mode
d.getElementById('company').value='Bharat Electronics';
d.getElementById('company').dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,120));
console.log('mode note:', (d.getElementById('modeNote').textContent||'').slice(0,60));
// prompt
d.getElementById('company').value='';
d.getElementById('company').dispatchEvent(new w.Event('input',{bubbles:true}));
console.log('prompt length:', (w.buildPrompt()||'').length);
// score card
d.getElementById('scPanel') && d.getElementById('btnScPick').click();
await new Promise(r=>setTimeout(r,150));
console.log('run picker rows:', d.querySelectorAll('#scPanel .pk').length);
w.renderScoreTab();
await new Promise(r=>setTimeout(r,150));
console.log('score models rendered:', d.querySelectorAll('#sheet .pill').length);
console.log('company options:', d.querySelectorAll('#scCo option').length);
// setup build
console.log('build shown:', JSON.stringify(d.getElementById('verBuild').textContent));
// documents
console.log('document rows:', d.querySelectorAll('.doc-row [data-doc]').length/2);
console.log('\nERRORS:', errors.length? errors.join('\n') : 'none');
