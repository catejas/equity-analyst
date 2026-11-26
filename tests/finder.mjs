import { ROOT } from './_paths.mjs';
/* The Sector Finder engine (build 28).
 *
 * Tejas, 22-11-2026: find the sectors doing well over the past 3 months,
 * 6 months and 1 year that should keep growing for the next 3 years. The
 * research tool supplies figures; the application scores (35 momentum, 20
 * business, 35 outlook, 10 valuation), ranks, and checks the returns against
 * prices itself. The fixture is TEST DATA, generated, not research. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import * as F from '../src/core/finder.js';
import { completeness, topUpPrompt, mergeTopUp } from '../src/core/completeness.js';
import { finderFixture } from './_finderfix.mjs';

let fail = 0, ran = 0;
const finderChecksMiss = (d) => F.finderChecks(d).filter((c) => c.have < c.want);
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };

console.log('\nThe sector list');
const win = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sectors.js'), 'utf8'), { window: win });
const appNames = win.EQSectors.all.map((x) => x[0]);
ok('the Finder screens exactly the app\'s sector list, in its order', JSON.stringify(appNames) === JSON.stringify(F.FINDER_SECTORS),
  `${appNames.length} in sectors.js, ${F.FINDER_SECTORS.length} in finder.js`);
ok('every mapped index belongs to a listed sector', Object.keys(F.SECTOR_INDEX).every((k) => F.FINDER_SECTORS.includes(k)));
ok('every sector has a short name for chart axes', F.FINDER_SECTORS.every((s) => F.SHORT_NAMES[s]));
ok('the seven pillars weigh 20, 15, 20, 15, 10, 10 and 10 (build 33)', JSON.stringify(F.PILLAR_WEIGHTS) === JSON.stringify({ performance: 20, fundamentals: 15, outlook: 20, policy: 15, global: 10, valuation: 10, risk: 10 }));
ok('each pillar\'s measures weigh 1 in all', Object.values(F.MEASURES).every((ms) => Math.abs(ms.reduce((a, m) => a + m[1], 0) - 1) < 1e-9));
ok('an index is tried by NSE\'s name and Upstox\'s', F.indexKeys('Nifty Financial Services').join(' ') === 'NSE_INDEX|Nifty Financial Services NSE_INDEX|Nifty Fin Service');

console.log('\nThe prompt');
const pr = F.buildFinderPrompt({ taxonomy: win.EQSectors.all, now: new Date('2026-11-22T10:00:00Z') });
ok('it names every sector', F.FINDER_SECTORS.every((s) => pr.includes(s)));
ok('it lists each sector\'s sub-sectors to choose from', pr.includes('sub-sectors: Public sector banks; Private sector banks'));
ok('it tells the tool not to rank or pick', /YOU DO NOT RANK THE SECTORS AND YOU DO NOT PICK THE BEST ONES/.test(pr));
ok('it states the seven pillars and weights', /past performance over 1, 2 and 3 years against the Nifty 500\s+\(20%\)/.test(pr) && /government and\s+policy \(15%\)/.test(pr));
ok('it asks for 1-, 2- and 3-year returns and the Nifty 500\'s', /"y1"/.test(pr) && /"y2"/.test(pr) && /"y3"/.test(pr) && /Nifty 500's return/.test(pr) && !/"m3"/.test(pr));
ok('it asks each bellwether\'s ROE, leverage and consensus revision', /"roe": 0, "netDebtEbitda": 0/.test(pr) && /"revision3m": 0/.test(pr));
ok('it asks for bellwether symbols so the app can check prices', /bellwethers/.test(pr) && /NSE symbol/.test(pr));
ok('it asks for one fenced json block, minified', /ONE fenced code block tagged json/.test(pr) && /ONE LINE, minified/.test(pr));
ok('it asks for a search record, never a zero', /run\.searchLog/.test(pr) && /Never write 0/.test(pr));
ok('it is dated today', /Today is 22-11-2026/.test(pr));
const prU = F.buildFinderPrompt({ previous: { top3: [{ name: 'Defence and aerospace' }, { name: 'Banking' }] }, previousTs: Date.parse('2026-11-01T00:00:00Z') });
ok('the update version names the line and the previous Top 3', /"line": "F\|screen"/.test(prU) && /Defence and aerospace, Banking/.test(prU) && /COMPLETE payload/.test(prU));

console.log('\nScoring, worked by hand (build 33: seven pillars, two stages)');
/* TEST DATA. The Nifty 500 returned 9, 8 and 7 (1 year; 2 and 3 years a year). */
const four = { run: { kind: 'sectorScreen' }, benchmark: { name: 'Nifty 500', returns: { y1: 9, y2: 8, y3: 7 } }, sectors: [
  { name: 'Banking', returns: { y1: 15, y2: 12, y3: 10 }, business: { revenueGrowth: 10, profitGrowth: 14, period: 'x' },
    outlook: { earningsGrowth3y: 14, demandGrowth3y: 12, source: 'x' }, valuation: { pe: 14, pe5yAvg: 16 } },
  { name: 'Information technology', returns: { y1: -2, y2: 2, y3: 4 }, business: { revenueGrowth: 4, profitGrowth: 3, period: 'x' },
    outlook: { earningsGrowth3y: 9, demandGrowth3y: 7, source: 'x' }, valuation: { pe: 28, pe5yAvg: 25 } },
  { name: 'Defence and aerospace', returns: { y1: 45, y2: 35, y3: 30 }, business: { revenueGrowth: 18, profitGrowth: 25, period: 'x' },
    outlook: { earningsGrowth3y: 20, demandGrowth3y: 15, source: 'x' }, valuation: { pe: 55, pe5yAvg: 35 } },
  { name: 'Retail', returns: { y1: 5, y2: 6, y3: 6 }, business: { revenueGrowth: 12, profitGrowth: 9, period: 'x' } }] };
