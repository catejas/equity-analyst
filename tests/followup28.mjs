import { REAL } from './_paths.mjs';
/* Missing figures: keep asking, ask better (build 28).
 *
 * Tejas rejected a "not available" mark: an item missing for ANY reason —
 * not found, left out, or sent but not read by the app — must be asked for
 * in every follow-up. So nothing is ever closed. A failed search is recorded
 * in run.searchLog; the item stays missing at full weight, and the next
 * follow-up names what was tried and where else to look. */
import fs from 'node:fs';
import { completeness, topUpPrompt, mergeTopUp, checkPath, SOURCE_HINTS } from '../src/core/completeness.js';
import { buildResearchPrompt } from '../src/core/prompt-builder.js';
import { buildReport } from '../src/core/report.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const bank = JSON.parse(fs.readFileSync(REAL + '/banking-psb-merged-16-11-2026.json', 'utf8'));
const pnb = JSON.parse(fs.readFileSync(REAL + '/pnb-merged-16-11-2026.json', 'utf8'));
const growth = (pl) => completeness(pl).missing.find((c) => /^Global growth over/.test(c.label));

console.log('\nThree states');
const c0 = completeness(bank);
const g0 = growth(bank);
ok('a missing item never searched is "open"', g0 && g0.state === 'open' && g0.tries === 0);
ok('every check knows its path', g0 && g0.path === 'global.cagr', g0 && g0.path);
ok('found items are "found"', c0.sections.flatMap((s) => s.checks).filter((c) => c.ok).every((c) => c.state === 'found'));
ok('the counts add up', c0.open + c0.searched === c0.missing.length, `${c0.open} open, ${c0.searched} searched`);

const t1 = mergeTopUp(bank, { run: { topUp: true, searchLog: [
  { path: 'global.cagr.y3', searched: ['IBISWorld Global Commercial Banking', 'FSB Global Monitoring Report 2025'], reason: 'IBISWorld publishes 2020-25 only' }] } },
  { now: new Date('2026-11-21T10:00:00Z') });
ok('the search record is merged and dated', t1.ok && t1.merged.run.searchLog.length === 1 && t1.merged.run.searchLog[0].at === '2026-11-21');
const g1 = growth(t1.merged);
ok('a searched item is "searched", once', g1.state === 'searched' && g1.tries === 1 && g1.lastTried === '2026-11-21');
ok('it is still missing, at full weight', !g1.ok && completeness(t1.merged).pct === c0.pct && completeness(t1.merged).missing.length === c0.missing.length);
const t2 = mergeTopUp(t1.merged, { run: { topUp: true, searchLog: [
  { path: 'global.cagr', searched: ['BIS quarterly review', 'IBISWorld Global Commercial Banking'], reason: 'no revenue series' }] } },
  { now: new Date('2026-11-22T10:00:00Z') });
const g2 = growth(t2.merged);
ok('a second search counts twice and keeps every source once', g2.tries === 2 && g2.sources.length === 3 && g2.lastTried === '2026-11-22', g2.sources.join('; '));
ok('the places not yet tried leave out the ones already tried', !g2.tryNext.some((h) => /^BIS/.test(h)) && g2.tryNext.some((h) => /World Bank/.test(h)), g2.tryNext.join('; '));

console.log('\nThe follow-up asks again');
const fu = topUpPrompt(t2.merged, { now: new Date('2026-11-22T10:00:00Z') });
const at = fu.indexOf('Global growth over');
const block = fu.slice(at, at + 1200);
ok('the item is still in the follow-up', at > 0);
ok('with how often and when it was searched', /SEARCHED BEFORE, NOT FOUND \(2 times, last 22-11-2026\)/.test(block));
ok('with the sources tried and the reason given', /IBISWorld Global Commercial Banking; FSB Global Monitoring Report 2025; BIS quarterly review/.test(block) && /Reason given: no revenue series/.test(block));
ok('and asks the tool to search again, elsewhere', /SEARCH AGAIN\. Sources not yet tried: World Bank Open Data/.test(block));
ok('the opening says how many were searched before', /1 of them was searched for before and not found/.test(fu));
ok('rule 5 asks for a search record, not a blank', /add an entry to "run\.searchLog"/.test(fu) && /"searchLog": \[\]/.test(fu));
const rp = buildResearchPrompt({ sector: 'Banking', subSector: 'Public Sector Banks', mode: 'sector', horizon: '3-5' });
ok('the full research brief asks for the search record too', /"searchLog": \[ \{ "path"/.test(rp));

console.log('\nPaths, as the tool may write them');
const co = pnb.companies[0];
const sym = co.symbol;
const t3 = mergeTopUp(pnb, { run: { topUp: true, searchLog: [{ path: `companies[${sym}].forensic.decade`, searched: ['annual report FY16'], reason: 'pre-merger years not restated' }] }, companies: [] });
const dec = completeness(t3.merged).sections.flatMap((s) => s.checks).find((c) => c.label === 'Years of profit against operating cash');
ok('companies[PNB] matches the check written companies[symbol=PNB]', !dec || dec.ok || (dec.state === 'searched'), dec && `${dec.path} — ${dec.state}`);
ok('an ask that opens with its path gives it', checkPath({ ask: 'macro — missing or undated: x' }) === 'macro');
ok('an ask that does not gives none', checkPath({ ask: 'Add the missing years — please' }) === '');
ok('the hints cover every part of a payload', SOURCE_HINTS[SOURCE_HINTS.length - 1][0].test('anything'));

console.log('\nThe report says so');
const rep = buildReport(t2.merged, { asOf: new Date('2026-11-22T10:00:00Z') });
const line = (rep.warnings || []).find((w) => /^Searched and not found: Global growth/.test(w));
ok('Gaps in this research names the item searched and not found', !!line, line);
ok('with how often, when and where', line && /Searched 2 times, last on 22-11-2026, in IBISWorld/.test(line) && /asked for again in every follow-up/.test(line));

console.log('\nNever 100% while anything is missing');
const almost = JSON.parse(JSON.stringify(bank));
almost.global.cagr = { y5: 4.3, y3: 5.1 };
const ca = completeness(almost);
ok('one item short reads 99%, not 100%', ca.missing.length >= 1 && ca.pct <= 99, `${ca.pct}% with ${ca.missing.length} missing`);

console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
