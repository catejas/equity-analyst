import { chromium } from 'playwright-core';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
const dir='/home/claude/eqapp';
const {parsePayload}=await import(dir+'/src/core/payload-schema.js');
const {buildReport}=await import(dir+'/src/core/report.js');
const scoring=await import(dir+'/src/core/scoring.js');
const indicators=await import(dir+'/src/core/indicators.js');
const dom=new JSDOM('<!doctype html><body></body>'); const w=dom.window; w.EQ={scoring,indicators};
const sb={window:w,document:w.document,navigator:{language:'en-IN'},console}; sb.self=sb; sb.globalThis=sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(dir+'/charts.js','utf8'),sb);
vm.runInContext(fs.readFileSync(dir+'/render.js','utf8'),sb);
const raw=JSON.parse(fs.readFileSync('/mnt/user-data/uploads/Anlon.json','utf8').replace(/\uFFFD/g,'-'));
const b0=buildReport(parsePayload(JSON.stringify(raw)).payload);
const p={meta:{sector:raw.run.sector,analysis_datetime:new Date().toISOString()},
  report:b0.report, warnings:b0.warnings, companyIndex:0, standalone:true};
fs.writeFileSync('/tmp/sc.html', sb.window.EQDocs.buildScorecard(p,'en'));
fs.writeFileSync('/tmp/ex.html', sb.window.EQDocs.buildCompanyExec(p,'en'));

const br = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
for (const [name,file] of [['scorecard','/tmp/sc.html'],['exec','/tmp/ex.html']]) {
  const pg = await br.newPage({ viewport:{width:1000,height:1400} });
  await pg.setContent(fs.readFileSync(file,'utf8'), { waitUntil:'networkidle' });
  await pg.waitForTimeout(500);
  const r = await pg.evaluate(() => {
    const pages=[...document.querySelectorAll('.page')];
    return { pages: pages.length,
      fill: pages.map(p=>{ const b=p.querySelector('.ir-box')||p.querySelector('.body');
        return b? Math.round(b.scrollHeight/b.clientHeight*100):-1; }),
      blocksInDom: document.querySelectorAll('.sc-blk').length,
      scaled: pages.map(p=>{ const b=p.querySelector('.body')||p; 
        const t=getComputedStyle(b.firstElementChild||b).transform; return t==='none'?1:t; }),
      fonts: pages.slice(0,3).map(p=>{
        const els=[...p.querySelectorAll('td,.ti')].slice(0,40);
        const set={}; els.forEach(e=>{ const f=getComputedStyle(e).fontSize; set[f]=(set[f]||0)+1; });
        return set; }) };
  });
  console.log(name, '->', r.pages, 'pages | fill%', r.fill.join(','),
    '| sc-blk in dom', r.blocksInDom);
  console.log('   transforms:', JSON.stringify(r.scaled).slice(0,140));
  r.fonts.forEach((f,i)=>console.log('   page',i+1,'font sizes:', JSON.stringify(f)));
  await pg.close();
}
await br.close();
