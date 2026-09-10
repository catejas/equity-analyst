import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const dir='/home/claude/eqapp';
const full=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
const seg=JSON.parse(JSON.stringify(full));
seg.run.top3=full.companies.map(c=>({symbol:c.symbol,name:c.name,why:'named'}));
const dom=new JSDOM('<!doctype html><html><body></body></html>',{runScripts:'outside-only'});
const w=dom.window;
w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
global.window=w; global.document=w.document;
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],
  ['report','core/report.js'],['rubrics','core/rubrics.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring};
const vm=await import('node:vm');
const sandbox={window:w, document:w.document, navigator:{language:'en-IN'}, console};
sandbox.self=sandbox; sandbox.globalThis=sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(dir+'/charts.js','utf8'), sandbox, {filename:'charts.js'});
vm.runInContext(fs.readFileSync(dir+'/render.js','utf8'), sandbox, {filename:'render.js'});
const built=eng.report.buildReport(eng.schema.parsePayload(fs.readFileSync('/tmp/psu.json','utf8')).payload);
const p={meta:{segment:'Banking',subsegment:'Public sector banks',analysis_datetime:new Date().toISOString()},
  report:built.report, warnings:built.warnings, companyIndex:0};
for(const [fn,name] of [['buildSector','sector'],['buildCompany','company'],['buildExec','exec']]){
  const html=sandbox.window.EQDocs[fn](p,'en');
  fs.writeFileSync('/tmp/'+name+'-new.html', html);
  console.log(name, html.length, 'chars');
}
