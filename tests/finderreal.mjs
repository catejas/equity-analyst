/* The Sector Finder on Tejas's real 22-11-2026 run (build 30).
 *
 * The base screen and its four follow-ups, exactly as received. Before build
 * 30 the merged screen stood at 77% depth with 23 sectors eligible for the
 * Top 3; the gaps were structural (no index for 11 sectors, indices younger
 * than five years, no earnings forecast for niche sectors), not reading
 * failures. This suite holds the fixes to that run. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import { readCheck } from '../src/core/readcheck.js';
import { completeness, mergeTopUp } from '../src/core/completeness.js';
import * as F from '../src/core/finder.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const dir = path.join(ROOT, 'tests/fixtures/real');
const ld = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

console.log('\nReading the replies');
let d = ld('finder-22-11-2026-base.json');
const r0 = readCheck(d);
ok('the base screen has no unread or unreadable field', !r0.unread.length && !r0.unreadable.length, JSON.stringify({ unread: r0.unread, unreadable: r0.unreadable }));
for (const n of [1, 2, 3, 4, 5, 6, 7]) {
  const add = ld(`finder-22-11-2026-topup${n}.json`);
  if (!Array.isArray(add.companies)) add.companies = [];
  const r = readCheck(add);
  ok(`follow-up ${n} has no unread or unreadable field`, !r.unread.length && !r.unreadable.length, JSON.stringify({ unread: r.unread, unreadable: r.unreadable }));
  const mg = mergeTopUp(d, add);
  ok(`follow-up ${n} merges`, mg.ok, mg.reason);
  d = mg.merged;
  /* The page runs the check on the merged data itself (build 30), so a
     "not found" note for a figure the reply carries is set aside. */
  readCheck(d);
}
ok('41 sectors after the merges', d.sectors.length === 41, d.sectors.length);

console.log('\nThe P/E history the tool wrote in its notes');
const withMedian = d.sectors.filter((s) => s.valuation && (s.valuation.peMedian > 0 || s.valuation.pe5yMedian > 0));
ok('long-run and five-year medians are read from the source notes', withMedian.length >= 5, `${withMedian.length} sectors`);
const s = F.scoreFinder(d);
/* Follow-up 5 sent ten medians whose series start in 2024 to 2026: under
   three years, so they are rightly not used (build 30's rule). */
const young = (x) => typeof x.valuation.peMedianSince === 'number' && new Date().getFullYear() - x.valuation.peMedianSince < 3 && !(x.valuation.pe5yMedian > 0);
const want = withMedian.filter((x) => x.valuation.pe > 0 && !(x.valuation.pe5yAvg > 0) && !young(x)).map((x) => x.name);
ok('a median of a series under three years is not used as history', withMedian.filter(young).every((x) => s.rows.find((r) => r.name === x.name).valuation.from !== 'research'),
  withMedian.filter(young).map((x) => x.name + ' ' + x.valuation.peMedianSince).join(', '));
const used = want.filter((n) => { const r = s.rows.find((y) => y.name === n); return r.valuation.history != null && r.valuation.historyBasis !== 'five-year average'; });
ok('where there is no five-year average, the median is the valuation history', want.length >= 3 && used.length === want.length, `${used.length} of ${want.length}: ${used.join(', ')}`);

console.log('\nThe ranking');
ok('at least 27 sectors can rank in the Top 3 (23 before build 30)', s.counts.eligible >= 27, JSON.stringify(s.counts));
ok('the Top 3 is three sectors with momentum and outlook', s.top3.length === 3 && s.top3.every((r) => r.eligible), s.top3.map((r) => r.name).join(', '));
const c = completeness(d);
ok('depth is at least 78% (77% before)', c.pct >= 78, `${c.pct}%`);

console.log('\nThe follow-up');
const ret = F.finderChecks(d).find((x) => x.label.startsWith('Returns'));
const noIndex = d.sectors.filter((x) => !x.index && !(x.returns && x.returns.y1 != null)
  && (x.bellwethers || []).filter((b) => b && b.symbol).length >= 2).map((x) => x.name);
ok('there are sectors with no index for the app to measure', noIndex.length >= 8, noIndex.join(', '));
const missingPart = (/Missing: ([^.]*)\./.exec(ret.ask) || [, ''])[1];
ok('the follow-up does not ask the tool for their returns', noIndex.every((n) => !missingPart.includes(n)), missingPart);
ok('it tells the tool the app measures them', /Do NOT search for these/.test(ret.ask));

console.log('\nThe app\'s price check fills them');
/* Every bellwether's daily prices, made up: each sector rises at its own
   rate. Index keys are refused, so every sector goes to its basket. */
const rate = {};
d.sectors.forEach((x, i) => (x.bellwethers || []).forEach((b) => { rate[b.symbol] = 0.0002 + (i % 7) * 0.0003; }));
const bars = (r) => { const out = []; const t0 = Date.parse('2025-10-01T00:00:00Z');
  for (let i = 0; i <= 420; i++) out.push({ date: new Date(t0 + i * 864e5).toISOString().slice(0, 10), c: 100 * Math.exp(r * i) }); return out; };
const v = await F.verifyReturns(d, {
  fetchBars: async (k) => { if (k.startsWith('NSE_EQ|')) { const sym = k.slice(7); if (rate[sym] != null) return bars(rate[sym]); }
    if (k === 'NSE_INDEX|Nifty 50') return bars(0.0004); throw new Error('no ' + k); },
  keyFor: (sym) => 'NSE_EQ|' + sym, now: new Date('2026-11-22T00:00:00Z') });
ok('every sector with two bellwethers is measured', noIndex.every((n) => v.sectors[F.nameKey(n)]), v.failed.join(', '));
const dv = JSON.parse(JSON.stringify(d)); dv.verified = v;
const sv = F.scoreFinder(dv);
ok('the no-index sectors then have momentum', noIndex.every((n) => sv.rows.find((r) => r.name === n).parts.momentum != null));
ok('and the follow-up no longer lists their returns', !F.finderChecks(dv).find((x) => x.label.startsWith('Returns')).detail.includes('app measures'));
ok('more sectors can rank once measured', sv.counts.eligible > s.counts.eligible, `${s.counts.eligible} → ${sv.counts.eligible}`);

console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
