import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const alerts=[]; const errors=[]; let copied=null;
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>alerts.push(String(m).slice(0,90)); w.confirm=()=>true;
    w.navigator.clipboard={writeText:async(t)=>{copied=t;}};
    w.open=(u)=>{ alerts.push('OPENED '+u); return null; };
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
await new Promise(r=>setTimeout(r,200));

const seg=d.getElementById('segment'), co=d.getElementById('company');
seg.value='Defence and aerospace'; seg.dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,120));

console.log('=== segment mode ===');
copied=null; d.getElementById('btnSearch').click(); await new Promise(r=>setTimeout(r,150));
console.log('copied:', copied ? copied.length+' chars' : 'NOTHING');
console.log('mentions company mode:', copied ? copied.includes('Do not screen a universe') : '-');

console.log('\n=== company mode ===');
co.value='Punjab National Bank'; co.dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,150));
console.log('button label:', d.getElementById('btnSearch').textContent);
copied=null; d.getElementById('btnSearch').click(); await new Promise(r=>setTimeout(r,200));
console.log('copied:', copied ? copied.length+' chars' : 'NOTHING');
console.log('is company prompt:', copied ? copied.includes('Punjab National Bank') && copied.includes('Do not screen a universe') : '-');

console.log('\n=== tool button in company mode ===');
copied=null; d.querySelector('[data-tool="claude"]').click(); await new Promise(r=>setTimeout(r,250));
console.log('copied:', copied ? copied.length+' chars' : 'NOTHING');
console.log('alerts:', alerts.join(' | ') || 'none');
console.log('errors:', errors.length?errors.join('\n'):'none');
