/* The Sector Finder rebuilt for professional screening (build 33).
 *
 * Tejas, 26-11-2026: judge a sector over 1, 2 and 3 years, by return for the
 * risk taken; score it on seven pillars as the Independent Sector Research
 * does; screen all 41 and study a shortlist of ten in depth. He also sent five
 * ICICI Securities reports; their key evidence (money flows by sector, scheme
 * money disbursed, trade measures, profit drivers, ownership, estimate
 * revisions, macro backdrop) is asked for in the deep dive. Every expected
 * figure is worked by hand in the comment beside it. TEST DATA throughout. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import * as M from '../src/core/sector-metrics.js';
import * as F from '../src/core/finder.js';
import { readCheck } from '../src/core/readcheck.js';
import { completeness, mergeTopUp, topUpPrompt } from '../src/core/completeness.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const DAY = 864e5;
/* Weekly closes, from 01-12-2022 (a Thursday), `f(i)` the close of week i. */
const weeks = (n, f, start = '2022-12-01') => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start + 'T00:00:00Z') + i * 7 * DAY).toISOString().slice(0, 10), c: f(i) }));

console.log('\nReturns over 1, 2 and 3 years');
{
  /* Doubling every 52 weeks exactly is hard to place on dates, so: a close
     of 100 until the last 3 years, then steps. Bars dated so the last is
     27-11-2025... built from the end instead. */
  const end = Date.parse('2026-11-26T00:00:00Z');
  const at = (daysBack, c) => ({ date: new Date(end - daysBack * DAY).toISOString().slice(0, 10), c });
  /* 3 years back 110, 2 years back 121, 1 year back 133.1, now 146.41 —
     10% a year. */
  const bars = [at(1100, 110), at(1096, 110), at(731, 121), at(366, 133.1), at(200, 140), at(100, 143), at(50, 145), at(14, 146), at(7, 146.2), at(0, 146.41)];
  const w = M.weekly(bars);
  ok('1-year return 10.00%', M.periodReturn(w, 12) === 10, M.periodReturn(w, 12));
  ok('2-year return, a year: (146.41 / 121)^(1/2) - 1 = 10.00%', M.periodReturn(w, 24) === 10, M.periodReturn(w, 24));
  ok('3-year return, a year: (146.41 / 110)^(1/3) - 1 = 10.00%', M.periodReturn(w, 36) === 10, M.periodReturn(w, 36));
  ok('a series that does not reach back 3 years has no 3-year figure', M.periodReturn(M.weekly(bars.slice(2)), 36) === null);
  ok('daily bars are read as week-end closes', M.weekly([{ date: '2026-11-23', c: 1 }, { date: '2026-11-24', c: 2 }, { date: '2026-11-27', c: 3 }, { date: '2026-11-30', c: 4 }]).map((b) => b.c).join() === '3,4');
}

console.log('\nRisk: volatility, largest fall, distance from the high');
{
  /* Up 10% one week, down 10% the next, for three years: weekly log returns
     ln 1.1 and ln 0.9 alternate. Their spread (sample standard deviation) is
     about 0.1003; annualised × √52 = 72.3%. */
  const w = weeks(157, (i) => 100 * Math.pow(1.1, Math.ceil(i / 2)) * Math.pow(0.9, Math.floor(i / 2)));
  const pm = M.priceMetrics(w);
  const l1 = Math.log(1.1), l2 = Math.log(0.9), n = 156, mu = (Math.ceil(n / 2) * l1 + Math.floor(n / 2) * l2) / n;
  const sd = Math.sqrt((Math.ceil(n / 2) * (l1 - mu) ** 2 + Math.floor(n / 2) * (l2 - mu) ** 2) / (n - 1)) * Math.sqrt(52) * 100;
  ok(`volatility ${sd.toFixed(2)}% a year`, Math.abs(pm.vol - sd) < 0.02, pm.vol);
  /* A rise to 200 then a fall to 120 and a recovery to 150: the largest fall
     is 120 / 200 - 1 = -40%; now 150 is 25% below the high. */
  const v = weeks(157, (i) => (i <= 60 ? 100 + i * (100 / 60) : i <= 100 ? 200 - (i - 60) * 2 : 120 + (i - 100) * (30 / 56)));
  const pv = M.priceMetrics(v);
  ok('largest fall over three years: -40.00%', pv.maxDD === -40, pv.maxDD);
  ok('now 25.00% below the three-year high', pv.fromHigh === -25, pv.fromHigh);
}

