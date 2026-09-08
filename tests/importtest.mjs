import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp';
const errors=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://example.com/equity-analyst/', pretendToBeVisual:true,
  beforeParse(w){
    w.matchMedia=w.matchMedia||(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
    w.scrollTo=()=>{};
    w.alert=(m)=>errors.push('ALERT: '+String(m).slice(0,400));
    w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push('ERROR: '+(e.error?e.error.stack:e.message)));
  },
});
const w=dom.window, d=w.document;
w.console.error=(...a)=>errors.push('console.error: '+a.join(' '));
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el);
}
// the engine is an ES module; jsdom will not run it, so hand it over directly
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],
  ['report','core/report.js'],['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]){
  eng[k]=await import(dir+'/src/'+p);
}
w.EQ={ scoring:eng.scoring, schema:eng.schema, report:eng.report, rubrics:eng.rubrics,compose:eng.compose,
  buildPrompt:eng.prompt.buildResearchPrompt, parsePayload:eng.schema.parsePayload,
  buildReport:eng.report.buildReport,
  version:{ methodology:eng.scoring.METHODOLOGY_VERSION, payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION } };
w.dispatchEvent(new w.CustomEvent('eq:ready'));
await new Promise(r=>setTimeout(r,200));

const payload=fs.readFileSync('/tmp/psu.json','utf8');
console.log('=== load errors ===', errors.length?errors.join('\n'):'none');

// Drive the flow exactly as a person does.
d.getElementById('importText').value=payload;
const btnRead=d.getElementById('btnDoImport');
console.log('READ IT present:', !!btnRead);
btnRead.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,300));

const review=d.getElementById('reviewBox');
console.log('\n=== after READ IT ===');
console.log('review shown:', review && !review.classList.contains('hidden'));
console.log('save button shown:', !d.getElementById('btnSaveImport').classList.contains('hidden'));
const txt=(review?review.textContent:'').replace(/\s+/g,' ').trim();
console.log('review says:', txt.slice(0,420));
console.log('errors so far:', errors.length?errors.join('\n'):'none');

// Save it
d.getElementById('btnSaveImport').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,300));
console.log('\n=== after SAVE ===');
const lib=JSON.parse(w.localStorage.getItem('eq.library')||'[]');
console.log('runs in library:', lib.length);
if(lib[0]) console.log('saved run:', lib[0].segment, '| companies:', lib[0].report?.counts?.universe,
  '| top3:', (lib[0].report?.top3||[]).map(c=>c.symbol).join(',')||'(none)');
console.log('errors:', errors.length?errors.join('\n').slice(0,900):'none');
