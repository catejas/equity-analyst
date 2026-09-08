import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp';
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const seg=JSON.parse(JSON.stringify(full));
seg.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named by the study'}));
seg.companies=[];

async function boot(storage){
  const alerts=[], errors=[];
  const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
    runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
    beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      w.scrollTo=()=>{}; w.alert=(m)=>alerts.push(String(m).split('\n')[0]); w.confirm=()=>true;
      w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
      w.HTMLCanvasElement.prototype.getContext=()=>null;
      w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message));
      if(storage) for(const k in storage) w.localStorage.setItem(k, storage[k]); }});
  const w=dom.window,d=w.document;
  w.console.error=(...a)=>errors.push('console.error '+a.join(' '));
  for(const f of ['segments.js','charts.js','render.js','docs.js']){
    const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
  const eng={};
  for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],['report','core/report.js'],
    ['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]) eng[k]=await import(dir+'/src/'+p);
  /* the engine lands late, exactly as the module does on a phone */
  await new Promise(r=>setTimeout(r,120));
  w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,
    buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
    version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
  w.dispatchEvent(new w.CustomEvent('eq:ready'));
  await new Promise(r=>setTimeout(r,250));
  return {w,d,alerts,errors};
}
const pause=()=>new Promise(r=>setTimeout(r,200));

let {w,d,alerts,errors}=await boot();
const imp=async(payload,click,tool)=>{ click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await pause();
  if(tool){ const sel=d.getElementById('importSrc'); sel.value=tool; sel.dispatchEvent(new w.Event('change',{bubbles:true})); }
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,280)); };

const go=(t)=>{ [...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click(); };
go('segment');
await imp(seg, ()=>d.getElementById('btnImport').click(), 'Claude');
console.log('--- 2. tool name ---');
console.log('  saved as:', [...d.querySelectorAll('#segPick option')].map(o=>o.textContent).join(''));

go('company');
for(let i=0;i<3;i++) await imp({run:seg.run,companies:[full.companies[i]]},
  ()=>d.querySelector('.co-import[data-rank="'+(i+1)+'"]').click(), 'Claude');
console.log('\n--- 3. standalone must not touch the Top 3 ---');
const solo={run:{...seg.run, top3:undefined}, companies:[{...full.companies[0], symbol:'INDIANB', name:'Indian Bank'}]};
await imp(solo, ()=>d.getElementById('btnSoloImport').click(), 'Claude');
console.log('  top3 boxes:', [...d.querySelectorAll('#coBoxes .runbox h2')].map(h=>h.textContent.replace(/\s+/g,' ').trim()).join(' | '));
console.log('  saved companies:', [...d.querySelectorAll('#coPick option')].map(o=>o.textContent.split('  ·')[0]).join(', '));

console.log('\n--- 6. section count by scope ---');
d.getElementById('importText').value=JSON.stringify(solo);
d.getElementById('btnDoImport').click(); await pause();
console.log(' ', (d.querySelector('#reviewBox .rvh')||{textContent:'?'}).textContent.replace(/\s+/g,' ').trim().slice(0,80));
d.getElementById('btnCancelImport').click(); await pause();

const saved={}; for(let i=0;i<w.localStorage.length;i++){ const k=w.localStorage.key(i); saved[k]=w.localStorage.getItem(k); }

console.log('\n--- 1. cold restart ---');
({w,d,alerts,errors}=await boot(saved));
[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab==='company').click();
await pause();
console.log('  top3 boxes after restart:', d.querySelectorAll('#coBoxes .runbox').length);
console.log('  names:', [...d.querySelectorAll('#coBoxes .runbox h2 span:nth-child(2)')].map(s=>s.textContent).join(' | '));

console.log('\n--- 4. standalone scores on its own ---');
const opts=[...d.querySelectorAll('#coPick option')];
const solOpt=opts.find(o=>/Indian Bank/.test(o.textContent));
d.getElementById('coPick').value=solOpt.value;
d.getElementById('coPick').dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();
w.renderScoreTab(); await pause();
console.log('  score tiles:', [...d.querySelectorAll('#scTiles .t')].map(t=>t.querySelector('.k').textContent+' '+t.querySelector('.v').textContent.replace(/\s+/g,'')).join(' | '));
console.log('  models:', d.querySelectorAll('#sheet .pill').length);
console.log('  first line:', (d.querySelector('#sheet .ln .r1')||{textContent:'?'}).textContent.replace(/\s+/g,' ').trim());

console.log('\n--- 5. names ---');
console.log('  tab:', [...d.querySelectorAll('nav button')].map(b=>b.textContent).join(' '));
console.log('  score heading:', d.querySelector('#tab-score h2').textContent);
console.log('  sector label:', d.querySelector('label[for="scSector"]').textContent);
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
