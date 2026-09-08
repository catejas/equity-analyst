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

console.log('tabs:', [...d.querySelectorAll('nav button')].map(b=>b.dataset.tab).join(' '));
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const seg=JSON.parse(JSON.stringify(full));
seg.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named by the study'}));
seg.companies=[];
const imp=async(payload,click)=>{ click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,180));
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,260)); };

const go=(t)=>{ [...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click(); };
go('sector');
await imp(seg, ()=>d.getElementById('btnImport').click());
console.log('\nSECTOR page');
console.log('  title  :', d.getElementById('segBoxName').textContent);
console.log('  picker :', [...d.querySelectorAll('#segPick option')].map(o=>o.textContent).join(' | '));
console.log('  docs   :', [...d.querySelectorAll('#segDocs [data-doc]')].map(b=>b.dataset.doc+'/'+b.dataset.act).join(' '));

go('company');
for(let i=0;i<3;i++) await imp({run:seg.run,companies:[full.companies[i]]},
  ()=>d.querySelector('.co-import[data-rank="'+(i+1)+'"]').click());
console.log('\nCOMPANY page');
console.log('  picker :', [...d.querySelectorAll('#coPick option')].map(o=>o.textContent).join('\n            '));
console.log('  slots  :', [...d.querySelectorAll('#coBoxes .runbox h2')].map(h=>h.textContent.replace(/\s+/g,' ').trim()).join(' | '));
console.log('  doc btn:', [...d.querySelectorAll('#coDocs [data-doc]')].map(b=>b.dataset.doc).join(' '));

// switch company and confirm the report button follows
const opts=[...d.querySelectorAll('#coPick option')];
d.getElementById('coPick').value=opts[1].value;
d.getElementById('coPick').dispatchEvent(new w.Event('change',{bubbles:true}));
await new Promise(r=>setTimeout(r,150));
console.log('  after switching to', opts[1].textContent.split('  ·')[0], '-> doc', d.querySelector('#coDocs [data-doc]').dataset.doc);

go('score');
w.renderScoreTab(); await new Promise(r=>setTimeout(r,150));
console.log('\nSCORE page');
console.log('  sector picker :', [...d.querySelectorAll('#scSector option')].length, 'entries');
console.log('  company picker:', [...d.querySelectorAll('#scCompany option')].map(o=>o.textContent).join('\n                   '));
console.log('  models        :', d.querySelectorAll('#sheet .pill').length);
console.log('  first line    :', (d.querySelector('#sheet .ln .r1')||{textContent:'?'}).textContent.replace(/\s+/g,' ').trim());

// documents still build
const cp=w.EQDocTools.currentPayload();
for(const k of ['sector','co1','co2','co3','exec','score']){
  const h=w.EQDocTools.buildHTML(cp,k,'en');
  console.log('  '+k.padEnd(7), String(h.length).padStart(7), 'chars');
}
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