const s4 = F.scoreFinder(four);
const by = (n) => s4.rows.find((r) => r.name === n);
const near = (a, b) => Math.abs(a - b) <= 0.051;
/* Relative returns, points: Defence 36/27/23, Banking 6/4/3, Retail -4/-2/-1,
   IT -11/-6/-3: the same order on all three, so performance is Defence 100,
   Banking 66.7, Retail 33.3, IT 0. */
ok('performance from the 1-, 2- and 3-year returns against the Nifty 500', by('Defence and aerospace').parts.performance === 100
  && by('Banking').parts.performance === 66.7 && by('Information technology').parts.performance === 0, JSON.stringify(by('Banking').rel));
/* Fundamentals for Banking: profit 2nd of 4 (66.7, weight .25), sales 3rd of 4
   (33.3, weight .15); the rest absent: (16.675 + 4.995) / 0.40 = 54.175. */
ok('fundamentals: Banking 54.2 (profit .25, sales .15, others absent)', near(by('Banking').parts.fundamentals, 54.175), by('Banking').parts.fundamentals);
/* Valuation: P/E against history Banking 0.875, IT 1.12, Defence 1.571 → 100,
   50, 0; PEG Banking 1.00, Defence 2.75, IT 3.11 → 100, 50, 0. Weights .6, .4:
   Banking 100, IT 30, Defence 20. */
ok('valuation: Banking 100, IT 30, Defence 20 (history .6, PEG .4)', by('Banking').parts.valuation === 100
  && by('Information technology').parts.valuation === 30 && by('Defence and aerospace').parts.valuation === 20);
/* Stage 1 (weights 20/15/20/10/10, risk absent → 50): Defence (2000 + 1500 +
   2000 + 200 + 500) / 75 = 82.7. */
ok('stage 1: Defence 82.7', near(by('Defence and aerospace').stage1Score, 82.667), by('Defence and aerospace').stage1Score);
/* All three eligible sectors are on the shortlist, so their score is the
   seven-pillar one, policy and global absent → 50: Defence (2000 + 1500 +
   2000 + 750 + 500 + 200 + 500) / 100 = 74.5; Banking (1334 + 812.6 + 1000 +
   750 + 500 + 1000 + 500) / 100 = 59.0; IT (750 + 500 + 300 + 500) / 100 = 20.5. */
ok('Defence scores 74.5 on all seven pillars', by('Defence and aerospace').score === 74.5, by('Defence and aerospace').score);
ok('Banking scores 59.0', by('Banking').score === 59, by('Banking').score);
ok('IT scores 20.5', by('Information technology').score === 20.5, by('Information technology').score);
ok('policy and global count as average until the deep dive', by('Banking').neutral.includes('policy') && by('Banking').neutral.includes('global'));
ok('Retail, with no outlook, is not eligible and ranks last', by('Retail').rank === 4 && !by('Retail').eligible && by('Retail').missing1.includes('outlook'),
  `rank ${by('Retail').rank}, missing ${by('Retail').missing1}`);
