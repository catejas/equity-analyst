import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const mkco=(n,a,b,c,d)=>({symbol:n.split(' ').map(w=>w[0]).join('').toUpperCase(),name:n,
  ratings:{businessQuality:{score:a,evidence:'ROA 1.1%'},growthMultibagger:{score:b,evidence:'advances +16%'},
    valuationOpportunity:{score:c,evidence:'0.9x book'},riskQuality:{score:d,evidence:'GNPA 1.5%'}}});
function segRun(tool, shortlist){
  const s=JSON.parse(JSON.stringify(full));
  s.run.segment='Banking'; s.run.subsegment='Public sector banks'; s.run.tool=tool;
  delete s.run.top3; s.companies=[]; s.shortlist=shortlist; return s;
}
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
  ['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js'],['screen','core/screen.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,screen:eng.screen,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
const pause=()=>new Promise(r=>setTimeout(r,220)); await pause();
const go=(t)=>{[...d.querySelectorAll('nav button')].find(x=>x.dataset.tab===t)?.click();};
const imp=async(payload,click)=>{ click();
  d.getElementById('importText').value=JSON.stringify(payload);
  d.getElementById('btnDoImport').click(); await pause();
  d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,300)); };

// the SAME twelve ratings, submitted by two tools in different order
const twelve=[mkco('State Bank of India',74,68,67,68), mkco('Bank of Baroda',64,78,62,58),
  mkco('Punjab National Bank',60,74,66,55), mkco('Canara Bank',66,70,71,62),
  mkco('Union Bank of India',69,72,65,66), mkco('Indian Bank',71,66,69,70),
  mkco('Bank of India',58,66,70,54), mkco('Central Bank',52,60,64,50),
  mkco('UCO Bank',49,58,61,47), mkco('Bank of Maharashtra',68,75,63,64),
  mkco('Punjab and Sind Bank',45,55,59,44), mkco('Indian Overseas Bank',47,57,62,46)];

go('segment');
await imp(segRun('Claude', twelve), ()=>d.getElementById('btnImport').click());
go('company'); await pause();
const slotNames=()=>[...d.querySelectorAll('#coBoxes .runbox h2 span:nth-child(2)')].map(s=>s.textContent);
console.log('Claude, order A  ->', slotNames().join(' | '));

go('segment');
await imp(segRun('Gemini', [...twelve].reverse()), ()=>d.getElementById('btnImport').click());
go('company'); await pause();
console.log('Gemini, order B  ->', slotNames().join(' | '));

console.log('\nthe reason shown on each box:');
[...d.querySelectorAll('#coBoxes .slotwhy')].forEach(x=>console.log('   ', x.textContent.replace(/\s+/g,' ').trim().slice(0,86)));

// an older run that named its own three still works
go('segment');
const legacy=JSON.parse(JSON.stringify(full));
legacy.run.tool='Perplexity'; legacy.companies=[];
legacy.run.top3=[{symbol:'X',name:'Legacy Bank',why:'named by the model'}];
await imp(legacy, ()=>d.getElementById('btnImport').click());
go('company'); await pause();
console.log('\nolder run naming its own three ->', slotNames().join(' | '));
console.log('\nerrors:', errors.length?errors.join('\n'):'none');
