import { ROOT, REAL } from './_paths.mjs';
/* src/core/update.js on its own, on real payloads (build 25).
 *   PNB as researched on 21-09-2026 (Gemini, consolidated) and 16-11-2026
 *   (Claude, standalone); the September Banking study (psu-banks-3.json,
 *   fraction-scaled) against the real 16-11-2026 Banking run. */
import fs from 'node:fs';
import { lineKey, windowEnd, updateDiff, digest, triggers, checkChanges } from '../src/core/update.js';
import { buildUpdatePrompt } from '../src/core/prompt-builder.js';
import { buildReport } from '../src/core/report.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const rd = (f) => { const t = fs.readFileSync(f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };
const SEP = rd(REAL + '/2f13d57b-PNB_gemini-code-1789969768806.json');
const NOV = rd(REAL + '/pnb-merged-16-11-2026.json');
const B3 = rd(ROOT + '/tests/fixtures/psu-banks-3.json');
const BANK = rd(REAL + '/banking-psb-merged-16-11-2026.json');

/* ---- lines ---- */
ok('a sector line ignores case, punctuation and the word "sector"',
  lineKey({ sector: 'Banking', subSector: 'Public Sector Banks' }) === lineKey({ sector: 'banking', subSector: 'Public sector banks' }));
ok('different sub-sectors are different lines',
  lineKey({ sector: 'Banking', subSector: 'Private banks' }) !== lineKey({ sector: 'Banking', subSector: 'Public sector banks' }));
ok('an independent company is one line however its ticker is spelt',
  lineKey({ kind: 'company', symbol: 'PNB.NS', standalone: true }) === lineKey({ kind: 'company', symbol: 'NSE:PNB', standalone: true }));
ok('a Top 3 company belongs to its sector line, apart from the same company researched on its own',
  lineKey({ kind: 'company', symbol: 'PNB', sectorLine: 'S|banking|x' }) !== lineKey({ kind: 'company', symbol: 'PNB', standalone: true }));

/* ---- dates ---- */
const d = (t) => { const x = windowEnd(t); return x ? x.toISOString().slice(0, 10) : null; };
ok('a window is read to its last day', d('2-4 Dec 2026') === '2026-12-04', d('2-4 Dec 2026'));
ok('Q3 FY27 ends 31-12-2026', d('Q3 FY27') === '2026-12-31');
ok('FY27 ends 31-03-2027', d('FY27') === '2027-03-31');
ok('H2 FY27 ends 31-03-2027', d('H2 FY27') === '2027-03-31');
ok('a DD-MM-YYYY date is that day', d('16-10-2026') === '2026-10-16');
ok('a month and year is that month’s end', d('Feb 2027') === '2027-02-28' && d('10-2026') === '2026-10-31');
ok('nothing readable is null, not a guess', d('soon') === null && d('') === null);

/* ---- the metric year (a defect found on the way) ---- */
const m = buildReport(NOV).report.full[0].metrics;
ok('metrics are computed on the latest year even when the payload lists years newest first', m.period === 'FY26', m.period);

/* ---- company against company ---- */
const cd = updateDiff(SEP, NOV);
const row = (k) => cd.figures.find((r) => r.key === k);
ok('PNB: a company comparison, 56 days apart', cd.kind === 'company' && cd.asOf.days === 56, JSON.stringify(cd.asOf));
ok('  price 117.39 to 141.79, reported, not judged', row('price').prev === 117.39 && row('price').cur === 141.79 && row('price').verdict === 'neutral');
ok('  the base case fell from 145 to 129: worse', row('fairValue').prev === 145 && row('fairValue').cur === 129 && row('fairValue').verdict === 'worse');
ok('  upside is computed by the app from price and value', Math.abs(row('upside').cur - (129 / 141.79 - 1) * 100) < 1e-9);
ok('  the score fell 72.13 to 58.67', cd.verdict.score.prev === 72.13 && cd.verdict.score.cur === 58.67);
ok('  consolidated FY26 against standalone FY26 is a change of basis, not a fall',
  row('revenue').verdict === 'basis' && row('revenue').prevBasis === 'consolidated' && row('revenue').curBasis === 'standalone');
ok('  measures the first version did not report are "new", not "unchanged"', row('ind.gnpa').verdict === 'new');
ok('  NPAs: lower is better', row('ind.gnpa').dir === 'down' && row('ind.nim').dir === 'up');
ok('  a red flag is matched by category, so the regulatory flag is not "new"',
  !cd.flags.added.some((f) => f.category === 'regulatory'), cd.flags.added.map((f) => f.category).join(', '));