ok('only sectors with performance and outlook make the Top 3', s4.top3.map((r) => r.name).join(', ') === 'Defence and aerospace, Banking, Information technology');
ok('each pillar\'s contribution adds up to the score (to rounding)', Math.abs(Object.values(by('Banking').contrib).reduce((a, x) => a + x, 0) - by('Banking').score) <= 0.3,
  JSON.stringify(by('Banking').contrib));

console.log('\nA gap does not decide the ranking (build 29, kept)');
const gap = JSON.parse(JSON.stringify(four));
delete gap.sectors.find((x) => x.name === 'Banking').valuation;
delete gap.sectors.find((x) => x.name === 'Banking').business.revenueGrowth;
delete gap.sectors.find((x) => x.name === 'Banking').returns.y3;
const sg = F.scoreFinder(gap);
const bg = sg.rows.find((r) => r.name === 'Banking');
ok('a missing valuation counts as average (50), not as disqualifying', bg.eligible && bg.parts.valuation === 50 && bg.neutral.includes('valuation'), JSON.stringify(bg.parts));
ok('profit growth alone scores fundamentals', typeof bg.parts.fundamentals === 'number' && !bg.neutral.includes('fundamentals'));
ok('the 1- and 2-year returns alone score performance', typeof bg.parts.performance === 'number' && bg.partial.includes('performance'));
ok('Banking still makes the Top 3', sg.top3.some((r) => r.name === 'Banking'), sg.top3.map((r) => r.name).join(', '));
ok('its reason says what was counted as average', /valuation[^.]*counted as average/.test(bg.reason), bg.reason);
const noYear = JSON.parse(JSON.stringify(four)); delete noYear.sectors.find((x) => x.name === 'Banking').returns.y1;
ok('without the 1-year return there is no performance pillar, and no Top 3 place', !F.scoreFinder(noYear).rows.find((r) => r.name === 'Banking').eligible);
const noOut = JSON.parse(JSON.stringify(four)); delete noOut.sectors.find((x) => x.name === 'Defence and aerospace').outlook;
const so = F.scoreFinder(noOut);
ok('without an outlook a sector ranks below every sector that has one',
  so.rows.find((r) => r.name === 'Defence and aerospace').rank > so.rows.filter((r) => r.eligible).length && !so.top3.some((r) => r.name === 'Defence and aerospace'));
ok('returns are read against the Nifty 500', by('Banking').rel.y1 === 6 && by('Banking').rel.y3 === 3 && by('Banking').relativeTo === 'Nifty 500');
ok('the reason is written from the figures', /Beat the Nifty 500 by 3\.0 points a year over three years/.test(by('Banking').reason) && /P\/E 14\.0 against its five-year average of 16\.0/.test(by('Banking').reason), by('Banking').reason);
ok('no return is marked checked until the app checks it', s4.rows.every((r) => !r.returns.checked) && !s4.benchmark.checked);

