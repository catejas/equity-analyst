/* A number on an axis says what it is.
 *
 * Two AI tools answered global.cagr two different ways: one gave 5.5 for five
 * and a half percent, the other 0.11 for eleven. Both were plotted without
 * comment, so the sector study printed an axis reading 0.2 and the reader had
 * no way to know whether banking was growing at a fifth or at a fifth of one
 * percent.
 *
 * Two things are asserted. The engine rescales a block that arrived as
 * fractions and SAYS SO in the gaps — a silently corrected number is worse
 * than a wrong one, because nothing points the reader at the source. And every
 * chart whose values are percentages carries the unit on its axis.
 */
import { buildReport } from '../src/core/report.js';
import fs from 'node:fs';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const read = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };

let fail = 0, ran = 0;
const ok = (label, pass, detail) => {
  ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

/* The real payload that carried fractions. */
const frac = read('107fec97-attachment.txt');
const before = { ...frac.global.cagr };
const r1 = buildReport(JSON.parse(JSON.stringify(frac)));
ok('the run still builds', r1.ok, r1.ok ? '' : (r1.errors || []).join('; '));
const after = r1.report?.global?.cagr || {};
ok('fractions were rescaled to percentage points',
  Math.abs(after.y15 - before.y15 * 100) < 1e-9,
  `${before.y15} -> ${after.y15}`);
const said = (r1.warnings || []).some((w) => /arrived as a fraction/i.test(String(w)));
ok('and the rescaling is stated, not silent', said);

/* The fields the reader actually saw wrong. PNB is a state-owned bank whose
   promoter is the Government of India; the research report printed "Promoter
   holding 0.7%" and "GDP growth 0.07%". */
const co1 = (r1.report?.full || [])[0] || {};
ok('promoter holding reads as a percentage',
  Math.abs((co1.ownership?.promoter ?? 0) - 70.08) < 0.01,
  String(co1.ownership?.promoter));
ok('free float reads as a percentage',
  Math.abs((co1.snapshot?.freeFloatPct ?? 0) - 29.9) < 0.01,
  String(co1.snapshot?.freeFloatPct));
ok('GDP growth reads as a percentage',
  Math.abs((r1.report?.macro?.gdpGrowth?.value ?? 0) - 7.2) < 0.01,
  String(r1.report?.macro?.gdpGrowth?.value));
ok('the twelve-month return reads as a percentage',
  Math.abs((co1.snapshot?.performance?.m12 ?? 0) - 45) < 0.01,
  String(co1.snapshot?.performance?.m12));
/* The same percentage appears in three separate blocks — snapshot, ownership
   and liquidity — and each is read by a different section. All three have to
   be on the same scale, or the report contradicts itself page to page. */
ok('every block states the free float on the same scale',
  Math.abs((co1.snapshot?.freeFloatPct ?? 0) - 29.9) < 0.01
  && Math.abs((co1.liquidity?.freeFloatPct ?? 0) - 29.9) < 0.01,
  `snapshot ${co1.snapshot?.freeFloatPct}, liquidity ${co1.liquidity?.freeFloatPct}`);
ok('the quarterly shareholding is rescaled too',
  Math.abs(((co1.shareholding || [])[0]?.promoter ?? 0) - 70.08) < 0.01,
  String((co1.shareholding || [])[0]?.promoter));
ok('the rupee exchange rate is not treated as a percentage',
  (r1.report?.macro?.currency?.value ?? 0) === 83.5,
  String(r1.report?.macro?.currency?.value));

/* A payload already in percentage points is left exactly alone. */
const pct = read('da0c46c1-attachment.txt');
const pctBefore = { ...pct.global.cagr };
const r2 = buildReport(JSON.parse(JSON.stringify(pct)));
const pctAfter = r2.report?.global?.cagr || {};
ok('percentages are left untouched',
  JSON.stringify(pctAfter) === JSON.stringify(pctBefore),
  `${JSON.stringify(pctBefore)} -> ${JSON.stringify(pctAfter)}`);
ok('and nothing is claimed about them',
  !(r2.warnings || []).some((w) => /arrived as a fraction/i.test(String(w))));

/* A COMPOSED run: a sector reply in percentage points merged with a company
   reply in fractions. Judging the whole payload at once let the sector's honest
   5.5 veto the correction the company needed, and the Banking study went out
   saying the Government of India owns 0.7% of Punjab National Bank. */
{
  const mixed = JSON.parse(JSON.stringify(pct));          // sector, in percent
  mixed.companies = JSON.parse(JSON.stringify(frac.companies));  // company, in fractions
  const rm = buildReport(mixed);
  const mc = (rm.report?.full || [])[0] || {};
  ok('a percentage-point sector block is left alone',
    Math.abs((rm.report?.global?.cagr?.y15 ?? 0) - 5.5) < 1e-9,
    String(rm.report?.global?.cagr?.y15));
  ok('while the fraction-scaled company beside it is corrected',
    Math.abs((mc.ownership?.promoter ?? 0) - 70.08) < 0.01,
    String(mc.ownership?.promoter));
  ok('and its snapshot and performance move with it',
    Math.abs((mc.snapshot?.freeFloatPct ?? 0) - 29.9) < 0.01
    && Math.abs((mc.snapshot?.performance?.m12 ?? 0) - 45) < 0.01,
    `free float ${mc.snapshot?.freeFloatPct}, 12m ${mc.snapshot?.performance?.m12}`);
  ok('with the correction named against the block it applied to',
    (rm.warnings || []).some((w) => /Punjab National Bank's research arrived as a fraction/.test(String(w))));
}

/* A single value is not enough evidence to rescale a block. */
const one = JSON.parse(JSON.stringify(pct));
one.global.cagr = { y15: 0.5 };
const r3 = buildReport(one);
ok('a lone sub-1 value is not reinterpreted',
  (r3.report?.global?.cagr || {}).y15 === 0.5);

/* Every chart whose title or series names a percentage states the unit. */
const src = fs.readFileSync(new URL('../render.js', import.meta.url), 'utf8');
const calls = src.split(/K\.(?:columns|lines)\(\{/).slice(1);
const missing = [];
calls.forEach((c) => {
  const body = c.slice(0, c.indexOf('});') + 1);
  const title = (/title\s*:\s*'([^']*)'/.exec(body) || [])[1] || '(untitled)';
  const pctish = /%|Pct|percentage|growth, by lookback|required for each multiple|Shareholding/i.test(body);
  if (pctish && !/yFmt/.test(body)) missing.push(title);
});
ok('every percentage chart labels its axis', missing.length === 0, missing.join(' | '));

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
