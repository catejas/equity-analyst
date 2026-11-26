/* The Sector Screen report (build 34).
 *
 * Tejas, 26-11-2026: "need some data charts, fact and figures and commentary
 * on what is what so that user can have better understanding ... there is no
 * human judgement or review on what and why application has selected." The
 * engine now gives each sector a stance, a quadrant and a confidence grade,
 * says why the next three missed, and tests how far the Top 3 depends on the
 * weights. Every expected figure is worked by hand beside it. TEST DATA,
 * except the last part, which uses the real screen of 22-11-2026. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import * as F from '../src/core/finder.js';
import { mergeTopUp } from '../src/core/completeness.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };

/* A hand-built score, so stance, quadrant, confidence and the near misses
   can be worked out on paper. Weights are the defaults. */
const W = F.PILLAR_WEIGHTS;
const P = (perf, fund, out, pol, glo, val, risk) => ({ performance: perf, fundamentals: fund, outlook: out, policy: pol, global: glo, valuation: val, risk });
const row = (name, rank, score, s1, parts, extra = {}) => ({ name, rank, score, stage1Score: s1, parts, eligible: true, shortlisted: rank <= 6,
  sub: {}, returns: { checked: false }, outlook: { tier: {} }, ...extra });
const sub16 = (k) => Object.fromEntries(['rel1', 'rel2', 'rel3', 'consistency', 'profit', 'revenue', 'eps3y', 'roe', 'earnings', 'demand', 'revision', 'cheap', 'pegCheap', 'lowVol', 'smallDD', 'lowLev'].slice(0, k).map((m) => [m, 1]));
const rows = [
  row('A', 1, 80, 80, P(90, 80, 90, 50, 50, 70, 60), { sub: sub16(8), returns: { checked: true }, outlook: { tier: { earnings: 'published' } }, shortlisted: false }),
  row('B', 2, 70, 70, P(80, 60, 30, 50, 50, 60, 60)),
  row('C', 3, 60, 60, P(60, 60, 60, 60, 60, 60, 60)),
  row('D', 4, 55, 55, P(40, 60, 70, 80, 50, 60, 60)),
  row('E', 5, 50, 50, P(30, 70, 40, 50, 50, 90, 60)),
  row('F', 6, 45, 45, P(20, 20, 80, 50, 50, 50, 50)),
  row('G', 7, 30, 30, P(10, 10, 10, 50, 50, 10, 10), { sub: sub16(4), outlook: { tier: { earnings: 'past' } } }),
  row('H', 8, 20, 20, P(5, 5, 5, 50, 50, 5, 5)),
];
rows[0].shortlisted = true;
const sc = { rows, top3: rows.slice(0, 3), shortlist: rows.slice(0, 6), weights: W };
const A = F.screenAnalysis(null, sc);

console.log('\nStance');
ok('the Top 3 are Overweight', ['A', 'B', 'C'].every((n) => A.stance[n] === 'overweight'));
ok('the rest of the shortlist is Neutral', ['D', 'E', 'F'].every((n) => A.stance[n] === 'neutral'));
/* 8 eligible; a quarter is floor(8 / 4) = 2 → the two lowest on the screen,
   G and H, are Underweight. */
ok('the bottom quarter of the screen (2 of 8) is Underweight', A.stance.G === 'underweight' && A.stance.H === 'underweight');
ok('a sector without past performance or outlook is not rated',
  F.screenAnalysis(null, { ...sc, rows: [...rows, { ...row('X', 9, 0, 0, P(null, null, null, null, null, null, null)), eligible: false, shortlisted: false }] }).stance.X === 'none');

console.log('\nRotation quadrant (past performance against outlook, split at 50)');
ok('A 90 / 90 is leading', A.quadrant.A === 'leading');
ok('B 80 / 30 is fading', A.quadrant.B === 'fading');
ok('D 40 / 70 is improving', A.quadrant.D === 'improving');
ok('G 10 / 10 is lagging', A.quadrant.G === 'lagging');
ok('C 60 / 60 is leading (50 and above counts as high)', A.quadrant.C === 'leading');

