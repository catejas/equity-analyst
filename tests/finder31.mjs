/* The Sector Finder from the companies themselves (build 31).
 *
 * Tejas, 23-11-2026, after seven follow-ups: "Data still missing, Fix this.
 * Find a way to get data. It's all listed companies." A sector aggregate, a
 * sector P/E history or a sector forecast is often published nowhere; each
 * listed company's results, EPS and consensus are. The tool sends those and
 * the application works the sector out. Every expected figure below is worked
 * by hand in the comment beside it. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import * as F from '../src/core/finder.js';
import { readCheck } from '../src/core/readcheck.js';
import { completeness, mergeTopUp, topUpPrompt } from '../src/core/completeness.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };

console.log('\nFinancial years');
ok('FY26, FY2026, 2025-26 and 2026 all end on 31-03-2026',
  ['FY26', 'FY2026', '2025-26', '2026', 'FY 26'].every((v) => F.fyEnd(v) === '2026-03-31'), ['FY26', 'FY2026', '2025-26', '2026'].map(F.fyEnd).join(' '));
ok('nonsense is no year', F.fyEnd('latest') === null && F.fyEnd('') === null);

console.log('\nSales and profit, added up across the companies');
{
  /* Revenue 120 + 60 against 100 + 50: 180 / 150 - 1 = 20.00%.
     Profit 12 + (-3) = 9 against 10 + 5 = 15: 9 / 15 - 1 = -40.00%. The
     company that swung to a loss is counted, not dropped. */
  const r = { name: 'X', bellwethers: [{ symbol: 'A', quarter: { period: 'Q2 FY27', revenue: 120, revenuePrev: 100, profit: 12, profitPrev: 10 } },
    { symbol: 'B', quarter: { revenue: 60, revenuePrev: 50, profit: -3, profitPrev: 5 } }, { symbol: 'C' }] };
  const b = F.companyBusiness(r);
  ok('sales growth is the sum against the sum: 20.00%', b.revenueGrowth === 20, b.revenueGrowth);
  ok('a company that swung to a loss is counted: profit -40.00%', b.profitGrowth === -40 && !b.lossBase, b.profitGrowth);
  ok('the companies used are named, and the period kept', b.of.join() === 'A,B' && b.period === 'Q2 FY27');
  /* IndiGo, Q2 FY27 against Q2 FY26: a loss of 1,879 against 2,582.
     (-1879 - -2582) / 2582 = 703 / 2582 = 27.23%, the loss narrowing. */
  const av = F.companyBusiness({ bellwethers: [{ symbol: 'INDIGO', quarter: { revenue: 23364, revenuePrev: 18556, profit: -1879, profitPrev: -2582 } }] });
  ok('a loss in both years scores as the loss narrowing: 27.23%', av.profitGrowth === 27.23 && av.lossBase, `${av.profitGrowth}, lossBase ${av.lossBase}`);
  ok('nothing sent, nothing made up', F.companyBusiness({ bellwethers: [{ symbol: 'A' }] }).revenueGrowth === null);
}

console.log('\nThe outlook from the companies\' consensus');
{
  /* EPS growth 10, 18, 30: median 18. Revenue growth 12 and 16: median 14. */
  const o = F.companyOutlook({ bellwethers: [{ symbol: 'A', forecast: { epsGrowth3y: 10, revenueGrowth3y: 12, years: 'FY26 to FY29' } },
    { symbol: 'B', forecast: { epsGrowth3y: 30 } }, { symbol: 'C', forecast: { epsGrowth3y: 18, revenueGrowth3y: 16 } }] });
  ok('earnings outlook is the median forecast: 18', o.earningsGrowth3y === 18, o.earningsGrowth3y);
  ok('demand outlook is the median revenue forecast: 14', o.demandGrowth3y === 14, o.demandGrowth3y);
}