console.log('\nAgainst the benchmark: consistency and relative strength');
{
  /* The sector rises 2% a week, the index 1%: it beats the index in every
     one of the twelve quarters, and the ratio rises month after month. */
  const s = weeks(160, (i) => 100 * Math.pow(1.02, i)), b = weeks(160, (i) => 100 * Math.pow(1.01, i));
  const pm = M.priceMetrics(s, b);
  ok('ahead in 12 of the last 12 quarters', pm.quartersBeat === 12 && pm.quarters === 12, `${pm.quartersBeat}/${pm.quarters}`);
  ok('relative strength rising over six months', pm.rsTrend6m > 0 && pm.rs.length >= 30 && pm.rs[0].v === 100, pm.rsTrend6m);
  const pm2 = M.priceMetrics(b, s);
  ok('and the other way round, ahead in none', pm2.quartersBeat === 0 && pm2.rsTrend6m < 0);
  /* 52-week average of a series rising 1% a week, last close against it. */
  const a52 = b.slice(-52).reduce((a, x) => a + x.c, 0) / 52;
  ok('position against its 52-week average', Math.abs(pm2.vs52w - (b[b.length - 1].c / a52 - 1) * 100) < 0.01, pm2.vs52w);
}

console.log('\nBreadth');
{
  const up = weeks(60, (i) => 100 + i), down = weeks(60, (i) => 200 - i);
  const br = M.breadth([up, up, down]);
  ok('two of three companies above their 52-week average: 66.7%', br.above === 2 && br.of === 3 && br.pct === 66.7, JSON.stringify(br));
}

console.log('\nThe price check uses weekly prices, the Nifty 500, and breadth');
{
  const asked = [];
  const series = (g) => weeks(208, (i) => 100 * Math.pow(1 + g, i), '2022-11-24');
  const bars = { 'NSE_INDEX|Nifty 500': series(0.002), 'NSE_INDEX|Nifty 50': series(0.0015), 'NSE_INDEX|Nifty Bank': series(0.004),
    'NSE_EQ|HDFCBANK': series(0.003), 'NSE_EQ|SBIN': series(0.005) };
  const v = await F.verifyReturns({ sectors: [{ name: 'Banking', index: 'Nifty Bank', bellwethers: [{ symbol: 'HDFCBANK' }, { symbol: 'SBIN' }] }] },
    { fetchBars: async (k, o) => { asked.push(o && o.unit + o.years); if (bars[k]) return bars[k]; throw new Error('x'); }, keyFor: (s) => 'NSE_EQ|' + s });
  ok('four years of weekly prices are asked for', asked.every((x) => x === 'weeks4'), [...new Set(asked)].join());
  ok('the Nifty 500 is measured, and the Nifty 50 beside it', v.benchmark500 && v.benchmark500.y1 > 0 && v.benchmark && v.relativeTo === 'Nifty 500');
  const b = v.sectors.banking;
  ok('the sector carries 1-, 2- and 3-year returns, volatility, largest fall and consistency', ['y1', 'y2', 'y3', 'vol', 'maxDD', 'quartersBeat'].every((k) => Number.isFinite(b[k])), JSON.stringify({ y3: b.y3, q: b.quartersBeat }));
  ok('and the breadth of its bellwethers', b.breadth && b.breadth.of === 2 && b.breadth.above === 2);
  const s = F.scoreFinder({ sectors: [{ name: 'Banking', returns: {}, outlook: { earningsGrowth3y: 12 } }], verified: v });
  ok('its returns are set against the Nifty 500 the app measured', s.rows[0].relativeTo === 'Nifty 500' && s.benchmark.checked
    && Math.abs(s.rows[0].rel.y3 - (b.y3 - v.benchmark500.y3)) < 0.01);
  ok('and risk is scored from the app\'s own volatility and fall', s.rows[0].sub.lowVol === -b.vol && !s.rows[0].neutral.includes('risk'));
}