console.log('\nThe shortlist (build 33)');
{
  const big = finderFixture();
  const sb = F.scoreFinder(big);
  ok('ten sectors are shortlisted from the screen', sb.shortlist.length === 10 && sb.rows.slice(0, 10).every((r) => r.shortlisted));
  ok('they are the ten best on the stage-1 score', sb.shortlist.every((r) => r.stage1Rank <= 10));
  ok('the Top 3 come from the shortlist', sb.top3.every((r) => r.shortlisted));
  ok('a sector outside the shortlist is scored on the five stage-1 pillars only', sb.rows[15].finalScore === null && sb.rows[15].score === sb.rows[15].stage1Score
    && sb.rows[15].parts.policy === null);
  /* The deep dive decides within the shortlist: give the 10th the best
     policy and global evidence and the 1st the worst. */
  const name10 = sb.shortlist[9].name, name1 = sb.shortlist[0].name;
  const dd = (good) => ({ flows: { fpiNet12mCr: good ? 9000 : -9000, fpiAucCr: 100000 },
    budget: [{ fy: 'FY23', be: 100 }, { fy: 'FY27', be: good ? 200 : 90, actual: null }],
    schemes: [{ name: 's', outlay: 100, disbursed: good ? 90 : 5 }], policy: [{ event: 'a', impact: good ? 1 : -1 }],
    global: { marketGrowth3y: good ? 12 : 1, indiaShareNow: good ? 8 : 3, indiaSharePrev: 5, exportsCagr3y: good ? 15 : -5 },
    drivers: [{ name: 'x', now: 2, yearAgo: 1, effect: good ? 'rising helps' : 'rising hurts' }], risks: [{ risk: 'r', severity: good ? 'low' : 'high' }] });
  big.sectors.forEach((x) => { if (x.name === name10) x.deepDive = dd(true); if (x.name === name1) x.deepDive = dd(false); });
  const sd = F.scoreFinder(big);
  const r10 = sd.rows.find((r) => r.name === name10), r1 = sd.rows.find((r) => r.name === name1);
  ok('the deep dive is scored: policy and global 100 for the best evidence, 0 for the worst', r10.parts.policy === 100 && r10.parts.global === 100
    && r1.parts.policy === 0 && r1.parts.global === 0, JSON.stringify([r10.parts.policy, r10.parts.global, r1.parts.policy, r1.parts.global]));
  ok('and moves the ranking within the shortlist', r10.rank < 10 && r1.rank > 1, `${name10} ${r10.rank}, ${name1} ${r1.rank}`);
  ok('the stage-1 score, and so the shortlist, is not changed by the deep dive', r10.stage1Score === sb.shortlist[9].stage1Score && sd.shortlist.length === 10);
  /* Budget: 100 → 200 over four years: 2^(1/4) - 1 = 18.92% a year. */
  ok('Budget allocation growth is worked out a year: 18.92%', F.deepMeasures(big.sectors.find((x) => x.name === name10)).budget === 18.92);
  ok('flows as a share of holdings: 9,000 of 1,00,000 = 9%', F.deepMeasures(big.sectors.find((x) => x.name === name10)).flows === 9);
}

console.log('\nReading the reply as the tool wrote it (build 29)');
const names = { 'IT': 'Information technology', 'Banks': 'Banking', 'FMCG': 'Fast moving consumer goods', 'Oil & Gas': 'Oil and gas',
  'Information Technology (IT)': 'Information technology', 'Auto Ancillaries': 'Auto components', 'Hotels & Tourism': 'Hospitality and tourism',
  'Specialty Chemicals': 'Chemicals', 'Power': 'Power and utilities', 'Defence': 'Defence and aerospace', 'Real Estate': 'Real estate' };
ok('sector names as tools write them are read as the list\'s', Object.keys(names).every((n) => F.canonicalSector(n) === names[n]),
  Object.keys(names).filter((n) => F.canonicalSector(n) !== names[n]).map((n) => n + '→' + F.canonicalSector(n)).join(', '));
ok('a name that is no sector is left alone', F.canonicalSector('Something else') === null);
const messy = { benchmark: { '3M': 2, '6M': 4, '1Y': 9 }, sectors: [
  { name: 'IT', pe: 28, avgPe5y: 25, return1y: -2, '3mReturn': -1, patGrowth: 5, salesGrowth: 6, epsCagr3y: 10, tailwinds: ['a'], risks: ['b'] }] };
const fixes = F.normaliseFinder(messy);
const it = messy.sectors[0];
ok('figures beside their block are moved into it', it.valuation.pe === 28 && it.valuation.pe5yAvg === 25 && it.returns.y1 === -2 && it.returns.m3 === -1
  && it.business.profitGrowth === 5 && it.business.revenueGrowth === 6 && it.outlook.earningsGrowth3y === 10 && it.outlook.tailwinds[0] === 'a');
ok('a benchmark without its wrapper is read', JSON.stringify(messy.benchmark.returns) === '{"m3":2,"m6":4,"y1":9}');
ok('every repair is listed', fixes.length === 13, fixes.length);
const frac = finderFixture(); frac.sectors.forEach((x) => { x.business.profitGrowth = +(x.business.profitGrowth / 100).toFixed(4); });
F.normaliseFinder(frac);
ok('a column sent as fractions for every sector is read as percent', frac.sectors[0].business.profitGrowth > 1.5);