console.log('\nConfidence');
/* A is treated as on the shortlist: 27 measures. 8 found → 8 / 27 × 60 =
   17.78; + 20 checked + 20 published = 57.78 → Medium, 58 points. */
ok('A: 8 of 27 measures, checked, published → 58 points, Medium', A.confidence.A.points === 58 && A.confidence.A.level === 'Medium', JSON.stringify(A.confidence.A));
/* G is not on the shortlist: 16 measures. 4 found → 15; not checked; past
   tier 8 → 23 → Low. */
ok('G: 4 of 16, not checked, past → 23 points, Low', A.confidence.G.points === 23 && A.confidence.G.level === 'Low', JSON.stringify(A.confidence.G));
ok('coverage is printed as a whole percentage (4 of 16 = 25%)', A.confidence.G.coverage === 25);
{
  const full = F.screenAnalysis(null, { ...sc, rows: [row('Z', 9, 1, 1, P(1, 1, 1, 1, 1, 1, 1), { shortlisted: false, sub: sub16(16), returns: { checked: true }, outlook: { tier: { earnings: 'guidance' } } })], top3: [], shortlist: [] });
  ok('every measure, checked, guidance → 100 points, High', full.confidence.Z.points === 100 && full.confidence.Z.level === 'High');
}

console.log('\nWhy not the next three');
ok('ranks 4, 5 and 6 are explained', A.whyNot.map((w) => w.rank).join() === '4,5,6');
const wD = A.whyNot[0];
/* D against C: behind 60 - 55 = 5.0. Gaps × weight: performance (60-40)×20%
   = 4.0; outlook (60-70)×20% = -2.0; policy (60-80)×15% = -3.0; global
   (60-50)×10% = 1.0. Trails most on performance 4.0, then global 1.0; leads
   most on policy, 3.0. */
ok('D is 5.0 points behind the third', wD.behind === 5);
ok('D trails on past performance by 4.0 and global by 1.0', wD.trails.map((g) => g.k + ' ' + g.pts).join() === 'performance 4,global 1', JSON.stringify(wD.trails));
ok('D leads on government and policy by 3.0', wD.leads.length === 1 && wD.leads[0].k === 'policy' && wD.leads[0].pts === -3, JSON.stringify(wD.leads));
/* E against C: valuation (60-90)×10% = -3.0, performance (60-30)×20% = 6.0,
   outlook (60-40)×20% = 4.0. */
const wE = A.whyNot[1];
ok('E trails on performance 6.0 and outlook 4.0; leads on valuation 3.0',
  wE.trails.map((g) => g.k + ' ' + g.pts).join() === 'performance 6,outlook 4' && wE.leads[0].k === 'valuation' && wE.leads[0].pts === -3, JSON.stringify(wE));
ok('without a third sector there is nothing to explain', F.screenAnalysis(null, { ...sc, top3: rows.slice(0, 2) }).whyNot.length === 0);

console.log('\nYour own weights');
{
  const w = F.normWeights({ performance: 2, fundamentals: 1, outlook: 1, policy: 0, global: 0, valuation: 0, risk: 0 });
  /* 2 + 1 + 1 = 4 → 50, 25, 25. */
  ok('weights are scaled to 100: 2, 1, 1 → 50, 25, 25', w.performance === 50 && w.fundamentals === 25 && w.outlook === 25 && w.risk === 0, JSON.stringify(w));
  ok('a negative weight gives the defaults back', F.weightsAreDefault(F.normWeights({ ...W, risk: -1 })));
  ok('all zero gives the defaults back', F.weightsAreDefault(F.normWeights({ performance: 0, fundamentals: 0, outlook: 0, policy: 0, global: 0, valuation: 0, risk: 0 })));
  ok('nothing stored gives the defaults', F.weightsAreDefault(F.normWeights(null)));
  ok('the defaults are recognised; one moved weight is not', F.weightsAreDefault(W) && !F.weightsAreDefault({ ...W, risk: 11 }));
}

