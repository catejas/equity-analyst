/* Five independent companies saved, then documents generated for an older one.
   Previously only the newest had buttons at all. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const anlon=JSON.parse(fs.readFileSync('/mnt/user-data/uploads/Anlon.json','utf8').replace(/\uFFFD/g,'-'));
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
const w=dom.window,d=w.document;
w.console.error=(...a)=>errors.push('console.error '+a.join(' '));
for(const f of ['sectors.js','charts.js','render.js','docs.js']){
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
const pause=()=>new Promise(r=>setTimeout(r,230)); await pause();
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};

go('company'); await pause();
const NAMES=['Anlon Healthcare Limited','Supriya Lifescience','Kronox Lab Sciences','Divis Labs','Laurus Labs'];
for(const nm of NAMES){
  const p=JSON.parse(JSON.stringify(anlon));
  p.companies[0].name=nm; p.companies[0].symbol=nm.split(' ')[0].toUpperCase().slice(0,6);
  d.getElementById('btnSoloImport').click(); await pause();
  d.getElementById('importText').value=JSON.stringify(p);
  d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,320));
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,340));
}
const opts=[...d.querySelectorAll('#soloPick option')];
console.log('saved independent companies:', opts.length);
opts.forEach(o=>console.log('   ', o.textContent.split('  ·')[0]));

console.log('\ndocument rows shown:', d.querySelectorAll('#soloDocs .docrow').length);
console.log('row labels:', [...d.querySelectorAll('#soloDocs .dn')].map(x=>x.textContent).join(' | '));

/* select the OLDEST saved company and build its documents */
const oldest=opts[opts.length-1];
d.getElementById('soloPick').value=oldest.value;
d.getElementById('soloPick').dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();
console.log('\nselected oldest:', oldest.textContent.split('  ·')[0]);
for(const k of ['solo:report','solo:exec','solo:score']){
  const cp=w.EQDocTools.currentPayload(k);
  var who = cp && cp.report && cp.report.full && cp.report.full[0] ? cp.report.full[0].name : null;
  console.log('  ', k.padEnd(12), cp ? ('builds for ' + who) : 'NULL');
}
/* and the newest, to prove the selection actually drives it */
const newest=opts[0];
d.getElementById('soloPick').value=newest.value;
d.getElementById('soloPick').dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();
console.log('  option value:', JSON.stringify(newest.value));
console.log('  SEL.solo now:', JSON.stringify(w.SEL && w.SEL.solo));
console.log('  soloRecord():', (typeof w.soloRecord==='function') ? (w.soloRecord()||{}).company : 'n/a');
const cp2=w.EQDocTools.currentPayload('solo:report');
console.log('switching to', newest.textContent.split('  ·')[0], '->',
  cp2 && cp2.report.full[0] ? cp2.report.full[0].name : 'NULL');
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
