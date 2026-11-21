import { REAL } from './_paths.mjs';
/* Did the application read everything the tool sent? (build 28)
 *
 * Tejas named three ways a figure goes missing: not available, not included,
 * or "included in the payload but is not read or picked up by the app". The
 * third is the app's own fault. readCheck moves near-variant keys to the
 * schema's name, lists what nothing in the app reads, and shows anything the
 * tool called "not found" that the reply in fact carries. */
import fs from 'node:fs';
import path from 'node:path';
import { readCheck, schemaTemplate, finderTemplate, resolvePath } from '../src/core/readcheck.js';
import { harvest, render } from './gen-knownkeys.mjs';
import { ROOT } from './_paths.mjs';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };

console.log('\nThe list of keys the app reads');
const cur = fs.readFileSync(path.join(ROOT, 'src/core/known-keys.js'), 'utf8');
ok('src/core/known-keys.js is up to date (node tests/gen-knownkeys.mjs)', cur === render(harvest()));

console.log('\nThe schema, read from the brief itself');
const T = schemaTemplate();
ok('the research brief\'s example parses', T && T.run && T.global && Array.isArray(T.companies) && T.companies[0].financials);
ok('it carries the 5/3/1-year growth keys', T.global.cagr && 'y5' in T.global.cagr && 'y1' in T.global.cagr && !('y15' in T.global.cagr));
ok('it carries the search record', 'searchLog' in T.run);
const FT = finderTemplate();
ok('the Finder brief\'s example parses', FT && Array.isArray(FT.sectors) && 'valuation' in FT.sectors[0] && 'benchmark' in FT);

console.log('\nNear-variants are read under the schema\'s name');
const g = { run: {}, global: { cagr: { cagr_5y: 4.3, '3yr': 5.1, Latest: 6.0 } },
  companies: [{ symbol: 'X', financials: { annual: [{ period: 'FY26', net_profit: 100, Revenue: 900 }] } }] };
const r1 = readCheck(g);
ok('cagr_5y, 3yr and Latest become y5, y3 and y1', JSON.stringify(g.global.cagr) === '{"y5":4.3,"y3":5.1,"y1":6}', JSON.stringify(g.global.cagr));
ok('net_profit and Revenue in a statement row become netProfit and revenue',
  g.companies[0].financials.annual[0].netProfit === 100 && g.companies[0].financials.annual[0].revenue === 900);
ok('every move is listed', r1.renamed.length === 5, r1.renamed.map((x) => x.from).join(', '));
const keep = { run: {}, global: { cagr: { y5: 4.3, cagr_5y: 9.9 } } };
readCheck(keep);
ok('a variant never overwrites the schema key already there', keep.global.cagr.y5 === 4.3 && keep.global.cagr.cagr_5y === 9.9);
const fr = { schema: 'equity-analyst/5', run: { kind: 'sectorScreen' }, sectors: [{ name: 'Banking', returns: { '3m': 4, '6 months': 8, '12M': 15 }, valuation: { PE: 14, pe_5y_avg: 16 } }] };
readCheck(fr);
ok('Finder returns sent as 3m, 6 months and 12M are read as m3, m6 and y1',
  JSON.stringify(fr.sectors[0].returns) === '{"m3":4,"m6":8,"y1":15}' && fr.sectors[0].valuation.pe5yAvg === 16);

console.log('\nWhat nothing reads is listed, not dropped');
const u = { run: {}, global: { cagr: { y5: 4.3 }, myOwnInvention: 'abc' }, macro: { gdpGrowth: { value: 7 } } };
const r2 = readCheck(u);
ok('an unknown key with a value is listed as sent but not read', r2.unread.includes('global.myOwnInvention'), r2.unread.join(', '));
ok('and is kept in the payload', u.global.myOwnInvention === 'abc');
ok('a key the app reads elsewhere is not listed', !r2.unread.some((x) => /gdpGrowth|value/.test(x)));
let renamedOnReal = 0;
for (const f of ['banking-psb-merged-16-11-2026.json', 'pnb-merged-16-11-2026.json', 'banking-psb-sector-16-11-2026.json',
  'banking-psb-topup1-16-11-2026.json', 'banking-psb-topup2-16-11-2026.json', 'banking-psb-topup3-16-11-2026.json']) {
  renamedOnReal += readCheck(JSON.parse(fs.readFileSync(REAL + '/' + f, 'utf8'))).renamed.length;
}
ok('nothing in the real 16-11 Banking and PNB payloads is renamed', renamedOnReal === 0, renamedOnReal);
const pnb = JSON.parse(fs.readFileSync(REAL + '/pnb-merged-16-11-2026.json', 'utf8'));
const rp = readCheck(pnb);
ok('the real PNB run\'s 1-month return (m1), which no report uses, is listed', rp.unread.includes('companies[].snapshot.performance.m1'), rp.unread.join(', '));

console.log('\n"Not found", but the reply carries it');
const cl = { run: { searchLog: [{ path: 'global.cagr.y5', searched: ['x'] }, { path: 'global.cagr.y3', searched: ['x'] }] }, global: { cagr: { y5: 4.3 } } };
const r3 = readCheck(cl);
ok('a value present under a path the tool called not found is shown', r3.claimed.length === 1 && r3.claimed[0].path === 'global.cagr.y5' && r3.claimed[0].value === 4.3);
ok('a path truly absent is not', !r3.claimed.some((c) => c.path === 'global.cagr.y3'));
ok('company paths resolve by ticker', resolvePath({ companies: [{ symbol: 'PNB', isin: 'INE160A01022' }] }, 'companies[symbol=PNB].isin') === 'INE160A01022'
  && resolvePath({ companies: [{ symbol: 'PNB.NS', isin: 'Z' }] }, 'companies[PNB].isin') === 'Z');

console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