ok('  but the severe cyclicality flag, absent in September, is', cd.flags.added.some((f) => f.category === 'cyclicality' && f.severity === 'severe'));
ok('  and it heads the summary', cd.headline.some((h) => h.key === 'flag'));

/* ---- the tool's account, checked ---- */
const rows = cd.figures;
const ck = checkChanges([
  { item: 'Share price', previous: 'Rs 117.39', current: 'Rs 141.79' },
  { item: 'Gross NPA', previous: 'n/a', current: '2.9%' },
  { item: 'Management change', previous: 'MD A', current: 'MD B' }], rows);
ok('a claim that matches the app’s numbers agrees', ck[0].check === 'agrees');
ok('a claim that does not is flagged with both readings', ck[1].check === 'differs' && /2\.55/.test(ck[1].detail), ck[1].detail);
ok('an item that is not a measured figure is "not checked"', ck[2].check === 'not checked');

/* ---- sector against sector ---- */
const sd = updateDiff(B3, BANK);
ok('Banking: the Top 3 rotation is computed from the two screens',
  sd.top3.stayed.join() === 'State Bank of India' && sd.top3.entered.sort().join() === 'Bank of India,Canara Bank'
  && sd.top3.left.sort().join() === 'Bank of Baroda,Punjab National Bank', JSON.stringify(sd.top3.entered) + ' / ' + JSON.stringify(sd.top3.left));
ok('  each leaver says which ratings moved', /Growth and multibagger 85 to 50/.test(sd.top3.rows.find((r) => r.symbol === 'PNB').why));
const gdp = sd.macro.find((x) => x.key === 'gdpGrowth');
ok('  macro readings compared on one scale (a fraction-scaled 0.072 is read as 7.2)', gdp.prev === 7.2 && gdp.cur === 7.8, `${gdp.prev} -> ${gdp.cur}`);
ok('  share measured two different ways is said to be not comparable', sd.competition.comparable === false);

/* ---- the digest and the brief ---- */
const dg = digest(NOV, { version: 2 });
ok('the company digest carries the figures, the thesis, the risks and the catalysts',
  /Share price \(12-11-2026\): 141\.79/.test(dg) && /Thesis then:/.test(dg) && /Risks then:/.test(dg) && /Catalysts then:/.test(dg));
const sdg = digest(BANK);
ok('the sector digest carries the Top 3, every rating and the macro', /Top 3 then/.test(sdg) && /Bank of Maharashtra/.test(sdg) && /Macro then:/.test(sdg));
const up = buildUpdatePrompt({ previous: NOV, version: 2, line: 'C|PNB', company: 'Punjab National Bank', sector: 'Banking' });
ok('the update brief asks for a complete payload, the change log and the thesis check',
  /COMPLETE payload/.test(up) && /"changes": \[/.test(up) && /"thesisCheck"/.test(up) && /"line": "C\|PNB"/.test(up));
ok('  and ends with the full research brief', up.indexOf('BEFORE ANYTHING ELSE') > up.indexOf('What the saved version said'));
let threw = false; try { buildUpdatePrompt({ company: 'X' }); } catch (e) { threw = true; }
ok('  it refuses to build without a saved version', threw);

/* ---- triggers ---- */
const now = new Date('2026-12-20T00:00:00Z');
const t = triggers(NOV, { now, livePrice: { price: 160 } });
ok('a price 12.8% above the research is a trigger', t.some((x) => x.key === 'price' && /up 12\.8%/.test(x.why)), t.map((x) => x.why).join(' | '));
ok('  so is a dated event that has passed (the 2-4 Dec MPC)', t.some((x) => x.key === 'catalyst' && /MPC/.test(x.why)));
ok('  and age past a month is amber', t.some((x) => x.key === 'age' && x.level === 'amber'));
ok('a fresh version with a steady price has none', triggers(NOV, { now: new Date('2026-11-20T00:00:00Z'), livePrice: { price: 142 } }).length === 0);
const later = new Date('2027-05-01T00:00:00Z'), B3s = Object.assign({}, B3, { companies: [] });
ok('a sector study whose macro readings are a year old is due', triggers(B3s, { now: later }).some((x) => x.key === 'macro'),
  triggers(B3s, { now: later }).map((x) => x.why).join(' | '));

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