console.log('\nA company\'s P/E history from its prices and EPS');
const monthly = (from, n, price) => {
  const out = []; const t = new Date(from + 'T00:00:00Z');
  for (let i = 0; i < n; i++) { const d = new Date(t); d.setUTCMonth(t.getUTCMonth() + i);
    out.push({ date: d.toISOString().slice(0, 10), c: typeof price === 'function' ? price(i, d) : price }); }
  return out;
};
{
  /* Price 100 every month from 01-11-2020 to 01-10-2026; EPS 5 in every year
     FY20 to FY26: P/E 20 every month, so the five-year average is 20.00.
     Trailing EPS 4: P/E now 100 / 4 = 25.00. */
  const eps = ['FY20', 'FY21', 'FY22', 'FY23', 'FY24', 'FY25', 'FY26'].map((fy) => ({ fy, eps: 5 }));
  const h = F.peHistory(monthly('2020-11-01', 72, 100), eps, 4);
  ok('a steady P/E of 20 averages 20.00', h.avg === 20, JSON.stringify(h));
  ok('the P/E now uses the trailing EPS: 25.00', h.pe === 25);
  /* The EPS of a year is used only once its accounts are out, two months after
     31 March. Price 100, EPS FY25 = 5 and FY26 = 10. In April and May 2026
     the P/E is still 100 / 5 = 20; from June 2026 it is 100 / 10 = 10. */
  const e2 = [{ fy: 'FY22', eps: 5 }, { fy: 'FY23', eps: 5 }, { fy: 'FY24', eps: 5 }, { fy: 'FY25', eps: 5 }, { fy: 'FY26', eps: 10 }];
  const short = F.peHistory(monthly('2026-04-01', 2, 100), e2, null);
  ok('with no TTM, the P/E now uses the latest year\'s EPS (100 / 10 = 10), and two months make no average', short && short.pe === 10 && short.months === 2 && short.avg === null,
    JSON.stringify(short));
  const h2 = F.peHistory(monthly('2022-06-01', 53, 100), e2, null);
  /* June 2022 to October 2026, 53 months. FY22's EPS is out from 31-05-2022,
     so every month from June 2022 has a P/E: June 2022 to May 2026 at 20 (48
     months), June to October 2026 at 10 (5 months). (48 x 20 + 5 x 10) / 53
     = 1010 / 53 = 19.0566 → 19.06. */
  ok('the year\'s EPS switches two months after the year ends: average 19.06', h2.avg === 19.06 && h2.months === 53, JSON.stringify(h2));
  /* A loss year has no P/E: EPS -2 for FY23 leaves those months out. */
  const e3 = [{ fy: 'FY22', eps: 5 }, { fy: 'FY23', eps: -2 }, { fy: 'FY24', eps: 5 }, { fy: 'FY25', eps: 5 }, { fy: 'FY26', eps: 5 }];
  const h3 = F.peHistory(monthly('2022-06-01', 53, 100), e3, null);
  ok('a loss year is left out, not counted as a P/E', h3.avg === 20 && h3.months === 41, JSON.stringify(h3));
  ok('under 24 months of P/E is no average', F.peHistory(monthly('2025-06-01', 12, 100), e2, null).avg === null);
}

