/* The Sector Finder's outlook tiers and the price-check queue (build 32).
 *
 * Tejas's decisions of 23-11-2026, after follow-ups 8 and 9 on build 31:
 *  - the outlook comes from published forecasts, then the company's own
 *    guidance, then the past trend; with only two forecast years, the third
 *    is extended at their trend;
 *  - a past-trend outlook counts at half weight;
 *  - one company's past growth is capped at ±50% a year;
 *  - a badge on the outlook figure only: Published, Guidance or Past;
 *  - the price check is queued (a check asked for while one runs runs
 *    next), shows its progress, can be run again by hand, and reads
 *    calendar years.
 * Every expected figure is worked by hand in the comment beside it. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import * as F from '../src/core/finder.js';
import { readCheck } from '../src/core/readcheck.js';
import { completeness, mergeTopUp, topUpPrompt } from '../src/core/completeness.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const yr = (fy, eps, actual) => ({ fy, eps, ...(actual ? { actual: true } : {}) });

console.log('\nYears as the sites write them');
ok('CY21 ends on 31-12-2021, CY2025 on 31-12-2025', F.fyEnd('CY21') === '2021-12-31' && F.fyEnd('CY2025') === '2025-12-31');
ok('an estimate year FY27E or FY2028E is read', F.fyEnd('FY27E') === '2027-03-31' && F.fyEnd('FY2028E') === '2028-03-31');
ok('an actual year FY26A is read', F.fyEnd('FY26A') === '2026-03-31');
ok('ABB\'s calendar-year EPS can now be priced', F.canPrice({ symbol: 'ABB', eps: ['CY21', 'CY22', 'CY23', 'CY24', 'CY25'].map((fy, i) => ({ fy, eps: 20 + i })) }));

console.log('\nPublished: the growth from the estimates the site shows');
{
  const base = { fy: 'FY26', end: '2026-03-31', v: 10 };
  const e = (fy, v) => ({ fy, end: F.fyEnd(fy), v });
  /* Three forecast years: 10 → 13.31 by FY29: (13.31 / 10)^(1/3) - 1 = 10.00%. */
  const g3 = F.forecastGrowth(base, [e('FY27', 11), e('FY28', 12.1), e('FY29', 13.31)]);
  ok('three published years: the growth to the third, 10.00% a year', +g3.g.toFixed(2) === 10 && !g3.extended, JSON.stringify(g3));
  /* Two years (Tejas's rule): FY27 12, FY28 14.4, so 20% between them; FY29
     extended at 14.4 x 1.2 = 17.28; (17.28 / 10)^(1/3) - 1 = 20.00%. */
  const g2 = F.forecastGrowth(base, [e('FY27', 12), e('FY28', 14.4)]);
  ok('two published years: the third extended at their trend, 20.00% a year', +g2.g.toFixed(2) === 20 && g2.extended, JSON.stringify(g2));
  ok('and the years say so', /extended at the FY27–FY28 trend/.test(g2.years), g2.years);
  /* Uneven: FY27 11 (+10%), FY28 13.2 (+20%); FY29 = 13.2 x 1.2 = 15.84;
     (15.84 / 10)^(1/3) - 1 = 16.57%. */
  const gu = F.forecastGrowth(base, [e('FY27', 11), e('FY28', 13.2)]);
  ok('uneven years: FY29 at the FY27–FY28 growth, 16.57% a year', +gu.g.toFixed(2) === 16.57, gu.g);
  /* One year only: 10 → 11.5 = 15.00%, used as it stands. */
  const g1 = F.forecastGrowth(base, [e('FY27', 11.5)]);
  ok('one published year is used as it stands, 15.00%', +g1.g.toFixed(2) === 15 && !g1.extended);
  ok('a loss base gives no growth rate', F.forecastGrowth({ ...base, v: -2 }, [e('FY27', 5)]) === null);
  ok('nothing after the base gives none', F.forecastGrowth(base, [e('FY26', 12)]) === null);
}

