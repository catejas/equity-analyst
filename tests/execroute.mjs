/* The right summary must reach the right button: a company row builds that
   company's summary, the sector page still builds the sector's. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const anlon=JSON.parse(fs.readFileSync('/mnt/user-data/uploads/Anlon.json','utf8').replace(/\uFFFD/g,'-'));
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
const w=dom.window,d=w.document;
for(const f of ['sectors.js','charts.js','render.js','docs.js']){
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
go('company'); await pause();
d.getElementById('btnSoloImport').click(); await pause();
d.getElementById('importText').value=JSON.stringify(anlon);
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,320));
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,340));

for(const k of ['solo:report','solo:exec','solo:score']){
  const cp=w.EQDocTools.currentPayload(k);
  const html=w.EQDocTools.buildHTML(cp,k,'en');
  const body=html.replace(/<script[\s\S]*?<\/script>/g,'');
  const shells=(body.match(/class="page"/g)||[]).length;
  const head=/<div class="eyebrow en">([^<]*)</.exec(body);
  console.log(k.padEnd(12), String(html.length).padStart(7), 'chars |', String(shells).padStart(2), 'shells |',
    (head?head[1].replace(/&nbsp;|·/g,' ').trim().slice(0,28):'?'));
}
console.log('\nfilename for solo:exec ->', w.EQDocTools.fileName ? w.EQDocTools.fileName('exec','en') : '(not exposed)');
console.log('errors:', errors.length?errors.join('\n'):'none');
