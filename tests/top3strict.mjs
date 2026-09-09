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
    w.navigator.clipboard={writeText:async(t)=>{clip=t;}}; w.open=()=>null;
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
const pause=()=>new Promise(r=>setTimeout(r,220));
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};

go('segment');
d.getElementById('btnImport').click();
d.getElementById('importText').value=JSON.stringify(seg);
d.getElementById('btnDoImport').click(); await pause();
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,300));
go('company'); await pause();

/* The prompt states its subject on one line. That line, verbatim, is the only
   thing worth checking — not whether a name appears somewhere in 54,000
   characters, and certainly not what the popup claims. */
function subject(text){
  if(!text) return '(nothing copied)';
  const m = /^Company:\s*(.+)$/m.exec(text);
  const s = /^Segment:\s*(.+)$/m.exec(text);
  return 'Company line: ' + (m ? JSON.stringify(m[1].trim()) : '(absent)')
       + '   |   Segment line: ' + (s ? JSON.stringify(s[1].trim()) : '(absent)');
}

console.log('=== standalone box EMPTY ===');
for(const r of [1,2,3]){
  clip=null; d.querySelector('.co-search[data-rank="'+r+'"]').click(); await pause();
  console.log('  rank '+r+' ->', subject(clip));
}

console.log('\n=== standalone box = "Tata Motors" ===');
const solo=d.getElementById('soloCo');
solo.value='Tata Motors';
solo.dispatchEvent(new w.Event('input',{bubbles:true}));
solo.dispatchEvent(new w.Event('change',{bubbles:true}));
await pause();
for(const r of [1,2,3]){
  clip=null; d.querySelector('.co-search[data-rank="'+r+'"]').click(); await pause();
  console.log('  rank '+r+' ->', subject(clip));
}
clip=null; d.getElementById('btnSoloSearch').click(); await pause();
console.log('  standalone ->', subject(clip));

console.log('\n=== what a TOOL button actually puts on the clipboard ===');
clip=null; d.querySelector('.co-search[data-rank="2"]').click(); await pause();
clip=null; d.querySelector('#toolRowCo [data-tool="claude"]').click(); await pause();
console.log('  after rank 2 Research, tool tap ->', subject(clip));
clip=null; d.getElementById('btnSoloSearch').click(); await pause();
clip=null; d.querySelector('#toolRowCo [data-tool="claude"]').click(); await pause();
console.log('  after standalone Research, tool tap ->', subject(clip));

console.log('\n=== segment page tool row ===');
go('segment'); await pause();
clip=null; d.getElementById('btnSegSearch').click(); await pause();
console.log('  after segment Research ->', subject(clip));
clip=null; d.querySelector('#toolRow [data-tool="chatgpt"]').click(); await pause();
console.log('  tool tap             ->', subject(clip));

console.log('\n=== tool tapped with no Research pressed ===');
w.LAST_PROMPT='';
clip=null; d.querySelector('#toolRow [data-tool="claude"]').click(); await pause();
console.log('  copied:', clip ? 'SOMETHING (wrong)' : 'nothing, and it said so');

console.log('\nerrors:', errors.length?errors.join('\n'):'none');