console.log('\nThe tiers, company by company');
{
  const hist = [yr('FY23', 8), yr('FY24', 9), yr('FY25', 9.5), yr('FY26', 10)];
  /* A: estimates FY27 12 and FY28 14.4 over FY26 actual 10 → 20.00% (published).
     B: same, the actual sent inside the forecast → 20.00% (published).
     C: only guidance, profit 15% → guidance.
     D: only past EPS, FY23 8 → FY26 10: (10/8)^(1/3) - 1 = 7.72% → past. */
  const r = { name: 'X', bellwethers: [
    { symbol: 'A', eps: hist, forecast: { eps: [yr('FY27', 12), yr('FY28', 14.4)], revenue: [{ fy: 'FY26', value: 100, actual: true }, { fy: 'FY27', value: 110 }, { fy: 'FY28', value: 121 }], source: 'StockAnalysis' } },
    { symbol: 'B', forecast: { eps: [yr('FY26', 10, true), yr('FY27', 12), yr('FY28', 14.4)] } },
    { symbol: 'C', eps: hist, guidance: { profitGrowth: 15, revenueGrowth: 12, source: 'Q2 FY27 call' } },
    { symbol: 'D', eps: hist }] };
  const o = F.companyOutlook(r);
  ok('the sector takes the best tier its companies reached: Published', o.tier.earnings === 'published', JSON.stringify(o.tier));
  ok('and the median of only those companies: 20.00, not mixed with guidance or history', o.earningsGrowth3y === 20, o.earningsGrowth3y);
  /* Revenue 100 → 110 → 121 (+10% a year), FY29 extended to 133.1: 10.00%. */
  ok('demand from the revenue estimates, extended the same way: 10.00%', o.demandGrowth3y === 10 && o.tier.demand === 'published', o.demandGrowth3y);
  ok('the note names the companies and the years', /consensus forecast of A, B/.test(o.note.earnings) && /extended/.test(o.note.earnings), o.note.earnings);
  const g = F.companyOutlook({ name: 'Y', bellwethers: [r.bellwethers[2], r.bellwethers[3]] });
  ok('with no forecast, guidance: 15.00', g.tier.earnings === 'guidance' && g.earningsGrowth3y === 15 && g.tier.demand === 'guidance' && g.demandGrowth3y === 12);
  const p = F.companyOutlook({ name: 'Z', bellwethers: [r.bellwethers[3]] });
  ok('with neither, the past trend: 7.72', p.tier.earnings === 'past' && p.earningsGrowth3y === 7.72, JSON.stringify(p));
  ok('and its note says it counts at half weight', /past EPS growth/.test(p.note.earnings) && /half weight/.test(p.note.earnings));
  ok('the past trend gives no demand figure (no revenue history)', p.demandGrowth3y === null && !p.tier.demand);
  /* Wabag: FY23 2.09 → FY26 59.46 is (59.46/2.09)^(1/3) - 1 = 205.3% a year:
     capped at +50. Paper: FY23 70.59 → FY26 14.66 is -40.8%: within the cap. */
  const cap = F.companyOutlook({ name: 'W', bellwethers: [
    { symbol: 'WABAG', eps: [yr('FY22', 21.21), yr('FY23', 2.09), yr('FY24', 39.49), yr('FY25', 47.48), yr('FY26', 59.46)] },
    { symbol: 'JKPAPER', eps: [yr('FY23', 70.59), yr('FY24', 66.22), yr('FY25', 24.13), yr('FY26', 14.66)] }] });
  /* Median of +50 and -40.79 = 4.61. */
  ok('one company\'s past growth is capped at ±50% a year: median of +50 and -40.79 = 4.61', cap.earningsGrowth3y === 4.61, cap.earningsGrowth3y);
  ok('and the note names the capped company', /WABAG capped at ±50%/.test(cap.note.earnings), cap.note.earnings);
  ok('a loss at either end gives no past trend', F.companyOutlook({ name: 'L', bellwethers: [{ symbol: 'L', eps: [yr('FY23', -2), yr('FY26', 4)] }] }).earningsGrowth3y === null);
}

console.log('\nThe research\'s own sector forecast comes first');
{
  const r = { name: 'Banking', outlook: { earningsGrowth3y: 14, source: 'MOFSL' }, bellwethers: [{ symbol: 'A', eps: [yr('FY23', 8), yr('FY26', 10)] }] };
  const ef = F.effective(r);
  ok('a sector forecast from the research is badged Published', ef.outlook.tier.earnings === 'published' && ef.outlook.earningsGrowth3y === 14 && /published sector forecast: MOFSL/.test(ef.outlook.note.earnings));
}

