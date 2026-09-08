import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const alerts=[]; const errors=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>alerts.push(String(m)); w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}};
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
await new Promise(r=>setTimeout(r,200));

const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const seg=JSON.parse(JSON.stringify(full));
seg.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named by the segment study'}));
seg.companies=[];
const cos=full.companies.map(c=>({run:seg.run, companies:[c]}));

const importInto=async(payload, click)=>{
  if(click) click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,180));
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,250));
};
// 1. segment
[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab==='report')?.click();
await new Promise(r=>setTimeout(r,150));
await importInto(seg, ()=>d.getElementById('btnImport').click());
console.log('segment box name :', d.getElementById('segBoxName').textContent);
console.log('company boxes    :', d.querySelectorAll('#coBoxes .runbox').length);
[...d.querySelectorAll('#coBoxes .runbox h2')].forEach(h=>console.log('   ', h.textContent.replace(/\s+/g,' ').trim()));

// 2. each company into its own box
for(let i=0;i<3;i++){
  await importInto(cos[i], ()=>d.querySelector('.co-import[data-rank="'+(i+1)+'"]').click());
}
console.log('\nafter three company imports:');
[...d.querySelectorAll('#coBoxes .runbox h2')].forEach(h=>console.log('   ', h.textContent.replace(/\s+/g,' ').trim()));
console.log('library records:', JSON.parse(w.localStorage.getItem('eq.library')||'[]')
  .map(r=>r.kind+':'+(r.company||'')).join(' | '));

// 3. documents from the composed run
const cp=w.EQDocTools.currentPayload();
console.log('\ncomposed run companies:', cp && cp.report.counts.universe);
for(const kind of ['sector','co1','co2','co3','exec','score']){
  try{ const html=w.EQDocTools.buildHTML(cp, kind, 'en');
    console.log('  '+kind.padEnd(7), String(html.length).padStart(7), 'chars | pages',
      (html.match(/class="page"/g)||[]).length);
  }catch(e){ console.log('  '+kind, 'THREW', e.message); }
}
// 4. delete one company
d.querySelector('.co-del[data-rank="2"]').click(); await new Promise(r=>setTimeout(r,200));
console.log('\nafter deleting rank 2:',
  [...d.querySelectorAll('#coBoxes .runbox h2')].map(h=>h.textContent.replace(/\s+/g,' ').trim()).join(' | '));
console.log('composed now:', w.EQDocTools.currentPayload().report.counts.universe, 'companies');
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
