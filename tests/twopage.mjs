import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const alerts=[]; const errors=[]; const opened=[]; let clip=null;
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>alerts.push(String(m).split('\n')[0]); w.confirm=()=>true;
    w.navigator.clipboard={writeText:async(t)=>{clip=t;}};
    w.open=(u)=>{ opened.push(u); return null; };
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
const w=dom.window,d=w.document;
w.console.error=(...a)=>errors.push('console.error '+a.join(' '));
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],['report','core/report.js'],
  ['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
await new Promise(r=>setTimeout(r,250));
/* copyText falls back to a textarea+execCommand path that jsdom does not route
   to navigator.clipboard, so the real text is captured at the source. */
const origCopy=w.copyText;
w.copyText=function(t){ clip=t; return origCopy.call(this,t); };
const pause=()=>new Promise(r=>setTimeout(r,180));

console.log('TABS:', [...d.querySelectorAll('nav button')].map(b=>b.dataset.tab).join(' '));

console.log('\n--- 1. segment dropdown ---');
const segSel=d.getElementById('segSel');
console.log('  segments listed:', segSel.options.length-1);
segSel.value='Defence and aerospace'; segSel.dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();
const subSel=d.getElementById('subSel');
console.log('  subsegments for Defence:', subSel.options.length-1, '| disabled:', subSel.disabled);
console.log('  e.g.', [...subSel.options].slice(1,4).map(o=>o.value).join(', '));
subSel.value='Avionics and electronic warfare'; subSel.dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();

console.log('\n--- 2. segment research ---');
clip=null; d.getElementById('btnSegSearch').click(); await pause();
console.log('  copied:', clip?clip.length+' chars':'NOTHING');
console.log('  is placeholder:', clip? clip.includes('Loading the research engine') : '-');
console.log('  names subsegment:', clip? clip.includes('Avionics and electronic warfare') : '-');
console.log('  alert:', alerts.at(-1));
d.querySelector('#toolRow [data-tool="claude"]').click(); await pause();
console.log('  tool opened:', opened.at(-1));

console.log('\n--- 3. standalone company ---');
[...d.querySelectorAll('nav button')].find(b=>b.dataset.tab==='company').click(); await pause();
d.getElementById('soloCo').value='Punjab National Bank';
d.getElementById('soloCo').dispatchEvent(new w.Event('change',{bubbles:true}));
clip=null; d.getElementById('btnSoloSearch').click(); await pause();
console.log('  copied:', clip?clip.length+' chars':'NOTHING');
console.log('  names the company:', clip? clip.includes('Punjab National Bank'):'-');
console.log('  company mode:', clip? clip.includes('Do not screen a universe'):'-');
console.log('  alert:', alerts.at(-1));
d.querySelector('#toolRowCo [data-tool="gemini"]').click(); await pause();
console.log('  tool opened:', opened.at(-1));

console.log('\n--- 4. import segment, then Top 3 ---');
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const seg=JSON.parse(JSON.stringify(full));
seg.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named by the study'}));
seg.companies=[];
const imp=async(payload,click)=>{ click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await pause();
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,260)); };
[...d.querySelectorAll('nav button')].find(b=>b.dataset.tab==='segment').click(); await pause();
await imp(seg, ()=>d.getElementById('btnImport').click());
console.log('  segment saved  :', d.getElementById('segBoxName').textContent);
console.log('  saved picker   :', [...d.querySelectorAll('#segPick option')].map(o=>o.textContent).join(''));
[...d.querySelectorAll('nav button')].find(b=>b.dataset.tab==='company').click(); await pause();
console.log('  top3 boxes     :', d.querySelectorAll('#coBoxes .runbox').length);
for(let i=0;i<3;i++) await imp({run:seg.run,companies:[full.companies[i]]},
  ()=>d.querySelector('.co-import[data-rank="'+(i+1)+'"]').click());
console.log('  after imports  :', [...d.querySelectorAll('#coBoxes .runbox h2')].map(h=>h.textContent.replace(/\s+/g,' ').trim()).join(' | '));
console.log('  saved companies:', [...d.querySelectorAll('#coPick option')].map(o=>o.textContent.split('  ·')[0]).join(', '));

console.log('\n--- 5. Top 3 research button ---');
clip=null; d.querySelector('.co-search[data-rank="1"]').click(); await pause();
console.log('  copied:', clip?clip.length+' chars':'NOTHING', '| names it:', clip?clip.includes('State Bank'):'-');

console.log('\n--- 6. documents ---');
const cp=w.EQDocTools.currentPayload();
for(const k of ['sector','co1','co2','co3','exec','score']){
  const h=w.EQDocTools.buildHTML(cp,k,'en');
  console.log('  '+k.padEnd(7), String(h.length).padStart(7), 'chars | pages', (h.match(/class="page"/g)||[]).length);
}
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