console.log('\nThe application\'s own returns');
const bars = [{ date: '2025-11-20', c: 100 }, { date: '2026-05-20', c: 110 }, { date: '2026-08-20', c: 120 }, { date: '2026-11-20', c: 132 }];
const rb = F.returnsFromBars(bars);
ok('returns from prices: 3m +10%, 6m +20%, 1y +32%', rb.m3 === 10 && rb.m6 === 20 && rb.y1 === 32, JSON.stringify(rb));
ok('a series shorter than a year gives no 1y figure', F.returnsFromBars(bars.slice(1)).y1 === null);
const series = (start, end) => { const out = []; const d0 = Date.parse('2025-11-01T00:00:00Z');
  for (let i = 0; i <= 390; i += 3) { const t = new Date(d0 + i * 86400000).toISOString().slice(0, 10); out.push({ date: t, c: start + (end - start) * i / 390 }); } return out; };
const fetched = [];
const fetchBars = async (key) => {
  fetched.push(key);
  if (key === 'NSE_INDEX|Nifty 50') return series(100, 110);
  if (key === 'NSE_INDEX|Nifty Bank') return series(100, 130);
  if (key === 'NSE_EQ|RAIL1' || key === 'NSE_EQ|RAIL2') return series(100, 150);
  throw new Error('no such instrument');
};
const toCheck = { run: { kind: 'sectorScreen' }, benchmark: { name: 'Nifty 50', returns: { m3: 1, m6: 2, y1: 3 } }, sectors: [
  { name: 'Banking', index: 'Nifty Bank', returns: { m3: 1, m6: 1, y1: 1 } },
  { name: 'Railways', returns: { m3: 1, m6: 1, y1: 1 }, bellwethers: [{ symbol: 'RAIL1' }, { symbol: 'RAIL2' }, { symbol: 'NOPE' }] },
  { name: 'Aviation', returns: { m3: 1, m6: 1, y1: 1 }, bellwethers: [{ symbol: 'NOPE' }] }] };
const v = await F.verifyReturns(toCheck, { fetchBars, keyFor: (s) => (s === 'NOPE' ? null : 'NSE_EQ|' + s) });
ok('the Nifty 50 is checked from its index', v.benchmark && v.benchmark.basis === 'index' && v.benchmark.y1 > 5);
ok('a sector with an index is checked from the index', v.sectors.banking && v.sectors.banking.basis === 'index' && v.sectors.banking.of === 'Nifty Bank');
ok('a sector without one is checked from its bellwethers, equally weighted', v.sectors.railways && v.sectors.railways.basis === 'basket' && v.sectors.railways.of === 'RAIL1, RAIL2');
ok('one stock is not a sector: it stays unchecked', !v.sectors.aviation && v.failed.includes('Aviation'));
toCheck.verified = v;
const sv = F.scoreFinder(toCheck);
const bk = sv.rows.find((r) => r.name === 'Banking');
ok('the app\'s figures replace the research\'s and are marked checked', bk.returns.checked && bk.returns.y1 > 20 && bk.returns.tool.y1 === 1);
ok('relative returns use the checked Nifty 50', sv.benchmark.checked && Math.abs(bk.rel.y1 - (bk.returns.y1 - sv.benchmark.y1)) < 0.01);
ok('a fetch that fails never throws', (await F.verifyReturns(toCheck, { fetchBars: async () => { throw new Error('offline'); } })).failed.length === 3);

console.log('\nDepth and the follow-up');
const fx = finderFixture({ thin: ['Retail', 'Aviation'] });
const c = completeness(fx);
ok('a screen is measured as a screen', c.kind === 'finder' && c.sections.length === 1);
const pe = c.missing.find((x) => x.label === 'P/E against its own history');
/* Build 31: a sector without a valuation is asked for its companies' EPS,
   named by symbol, not for a sector P/E average it may not have. */
ok('the two sectors without a valuation are named, with the companies to look up', pe && pe.have === 39 && pe.want === 41
  && /Retail \(EPS history of AAA25, BBB25, CCC25\); Aviation \(EPS history of AAA29, BBB29, CCC29\)/.test(pe.detail || ''), pe && pe.detail);
