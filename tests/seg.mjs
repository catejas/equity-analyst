import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp'; const errors=[];
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://example.com/e/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null;
    w.addEventListener('error',e=>errors.push(e.error?e.error.stack.split('\n').slice(0,4).join(' | '):e.message)); }});
const w=dom.window, d=w.document;
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); d.body.appendChild(el); }
await new Promise(r=>setTimeout(r,150));
console.log('EQSegments loaded:', !!w.EQSegments, w.EQSegments && w.EQSegments.count.segments);
console.log('#segment present:', !!d.getElementById('segment'));
console.log('#segPanel present:', !!d.getElementById('segPanel'));
console.log('#btnSegPick present:', !!d.getElementById('btnSegPick'));
d.getElementById('segment').value='defence';
d.getElementById('segment').dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,150));
console.log('panel hidden:', d.getElementById('segPanel').classList.contains('hidden'));
console.log('panel html length:', d.getElementById('segPanel').innerHTML.length);
console.log('rows:', d.querySelectorAll('#segPanel .pk').length);
console.log('errors:', errors.length?errors.join('\n'):'none');