console.log('\nThe sector\'s P/E from its companies, in the price check');
{
  /* Two companies. A: price 100, EPS 5 (avg 20), TTM 4 → P/E 25, 1.25x its
     average. B: price 60, EPS 3 (avg 20), TTM 4 → P/E 15, 0.75x. Sector: P/E
     median (25, 15) = 20, history median (20, 20) = 20, ratio median
     (1.25, 0.75) = 1.000. */
  const eps = ['FY21', 'FY22', 'FY23', 'FY24', 'FY25', 'FY26'].map((fy) => ({ fy, eps: 5 }));
  const eps3 = eps.map((x) => ({ fy: x.fy, eps: 3 }));
  const pay = { sectors: [
    { name: 'Fintech and payments', bellwethers: [{ symbol: 'A', eps, epsTtm: 4 }, { symbol: 'B', eps: eps3, epsTtm: 4 }, { symbol: 'C' }] },
    { name: 'Banking', index: 'Nifty Bank', valuation: { pe: 14, pe5yAvg: 16 }, bellwethers: [{ symbol: 'A', eps, epsTtm: 4 }] }] };
  const asked = [];
  const v = await F.verifyReturns(pay, {
    fetchBars: async (k, o) => { asked.push(k + (o && o.unit ? ':' + o.unit : ''));
      if (o && o.unit === 'months') return monthly('2020-11-01', 72, k.endsWith('|B') ? 60 : 100); throw new Error('no daily'); },
    keyFor: (s) => 'NSE_EQ|' + s });
  const fv = v.valuation[F.nameKey('Fintech and payments')];
  ok('the sector P/E is the median of its companies: 20.00', fv && fv.pe === 20, JSON.stringify(fv));
  ok('its history is the median of their own averages: 20.00', fv && fv.history === 20);
  ok('and how far it stands from it is the median of each company\'s: 1.000', fv && fv.ratio === 1);
  ok('a company with no EPS is not priced', fv && fv.of === 'A, B' && !asked.includes('NSE_EQ|C:months'), asked.join(' '));
  ok('a sector whose index has its own history is not re-priced', !v.valuation.banking);
  /* EPS sent in paise (500 for ₹5): P/E 100 / 500 = 0.2, impossible. */
  const bad = await F.verifyReturns({ sectors: [{ name: 'Education', bellwethers: [{ symbol: 'A', eps: eps.map((x) => ({ fy: x.fy, eps: 500 })), epsTtm: 400 }] }] },
    { fetchBars: async (k, o) => { if (o && o.unit === 'months') return monthly('2020-11-01', 72, 100); throw new Error('x'); }, keyFor: (s) => 'NSE_EQ|' + s });
  ok('an impossible P/E (EPS in the wrong unit) is left out, and the sector asked again', !bad.valuation.education && bad.valuationFailed.join() === 'Education');
  const s = F.scoreFinder({ ...pay, verified: v });
  const row = s.rows.find((r) => r.name === 'Fintech and payments');
  ok('the screen scores the valuation the app worked out', row.valuation.from === 'app' && row.valuation.ratio === 1 && !row.neutral.includes('valuation'),
    JSON.stringify(row.valuation));
  ok('and says so in the reason', /worked out by the application/.test(row.reason), row.reason);
  ok('the research\'s own index history comes first', s.rows.find((r) => r.name === 'Banking').valuation.from === 'research');
}

