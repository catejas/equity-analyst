import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp';
const dom=new JSDOM(fs.readFileSync(dir+'/index.html','utf8'),{
  runScripts:'dangerously', url:'https://example.com/e/', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.navigator.clipboard={writeText:async()=>{}};
    w.HTMLCanvasElement.prototype.getContext=()=>null; }});
const w=dom.window;
for(const f of ['segments.js','charts.js','render.js','docs.js']){
  const el=w.document.createElement('script'); el.textContent=fs.readFileSync(dir+'/'+f,'utf8'); w.document.body.appendChild(el);
}
const raw=fs.readFileSync('/tmp/psu.json','utf8');
console.log('raw length:', raw.length);
console.log('parses as JSON directly:', (()=>{try{JSON.parse(raw);return true;}catch(e){return e.message.slice(0,80);}})());
const cands=w.extractJsonCandidates(raw);
console.log('candidates found:', cands.length, cands.map(c=>c.text.length));
if(cands.length){
  const one=w.readOne(cands[0].text);
  console.log('readOne result:', one? 'object with keys '+Object.keys(one.data).slice(0,8).join(',') : 'NULL');
}
console.log('looksLikePayload on the raw object:', w.looksLikePayload(JSON.parse(raw)));
const got=w.readPayload(raw);
console.log('readPayload:', got? 'keys '+Object.keys(got).slice(0,8).join(',') : 'NULL');
