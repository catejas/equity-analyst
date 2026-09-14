import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const raw=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const closes=Array.from({length:110},(_,i)=>780+90*Math.sin(i/9)+i*1.6);
closes[closes.length-1]=Math.max(...closes)+9;
const series={spacing:'weekly',closes,highs:closes.map(c=>c*1.015),lows:closes.map(c=>c*0.985),
  volumes:closes.map((_,i)=>i===closes.length-1?3.3e6:1.05e6),adjusted:true,asOf:'2026-09-12'};
function seg(name,tool){ const s=JSON.parse(JSON.stringify(raw));
  s.run.segment=name; s.run.tool=tool; s.run.schemaVersion='4.0.0';
  s.run.top3=raw.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named'}));
  s.companies=[]; return s; }
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
const pause=()=>new Promise(r=>setTimeout(r,230)); await pause();
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};
const imp=async(payload,click)=>{ click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await pause();
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,300)); };

console.log('versions:', JSON.stringify(w.EQ.version));

go('sector'); await imp(seg('Banking','Claude'), ()=>d.getElementById('btnImport').click());
go('company'); await pause();
for(let i=0;i<3;i++){
  const co=JSON.parse(JSON.stringify(raw.companies[i]));
  if(i===0) co.priceHistory=series;
  await imp({run:{...seg('Banking','Claude').run},companies:[co]},
    ()=>d.querySelector('.co-import[data-rank="'+(i+1)+'"]').click());
}
go('sector'); await imp(seg('Defence and aerospace','Claude'), ()=>d.getElementById('btnImport').click());

/* importing the second sector selected it; go back to the one with companies */
go('sector'); await pause();
const opts=[...d.querySelectorAll('#segPick option')];
const banking=opts.find(o=>/^Banking/.test(o.textContent.trim()));
d.getElementById('segPick').value=banking.value;
d.getElementById('segPick').dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();
console.log('selected run:', banking.textContent.trim());
const cp=w.EQDocTools.currentPayload();
console.log('\nrotation present:', !!(cp && cp.report && cp.report.rotation));
if(cp && cp.report.rotation) console.log('  ', cp.report.rotation.available? 'available, '+cp.report.rotation.comparable+' comparable, reliable '+cp.report.rotation.reliable : cp.report.rotation.caveat.slice(0,70));

for(const k of ['sector','co1','co2','co3','exec','score']){
  const h=w.EQDocTools.buildHTML(cp,k,'en');
  const b=h.replace(/<script[\s\S]*?<\/script>/g,'');
  console.log('  '+k.padEnd(7), String(h.length).padStart(7),
    '| tech', b.includes('Technical panel'), '| multibagger', b.includes('Multibagger detection'),
    '| rotation', b.includes('Where capital has moved'),
    '| undefined', b.includes('undefined'));
}
console.log('\nwhat each company report says:');
for(const k of ['co1','co2','co3']){
  const b=w.EQDocTools.buildHTML(cp,k,'en').replace(/<script[\s\S]*?<\/script>/g,'');
  const i=b.indexOf('Technical panel');
  const t=b.slice(i,i+260).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  console.log('  '+k+':', t.slice(0,150));
}
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