console.log('\nThe deep dive prompt');
{
  const big = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/real/finder-22-11-2026-base.json'), 'utf8'));
  const pr = F.buildDeepDivePrompt(big, { now: new Date('2026-11-26T10:00:00Z') });
  const sc = F.scoreFinder(big);
  ok('it names the ten shortlisted sectors, in order, with their bellwethers', sc.shortlist.every((r, i) => pr.includes(`${String(i + 1).padStart(2, '0')}. ${r.name}`)) && /\[bellwethers: /.test(pr));
  ok('NSDL sector-wise FPI flows', /NSDL's\s+fortnightly sector-wise FPI data/.test(pr) && /"fpiAucCr"/.test(pr));
  ok('Budget, five years, Estimate against actual', /for each of the last FIVE years/.test(pr) && /"be"/.test(pr) && /"actual"/.test(pr));
  ok('scheme outlay against money disbursed', /"outlay"/.test(pr) && /"disbursed"/.test(pr));
  ok('national targets', /900 GW/.test(pr) && /"goal"/.test(pr));
  ok('trade measures: safeguard duties, CBAM', /safeguard and anti-dumping duties/.test(pr) && /CBAM/.test(pr));
  ok('profit drivers now and a year ago', /"yearAgo"/.test(pr) && /rising helps/.test(pr));
  ok('shareholding of each bellwether, five quarters', /"holding"/.test(pr) && /FIVE quarters/.test(pr));
  ok('the macro backdrop once', /"repoRate"/.test(pr) && /"msciIndia1y"/.test(pr) && /"msciEm1y"/.test(pr));
  ok('thesis, bull and bear, dated catalysts', /"thesis"/.test(pr) && /"bull"/.test(pr) && /"catalysts"/.test(pr));
  ok('and it tells the tool not to rank', /You do not rank or rate the sectors/.test(pr));
}

console.log('\nThe deep dive, read, merged and scored');
{
  let d = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/real/finder-22-11-2026-base.json'), 'utf8'));
  readCheck(d);
  const sc = F.scoreFinder(d);
  const first = sc.shortlist[0].name;
  const c0 = completeness(d);
  ok('before the deep dive, one item says to run it, and the follow-up does not ask it', c0.missing.some((m) => m.state === 'deep')
    && !/deepDive/.test(topUpPrompt(d)));
  const add = { schema: 'equity-analyst/5', run: { kind: 'sectorScreen', topUp: true, stage: 'deepDive', searchLog: [] },
    macro: { repoRate: '5.5%', cpi: 2.1, crude: 68, usdInr: 94, fpiIndiaNet3mCr: 22000, msciIndia1y: 4, msciEm1y: 18, asOf: '25-11-2026' },
    sectors: [{ name: first, deepDive: {
      flows: { fpiNet12mCr: '4,500', fpiAucCr: 150000, asOf: '15-11-2026', source: 'NSDL' },
      budget: [{ fy: 'FY23', be: 1000 }, { fy: 'FY24', be: 1100, actual: 1050 }, { fy: 'FY25', be: 1200 }, { fy: 'FY26', be: 1300 }, { fy: 'FY27', be: 1400 }],
      schemes: [{ name: 'PLI', outlay: 12195, disbursed: 4000 }], policy: [{ event: 'a', impact: 1 }, { event: 'b', impact: 1 }, { event: 'c', impact: -1 }],
      global: { marketGrowth3y: 5, indiaShareNow: 6, indiaSharePrev: 5, exportsCagr3y: 10 },
      drivers: [{ name: 'ARPU', now: 210, yearAgo: 190, effect: 'rising helps' }, { name: 'spectrum', now: 1, yearAgo: 2, effect: 'rising hurts' }],
      risks: [{ risk: 'x', severity: 'high' }, { risk: 'y', severity: 'low' }, { risk: 'z', severity: 'medium' }],
      commentary: { thesis: 'A thesis long enough to count as written for this test.', bull: 'b', bear: 'c', catalysts: [{ event: 'a', date: 'x' }, { event: 'b', date: 'y' }] } } }] };
  const rc = readCheck(add);
  ok('nothing in it goes unread', !rc.unread.length && !rc.unreadable.length, JSON.stringify(rc.unread));
  const mg = mergeTopUp(d, add);
  ok('it merges into the saved screen', mg.ok && mg.merged.sectors.length === d.sectors.length && mg.merged.macro && mg.merged.macro.repoRate === 5.5, mg.reason);
  d = mg.merged;
  const dm = F.deepMeasures(d.sectors.find((x) => x.name === first));
  /* 4,500 of 1,50,000 = 3%; Budget 1,000 → 1,400 over 4 years =
     1.4^(1/4) - 1 = 8.78%; spent 1,050 of 1,100 = 95.45%; PLI 4,000 of
     12,195 = 32.8%; policy +1 +1 -1 = 1; ARPU up (helps) +1, spectrum down
     (hurts) +1 = 2; risks high 2 + medium 1 + low 0.25 = 3.25. */
  ok('flows 3.00% of holdings', dm.flows === 3, dm.flows);
  ok('Budget growth 8.78% a year', dm.budget === 8.78, dm.budget);
  ok('Budget spent 95.45%', dm.utilisation === 95.45, dm.utilisation);
  ok('scheme money disbursed 32.80%', dm.schemes === 32.8, dm.schemes);
  ok('policy net +1, drivers net +2, risk grade 3.25', dm.policyNet === 1 && dm.drivers === 2 && dm.riskGrade === 3.25, JSON.stringify(dm));
  const s2 = F.scoreFinder(d);
  ok('the screen counts the deep dive done for one sector', s2.counts.deepDone === 1);
  const c = completeness(d);
  ok('the follow-up now asks the deep-dive items the shortlist still lacks, by name',
    c.missing.some((m) => m.label === 'Foreign portfolio flows' && m.have === 1 && m.want === 10) && /sectors\.deepDive\.flows/.test(topUpPrompt(d)));
  ok('and names NSDL as a source to try', /fpi\.nsdl\.co\.in/.test(topUpPrompt(d)));
}

console.log('\nOwnership');
{
  /* FII + DII: 35 → 38 (+3) for one company, 20 → 21 (+1) for the other;
     median of the two = 2. Quarters sent out of order are sorted. */
  const r = { bellwethers: [{ symbol: 'A', holding: [{ q: 'Sep-26', fii: 22, dii: 16 }, { q: 'Sep-25', fii: 20, dii: 15 }] },
    { symbol: 'B', holding: [{ q: 'Q2 FY26', fii: 10, dii: 10 }, { q: 'Q2 FY27', fii: 11, dii: 10 }] }] };
  ok('institutional holding up a median 2.00 points in a year', F.deepMeasures(r).ownership === 2, F.deepMeasures(r).ownership);
}

console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