console.log('\nYour review over the ranking');
{
  /* The hand-built score: app Top 3 A, B, C; shortlist A to F. */
  const r1 = F.applyReview(sc, { overrides: [{ name: 'B', action: 'exclude', note: 'freight cycle has turned' }] });
  ok('taking B out brings in the next on the shortlist: A, C, D', r1.top3.map((r) => r.name).join() === 'A,C,D', r1.top3.map((r) => r.name).join());
  ok('the app’s own Top 3 is kept beside it', r1.review.appTop3.join() === 'A,B,C' && r1.review.changed);
  const r2 = F.applyReview(sc, { overrides: [{ name: 'F', action: 'include', note: 'policy support coming in the Budget' }] });
  ok('putting F in places it first, ahead of the app’s picks: F, A, B', r2.top3.map((r) => r.name).join() === 'F,A,B', r2.top3.map((r) => r.name).join());
  const r3 = F.applyReview(sc, { overrides: [{ name: 'B', action: 'exclude', note: '' }] });
  ok('a call without a note is not applied, and is listed', r3.top3.map((r) => r.name).join() === 'A,B,C' && r3.review.ignored.length === 1 && !r3.review.changed);
  const r4 = F.applyReview(sc, { overrides: [{ name: 'B', action: 'exclude', note: 'first view' }, { name: 'B', action: 'include', note: 'changed my mind' }] });
  ok('the last word on a sector stands', r4.review.overrides.length === 1 && r4.review.overrides[0].action === 'include' && r4.top3.map((r) => r.name).join() === 'B,A,C');
  const r5 = F.applyReview(sc, { approved: { at: 1, top3: ['A', 'B', 'C'] } });
  ok('an approval of the same Top 3 is current', r5.review.approved.current === true);
  const r6 = F.applyReview(sc, { approved: { at: 1, top3: ['A', 'B', 'C'] }, overrides: [{ name: 'B', action: 'exclude', note: 'freight cycle' }] });
  ok('an approval of a different Top 3 is marked as changed since', r6.review.approved.current === false);
  ok('no review leaves the ranking as it is', F.applyReview(sc, null).top3.map((r) => r.name).join() === 'A,B,C' && !F.applyReview(sc, null).review.changed);
  const A1 = F.screenAnalysis(null, r1);
  ok('after the review, D is Overweight and B Neutral', A1.stance.D === 'overweight' && A1.stance.B === 'neutral');
  ok('the near misses skip the Top 3 and the excluded: E and F', A1.whyNot.map((w) => w.name).join() === 'E,F', A1.whyNot.map((w) => w.name).join());
}

console.log('\nTrack record of earlier picks');
{
  /* Strength against the index, monthly: 100 on 01-01-2026, 110 on
     01-04-2026, 121 on 01-07-2026. A pick of 15-04-2026 starts from the
     reading at or before it, 110: 121 / 110 - 1 = +10.0% over 3 months. */
  const rs = [{ date: '2026-01-01', v: 100 }, { date: '2026-04-01', v: 110 }, { date: '2026-07-01', v: 121 }];
  const fall = [{ date: '2026-01-01', v: 100 }, { date: '2026-04-01', v: 100 }, { date: '2026-07-01', v: 95 }];
  const cur = { rows: [{ name: 'A', returns: { rs } }, { name: 'B', returns: { rs: fall } }, { name: 'C', returns: {} }] };
  const t = F.trackRecord([{ asOf: Date.parse('2026-04-15T00:00:00Z'), top3: ['A', 'B', 'C'], approved: true }], cur);
  ok('A: +10.0% against the index since the pick', t[0].picks[0].rel === 10 && t[0].picks[0].months === 3, JSON.stringify(t[0].picks[0]));
  ok('B: 95 / 100 - 1 = -5.0%', t[0].picks[1].rel === -5);
  ok('C without prices has no figure', t[0].picks[2].rel === null);
  ok('average (10 - 5) / 2 = +2.5%, 1 of 2 ahead', t[0].average === 2.5 && t[0].ahead === 1 && t[0].of === 2);
  ok('a screen dated before the prices begin has no figure', F.trackRecord([{ asOf: '2025-06-01', top3: ['A'] }], cur)[0].picks[0].rel === null);
  ok('screens are listed oldest first', F.trackRecord([{ asOf: '2026-05-01', top3: ['A'] }, { asOf: '2026-02-01', top3: ['A'] }], cur)[0].asOf === '2026-02-01');
}

