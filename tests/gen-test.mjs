import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=(m)=>errors.push('ALERT '+String(m).slice(0,120));
    w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push('ERR '+(e.error?e.error.stack.split('\n')[0]:e.message))); }});
const w=dom.window,d=w.document;
w.console.error=(...a)=>errors.push('console.error '+a.join(' '));
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],
  ['report','core/report.js'],['prompt','core/prompt-builder.js'],['rubrics','core/rubrics.js'],['compose','core/compose.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring,schema:eng.schema,report:eng.report,rubrics:eng.rubrics,compose:eng.compose,
  buildPrompt:eng.prompt.buildResearchPrompt,parsePayload:eng.schema.parsePayload,buildReport:eng.report.buildReport,
  version:{methodology:eng.scoring.METHODOLOGY_VERSION,payloadSchema:eng.schema.PAYLOAD_SCHEMA_VERSION}};
w.dispatchEvent(new w.CustomEvent('eq:ready'));
await new Promise(r=>setTimeout(r,150));
d.getElementById('importText').value=fs.readFileSync('/tmp/psu.json','utf8');
d.getElementById('btnDoImport').click(); await new Promise(r=>setTimeout(r,200));
d.getElementById('btnSaveImport').click(); await new Promise(r=>setTimeout(r,300));

// Does the document actually build through the app's own pipeline?
const p = w.EQDocTools ? w.EQDocTools.currentPayload && w.EQDocTools.currentPayload() : null;
console.log('EQDocTools present:', !!w.EQDocTools);
const fns = w.EQDocTools ? Object.keys(w.EQDocTools) : [];
console.log('its exports:', fns.join(', '));
try{
  const cp = w.EQDocTools.currentPayload();
  console.log('currentPayload ->', cp ? ('report with '+cp.report.counts.universe+' companies, meta '+cp.meta.segment) : 'NULL');
  for(const kind of ['sector','co1','co2','co3','exec','score']){
    try{
      const html = w.EQDocTools.buildHTML(cp, kind, 'en');
      const body = html.replace(/<script[\s\S]*?<\/script>/g,'');
      console.log('  '+kind.padEnd(7), String(html.length).padStart(7)+' chars',
        '| pages', (html.match(/class="page"/g)||[]).length,
        '| undefined', body.includes('undefined'), '| NaN', body.includes('NaN'));
    }catch(e){ console.log('  '+kind.padEnd(7), 'THREW:', e.message); }
  }
}catch(e){ console.log('generation threw:', e.message); }
console.log('errors:', errors.length?errors.join('\n'):'none');