console.log('\nPast counts at half weight');
{
  /* Four sectors with earnings 10, 20, 30, 40 and nothing else in the
     outlook. Percentiles: 0, 33.3, 66.7, 100. If the 40 is a past trend,
     its rank is pulled halfway to average: 50 + (100 - 50) / 2 = 75.0. */
  const mk = (name, g, past) => ({ name, returns: { m3: 1, m6: 2, y1: 3 },
    ...(past ? { bellwethers: [{ symbol: name.slice(0, 3).toUpperCase(), eps: [yr('FY23', 100), yr('FY26', 100 * Math.pow(1 + g / 100, 3))] }] }
      : { outlook: { earningsGrowth3y: g } }) });
  const d = { benchmark: { returns: { m3: 0, m6: 0, y1: 0 } }, sectors: [mk('Banking', 10), mk('Retail', 20), mk('Cement and building materials', 30), mk('Aviation', 40, true)] };
  const s = F.scoreFinder(d);
  const av = s.rows.find((r) => r.name === 'Aviation');
  ok('a past-trend outlook is scored, with its tier', av.outlook.tier.earnings === 'past' && av.outlook.earningsGrowth3y === 40, JSON.stringify(av.outlook.tier));
  ok('at half weight: rank 100 counts as 75.0', av.parts.outlook === 75, av.parts.outlook);
  ok('a published one keeps its rank: 66.7', s.rows.find((r) => r.name === 'Cement and building materials').parts.outlook === 66.7);
  ok('the sector can rank for the Top 3', av.eligible);
  ok('and its reason says it is a past trend at half weight', /past growth of 40\.0% a year \(half weight\)/.test(av.reason), av.reason);
}