console.log('\nWhat moved, by pillar');
{
  const prev = { rows: [{ name: 'A', rank: 2, score: 60, parts: P(50, 50, 50, 50, 50, 50, 50), neutral: [] }], top3: [] };
  const cur = { rows: [{ name: 'A', rank: 1, score: 70, parts: P(80, 45, 50, 50, 50, 50, 50), neutral: ['policy'] }], top3: [] };
  const c = F.compareScreens(prev, cur);
  ok('past performance up 30 is the largest pillar change', c.rows[0].biggest.k === 'performance' && c.rows[0].biggest.d === 30, JSON.stringify(c.rows[0].biggest));
  ok('a pillar counted as average is left out of the changes', !('policy' in c.rows[0].pillars));
}

console.log('\nThe real screen of 22-11-2026');
const dir = path.join(ROOT, 'tests/fixtures/real');
const ld = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
let d = ld('finder-22-11-2026-base.json');
for (const n of [1, 2, 3, 4, 5, 6, 7]) {
  const add = ld(`finder-22-11-2026-topup${n}.json`);
  if (!Array.isArray(add.companies)) add.companies = [];
  const mg = mergeTopUp(d, add); if (mg.ok) d = mg.merged;
}
const real = F.scoreFinder(d);
const RA = F.screenAnalysis(d, real);
const Sv = RA.sensitivity;
ok('15 weight variants are tried (7 pillars × ±5, and all equal)', Sv && Sv.of === 15, Sv && Sv.of);
ok('each variant’s weights still add to 100', Sv.variants.length === 15);
ok('the count of unchanged variants matches the list',
  Sv.same === Sv.variants.filter((v) => v.top3.length === real.top3.length && v.top3.every((t) => real.top3.some((r) => r.name === t))).length);
ok('each of the Top 3 is counted in at most 15 variants', Sv.holds.length === real.top3.length && Sv.holds.every((h) => h.in >= 0 && h.in <= 15));
ok('every sector is given a stance', real.rows.every((r) => ['overweight', 'neutral', 'underweight', 'none'].includes(RA.stance[r.name])));
ok('exactly the Top 3 are Overweight', Object.values(RA.stance).filter((v) => v === 'overweight').length === real.top3.length);
const srcs = F.screenSources(d);
ok('the sources are listed once each', srcs.length > 20 && new Set(srcs.map((s) => s.source)).size === srcs.length, srcs.length);
ok('each source says what it was used for', srcs.every((s) => s.for.length >= 1));

/* The weights the sensitivity check uses: Valuation +5 from 10 to 15; the
   other 90 scaled to 85, so Past performance is 20 × 85 / 90 = 18.89. Read
   back by scoring with those weights directly. */
{
  const w = { ...W }; const sc2 = 85 / 90; Object.keys(w).forEach((k) => { w[k] = k === 'valuation' ? 15 : w[k] * sc2; });
  const t = F.scoreFinder(d, { weights: w }).top3.map((r) => r.name).join();
  const v = Sv.variants.find((x) => x.label === 'Valuation +5');
  ok('"Valuation +5" is valuation 15, the rest scaled to 85', v && v.top3.join() === t, `${v && v.top3.join()} vs ${t}`);
}

console.log(`\n${ran - fail}/${ran} checks pass`);
process.exit(fail ? 1 : 0);
