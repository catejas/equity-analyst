import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[]; let clip=null;
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const seg=JSON.parse(JSON.stringify(full));
seg.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named'}));
seg.companies=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
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
await new Promise(r=>setTimeout(r,250));
const orig=w.copyText; w.copyText=function(t){ clip=t; return orig.call(this,t); };
const pause=()=>new Promise(r=>setTimeout(r,200));
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};

go('segment');
d.getElementById('btnImport').click();
d.getElementById('importText').value=JSON.stringify(seg);
d.getElementById('btnDoImport').click(); await pause();
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,280));
go('company'); await pause();

const probe=(label)=>{
  const isCompanyMode = clip.includes('Do not screen a universe');
  const named = ['State Bank of India','Bank of Baroda','Punjab National Bank','Tata Motors']
    .filter(n=>clip.includes(n));
  console.log(label);
  console.log('   company mode :', isCompanyMode);
  console.log('   names found  :', named.join(', ') || '(none)');
};

console.log('=== Top 3 research, solo box EMPTY ===');
for(const r of [1,2,3]){
  clip=null; d.querySelector('.co-search[data-rank="'+r+'"]').click(); await pause();
  probe('  rank '+r);
}
console.log('\n=== solo box has a DIFFERENT name typed in ===');
d.getElementById('soloCo').value='Tata Motors';
d.getElementById('soloCo').dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();
clip=null; d.querySelector('.co-search[data-rank="1"]').click(); await pause();
probe('  rank 1 (should still be State Bank of India)');
clip=null; d.getElementById('btnSoloSearch').click(); await pause();
probe('  solo button (should be Tata Motors)');
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
