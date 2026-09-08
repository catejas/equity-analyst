import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const alerts=[]; const errors=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>alerts.push(String(m)); w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
const w=dom.window,d=w.document;
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],
  ['report','core/report.js'],['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={ scoring:eng.scoring, schema:eng.schema, report:eng.report, rubrics:eng.rubrics,compose:eng.compose,
  buildPrompt:eng.prompt.buildResearchPrompt, parsePayload:eng.schema.parsePayload, buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION} };
w.dispatchEvent(new w.CustomEvent('eq:ready'));
await new Promise(r=>setTimeout(r,150));

const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));

// --- Block 1: segment work only, exactly as a split reply sends it
const block1=JSON.parse(JSON.stringify(full)); block1.companies=[];
d.getElementById('importText').value=JSON.stringify(block1);
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,200));
console.log('block 1 review:', (d.getElementById('reviewBox').textContent||'').replace(/\s+/g,' ').slice(0,120));
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,250));
let lib=JSON.parse(w.localStorage.getItem('eq.library')||'[]');
console.log('after block 1 — runs:', lib.length, '| partial:', lib[0] && lib[0].partial);
console.log('alert:', (alerts[alerts.length-1]||'').slice(0,110));

// --- a payload whose risks use the ordinary words
const words=JSON.parse(JSON.stringify(full));
words.companies.forEach(c=>{ (c.risks||[]).forEach((r,i)=>{ r.severity=['high','medium','minor','critical'][i%4]; }); });
d.getElementById('importText').value=JSON.stringify(words);
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,200));
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,300));
lib=JSON.parse(w.localStorage.getItem('eq.library')||'[]');
console.log('\nafter the "high/medium/minor" payload — runs:', lib.length);
console.log('alert:', (alerts[alerts.length-1]||'').slice(0,140));
const saved=lib.find(x=>x.report && x.report.counts && x.report.counts.universe===3);
console.log('companies scored:', saved && saved.report.counts.scored);
console.log('severities stored:', saved && saved.report.full[0].risks.map(r=>r.severity).join(','));
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
