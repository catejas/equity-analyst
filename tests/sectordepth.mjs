/* Build 22 — what the sector study and the registers must bring back.
 *
 * Tejas, 16 Nov 2026, on the sample reports:
 *   3. "11 essential registers were never searched ... Fix this."
 *   4. "Competition and Market share data are not complete and doesn't make
 *       sense to reader."
 *   5. "The world - missing global market size and growth, global peers and
 *       what each makes - where India sits."
 *   6. "Macro and policy - missing budget allocations, announced against
 *       spent, How the regime evolved - Trade data behind the claims."
 *   7. "Industry - missing - Value chain with beneficiaries, TAM, SAM and SOM -
 *       Programmes traced to suppliers."
 * Each is checked at the three places it can fail: the brief that asks for
 * it, the depth check that notices it did not come back (and writes the
 * follow-up), and the merge that takes the follow-up in without losing rows. */
import fs from 'node:fs';
import { buildResearchPrompt } from '../src/core/prompt-builder.js';
import { completeness, topUpPrompt, mergeTopUp } from '../src/core/completeness.js';
import { buildReport } from '../src/core/report.js';
import { validatePayload } from '../src/core/payload-schema.js';
import { REGISTERS } from '../src/core/litigation.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null ? '  — ' + d : ''}`); };
const load = (f) => { const t = fs.readFileSync(f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };
const NOW = new Date('2026-11-16T10:00:00Z');

/* ---- the brief ---- */
const P = buildResearchPrompt({ sector: 'Power', subSector: 'Utilities' });
const essential = REGISTERS.filter((r) => r.essential);
ok('the schema lists a row for every register, not one example',
  REGISTERS.every((r) => P.includes(`"register": "${r.id}", "subject": "company"`)));
ok('the world block asks for the GLOBAL market in US$, with year and basis',
  /GLOBAL market size in US\$ billion/.test(P) && P.includes('"marketSizeYear"') && P.includes('"marketSizeBasis"'));
ok('it asks for the forecast and India\'s share of the world', P.includes('"growthForecast"') && P.includes('"indiaShare"'));
ok('global peers must be outside India', /OUTSIDE India/.test(P));
ok('the Budget is five years, Budget Estimate against Actuals or RE',
  /last five Union Budgets/.test(P) && P.includes('"spentBasis"'));
ok('the regime is asked for in four or more dated eras', /AT LEAST FOUR ERAS/.test(P));
ok('trade data is four rows in US$ million', /at least four rows/.test(P) && P.includes('"unit": "USD million"'));
ok('the value chain is five nodes with a listed company at each', /AT LEAST FIVE nodes/.test(P) && /NSE symbol/.test(P));
ok('TAM, SAM and SOM each carry a method', (P.match(/"method": ""/g) || []).length >= 3);
ok('programmes are three, each traced to listed suppliers', /AT LEAST THREE of the major national programmes/.test(P));
ok('competition names its measure, period and market total',
  P.includes('"metric"') && P.includes('"marketTotal"') && /AT LEAST EIGHT players/.test(P));
ok('shares are asked for in percentage points, not fractions', /23 for 23%, never 0\.23/.test(P));
ok('the rupee is asked for on the run date as a day, never a quarter', /never a quarter/.test(P));

/* ---- the depth check on a thin sector study ---- */
const SEC = Object.assign(load('tests/fixtures/psu.json'), { companies: [] });
const c = completeness(SEC, { now: NOW });
const find = (label) => c.sections.flatMap((s) => s.checks).find((x) => x.label.startsWith(label));
ok('India\'s credit market labelled global is not a global market size',
  !find('Global market size').ok, find('Global market size').have + ' of 2');
ok('the forecast is missing and said so', !find('Forecast global growth').ok);
ok('India\'s place in the world is asked for', !find('Where India sits').ok);
ok('a Budget row of zeros counts as no year', find('Budget years').have === 0);
ok('a trade row with value 0 is not trade data', find('Trade data behind the claims').have === 0);
ok('two eras where four are needed', find('How the regime evolved').have === 2);
ok('value-chain nodes are counted by whether a company is named', find('Value-chain nodes').want === 5);
ok('programmes are counted by whether a supplier is named', find('Programmes traced').want === 3);
ok('market shares must name their measure, period and total', !find('Share measure').ok);
ok('and must cover 80% of the market', !find('Share of the market accounted for').ok,
  find('Share of the market accounted for').have + '%');
const T = topUpPrompt(SEC, { now: NOW });
ok('the follow-up asks for each of the missing world, macro and industry items',
  ['global.marketSize', 'global.indiaShare', 'budget.allocations', 'policyEvolution',
    'geopolitics.tradeData', 'valueChain', 'programs', 'competition'].every((k) => T.includes(k)));

/* ---- the registers ---- */
const CO = load('tests/fixtures/psu.json');
const one = { run: CO.run, companies: [CO.companies[0]] };
const cc = completeness(one, { now: NOW });
const reg = cc.sections.flatMap((s) => s.checks).find((x) => x.label === 'Essential registers searched');
ok('the depth check counts the essential registers', reg && reg.want === essential.length && !reg.ok,
  reg && `${reg.have} of ${reg.want}`);
const T2 = topUpPrompt(one, { now: NOW });
ok('the follow-up names every missing register with where to search it',
  essential.filter((r) => !CO.companies[0].litigation.searched.some((s) => s.register === r.id))
    .every((r) => T2.includes(`"${r.id}" (${r.name}`)));
ok('and says an unreachable register is recorded, not left out', /register unreachable/.test(T2));
{
  const p = load('tests/fixtures/psu.json');
  p.companies[0].litigation.searched.push(
    { register: 'ibbi', subject: 'company', outcome: '', detail: '' },
    { register: 'nclt', subject: 'company', outcome: 'Clean', detail: 'searched 15-11-2026' });
  const v = validatePayload(p);
  ok('a schema row handed back blank does not fail the payload', v.valid, v.errors[0]);
  ok('it is counted as not searched', !p.companies[0].litigation.searched.some((s) => s.register === 'ibbi'));
  ok('"Clean" is read as clear', p.companies[0].litigation.searched.find((s) => s.register === 'nclt').outcome === 'clear');
}
{
  /* The follow-up's register rows are added, not folded into one. */
  const base = load('tests/fixtures/psu.json');
  const add = { run: { topUp: true }, companies: [{ symbol: base.companies[0].symbol, litigation: { searched: [
    { register: 'indiankanoon', subject: 'company', outcome: 'clear', detail: 'x' },
    { register: 'ibbi', subject: 'company', outcome: 'register unreachable', detail: 'captcha' },
    { register: 'sebi_orders', subject: 'promoter', subjectName: 'Govt of India', outcome: 'clear', detail: 'y' }] } }] };
  const before = base.companies[0].litigation.searched.length;
  const m = mergeTopUp(base, add);
  const after = m.merged.companies[0].litigation.searched;
  ok('three register rows from the follow-up are added, none swallowed', after.length === before + 3,
    `${before} → ${after.length}`);
  const r = buildReport(m.merged).report.full[0].litigation;
  ok('and the report counts them as searched', r.registersSearched === before + 2 || r.registersSearched === before + 3,
    r.registersSearched);
}
{
  /* Two Budget heads in one year, and two partners in one year, stay two rows. */
  const base = { run: {}, budget: { allocations: [{ head: 'A', year: 'FY25', announced: 10, spent: 9 }] },
    geopolitics: { tradeData: [{ flow: 'import', partner: 'China', value: 5, year: '2025', source: 's' }] } };
  const m = mergeTopUp(base, { run: { topUp: true },
    budget: { allocations: [{ head: 'B', year: 'FY25', announced: 20, spent: 18 }] },
    geopolitics: { tradeData: [{ flow: 'import', partner: 'Japan', value: 3, year: '2025', source: 's' }] } });
  ok('a second Budget head in the same year is a new row', m.merged.budget.allocations.length === 2);
  ok('a second trade partner in the same year is a new row', m.merged.geopolitics.tradeData.length === 2);
}

/* ---- competition: fractions ---- */
{
  const p = load('tests/fixtures/psu.json');
  p.competition.players = [{ name: 'A', share: 0.22 }, { name: 'B', share: 0.16 }, { name: 'C', share: 0.07 }];
  const r = buildReport(p);
  const sh = r.report.competition.players.map((x) => x.share);
  ok('market shares given as fractions are read as percent', sh.join(',') === '22,16,7', sh.join(','));
  ok('and the report says it did so', (r.warnings || []).some((w) => /Market shares arrived as fractions/.test(w)));
  const q = load('tests/fixtures/psu.json');
  q.competition.players = [{ name: 'A', share: 0.4 }, { name: 'B', share: 0.3 }, { name: 'C', share: 0.5 }];
  ok('shares adding to more than the market are not rescaled',
    buildReport(q).report.competition.players[0].share === 0.4);
}

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