ok('the percentage stays under 100 while anything is missing', c.pct < 100, c.pct);
const tp = topUpPrompt(fx);
ok('the follow-up is for the Sector Finder screen', /the Sector Finder screen/.test(tp) && /"kind": "sectorScreen"/.test(tp) && /Sectors are matched by\s+"name"/.test(tp));
const partial = finderFixture({ upto: 20 });
const cp = completeness(partial).missing.find((x) => x.label === 'Sectors screened');
ok('a reply cut short asks for the sectors it did not reach', cp && cp.have === 20 && /Power and utilities/.test(cp.ask)
  && !/Missing: .*Oil and gas/.test(cp.ask) && /Emerging themes/.test(cp.ask), cp && `${cp.have}/${cp.want}`);
const add = { run: { topUp: true, kind: 'sectorScreen' }, companies: [], sectors: [
  { name: 'Retail', valuation: { pe: 40, pe5yAvg: 45 } }, { name: 'aviation', valuation: { pe: 30, pe5yAvg: 28 } }] };
const mg = mergeTopUp(fx, add);
ok('a follow-up merges into the sectors by name, whatever the case', mg.ok && mg.merged.sectors.length === 41
  && mg.merged.sectors.find((s) => s.name === 'Retail').valuation.pe === 40
  && mg.merged.sectors.find((s) => s.name === 'Aviation').valuation.pe === 30);
ok('and closes the gap', !completeness(mg.merged).missing.some((x) => x.label === 'P/E against its own history'));

console.log('\nTwo screens compared');
const a = F.scoreFinder(finderFixture());
const bfx = finderFixture(); bfx.sectors.find((s) => s.name === 'Banking').returns = { m3: 30, m6: 60, y1: 90 };
bfx.sectors.find((s) => s.name === 'Banking').outlook.earningsGrowth3y = 40; bfx.sectors.find((s) => s.name === 'Banking').business.profitGrowth = 60;
const bsc = F.scoreFinder(bfx);
const cmp = F.compareScreens(a, bsc);
ok('a sector that rises into the Top 3 is named as entered', cmp.entered.includes('Banking'), JSON.stringify(cmp.entered));
ok('the one it displaced is named as left', cmp.left.length === 1);
ok('every sector carries its rank then and now', cmp.rows.length === 41 && cmp.rows.every((r) => r.rankThen != null));

console.log('\nBuild 30: what the 22-11 real run lacked');
{
  const base = () => JSON.parse(JSON.stringify(four));
  /* A median P/E written in the source text is read as the history. */
  const md = base(); const bk = md.sectors.find((x) => x.name === 'Banking');
  bk.valuation = { pe: 14, source: 'NSE factsheet; 5-year median P/E 16.0x' };
  const sm = F.scoreFinder(md).rows.find((r) => r.name === 'Banking');
  ok('a five-year median P/E in the source text stands in for the average', sm.parts.valuation === 100 && !sm.neutral.includes('valuation'), JSON.stringify(sm.parts));
  ok('and the scorer does not change the payload it was given', md.sectors.find((x) => x.name === 'Banking').valuation.pe5yMedian === undefined);
  const lr = base(); lr.sectors.find((x) => x.name === 'Banking').valuation = { pe: 14, peMedian: 17, peMedianSince: 2025 };
  const yr = new Date().getUTCFullYear();
  const short = yr - 2025 < 3;
  ok('a long-run median is used only on three years of history', (F.scoreFinder(lr).rows.find((r) => r.name === 'Banking').valuation.history === null) === short);
  const lr2 = base(); lr2.sectors.find((x) => x.name === 'Banking').valuation = { pe: 14, peMedian: 17, peMedianSince: 2012 };
  ok('a median since 2012 is used', !F.scoreFinder(lr2).rows.find((r) => r.name === 'Banking').neutral.includes('valuation'));
  ok('the follow-up accepts any history, not only pe5yAvg',
    !finderChecksMiss(lr2).some((m) => /Banking/.test(m.detail) && m.label.startsWith('P/E')));

  /* A demand forecast alone scores the outlook (niche sectors). */
  const dm = base(); dm.sectors.find((x) => x.name === 'Retail').outlook = { demandGrowth3y: 30, source: 'x' };
  const rr = F.scoreFinder(dm).rows.find((r) => r.name === 'Retail');
  ok('a demand forecast alone scores the outlook', typeof rr.parts.outlook === 'number' && rr.partial.includes('outlook'), JSON.stringify(rr.parts));
  ok('so the sector can rank in the Top 3', rr.eligible);
  ok('its reason gives the demand forecast', /demand/i.test(rr.reason), rr.reason);

  /* The benchmark the app measured on the same date as the sector. */
  const bm = base(); bm.verified = { benchmark: { m3: 10, m6: 10, y1: 10 }, sectors: { banking: { m3: 4, m6: 8, y1: 15 } } };
  const rb = F.scoreFinder(bm).rows.find((r) => r.name === 'Banking');
  ok('an app-checked return is set against the app-checked benchmark', rb.returns && rb.returns.checked && rb.rel && rb.rel.y1 === 5, JSON.stringify(rb.rel));
}

