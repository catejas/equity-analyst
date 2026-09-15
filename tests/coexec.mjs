import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import vm from 'node:vm';
const dir='/home/claude/eqapp';
const {parsePayload}=await import(dir+'/src/core/payload-schema.js');
const {buildReport}=await import(dir+'/src/core/report.js');
const scoring=await import(dir+'/src/core/scoring.js');
const indicators=await import(dir+'/src/core/indicators.js');
const dom=new JSDOM('<!doctype html><body></body>'); const w=dom.window;
w.EQ={scoring,indicators};
const sb={window:w,document:w.document,navigator:{language:'en-IN'},console};
sb.self=sb; sb.globalThis=sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(dir+'/charts.js','utf8'),sb,{filename:'charts.js'});
vm.runInContext(fs.readFileSync(dir+'/render.js','utf8'),sb,{filename:'render.js'});

const raw=JSON.parse(fs.readFileSync('/mnt/user-data/uploads/Anlon.json','utf8').replace(/\uFFFD/g,'-'));
const parsed=parsePayload(JSON.stringify(raw));
console.log('payload valid:', parsed.valid, '| errors:', parsed.errors.length);
const b=buildReport(parsed.payload);
const p={meta:{segment:raw.run.segment,analysis_datetime:new Date().toISOString()},
  report:b.report, warnings:b.warnings, companyIndex:0, standalone:true};

const html=sb.window.EQDocs.buildCompanyExec(p,'en');
fs.writeFileSync('/tmp/anlon-exec.html', html);
const body=html.replace(/<script[\s\S]*?<\/script>/g,'');
console.log('exec summary  :', html.length, 'chars');
console.log('page shells   :', (body.match(/class="page"/g)||[]).length);
console.log('sections      :', [...body.matchAll(/<span class="ti">([^<]+)</g)].map(m=>m[1]).join(' | '));
console.log('figures       :', (body.match(/<svg/g)||[]).length);
console.log('undefined     :', body.includes('undefined'), '| NaN:', body.includes('NaN'));
const full=sb.window.EQDocs.buildCompany(p,'en');
console.log('\nfull report   :', full.length, 'chars |', (full.replace(/<script[\s\S]*?<\/script>/g,'').match(/class="page"/g)||[]).length, 'shells');
console.log('summary is    :', Math.round(html.length/full.length*100)+'% the size of the full report');