console.log('\nThe follow-up keeps asking for a forecast');
{
  const d = { benchmark: { returns: { m3: 1, m6: 2, y1: 3 } }, sectors: [
    { name: 'Education', bellwethers: [{ symbol: 'NIITLTD', eps: [yr('FY23', 1), yr('FY26', 2)] }, { symbol: 'APTECHT' }, { symbol: 'CAREERP' }] },
    { name: 'Retail', bellwethers: [{ symbol: 'TRENT', forecast: { eps: [yr('FY26', 10, true), yr('FY27', 12)], revenue: [{ fy: 'FY27', value: 100 }, { fy: 'FY28', value: 120 }] } }, { symbol: 'DMART' }, { symbol: 'ABFRL' }] }] };
  const ol = F.finderChecks(d).find((c) => c.label.startsWith('Three-year'));
  ok('a sector on its past trend is still asked for estimates or guidance', /Education \(earnings and demand: the consensus estimates or guidance of NIITLTD, APTECHT, CAREERP \(past trend used/.test(ol.detail), ol.detail);
  ok('a sector with published estimates is not', !/Retail/.test(ol.detail));
  ok('the ask wants the estimates exactly as shown, one site per sector, and guidance', /EXACTLY AS THE SITE SHOWS THEM/.test(ol.ask) && /ONE site/.test(ol.ask) && /bellwethers\[\]\.guidance/.test(ol.ask) && /extends a third/.test(ol.ask));
}

console.log('\nReading estimates as tools write them');
{
  const add = { run: { topUp: true, kind: 'sectorScreen', searchLog: [] }, sectors: [{ name: 'Retail', bellwethers: [
    { symbol: 'TRENT', forecast: { eps: { FY26A: 50, FY27E: 60, FY28E: 72 }, sales: [{ fy: 'FY27E', revenue: 100 }, { fy: 'FY28E', revenue: 115 }], source: 'StockAnalysis' },
      managementGuidance: { salesGrowth: 20, patGrowth: 25, source: 'Q2 FY27 call' } }] }] };
  const rc = readCheck(add);
  const b = add.sectors[0].bellwethers[0];
  ok('nothing goes unread', !rc.unread.length && !rc.unreadable.length, JSON.stringify(rc.unread));
  ok('EPS estimates by year become a list, the actual marked', Array.isArray(b.forecast.eps) && b.forecast.eps.length === 3
    && b.forecast.eps.find((e) => e.fy === 'FY26A').actual && b.forecast.eps.some((e) => e.fy === 'FY28'), JSON.stringify(b.forecast.eps));
  ok('sales estimates are read as revenue', Array.isArray(b.forecast.revenue) && b.forecast.revenue[0].value === 100 && b.forecast.revenue[1].fy === 'FY28', JSON.stringify(b.forecast.revenue));
  ok('management guidance is read as guidance', b.guidance && b.guidance.revenueGrowth === 20 && b.guidance.profitGrowth === 25);
  /* 50 → 60 → 72 (+20%), FY29 86.4: (86.4/50)^(1/3) - 1 = 20.00%. */
  ok('and scores as Published: 20.00', F.companyOutlook(add.sectors[0]).earningsGrowth3y === 20);
}

console.log('\nThe data stamp and the progress of the price check');
{
  const d = { benchmark: { name: 'Nifty 50' }, sectors: [{ name: 'Retail', bellwethers: [{ symbol: 'A' }] }] };
  const s1 = F.finderStamp(d);
  ok('the stamp does not change with the app\'s own check', F.finderStamp({ ...d, verified: { sectors: { retail: {} } } }) === s1);
  ok('it changes when a follow-up adds a figure', F.finderStamp({ ...d, sectors: [{ name: 'Retail', bellwethers: [{ symbol: 'A', eps: [yr('FY26', 1)] }] }] }) !== s1);
  const seen = [];
  const v = await F.verifyReturns(d, { fetchBars: async () => { throw new Error('offline'); }, keyFor: (s) => 'NSE_EQ|' + s, onProgress: (p, a, b) => seen.push(`${p} ${a}/${b}`) });
  ok('a check carries the stamp of the data it was run on', v.stamp === s1);
  ok('and reports its progress', seen.includes('returns 0/1') && seen.includes('returns 1/1'), seen.join(', '));
}

console.log('\nThe real run: ten follow-ups');
{
  const dir = path.join(ROOT, 'tests/fixtures/real');
  const ld = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  let d = ld('finder-22-11-2026-base.json'); readCheck(d);
  const parts = ['1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9'];
  const unread = [];
  for (const n of parts) {
    const a = ld(`finder-22-11-2026-topup${n}.json`); if (!Array.isArray(a.companies)) a.companies = [];
    const rc = readCheck(a); unread.push(...rc.unread, ...rc.unreadable);
    const mg = mergeTopUp(d, a); if (!mg.ok) throw new Error(n + ': ' + mg.reason); d = mg.merged; readCheck(d);
  }
  ok('all ten follow-ups are read in full', !unread.length, JSON.stringify(unread).slice(0, 200));
  const abb = d.sectors.find((x) => x.name === 'Capital goods').bellwethers.find((b) => b.symbol === 'ABB');
  ok('ABB\'s calendar-year EPS is now read and can be priced', F.canPrice(abb));
  const s = F.scoreFinder(d);
  const nine = ['Shipping and marine', 'Diversified holdings', 'Paper and packaging', 'Engineering and industrial services',
    'Agriculture and agri inputs', 'Trading and distribution', 'Water and environment', 'Education'];
  const rows = nine.map((n) => s.rows.find((r) => r.name === n));
  ok('the eight sectors that had no outlook now have one from their past EPS trend', rows.every((r) => !r.missingParts.includes('outlook') && r.outlook.tier.earnings === 'past'),
    rows.filter((r) => r.missingParts.includes('outlook')).map((r) => r.name).join(', '));
  /* Emerging themes sent no EPS: it stays without an outlook, and is asked. */
  ok('Emerging themes, with no EPS sent, still has none and is asked', s.rows.find((r) => r.name === 'Emerging themes').missingParts.includes('outlook')
    && /Emerging themes/.test(F.finderChecks(d).find((c) => c.label.startsWith('Three-year')).detail));
  ok('a sector with a published forecast keeps its Published badge', s.rows.some((r) => r.outlook.tier.earnings === 'published'));
  ok('more sectors can rank for the Top 3 than before (27)', s.counts.eligible > 27, s.counts.eligible);
  const tp = topUpPrompt(d);
  ok('the next follow-up asks for the estimates as published, by symbol', /consensus estimates or guidance of SCI, GESHIP/.test(tp), (tp.match(/Shipping and marine \([^)]*\)/) || [''])[0]);
  ok('and still leaves the P/E history to the app', !/EPS history of LICI/.test(tp));
}

console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
