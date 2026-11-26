/* Build 36: replies in parts, joined into one before anything is saved.
 * Tejas, 26-11-2026: "Is there any way the prompt is engineered is such way
 * that even if it will get all payload reply in 10-12 parts, at the end, i
 * can get one or two JSON for import". */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import * as P from '../src/core/parts.js';
import * as C from '../src/core/completeness.js';
import * as F from '../src/core/finder.js';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const real = fs.readFileSync(path.join(ROOT, 'tests/fixtures/real/finder-26-11-2026-replies.txt'), 'utf8');

console.log('\nReading every block in a paste');
const blocks = P.extractBlocks(real);
ok('your whole file of 26-11-2026, prose and all, gives its seventeen blocks', blocks.length === 17, blocks.length);
const two = 'Part one:\n```json\n{"run":{"topUp":true},"sectors":[{"name":"A {x}"}]}\n```\nand two\n<<<EQUITY-ANALYST-DATA\n{"run":{"topUp":true},"sectors":[{"name":"B"}]}\n>>>EQUITY-ANALYST-DATA';
ok('fenced and marker blocks in one paste; a brace inside a string is not a block', P.extractBlocks(two).length === 2 && P.extractBlocks(two)[0].sectors[0].name === 'A {x}');
ok('a block cut off is not read, and the paste shows two marks for one block', P.extractBlocks('```json\n{"run":{"a":1}}\n```\n```json\n{"run":{"b":').length === 1
  && P.blockMarks('```json\n{"run":{"a":1}}\n```\n```json\n{"run":{"b":\n```') === 2);
ok('a part’s label is read, numbers as text too', JSON.stringify(P.partOf({ run: { part: { n: '2', of: '6', id: 'x' } } })) === '{"n":2,"of":6,"id":"x"}');
ok('a part numbered beyond its set is not a part', P.partOf({ run: { part: { n: 7, of: 6 } } }) === null);

console.log('\nJoining');
const all = C.combineBlocks(blocks);
ok('the seventeen follow-up blocks become one follow-up', all.ok && all.joined === 17 && all.topUp === true);
ok('covering the 22 sectors they named', all.data.sectors.length === 22, all.data.sectors.length);
const eps = (x) => x.sectors.reduce((a, s) => a + (s.bellwethers || []).filter((b) => Array.isArray(b.eps) && b.eps.length).length, 0);
ok('with all 64 companies’ EPS', eps(all.data) === 64, eps(all.data));
ok('and the eleven deep dives', all.data.sectors.filter((s) => s.deepDive).length === 11);
ok('no part label is left on the joined payload', !all.data.run.part);
/* A screen in three parts, sent out of order: part 1 is the base. */
const part = (n, names, extra = {}) => ({ schema: 'equity-analyst/5', run: { kind: 'sectorScreen', part: { n, of: 3, id: 'screen-t' }, searchLog: [{ path: 'p' + n, searched: ['s'], reason: 'r' }] },
  sectors: names.map((name) => ({ name, why: 'w' })), ...extra });
const j = C.combineBlocks([part(3, ['Retail']), part(1, ['Banking', 'Insurance'], { benchmark: { name: 'Nifty 500', returns: { y1: 5 } } }), part(2, ['Aviation'])]);
ok('three parts out of order join in order, the first part the base', j.ok && j.data.sectors.map((s) => s.name).join() === 'Banking,Insurance,Aviation,Retail', j.data.sectors.map((s) => s.name).join());
ok('it is a full screen, not a follow-up, with the benchmark kept', !j.topUp && j.data.benchmark.returns.y1 === 5);
ok('every part’s search log is kept', j.data.run.searchLog.length === 3);
ok('it reads as a Finder screen', F.isFinderPayload(j.data));

console.log('\nThe prompts ask for parts');
const pr = F.buildFinderPrompt({ now: new Date(2026, 10, 26, 18, 7) });
ok('the screen: six parts of seven sectors, the benchmark in part 1', /IN 6 PARTS/.test(pr) && /Part 1: sectors 1–7 \(Banking[^)]*\), and the benchmark/.test(pr) && /Part 6: sectors 36–41/.test(pr));
ok('one id for the set', (pr.match(/screen-26112026-1807/g) || []).length >= 3);
ok('stop after each part and wait for "next"', /After each part, STOP and wait\. When I write "next"/.test(pr));
ok('or one downloadable file, where the tool can make one', /DOWNLOADABLE FILE/.test(pr) && /Import file/.test(pr));
ok('short sources, no zeros for missing values', /"source" names the site and/.test(pr) && /never send 0, "" or null/.test(pr));
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/real/finder-22-11-2026-base.json'), 'utf8'));
const dd = F.buildDeepDivePrompt(d, { now: new Date(2026, 10, 26, 18, 7) });
const sl = F.scoreFinder(d).shortlist.length;
ok('the deep dive: two sectors a part, the macro block in part 1', new RegExp('IN ' + Math.ceil(sl / 2) + ' PARTS').test(dd) && /Part 1: sectors 1–2 \([^)]*\), and the macro block/.test(dd), sl);
const fu = C.topUpPrompt(d, { now: new Date(2026, 10, 26, 18, 7) });
ok('the follow-up: parts of at most eight sectors, each labelled', /IN PARTS of at most EIGHT sectors/.test(fu) && /"part": \{ "n": 1, "of": 2, "id": "followup-26112026-1807" \}/.test(fu));
ok('and never re-send what was sent', /never re-send a figure already sent/.test(fu));
const tuned = C.topUpPrompt({ schema: 'equity-analyst/5', run: { sector: 'Banking' }, companies: [] });
ok('a sector study’s follow-up keeps its single block', !tuned || !/IN PARTS/.test(tuned));
console.log(`\n${ran - fail}/${ran} checks pass`);
process.exit(fail ? 1 : 0);