console.log('\nThe follow-up asks the companies');
{
  const d = { run: { kind: 'sectorScreen' }, benchmark: { returns: { m3: 1, m6: 2, y1: 3 } }, sectors: [
    { name: 'Education', bellwethers: [{ symbol: 'NIITLTD' }, { symbol: 'APTECHT' }, { symbol: 'CAREERP' }] },
    { name: 'Aviation', bellwethers: [{ symbol: 'INDIGO', eps: [{ fy: 'FY24', eps: 211 }, { fy: 'FY25', eps: 188 }, { fy: 'FY26', eps: 150 }] },
      { symbol: 'SPICEJET' }, { symbol: 'GMRAIRPORT' }] }] };
  const ch = F.finderChecks(d);
  const bz = ch.find((c) => c.label.startsWith('Business'));
  ok('business names the companies whose quarter figures are wanted', /Education \(sales and profit: the quarter figures of NIITLTD, APTECHT, CAREERP\)/.test(bz.detail), bz.detail);
  ok('and asks for each company\'s filing, losses included', /EACH bellwether/.test(bz.ask) && /A loss is a negative number/.test(bz.ask));
  const ol = ch.find((c) => c.label.startsWith('Three-year'));
  ok('the outlook asks each company\'s consensus estimates or guidance', /consensus estimates or guidance of NIITLTD/.test(ol.detail) && /Trendlyne/.test(ol.ask) && /guidance/.test(ol.ask));
  const va = ch.find((c) => c.label.startsWith('P/E'));
  ok('valuation asks for EPS, not for P/E averages', /Education \(EPS history of NIITLTD, APTECHT, CAREERP\)/.test(va.ask) && /do NOT look for P\/E averages/.test(va.ask), va.ask.slice(-200));
  ok('a sector whose companies sent EPS is the app\'s to work out', /Aviation \(the app works it out/.test(va.detail) && !/Missing: [^.]*Aviation/.test(va.ask));
  const ret = ch.find((c) => c.label.startsWith('Returns'));
  ok('returns the app can measure are left to it', ret.appOnly && /Do NOT search/.test(ret.ask));
  const tp = topUpPrompt(d);
  ok('a check that is entirely the app\'s is not sent to the tool', !/Returns over 3 months/.test(tp) && /Business momentum/.test(tp));
  const c = completeness(d);
  ok('but it still shows as a gap, marked as the app\'s', c.missing.some((m) => m.label.startsWith('Returns') && m.state === 'app'));
  /* The app's check failed for Aviation: now it is asked of the tool. */
  d.verified = { sectors: {}, failed: ['Aviation'], valuation: {}, valuationFailed: ['Aviation'] };
  const ch2 = F.finderChecks(d);
  ok('a return the app could not measure is asked of the tool', /Missing: [^.]*Aviation/.test(ch2.find((c) => c.label.startsWith('Returns')).ask));
  ok('a valuation the app could not work out is asked again', /Missing: [^.]*Aviation \(EPS history/.test(ch2.find((c) => c.label.startsWith('P/E')).ask));
}

console.log('\nReading the companies\' figures as tools write them');
{
  const add = { run: { topUp: true, kind: 'sectorScreen', searchLog: [] }, sectors: [{ name: 'Education', bellwethers: [
    { symbol: 'NIITLTD', results: { sales: '100', revenuePrevious: 90, PAT: '10', patPrev: 8, period: 'Q2 FY27' },
      eps: { FY24: 2, FY25: 2.5, FY26: 3, ttm: 3.2 }, consensus: { epsCagr3y: 15 } }] }] };
  const rc = readCheck(add);
  const b = add.sectors[0].bellwethers[0];
  ok('nothing in it goes unread', !rc.unread.length && !rc.unreadable.length, JSON.stringify(rc.unread));
  ok('results, sales and PAT are read as the quarter', b.quarter && b.quarter.revenue === 100 && b.quarter.profit === 10 && b.quarter.profitPrev === 8 && b.quarter.revenuePrev === 90,
    JSON.stringify(b.quarter));
  ok('EPS by year is read as a list, and TTM kept', Array.isArray(b.eps) && b.eps.length === 3 && b.epsTtm === 3.2);
  ok('consensus is read as the forecast', b.forecast && b.forecast.epsGrowth3y === 15);
}

console.log('\nThe prompt');
{
  const pr = F.buildFinderPrompt({ now: new Date('2026-11-23T10:00:00Z') });
  ok('says every sector is made of listed companies', /EVERY SECTOR IS MADE OF LISTED\s+COMPANIES/.test(pr));
  ok('shows the companies\' quarter, EPS and forecast in the JSON', /"quarter": \{ "period"/.test(pr) && /"eps": \[ \{ "fy"/.test(pr) && /"forecast": \{ "eps": \[/.test(pr) && /"guidance": \{ "revenueGrowth"/.test(pr));
  ok('no longer asks the tool to add the results up itself', !/add up the bellwethers/.test(pr));
}

console.log('\nThe real run: seven follow-ups, then the companies\' figures');
{
  const dir = path.join(ROOT, 'tests/fixtures/real');
  const ld = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  let d = ld('finder-22-11-2026-base.json'); readCheck(d);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) { const a = ld(`finder-22-11-2026-topup${n}.json`); if (!Array.isArray(a.companies)) a.companies = [];
    readCheck(a); const mg = mergeTopUp(d, a); if (!mg.ok) throw new Error(mg.reason); d = mg.merged; readCheck(d); }
  const before = F.scoreFinder(d);
  const tpBefore = topUpPrompt(d);
  ok('after seven follow-ups the screen still lacks P/E history for many sectors', completeness(d).missing.some((m) => m.label.startsWith('P/E') && m.have <= 25));
  ok('the next follow-up asks for each company\'s EPS by symbol', /EPS history of LICI, SBILIFE/.test(tpBefore));
  ok('and does not ask for returns the app measures', !/Returns over 3 months/.test(tpBefore));
  /* A made-up follow-up: TEST DATA, not research. Every company of every sector
     still lacking something sends its quarter, five years of EPS and a
     consensus. The prices are mocked. */
  const lacking = before.rows.filter((r) => !r.complete).map((r) => r.name);
  const add = { run: { topUp: true, kind: 'sectorScreen', searchLog: [] }, sectors: lacking.map((name, i) => {
    const r = d.sectors.find((x) => x.name === name);
    return { name, bellwethers: (r.bellwethers || []).map((b, j) => ({ symbol: b.symbol,
      quarter: { period: 'Q2 FY27', revenue: 100 + i + j, revenuePrev: 100, profit: 10 + (i % 5) - j, profitPrev: 10, source: 'TEST' },
      eps: ['FY22', 'FY23', 'FY24', 'FY25', 'FY26'].map((fy, k) => ({ fy, eps: 5 + k * 0.5 })), epsTtm: 7.5,
      forecast: { epsGrowth3y: 8 + (i % 9), revenueGrowth3y: 6 + (i % 7), years: 'FY26 to FY29', source: 'TEST' } })) };
  }) };
  const rc = readCheck(add);
  ok('the companies\' figures are all read', !rc.unread.length && !rc.unreadable.length, JSON.stringify(rc.unread).slice(0, 200));
  const mg = mergeTopUp(d, add);
  ok('and merge into the screen by sector and symbol', mg.ok && mg.merged.sectors.length === 41
    && mg.merged.sectors.find((x) => x.name === 'Education').bellwethers.every((b) => b.quarter && b.name), mg.reason);
  d = mg.merged;
  const rate = {}; d.sectors.forEach((x, i) => (x.bellwethers || []).forEach((b) => { rate[b.symbol] = 0.0002 + (i % 7) * 0.0003; }));
  const daily = (r) => { const out = []; const t0 = Date.parse('2025-10-01T00:00:00Z');
    for (let i = 0; i <= 420; i++) out.push({ date: new Date(t0 + i * 864e5).toISOString().slice(0, 10), c: 100 * Math.exp(r * i) }); return out; };
  const v = await F.verifyReturns(d, {
    fetchBars: async (k, o) => {
      const sym = k.startsWith('NSE_EQ|') ? k.slice(7) : null;
      if (o && o.unit === 'months') { if (sym) return monthly('2020-11-01', 72, (m) => 80 + m * 0.5); throw new Error('x'); }
      if (sym && rate[sym] != null) return daily(rate[sym]);
      if (k === 'NSE_INDEX|Nifty 50') return daily(0.0004);
      throw new Error('no ' + k); },
    keyFor: (s) => 'NSE_EQ|' + s, now: new Date('2026-11-23T00:00:00Z') });
  d.verified = v;
  const after = F.scoreFinder(d);
  const c = completeness(d);
  ok('every sector now has its business momentum', after.rows.every((r) => !r.missingParts.includes('business')),
    after.rows.filter((r) => r.missingParts.includes('business')).map((r) => r.name).join(', '));
  ok('and its outlook', after.rows.every((r) => !r.missingParts.includes('outlook')),
    after.rows.filter((r) => r.missingParts.includes('outlook')).map((r) => r.name).join(', '));
  ok('and its valuation, worked out by the app where the research had none', after.rows.every((r) => !r.missingParts.includes('valuation')),
    after.rows.filter((r) => r.missingParts.includes('valuation')).map((r) => r.name).join(', '));
  ok('every sector can now rank for the Top 3', after.counts.eligible === 41, `${before.counts.eligible} → ${after.counts.eligible}`);
  ok('nothing is counted as merely average any more', after.counts.neutral === 0, after.counts.neutral);
  ok('depth rises well above 80%', c.pct >= 95, `${completeness(d).pct}% (left: ${c.missing.map((m) => m.label).join('; ')})`);
}

console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