console.log('\nThe price check (build 33: weekly prices, chain-linked baskets)');
{
  /* Every stock rises exactly 1% a week; C lists 30 weeks later at a price ten
     times higher. A chain-linked basket rises 1% a week without a jump when C
     joins: over a year 1.01^52 - 1 = 67.77%. */
  const t0 = Date.parse('2025-11-24T00:00:00Z');
  const wk = (n, p0, from = 0) => Array.from({ length: n - from }, (_, i) => ({ date: new Date(t0 + (from + i) * 7 * 864e5).toISOString().slice(0, 10), c: p0 * Math.pow(1.01, i) }));
  const stockBars = { 'NSE_EQ|AAA': wk(53, 100), 'NSE_EQ|BBB': wk(53, 50), 'NSE_EQ|CCC': wk(53, 1000, 30) };
  const pay = { sectors: [{ name: 'Fintech and payments', bellwethers: [{ symbol: 'AAA' }, { symbol: 'BBB' }, { symbol: 'CCC' }] }] };
  const v = await F.verifyReturns(pay, {
    fetchBars: async (k) => { if (stockBars[k]) return stockBars[k]; throw new Error('no ' + k); },
    keyFor: (s) => 'NSE_EQ|' + s });
  const fp = v.sectors[F.nameKey('Fintech and payments')];
  ok('a stock listed later joins the basket', fp && fp.of === 'AAA, BBB, CCC', fp && fp.of);
  ok('without a jump: the basket rises 67.77% in the year', fp && fp.y1 === 67.77, fp && fp.y1);
  ok('no figure is "not a number"', fp && [fp.y1, fp.vol, fp.maxDD].every((x) => x === null || Number.isFinite(x)), JSON.stringify(fp && { y1: fp.y1, vol: fp.vol }));
  const one = await F.verifyReturns({ sectors: [{ name: 'Education', bellwethers: [{ symbol: 'AAA' }, { symbol: 'ZZZ' }] }] },
    { fetchBars: async (k) => { if (stockBars[k]) return stockBars[k]; throw new Error('x'); }, keyFor: (s) => 'NSE_EQ|' + s });
  ok('one stock is not a basket: the sector is listed as failed', one.failed.join() === 'Education' && !one.sectors.education);
}

console.log('\nBuild 30: the follow-up leaves the app\'s job to the app');
{
  const ni = JSON.parse(JSON.stringify(four));
  ni.sectors.push({ name: 'Fintech and payments', bellwethers: [{ symbol: 'PAYTM' }, { symbol: 'PINELABS' }, { symbol: 'POLICYBZR' }] });
  const ask = F.finderChecks(ni).find((c) => c.label.startsWith('Returns'));
  ok('a sector with no index and its bellwethers is not asked for its returns', /Do NOT search for these/.test(ask.ask) && !/Missing: [^.]*Fintech/.test(ask.ask), ask.ask);
  ok('but it still shows as a gap until the app measures it', ask.have < ask.want && /app measures it from prices/.test(ask.detail));
  ni.verified = { sectors: { [F.nameKey('Fintech and payments')]: { m3: 1, m6: 2, y1: 3 } } };
  const ask2 = F.finderChecks(ni).find((c) => c.label.startsWith('Returns'));
  ok('once the app has measured it, it counts as found', !/Fintech/.test(ask2.detail), ask2.detail);
}

console.log('\nOffline');
/* Build 28 added three engine modules; a module missing from the service
   worker's list fails to load on a phone that is offline. */
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const mods = fs.readdirSync(path.join(ROOT, 'src/core')).filter((f) => f.endsWith('.js'));
const unc = mods.filter((f) => !sw.includes(`./src/core/${f}`));
ok('every engine module is in the offline cache', unc.length === 0, unc.join(', '));

console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
