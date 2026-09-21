import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import vm from 'node:vm';
const dir='/home/claude/eqapp';
const dom=new JSDOM('<!doctype html><html><body></body></html>');
const w=dom.window; global.window=w; global.document=w.document;
const eng={};
for(const [k,p] of [['scoring','core/scoring.js'],['schema','core/payload-schema.js'],
  ['report','core/report.js'],['rubrics','core/rubrics.js'],['indicators','core/indicators.js']]) eng[k]=await import(dir+'/src/'+p);
w.EQ={scoring:eng.scoring, indicators:eng.indicators};
const sandbox={window:w,document:w.document,navigator:{language:'en-IN'},console};
sandbox.self=sandbox; sandbox.globalThis=sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(dir+'/charts.js','utf8'),sandbox,{filename:'charts.js'});
vm.runInContext(fs.readFileSync(dir+'/render.js','utf8'),sandbox,{filename:'render.js'});

const raw=JSON.parse(fs.readFileSync('/tmp/psu.json','utf8'));
// give company 0 a real weekly series
const closes=Array.from({length:110},(_,i)=>780+90*Math.sin(i/9)+i*1.6);
closes[closes.length-1]=Math.max(...closes)+8;
raw.companies[0].priceHistory={ spacing:'weekly', closes,
  highs:closes.map(c=>c*1.015), lows:closes.map(c=>c*0.985),
  volumes:closes.map((_,i)=>i===closes.length-1?3.4e6:1.1e6),
  adjusted:true, asOf:'2026-09-12' };
const parsed=eng.schema.parsePayload(JSON.stringify(raw));
console.log('payload valid:', parsed.valid, '| errors:', parsed.errors.length);
const built=eng.report.buildReport(parsed.payload);
/* the report reorders by rank, so find where the company with the series landed */
const idx=built.report.full.findIndex(c=>c.symbol===raw.companies[0].symbol);
console.log('series company is at ranked index', idx, '-', built.report.full[idx].name);
const p={meta:{sector:'Banking',analysis_datetime:new Date().toISOString()},
  report:built.report, warnings:built.warnings, companyIndex:idx};
const html=sandbox.window.EQDocs.buildCompany(p,'en');
fs.writeFileSync('/tmp/tech.html',html);
const body=html.replace(/<script[\s\S]*?<\/script>/g,'');
console.log('company report:', html.length, 'chars');
console.log('has Technical panel section:', body.includes('Technical panel'));
const rows=[...body.matchAll(/<td>([^<]{1,40})<\/td>/g)].map(m=>m[1]);
const want=['Trend','RSI14','MACD','Bollinger','Hull MA 20','PSAR','Momentum 13','20-day high breakout'];
want.forEach(x=>console.log('   row', x.padEnd(22), rows.some(r=>r.includes(x.split(' ')[0]))));
const m=/Computed by the application[^<]*/.exec(body);
console.log('provenance line:', m?m[0].slice(0,110):'MISSING');
console.log('undefined:', body.includes('undefined'), '| NaN:', body.includes('NaN'));

// and with no series at all
delete raw.companies[0].priceHistory;
const p2=eng.report.buildReport(eng.schema.parsePayload(JSON.stringify(raw)).payload);
const i2=p2.report.full.findIndex(c=>c.symbol===raw.companies[0].symbol);
const h2=sandbox.window.EQDocs.buildCompany({meta:p.meta,report:p2.report,warnings:[],companyIndex:i2},'en');
console.log('\nwithout a series -> report still builds:', h2.length, 'chars | panel section present:', h2.includes('Technical panel'));
