import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const raw=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://e.com/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
    w.navigator.clipboard={writeText:async()=>{}}; w.open=()=>null;
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n')[0]:e.message)); }});
const w=dom.window,d=w.document;
w.console.error=(...a)=>errors.push('console.error '+a.join(' '));
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
const tap=(el)=>el.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true}));

const seg=d.getElementById('segSel');
console.log('options on segSel:', seg.options.length);
tap(seg); await pause();
const panel=d.querySelector('.pickpanel');
console.log('panel opened     :', !!panel);
console.log('header           :', panel && panel.querySelector('.pkhead').textContent);
console.log('rows             :', panel ? panel.querySelectorAll('.pk').length : 0, '(matches options:', panel && panel.querySelectorAll('.pk').length===seg.options.length, ')');
const full = panel && w.getComputedStyle ? true : false;
console.log('panel is a dialog:', panel && panel.getAttribute('role')==='dialog');

/* choosing a row must set the select and fire change */
let fired=0; seg.addEventListener('change',()=>fired++);
const row=[...panel.querySelectorAll('.pk')].find(r=>/Defence/.test(r.textContent));
row.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await pause();
console.log('after choosing   : value =', JSON.stringify(seg.value), '| change fired', fired, 'time(s)');
console.log('panel closed     :', !d.querySelector('.pickmask'));

/* the sub-sector list must have refilled for the chosen sector */
console.log('sub-sector options now:', d.getElementById('subSel').options.length - 1);
tap(d.getElementById('subSel')); await pause();
console.log('sub-sector panel rows :', d.querySelectorAll('.pickpanel .pk').length);
d.querySelector('.pickmask').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
await pause();
console.log('closed by backdrop    :', !d.querySelector('.pickmask'));
console.log('errors:', errors.length?errors.join('\n'):'none');
