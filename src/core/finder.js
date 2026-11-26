import { weekly, periodReturn, basket, priceMetrics, breadth } from './sector-metrics.js';
import { partsRule, planSectors, partId } from './parts.js';
/* The Sector Finder (build 28).
 *
 * Tejas, 22-11-2026: "we can search the Top3 companies of any sector but now I
 * want to get Solution to pickup and find sector which is doing good in the
 * past 3 months, 6 months and one year and will continue to grow for next 3
 * years."
 *
 * One prompt asks the research tool for every sector in the app's list: the
 * sector index's return over 3 months, 6 months and 1 year, the Nifty 50's over
 * the same periods, the sector's sales and profit growth over the last four
 * quarters, its forecast growth over the next three years with the tailwinds
 * and risks behind it, and its P/E against its own five-year average.
 *
 * The tool does not rank. As with the Top 3 companies, the application scores
 * every sector from those figures and picks the three:
 *
 *   past momentum      35   3m / 6m / 1y return against the Nifty 50
 *   business momentum  20   profit and sales growth, last four quarters
 *   3-year outlook     35   forecast earnings and demand growth
 *   valuation          10   P/E against its own five-year average
 *
 * Each part is a percentile among the sectors screened, so the score says how
 * a sector stands against the others today, not against a fixed bar.
 *
 * Build 29 (Tejas: missing data "directly affect the ranking of Top3"). A gap
 * no longer decides the ranking. Past momentum and the three-year outlook —
 * 70 of the 100 points — must be there for a sector to make the Top 3.
 * Business momentum and valuation, when they could not be established, count
 * as average (the 50th percentile): neither reward nor penalty. Every such
 * part is shown as "counted as average", and the follow-up keeps asking for
 * it.
 *
 * The returns are not taken on trust. The application fetches the sector
 * index (or, failing that, the sector's bellwether stocks) itself and replaces
 * the tool's figures with its own; what it could not check is marked so. */

const S = (v) => (v == null ? '' : String(v).trim());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const real = (v) => isNum(v) && v !== 0;
const arr = (v) => (Array.isArray(v) ? v : []);

export const FINDER_LINE = 'F|screen';
export const BENCHMARK = 'Nifty 50';
/* Build 33: sectors are set against the Nifty 500, the broad market, since
   many are mid-cap heavy; the Nifty 50 is kept beside it. */
export const BENCHMARK_BROAD = 'Nifty 500';
/* How the three lookbacks combine into one momentum reading: the year counts
   most, the quarter least, so one strong quarter cannot carry a sector. */
const MOMENTUM_MIX = { m3: 0.25, m6: 0.35, y1: 0.40 };

/* The app's sector list (sectors.js), in its order. finder.mjs checks the two
   stay the same. */
export const FINDER_SECTORS = Object.freeze([
  'Banking', 'Non-banking finance', 'Insurance', 'Capital markets', 'Fintech and payments',
  'Information technology', 'Pharmaceuticals', 'Healthcare services', 'Chemicals', 'Fertilisers',
  'Automobiles', 'Auto components', 'Capital goods', 'Defence and aerospace', 'Railways',
  'Infrastructure and construction', 'Real estate', 'Cement and building materials', 'Metals and mining',
  'Oil and gas', 'Power and utilities', 'Renewable energy', 'Fast moving consumer goods',
  'Consumer durables', 'Electronics manufacturing', 'Retail', 'Textiles and apparel',
  'Agriculture and agri inputs', 'Logistics and transport', 'Aviation', 'Hospitality and tourism',
  'Media and entertainment', 'Telecommunications', 'Education', 'Paper and packaging',
  'Engineering and industrial services', 'Trading and distribution', 'Diversified holdings',
  'Shipping and marine', 'Water and environment', 'Emerging themes']);

/* The NSE index that tracks each sector, by the name NSE gives it. Where none
   does, the bellwether stocks stand in for it. The tool names the index too;
   the application tries the tool's name, then this one. */
export const SECTOR_INDEX = Object.freeze({
  'Banking': 'Nifty Bank', 'Non-banking finance': 'Nifty Financial Services', 'Capital markets': 'Nifty Capital Markets',
  'Information technology': 'Nifty IT', 'Pharmaceuticals': 'Nifty Pharma', 'Healthcare services': 'Nifty Healthcare Index',
  'Chemicals': 'Nifty Chemicals', 'Automobiles': 'Nifty Auto', 'Auto components': 'Nifty Auto',
  'Defence and aerospace': 'Nifty India Defence', 'Infrastructure and construction': 'Nifty Infrastructure',
  'Real estate': 'Nifty Realty', 'Metals and mining': 'Nifty Metal', 'Oil and gas': 'Nifty Oil & Gas',
  'Power and utilities': 'Nifty Energy', 'Renewable energy': 'Nifty Energy', 'Fast moving consumer goods': 'Nifty FMCG',
  'Consumer durables': 'Nifty Consumer Durables', 'Retail': 'Nifty India Consumption',
  'Logistics and transport': 'Nifty Transportation & Logistics', 'Hospitality and tourism': 'Nifty India Tourism',
  'Media and entertainment': 'Nifty Media', 'Telecommunications': 'Nifty India Digital',
});
/* Upstox's instrument names for NSE indices differ in places from NSE's own
   (it abbreviates). Both are tried. */
const UPSTOX_INDEX = {
  'nifty 50': 'Nifty 50', 'nifty 500': 'Nifty 500', 'nifty bank': 'Nifty Bank', 'nifty it': 'Nifty IT', 'nifty pharma': 'Nifty Pharma',
  'nifty auto': 'Nifty Auto', 'nifty fmcg': 'Nifty FMCG', 'nifty metal': 'Nifty Metal', 'nifty realty': 'Nifty Realty',
  'nifty energy': 'Nifty Energy', 'nifty media': 'Nifty Media', 'nifty psu bank': 'Nifty PSU Bank',
  'nifty private bank': 'Nifty Pvt Bank', 'nifty financial services': 'Nifty Fin Service',
  'nifty infrastructure': 'Nifty Infra', 'nifty consumer durables': 'Nifty Consr Durbl',
  'nifty healthcare index': 'NIFTY HEALTHCARE', 'nifty oil & gas': 'NIFTY OIL AND GAS',
  'nifty india consumption': 'Nifty Consumption', 'nifty capital markets': 'Nifty Capital Mkt',
  'nifty india defence': 'Nifty Ind Defence', 'nifty india digital': 'Nifty Ind Digital',
  'nifty india tourism': 'Nifty Ind Tourism', 'nifty transportation & logistics': 'Nifty Trans Logis',
  'nifty chemicals': 'Nifty Chemicals',
};
export function indexKeys(name) {
  const n = S(name);
  if (!n) return [];
  const keys = [`NSE_INDEX|${n}`];
  const alt = UPSTOX_INDEX[n.toLowerCase()];
  if (alt && alt !== n) keys.push(`NSE_INDEX|${alt}`);
  return keys;
}

/* Short names for chart axes. */
export const SHORT_NAMES = Object.freeze({
  'Banking': 'Banks', 'Non-banking finance': 'NBFCs', 'Insurance': 'Insurance', 'Capital markets': 'Cap. markets',
  'Fintech and payments': 'Fintech', 'Information technology': 'IT', 'Pharmaceuticals': 'Pharma',
  'Healthcare services': 'Healthcare', 'Chemicals': 'Chemicals', 'Fertilisers': 'Fertilisers', 'Automobiles': 'Autos',
  'Auto components': 'Auto parts', 'Capital goods': 'Cap. goods', 'Defence and aerospace': 'Defence', 'Railways': 'Railways',
  'Infrastructure and construction': 'Infra', 'Real estate': 'Realty', 'Cement and building materials': 'Cement',
  'Metals and mining': 'Metals', 'Oil and gas': 'Oil & gas', 'Power and utilities': 'Power', 'Renewable energy': 'Renewables',
  'Fast moving consumer goods': 'FMCG', 'Consumer durables': 'Durables', 'Electronics manufacturing': 'Electronics',
  'Retail': 'Retail', 'Textiles and apparel': 'Textiles', 'Agriculture and agri inputs': 'Agri', 'Logistics and transport': 'Logistics',
  'Aviation': 'Aviation', 'Hospitality and tourism': 'Hotels', 'Media and entertainment': 'Media', 'Telecommunications': 'Telecom',
  'Education': 'Education', 'Paper and packaging': 'Paper', 'Engineering and industrial services': 'Engineering',
  'Trading and distribution': 'Trading', 'Diversified holdings': 'Holdings', 'Shipping and marine': 'Shipping',
  'Water and environment': 'Water', 'Emerging themes': 'Themes',
});
export const nameKey = (v) => S(v).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function isFinderPayload(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.run && /sector\s*screen|finder/i.test(S(d.run.kind))) return true;
  return Array.isArray(d.sectors) && !arr(d.companies).length && !d.shortlist
    && (!d.macro || d.sectors.some((x) => x && x.deepDive));
}

/* ── Reading a reply as the tool actually wrote it (build 29) ───────────
 * Tejas: missing data "directly affect the ranking of Top3. … Fix this any
 * how." A figure the tool sent but the app did not read is the app's fault.
 * normaliseFinder runs on every Finder reply before anything else reads it
 * and repairs the shapes AI tools actually send:
 *   - sector names that are not the list's ("IT", "Banks", "FMCG", "Oil & Gas");
 *   - figures put beside their block instead of in it (a row's own "pe",
 *     "return1y", "tailwinds");
 *   - other names for a field ("avgPe5y", "epsCagr3y", "patGrowth");
 *   - a block sent without its wrapper (benchmark { m3, m6, y1 });
 *   - a whole column sent as fractions (0.124 for 12.4%).
 * Numbers sent as text are read by readcheck.js. Every repair is listed. */
const NAME_ALIASES = {
  'banks': 'Banking', 'bank': 'Banking', 'psu banks': 'Banking', 'public sector banks': 'Banking', 'private banks': 'Banking',
  'private sector banks': 'Banking', 'nbfc': 'Non-banking finance', 'nbfcs': 'Non-banking finance',
  'non banking financial companies': 'Non-banking finance', 'financial services': 'Non-banking finance',
  'capital market': 'Capital markets', 'fintech': 'Fintech and payments', 'payments': 'Fintech and payments',
  'it': 'Information technology', 'it services': 'Information technology', 'technology': 'Information technology',
  'software': 'Information technology', 'pharma': 'Pharmaceuticals', 'healthcare': 'Healthcare services',
  'hospitals': 'Healthcare services', 'specialty chemicals': 'Chemicals', 'speciality chemicals': 'Chemicals',
  'fertilizers': 'Fertilisers', 'fertiliser': 'Fertilisers', 'auto': 'Automobiles', 'autos': 'Automobiles', 'automobile': 'Automobiles',
  'auto ancillaries': 'Auto components', 'auto ancillary': 'Auto components', 'auto parts': 'Auto components',
  'industrials': 'Capital goods', 'defence': 'Defence and aerospace', 'defense': 'Defence and aerospace',
  'railway': 'Railways', 'infra': 'Infrastructure and construction', 'infrastructure': 'Infrastructure and construction',
  'construction': 'Infrastructure and construction', 'realty': 'Real estate', 'cement': 'Cement and building materials',
  'building materials': 'Cement and building materials', 'metals': 'Metals and mining', 'mining': 'Metals and mining',
  'metal': 'Metals and mining', 'oil gas': 'Oil and gas', 'energy': 'Oil and gas', 'power': 'Power and utilities',
  'utilities': 'Power and utilities', 'renewables': 'Renewable energy', 'fmcg': 'Fast moving consumer goods',
  'consumer staples': 'Fast moving consumer goods', 'durables': 'Consumer durables', 'electronics': 'Electronics manufacturing',
  'ems': 'Electronics manufacturing', 'textiles': 'Textiles and apparel', 'apparel': 'Textiles and apparel',
  'agriculture': 'Agriculture and agri inputs', 'agri': 'Agriculture and agri inputs', 'agrochemicals': 'Agriculture and agri inputs',
  'logistics': 'Logistics and transport', 'transport': 'Logistics and transport', 'airlines': 'Aviation',
  'hotels': 'Hospitality and tourism', 'hospitality': 'Hospitality and tourism', 'tourism': 'Hospitality and tourism',
  'media': 'Media and entertainment', 'entertainment': 'Media and entertainment', 'telecom': 'Telecommunications',
  'paper': 'Paper and packaging', 'packaging': 'Paper and packaging', 'engineering': 'Engineering and industrial services',
  'trading': 'Trading and distribution', 'distribution': 'Trading and distribution', 'holding companies': 'Diversified holdings',
  'conglomerates': 'Diversified holdings', 'diversified': 'Diversified holdings', 'shipping': 'Shipping and marine',
  'marine': 'Shipping and marine', 'water': 'Water and environment', 'environment': 'Water and environment',
  'new age': 'Emerging themes', 'themes': 'Emerging themes', 'emerging': 'Emerging themes',
};
export function canonicalSector(name) {
  const k = nameKey(name);
  if (!k) return null;
  const exact = FINDER_SECTORS.find((s) => nameKey(s) === k);
  if (exact) return exact;
  if (NAME_ALIASES[k]) return NAME_ALIASES[k];
  const short = Object.keys(SHORT_NAMES).find((s) => nameKey(SHORT_NAMES[s]) === k);
  if (short) return short;
  /* "Information Technology (IT)", "Pharmaceuticals & Healthcare": the one
     listed sector whose words are all in the name, or whose name starts it. */
  const words = new Set(k.split(' '));
  const hits = FINDER_SECTORS.filter((s) => {
    const w = nameKey(s).split(' ').filter((x) => x !== 'and');
    return w.every((x) => words.has(x)) || k.startsWith(nameKey(s));
  });
  if (hits.length === 1) return hits[0];
  /* "Hotels & Tourism", "Media, Entertainment": every alias found among its
     words points to the same sector. */
  const via = new Set(Object.keys(NAME_ALIASES).filter((a) => a.split(' ').every((x) => words.has(x))).map((a) => NAME_ALIASES[a]));
  return via.size === 1 ? [...via][0] : null;
}
const flatK = (k) => S(k).toLowerCase().replace(/[^a-z0-9]/g, '');
/* Field aliases by block: the field, then the flat names that mean it. */
const FIELD_ALIASES = {
  returns: { m3: [/^(r|ret|return|returns|perf|change)?_?3_?(m|mo|mth|months?)(return|ret|perf)?$/],
             m6: [/^(r|ret|return|returns|perf|change)?_?6_?(m|mo|mth|months?)(return|ret|perf)?$/],
             y1: [/^(r|ret|return|returns|perf|change)?_?(1_?(y|yr|year)|12_?(m|mo|months?)|oneyear)(return|ret|perf)?$/] },
  business: { revenueGrowth: [/^(revenue|sales|topline|income)(growth|yoy|growthyoy|change)$/, /^(yoy)?(revenue|sales)$/],
              profitGrowth: [/^(net)?(profit|pat|earnings|netincome)(growth|yoy|growthyoy|change)$/] },
  outlook: { earningsGrowth3y: [/^(earnings|eps|profit|pat)(growth|cagr)(3y|3yr|threeyear|fy\d+)?(cagr)?$/, /^(earnings|eps|profit|pat)cagr3?y?$/],
             demandGrowth3y: [/^(demand|revenue|industry|market|sales|volume)(growth|cagr)(3y|3yr|threeyear)?(cagr)?$/] },
  valuation: { peMedian: [/^(longrun|lr|hist|historical)?medianpe(ratio)?$/, /^pe(ratio)?(longrun)?median$/],
               pe5yMedian: [/^(5y|5yr|fiveyear|5year)medianpe$/, /^pe(5y|5yr|fiveyear|5year)median$/],
               pe: [/^(ttm|trailing|current)?pe(ratio)?(ttm)?$/],
               pe5yAvg: [/^(avg|average|mean|hist|historical)?(5y|5yr|fiveyear|5year)?(avg|average|mean)?pe(ratio)?(5y|5yr|fiveyear|5year)?(avg|average|mean)?$/] },
};
function aliasField(block, key) {
  const f = flatK(key);
  const table = FIELD_ALIASES[block] || {};
  for (const field of Object.keys(table)) {
    if (flatK(field) === f) return field;
    if (table[field].some((re) => re.test(f))) {
      /* pe5yAvg needs both a five-year and an average marker; plain "pe" stays pe. */
      if (field === 'pe5yAvg' && !(/(5y|5yr|fiveyear|5year)/.test(f) && /(avg|average|mean|hist)/.test(f))) continue;
      if (field === 'pe' && /(avg|average|mean|5y|fiveyear|median)/.test(f)) continue;
      if (field === 'pe5yAvg' && /median/.test(f)) continue;
      return field;
    }
  }
  return null;
}
export function normaliseFinder(d) {
  const fixes = [];
  if (!d || typeof d !== 'object') return fixes;
  const isO = (v) => v && typeof v === 'object' && !Array.isArray(v);
  /* The benchmark, wherever it was put and however it was wrapped. */
  for (const k of ['nifty50', 'nifty', 'benchmarkReturns', 'nifty50Returns']) {
    if (d[k] && !d.benchmark) { d.benchmark = isO(d[k]) ? d[k] : { returns: d[k] }; delete d[k]; fixes.push(`${k} read as the benchmark`); }
  }
  if (isO(d.benchmark)) {
    const b = d.benchmark;
    if (!isO(b.returns)) b.returns = {};
    Object.keys(b).forEach((k) => {
      if (k === 'returns') return;
      const f = aliasField('returns', k);
      if (f && b.returns[f] == null) { b.returns[f] = b[k]; delete b[k]; fixes.push(`benchmark.${k} read as benchmark.returns.${f}`); }
    });
    Object.keys(b.returns).forEach((k) => {
      const f = aliasField('returns', k);
      if (f && f !== k && b.returns[f] == null) { b.returns[f] = b.returns[k]; delete b.returns[k]; fixes.push(`benchmark.returns.${k} read as ${f}`); }
    });
  }
  if (!Array.isArray(d.sectors) && isO(d.sectors)) {
    /* { "Banking": {...}, "IT": {...} } */
    d.sectors = Object.keys(d.sectors).map((n) => Object.assign({ name: n }, d.sectors[n]));
    fixes.push('sectors sent as an object, read as a list');
  }
  const seen = new Set();
  arr(d.sectors).forEach((r) => {
    if (!isO(r)) return;
    if (!S(r.name) && S(r.sector)) { r.name = r.sector; delete r.sector; }
    const canon = canonicalSector(r.name);
    if (canon && canon !== r.name && !arr(d.sectors).some((x) => x !== r && x && x.name === canon) && !seen.has(canon)) {
      fixes.push(`"${r.name}" read as ${canon}`);
      r.name = canon;
    }
    seen.add(r.name);
    ['returns', 'business', 'outlook', 'valuation'].forEach((blk) => { if (r[blk] != null && !isO(r[blk])) return; r[blk] = r[blk] || {}; });
    /* Figures beside their block, and other names inside it. */
    Object.keys(r).forEach((k) => {
      if (['name', 'subSector', 'index', 'bellwethers', 'why', 'returns', 'business', 'outlook', 'valuation'].includes(k)) return;
      if (/^(tailwinds?|drivers|positives|catalysts)$/i.test(k) && r.outlook.tailwinds == null) {
        r.outlook.tailwinds = r[k]; delete r[k]; fixes.push(`${r.name}: ${k} read as outlook.tailwinds`); return;
      }
      if (/^(risks?|headwinds|negatives|concerns)$/i.test(k) && r.outlook.risks == null) {
        r.outlook.risks = r[k]; delete r[k]; fixes.push(`${r.name}: ${k} read as outlook.risks`); return;
      }
      if (/^(stocks|companies|leaders|topstocks|constituents|bellwether)$/i.test(k) && r.bellwethers == null) {
        r.bellwethers = r[k]; delete r[k]; fixes.push(`${r.name}: ${k} read as bellwethers`); return;
      }
      for (const blk of ['returns', 'business', 'outlook', 'valuation']) {
        const f = aliasField(blk, k);
        if (f && r[blk][f] == null) { r[blk][f] = r[k]; delete r[k]; fixes.push(`${r.name}: ${k} read as ${blk}.${f}`); return; }
      }
    });
    /* Build 31: each company's own figures, under the names tools use. */
    const QA = { revenue: /^(revenue|sales|turnover|totalincome|revenuefromoperations|income)$/i,
      revenuePrev: /^(revenueprev|revenueprevious|revenueyearago|revenuely|prevrevenue|salesprev|revenueprioryear|revenueyoyprev)$/i,
      profit: /^(profit|pat|netprofit|netincome|earnings)$/i,
      profitPrev: /^(profitprev|patprev|netprofitprev|profityearago|profitly|prevprofit|profitprioryear)$/i };
    arr(r.bellwethers).forEach((b) => {
      if (!isO(b)) return;
      for (const k of ['quarterly', 'results', 'latestQuarter', 'q']) if (isO(b[k]) && !isO(b.quarter)) { b.quarter = b[k]; delete b[k]; fixes.push(`${r.name}: ${b.symbol}.${k} read as quarter`); }
      if (isO(b.quarter)) Object.keys(b.quarter).forEach((k) => {
        const f = Object.keys(QA).find((t) => QA[t].test(k.replace(/[^a-z]/gi, '')));
        if (f && f !== k && b.quarter[f] == null) { b.quarter[f] = b.quarter[k]; delete b.quarter[k]; fixes.push(`${r.name}: ${b.symbol}.quarter.${k} read as ${f}`); }
      });
      if (isO(b.eps) && !Array.isArray(b.eps)) {
        /* { "FY26": 54.1, "FY25": 48.0, "ttm": 56 } */
        const o = b.eps; b.eps = [];
        Object.keys(o).forEach((k) => { if (/^ttm$/i.test(k)) { if (b.epsTtm == null) b.epsTtm = o[k]; } else b.eps.push({ fy: k, eps: o[k] }); });
        fixes.push(`${r.name}: ${b.symbol}.eps read as a list by year`);
      }
      if (b.ttmEps != null && b.epsTtm == null) { b.epsTtm = b.ttmEps; delete b.ttmEps; }
      if (isO(b.consensus) && !isO(b.forecast)) { b.forecast = b.consensus; delete b.consensus; fixes.push(`${r.name}: ${b.symbol}.consensus read as forecast`); }
      for (const k of ['managementGuidance', 'companyGuidance', 'outlookGuidance']) if (isO(b[k]) && !isO(b.guidance)) { b.guidance = b[k]; delete b[k]; fixes.push(`${r.name}: ${b.symbol}.${k} read as guidance`); }
      if (isO(b.guidance)) {
        const gd = b.guidance;
        for (const k of ['salesGrowth', 'revenue', 'topLineGrowth']) if (gd[k] != null && gd.revenueGrowth == null) { gd.revenueGrowth = gd[k]; delete gd[k]; }
        for (const k of ['patGrowth', 'earningsGrowth', 'netProfitGrowth', 'profit']) if (gd[k] != null && gd.profitGrowth == null) { gd.profitGrowth = gd[k]; delete gd[k]; }
      }
      if (isO(b.forecast)) {
        const fo = b.forecast;
        /* Yearly estimates sent as { "FY27": 61.2, "FY28": 70.4 } (build 32). */
        [['eps', 'eps'], ['revenue', 'value']].forEach(([k, v]) => {
          if (!isO(fo[k]) || Array.isArray(fo[k])) return;
          const o = fo[k]; fo[k] = [];
          Object.keys(o).forEach((y) => fo[k].push({ fy: y.replace(/E$/i, ''), [v]: o[y], ...(/A$|actual/i.test(y) ? { actual: true } : {}) }));
          fixes.push(`${r.name}: ${b.symbol}.forecast.${k} read as a list by year`);
        });
        for (const k of ['estimates', 'epsEstimates']) if (Array.isArray(fo[k]) && !fo.eps) { fo.eps = fo[k]; delete fo[k]; }
        for (const k of ['revenueEstimates', 'salesEstimates', 'sales']) if (Array.isArray(fo[k]) && !fo.revenue) { fo.revenue = fo[k]; delete fo[k]; }
        arr(fo.revenue).forEach((e) => { if (isO(e) && e.value == null) for (const k of ['revenue', 'sales', 'amount']) if (e[k] != null) { e.value = e[k]; delete e[k]; } });
        [fo.eps, fo.revenue].forEach((l) => arr(l).forEach((e) => { if (isO(e) && typeof e.fy === 'string' && /\d\s*E$/i.test(e.fy)) e.fy = e.fy.replace(/E$/i, ''); }));
        for (const k of ['epsCagr3y', 'earningsGrowth3y', 'patGrowth3y', 'epsGrowth']) if (fo[k] != null && fo.epsGrowth3y == null) { fo.epsGrowth3y = fo[k]; delete fo[k]; }
        for (const k of ['revenueCagr3y', 'salesGrowth3y', 'revenueGrowth']) if (fo[k] != null && fo.revenueGrowth3y == null) { fo.revenueGrowth3y = fo[k]; delete fo[k]; }
      }
    });
    ['returns', 'business', 'outlook', 'valuation'].forEach((blk) => {
      const o = r[blk];
      Object.keys(o).forEach((k) => {
        if (FIELD_ALIASES[blk] && FIELD_ALIASES[blk][k]) return;
        const f = aliasField(blk, k);
        if (f && o[f] == null) { o[f] = o[k]; delete o[k]; fixes.push(`${r.name}: ${blk}.${k} read as ${blk}.${f}`); }
      });
    });
  });
  /* Build 30. The 22-11-2026 run could not find five-year average P/Es for
     most indices (many are younger than five years) but wrote each index's
     long-run median into valuation.source: "Long-run median P/E 16.4 since
     2003". That is the P/E's own history, and it is read: as peMedian, when
     the series is at least three years long, and as pe5yMedian when the
     source gives a five-year median. A median of a series under three years
     says nothing about history and is left out. */
  const thisYear = new Date().getFullYear();
  arr(d.sectors).forEach((r) => {
    if (!isO(r) || !isO(r.valuation)) return;
    const v = r.valuation, src = S(v.source);
    if (!real(v.pe5yMedian)) {
      const m5 = /(?:5|five)[- ]?(?:year|yr|y)\s+median(?:\s+P\/E)?\s*(?:of|is|:)?\s*([\d.]+)/i.exec(src);
      if (m5 && Number(m5[1]) > 0) { v.pe5yMedian = Number(m5[1]); fixes.push(`${r.name}: five-year median P/E ${m5[1]} read from the source note`); }
    }
    if (!real(v.peMedian)) {
      const m = /long[- ]run\s+median(?:\s+P\/E)?\s*(?:of|is|:)?\s*([\d.]+)(?:\s*(?:since|from)\s*(\d{4}))?/i.exec(src);
      if (m && Number(m[1]) > 0) {
        const since = m[2] ? Number(m[2]) : null;
        if (since == null || thisYear - since >= 3) {
          v.peMedian = Number(m[1]); if (since) v.peMedianSince = since;
          fixes.push(`${r.name}: long-run median P/E ${m[1]}${since ? ' (since ' + since + ')' : ''} read from the source note`);
        }
      }
    }
  });
  /* A whole column in fractions: every value under 1.5 in size while the
     same figure is a percentage everywhere else in India's market data. */
  const cols = [['returns', 'm3'], ['returns', 'm6'], ['returns', 'y1'], ['business', 'revenueGrowth'], ['business', 'profitGrowth'],
    ['outlook', 'earningsGrowth3y'], ['outlook', 'demandGrowth3y']];
  cols.forEach(([blk, f]) => {
    const vals = arr(d.sectors).map((r) => r && r[blk] && r[blk][f]).filter((v) => typeof v === 'number' && v !== 0);
    if (vals.length >= 5 && vals.every((v) => Math.abs(v) <= 1.5)) {
      arr(d.sectors).forEach((r) => { if (r && r[blk] && typeof r[blk][f] === 'number') r[blk][f] = +(r[blk][f] * 100).toFixed(4); });
      fixes.push(`${blk}.${f} sent as fractions for every sector, read as percent`);
    }
  });
  return fixes;
}

/* ── The prompt ───────────────────────────────────────────────────────── */
const p2 = (v) => (v < 10 ? '0' : '') + v;
const dmyOf = (t) => { const d = new Date(t); return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`; };

export function buildFinderPrompt({ taxonomy = null, now = new Date(), previous = null, previousTs = null } = {}) {
  const screenId = partId('screen', now);
  const today = dmyOf(now);
  const subsOf = (name) => {
    const hit = arr(taxonomy).find((x) => Array.isArray(x) && nameKey(x[0]) === nameKey(name));
    return hit ? arr(hit[1]) : [];
  };
  const list = FINDER_SECTORS.map((s, i) => {
    const subs = subsOf(s);
    const ix = SECTOR_INDEX[s];
    return `${p2(i + 1)}. ${s}${ix ? `  [index: ${ix}]` : '  [no NSE sector index: use the bellwethers]'}`
      + (subs.length ? `\n    sub-sectors: ${subs.join('; ')}` : '');
  }).join('\n');
  const upd = previous ? (() => {
    const prevTop = arr(previous.top3).map((r) => r.name).join(', ');
    return `
THIS IS AN UPDATE
The previous screen was saved on ${dmyOf(previousTs || Date.now())}${prevTop ? ` and its Top 3 sectors were ${prevTop}` : ''}.
Search every sector afresh, as at today, and return a COMPLETE payload — not
only what changed. Add to "run": "update": { "line": "${FINDER_LINE}", "previousAsOf": "${dmyOf(previousTs || Date.now())}" }.
The application compares the two screens itself.
`;
  })() : '';

  return `SECTOR FINDER — WHICH INDIAN SECTORS ARE DOING WELL NOW, AND WHICH SHOULD KEEP GROWING

Today is ${today}. You are screening every sector of the Indian listed market
in the list below, for an equity research application. For each sector it needs
how the sector has done over the last 1, 2 and 3 years, what is behind that in
the businesses themselves, and how it is expected to grow over the next three
years. This is STAGE 1, the screen of every sector. The application then
shortlists the best ten and asks for a deeper study of those (government
policy and Budgets, global and regional trends, money flows) separately.
${upd}
NUMBERS ARE NUMBERS. Write 12.5, not "12.5%", "12.5 percent" or "12-13". A
range is its midpoint. A P/E is 22.4, not "22.4x".

YOU DO NOT RANK THE SECTORS AND YOU DO NOT PICK THE BEST ONES.
The application scores and ranks every sector from the figures you return,
on seven pillars: past performance over 1, 2 and 3 years against the Nifty 500
(20%), business fundamentals (15%), the growth outlook (20%), government and
policy (15%), global and regional (10%), valuation (10%) and risk (10%). It
measures returns, volatility and falls itself from prices. Your job is to get
each figure right, dated and sourced. A sector without its outlook cannot be
ranked among the leaders, and any other missing figure is counted as merely
average, so every missing figure can cost a sector its place.

HOW TO RESEARCH IT

1. SEARCH for every figure. Do not answer from memory: index levels, results
   and forecasts move every week. Every figure carries its date or period and
   its source.
2. Percentages are numbers: 12.5 means 12.5%. A fall is negative: -8.2.
3. Never write 0, "" or null for something you could not find. Leave the key
   out, and add an entry to "run.searchLog" naming every source you tried. The
   application asks for it again, with those sources, in the follow-up.

FOR EVERY SECTOR IN THE LIST

  name          exactly as written in the list.
  subSector     the strongest sub-sector in it right now, chosen from that
                sector's own list of sub-sectors, written exactly as listed.
  index         the NSE index that tracks it, as NSE names it (the one shown
                in brackets unless a better one exists), or null if none does.
  returns       the index's price return over the last 1 year ("y1"), and
                over 2 and 3 years as an ANNUAL rate ("y2", "y3" — the
                compound growth a year), to the latest close, in
                percent, with "asOf" (the close used, DD-MM-YYYY) and
                "source" (NSE index data, or the factsheet). With no index,
                the market-cap-weighted return of the sector's listed
                companies (or of the bellwethers below), and say so in "basis".
                If you cannot find one, leave returns out for that sector and
                do not log a search: the application measures it itself from
                the bellwethers' prices.
  bellwethers   the 3 to 5 largest NSE-listed companies in the sector, each
                with its NSE symbol. The application fetches their prices
                itself to check the returns. EVERY SECTOR IS MADE OF LISTED
                COMPANIES: where a sector-wide figure below is not
                published, send each bellwether's own figures (shown in
                the JSON below) and the application works the sector out
                from them:
                  quarter   its latest quarter's revenue from operations and
                            net profit, and the same quarter a year earlier,
                            consolidated, in ₹ crore, from its results filing.
                            A loss is a negative number; send it.
                  eps       its EPS for each of the last five financial
                            years, and "epsTtm" for the trailing twelve
                            months, from its annual reports and filings.
                  forecast  its consensus estimates, year by year as the
                            site shows them (EPS and revenue for FY27E,
                            FY28E…, with the last actual year marked
                            "actual": true), from one site for the whole
                            sector. Two forecast years are enough.
                            Add "revision3m": the percentage change in its
                            next-year consensus EPS over the last three
                            months (positive when analysts raised it).
                  guidance  where no analyst covers it, its own guided
                            annual revenue and profit growth from its latest
                            earnings call.
                  roe       its return on equity for the last financial year,
                            in percent.
                  netDebtEbitda  its net debt divided by EBITDA for the last
                            financial year (negative for net cash). Leave it
                            out for a bank, NBFC or insurer.
  business      year-on-year growth of the sector's listed companies in
                aggregate: "revenueGrowth" and "profitGrowth" (net profit),
                over the last four reported quarters, with "period" (e.g.
                "four quarters to Q2 FY27 against the year before"), "basis"
                (which companies are included) and "source". Where no
                aggregate is published, leave business out and send each
                bellwether's "quarter" instead: the application adds them
                up. Every listed company files them, so they can always be
                found.
  outlook       "earningsGrowth3y" — forecast annual earnings growth over the
                next three years; "demandGrowth3y" — forecast annual growth of
                the industry's demand or revenue over the same years; "years"
                (e.g. "FY26 to FY29"); at least TWO "tailwinds" and TWO
                "risks", each a sentence with a figure where there is one;
                and "source" (a brokerage or rating-agency sector outlook, an
                industry body, a government projection), with its date. For a
                niche sector, use the closest published industry forecast;
                where there is none, send each bellwether's "forecast"
                (consensus estimates as published) or "guidance", and the
                application takes their median. Where neither exists, it
                uses the companies' past EPS trend, marked as such. Tailwinds and risks can
                come from the bellwethers' own earnings calls and annual
                reports; name the company.
  valuation     the sector index's trailing P/E ("pe") and its five-year
                average ("pe5yAvg"), with "asOf" and "source" (the NSE index
                factsheet gives both). If only a five-year MEDIAN is
                published, send it as "pe5yMedian" — do not leave it out
                because it is not a mean. If the index is younger than five
                years, send its long-run median as "peMedian" with
                "peMedianSince", the year its P/E series starts. WITH NO SECTOR
                INDEX, or an index under three years old, do not look for
                P/E averages: send each bellwether's "eps" and "epsTtm". The
                application works out each company's P/E history from its
                own price feed.
  why           one sentence: the single most important reason the sector is,
                or is not, attractive now.

And the benchmark: the Nifty 500's return over the same three periods, to
the same close (the application also measures it, and the Nifty 50, itself).

THE SECTORS (${FINDER_SECTORS.length})

${list}

${partsRule({ id: screenId, plan: planSectors(FINDER_SECTORS, 7, 'the benchmark'), what: 'the screen' })}

Each part looks like this, minified on one line:

\`\`\`json
{"schema":"equity-analyst/5","run":{"kind":"sectorScreen","part":{"n":1,"of":${Math.ceil(FINDER_SECTORS.length / 7)},"id":"${screenId}"}, ... },"benchmark":{ ... },"sectors":[ ... ]}
\`\`\`

If your interface cannot render a code block, wrap each part in a line
reading <<<EQUITY-ANALYST-DATA before it and >>>EQUITY-ANALYST-DATA after it.

THE JSON (shown laid out here; send it minified)

{
  "schema": "equity-analyst/5",
  "run": {
    "kind": "sectorScreen",
    "part": { "n": 1, "of": ${Math.ceil(FINDER_SECTORS.length / 7)}, "id": "${screenId}" },
    "schemaVersion": "5.0.0",
    "generatedAt": "ISO 8601 timestamp",
    "tool": "the name of the AI tool producing this payload",
    "searchesRun": 0,
    "researchNotes": "what you could and could not establish, and why",
    "searchLog": [ { "path": "sectors[Banking].valuation.pe5yAvg", "searched": ["source tried"], "reason": "why it could not be established" } ]
  },
  "benchmark": { "name": "${BENCHMARK_BROAD}", "returns": { "y1": 0, "y2": 0, "y3": 0 }, "asOf": "DD-MM-YYYY", "source": "" },
  "sectors": [
    {
      "name": "Banking",
      "subSector": "Public sector banks",
      "index": "Nifty Bank",
      "returns": { "y1": 0, "y2": 0, "y3": 0, "asOf": "DD-MM-YYYY", "basis": "index", "source": "" },
      "bellwethers": [ { "symbol": "SBIN", "name": "State Bank of India",
                         "quarter": { "period": "Q2 FY27", "revenue": 0, "revenuePrev": 0, "profit": 0, "profitPrev": 0, "source": "" },
                         "eps": [ { "fy": "FY26", "eps": 0 } ], "epsTtm": 0, "epsSource": "",
                         "forecast": { "eps": [ { "fy": "FY26", "eps": 0, "actual": true }, { "fy": "FY27", "eps": 0 } ],
                                       "revenue": [ { "fy": "FY26", "value": 0, "actual": true }, { "fy": "FY27", "value": 0 } ],
                                       "analysts": 0, "revision3m": 0, "asOf": "", "source": "" },
                         "guidance": { "revenueGrowth": 0, "profitGrowth": 0, "years": "", "source": "" },
                         "roe": 0, "netDebtEbitda": 0 } ],
      "business": { "revenueGrowth": 0, "profitGrowth": 0, "period": "", "basis": "", "source": "" },
      "outlook": { "earningsGrowth3y": 0, "demandGrowth3y": 0, "years": "FY26 to FY29", "basis": "",
                   "tailwinds": [""], "risks": [""], "source": "" },
      "valuation": { "pe": 0, "pe5yAvg": 0, "pe5yMedian": 0, "peMedian": 0, "peMedianSince": 2011, "asOf": "DD-MM-YYYY", "basis": "index", "source": "" },
      "why": ""
    }
  ]
}
`;
}

/* ── Stage 2: the deep dive on the shortlist (build 33) ─────────────── */
/* What the five ICICI Securities samples Tejas sent on 26-11-2026 rest on,
   and the Finder lacked: money flows by sector, government targets and
   scheme money actually spent, trade measures, the prices that drive each
   sector's profits, ownership trends, and a macro backdrop. Asked for the
   ten shortlisted sectors only, so the reply stays a size a tool can send. */
export function buildDeepDivePrompt(d, { now = new Date() } = {}) {
  const sc = scoreFinder(d);
  const deepId = partId('deep', now);
  const deepPlan = planSectors(sc.shortlist.map((r) => r.name), 2, 'the macro block');
  const today = dmyOf(now);
  const list = sc.shortlist.map((r, i) => {
    const bws = arr((arr(d && d.sectors).find((x) => nameKey(x && x.name) === nameKey(r.name)) || {}).bellwethers)
      .map((b) => S(b && b.symbol)).filter(Boolean);
    return `${p2(i + 1)}. ${r.name}${bws.length ? `  [bellwethers: ${bws.join(', ')}]` : ''}`;
  }).join('\n');
  return `SECTOR FINDER — STAGE 2: THE DEEP DIVE ON THE SHORTLIST

Today is ${today}. The application screened every sector of the Indian listed
market and shortlisted the ${sc.shortlist.length} below. For each, it now needs the evidence a
professional sector analyst weighs beyond prices and results: government
policy and money, global and regional trends, what drives the sector's
profits, who is buying it, and the risks. The application scores this itself
(government and policy 15%, global and regional 10%, and parts of past
performance, fundamentals and risk). You do not rank or rate the sectors.

NUMBERS ARE NUMBERS: 12.5, not "12.5%". Amounts in ₹ crore unless the field
says otherwise. Every figure carries its date or period and its source.
SEARCH for every figure; do not answer from memory. Never write 0, "" or null
for something you could not find: leave it out and add an entry to
"run.searchLog" naming the sources you tried.

THE SHORTLIST (${sc.shortlist.length})

${list}

FOR EVERY SECTOR IN THE SHORTLIST, under "deepDive":

  flows       foreign portfolio investment in the sector, from NSDL's
              fortnightly sector-wise FPI data (fpi.nsdl.co.in): "fpiNet12mCr"
              (net investment over the last 12 months), "fpiNet3mCr" (last 3
              months), "fpiAucCr" (FPI assets under custody in the sector, the
              latest fortnight), "asOf", "source".
  budget      the Union Budget allocation to the sector's main ministry or
              department heads, for each of the last FIVE years: { "fy",
              "head", "be" (Budget Estimate), "re" (Revised Estimate), "actual"
              (where published) }. Use the same heads every year.
  schemes     the main government schemes for the sector (PLI, mission,
              programme): { "name", "outlay" (total sanctioned), "disbursed"
              (released or spent so far), "asOf", "endYear", "source" }.
  targets     national targets the sector serves (capacity, production,
              penetration): { "target", "current", "goal", "by", "unit",
              "source" } — e.g. installed power capacity 520 GW now, 900 GW
              by FY32 (National Electricity Plan).
  policy      policy, regulatory and trade measures of the last two years and
              those announced: safeguard and anti-dumping duties, import
              quotas, export curbs, EU CBAM, tax changes, regulation:
              { "event", "date", "impact" (1 helps the sector, -1 hurts it,
              0 neutral), "detail" }. At least three.
  global      "marketSizeUsdBn" (global market), "marketGrowth3y" (forecast
              annual growth of the global market), "indiaShareNow" and
              "indiaSharePrev" (India's share of the global market, in
              percent, now and five years ago, with "indiaShareYears"),
              "exportsCagr3y" and "importsCagr3y" (India's exports and imports
              of the sector's products, annual growth over three years),
              "source".
  drivers     the two to four prices or rates that drive the sector's profits
              (LME aluminium, coking coal, steel price, crude, the rupee, the
              repo rate, freight): { "name", "unit", "now", "yearAgo",
              "effect" ("rising helps" or "rising hurts"), "source" }.
  risks       the sector's main risks: { "risk", "severity" ("high",
              "medium" or "low"), "detail" }. At least three, including
              regulatory and concentration risk.
  commentary  "thesis" (the investment case in three or four sentences),
              "bull" and "bear" (what could go right and wrong), "catalysts"
              ([{ "event", "date" }] — dated events in the next 12 months:
              Budget, policy decisions, capacity commissioning, results).

And for every bellwether of every shortlisted sector, under its own symbol:
  holding     its shareholding pattern for each of the last FIVE quarters:
              [{ "q": "Sep-26", "promoter", "fii", "dii" }], in percent, from
              its exchange filings.

AND ONCE, for the market as a whole, under "macro":
  "repoRate", "repoRatePrev" (a year ago), "cpi" (latest CPI inflation),
  "gdpGrowth" (latest quarter, real), "crude" (Brent, US$ a barrel) and
  "crudeYearAgo", "usdInr" and "usdInrYearAgo", "us10y" (US 10-year yield),
  "fpiIndiaNet3mCr" (FPI net investment in Indian equity, last 3 months),
  "msciIndia1y" and "msciEm1y" (1-year returns of MSCI India and MSCI
  Emerging Markets), "asOf", "source".

${deepPlan.length ? partsRule({ id: deepId, plan: deepPlan, what: 'the deep dive' }) : ''}

Each part looks like this (laid out here; send it minified on one line):

{
  "schema": "equity-analyst/5",
  "run": { "kind": "sectorScreen", "topUp": true, "stage": "deepDive", "part": { "n": 1, "of": ${deepPlan.length || 1}, "id": "${deepId}" }, "generatedAt": "", "tool": "", "searchLog": [] },
  "macro": { "repoRate": 0, "repoRatePrev": 0, "cpi": 0, "gdpGrowth": 0, "crude": 0, "crudeYearAgo": 0, "usdInr": 0, "usdInrYearAgo": 0,
             "us10y": 0, "fpiIndiaNet3mCr": 0, "msciIndia1y": 0, "msciEm1y": 0, "asOf": "DD-MM-YYYY", "source": "" },
  "sectors": [
    {
      "name": "Power and utilities",
      "deepDive": {
        "flows": { "fpiNet12mCr": 0, "fpiNet3mCr": 0, "fpiAucCr": 0, "asOf": "DD-MM-YYYY", "source": "" },
        "budget": [ { "fy": "FY27", "head": "Ministry of Power", "be": 0, "re": 0, "actual": 0 } ],
        "schemes": [ { "name": "RDSS", "outlay": 0, "disbursed": 0, "asOf": "", "endYear": "", "source": "" } ],
        "targets": [ { "target": "Installed capacity", "current": 0, "goal": 0, "by": "FY32", "unit": "GW", "source": "" } ],
        "policy": [ { "event": "", "date": "DD-MM-YYYY", "impact": 1, "detail": "" } ],
        "global": { "marketSizeUsdBn": 0, "marketGrowth3y": 0, "indiaShareNow": 0, "indiaSharePrev": 0, "indiaShareYears": "2021 to 2026",
                    "exportsCagr3y": 0, "importsCagr3y": 0, "source": "" },
        "drivers": [ { "name": "", "unit": "", "now": 0, "yearAgo": 0, "effect": "rising helps", "source": "" } ],
        "risks": [ { "risk": "", "severity": "medium", "detail": "" } ],
        "commentary": { "thesis": "", "bull": "", "bear": "", "catalysts": [ { "event": "", "date": "" } ] }
      },
      "bellwethers": [ { "symbol": "NTPC", "holding": [ { "q": "Sep-26", "promoter": 0, "fii": 0, "dii": 0 } ] } ]
    }
  ]
}

`;
}

/* ── What is missing ──────────────────────────────────────────────────── */
/* Returned as plain findings; completeness.js turns them into checks, so the
   depth box, the search record and the follow-up work for the screen exactly
   as they do for a sector study. */
export function finderChecks(d0) {
  const d = d0 && typeof d0 === 'object' ? JSON.parse(JSON.stringify(d0)) : d0;
  if (d) normaliseFinder(d);
  const ver = (d && d.verified && d.verified.sectors) || {};
  const out = [];
  const add = (group, label, have, want, ask, detail, appOnly) => out.push({ group, label, have, want, ask, detail, appOnly: appOnly || false });
  const rows = arr(d && d.sectors).filter((x) => x && S(x.name));
  const have = FINDER_SECTORS.filter((s) => rows.some((r) => nameKey(r.name) === nameKey(s)));
  const absent = FINDER_SECTORS.filter((s) => !have.includes(s));
  add('The screen', 'Sectors screened', have.length, FINDER_SECTORS.length,
    `sectors — every sector in the list must be screened. Missing: ${absent.join(', ')}. Send each with all its blocks.`,
    absent.join(', '));
  /* Build 33: the benchmark is the Nifty 500 over 1, 2 and 3 years. The app
     measures it itself; it is asked of the research only once the app's own
     check could not run. */
  const vb = d && d.verified;
  const b = (d && d.benchmark && d.benchmark.returns) || {};
  const benchApp = !!(vb && ((vb.benchmark500 && isNum(vb.benchmark500.y1)) || (vb.benchmark && isNum(vb.benchmark.y1))));
  const bMiss = benchApp ? [] : ['y1', 'y2', 'y3'].filter((k) => !real(b[k]));
  add('The screen', 'Nifty 500 returns over 1, 2 and 3 years', 3 - bMiss.length, 3,
    `benchmark.returns — the Nifty 500's price return over ${bMiss.join(', ')} (2 and 3 years as an annual rate) to the latest close, with "asOf" and "source".`,
    bMiss.join(', ') + (bMiss.length && !(vb && vb.error) ? ' (the app measures it from prices)' : ''), bMiss.length > 0 && !(vb && vb.error));
  /* `gaps(r)` names the fields a sector lacks, so the follow-up asks for
     exactly them: "Retail (pe5yAvg), Aviation (pe, pe5yAvg)". */
  const need = (label, path, gaps, what) => {
    const miss = rows.map((r) => ({ name: S(r.name), g: gaps(r) })).filter((x) => x.g.length);
    const list = miss.map((x) => `${x.name} (${x.g.join(', ')})`).join('; ');
    add('Every sector', label, rows.length - miss.length, rows.length,
      `${path} — ${what} Missing: ${list}.`, list);
  };
  const lacks = (obj, keys) => keys.filter((k) => !real(obj && obj[k]));
  /* Returns the app measured from prices count as found. A sector the app
     can measure itself (it has an index or two bellwethers) is the app's job,
     not the tool's: it is listed as such and left out of the ask, unless the
     app's own check has already failed for it (build 31; build 30 did this
     for sectors with no index only). */
  const failed = new Set(arr(d && d.verified && d.verified.failed).map(nameKey));
  const vfailed = new Set(arr(d && d.verified && d.verified.valuationFailed).map(nameKey));
  const ran = !!(d && d.verified);
  {
    const appsJob = [];
    const miss = [];
    rows.forEach((r) => {
      const v = ver[nameKey(r.name)];
      if (v && (isNum(v.y1) || isNum(v.y3))) return;
      const g = lacks(r.returns, ['y1', 'y2', 'y3']);
      if (!g.length) return;
      const measurable = S(r.index) || SECTOR_INDEX[FINDER_SECTORS.find((x) => nameKey(x) === nameKey(r.name))]
        || bwOf(r).length >= 2;
      (measurable && !failed.has(nameKey(r.name)) ? appsJob : miss).push(`${S(r.name)} (${g.join(', ')})`);
    });
    const gaps = miss.length + appsJob.length;
    add('Every sector', 'Returns over 1, 2 and 3 years', rows.length - gaps, rows.length,
      'sectors.returns — the sector index\'s return over 1 year ("y1"), and over 2 and 3 years as an annual rate ("y2", "y3"), with "asOf" and "source".'
      + (miss.length ? ` Missing: ${miss.join('; ')}.` : '')
      + (appsJob.length ? ` Do NOT search for these: the application measures them itself from the index or the bellwethers' prices: ${appsJob.map((x) => x.replace(/ \(.*$/, '')).join(', ')}.` : ''),
      miss.concat(appsJob.map((x) => x.replace(/\(.*\)/, '(the app measures it from prices)'))).join('; '),
      !miss.length && appsJob.length > 0);
  }
  need('Bellwether stocks for the price check', 'sectors.bellwethers',
    (r) => { const n = bwOf(r).length; return n >= 3 ? [] : [`${n} of 3 symbols`]; },
    'the 3 to 5 largest NSE-listed companies, each with its NSE "symbol".');
  const syms = (r) => bwOf(r).map((b) => S(b.symbol)).join(', ');
  const eff = (r) => effective(r, d && d.verified);
  /* Build 31: what a sector lacks is asked of its companies. */
  need('Business momentum: sales and profit growth', 'sectors.bellwethers.quarter',
    (r) => { const b = eff(r).business; const g = [].concat(isNum(b.revenueGrowth) ? [] : ['sales'], isNum(b.profitGrowth) ? [] : ['profit']);
      return g.length ? [`${g.join(' and ')}: the quarter figures of ${syms(r) || 'its bellwethers'}`] : []; },
    'where the sector\'s aggregate growth is not published, do NOT add it up yourself and do not leave it out: send EACH bellwether\'s own figures from its latest results filing on NSE/BSE, under sectors[].bellwethers[].quarter: { "period": "Q2 FY27", "revenue", "revenuePrev", "profit", "profitPrev", "source" } — revenue from operations and net profit, consolidated, in ₹ crore, for the latest quarter and the same quarter a year earlier. A loss is a negative number: send it, do not skip the company. The application adds the companies up and handles losses. Every listed company files these, so they can always be found.');
  /* Build 32. A figure counts as found only when it is a forecast or the
     company's guidance. One the app took from the past trend is scored (at
     half weight) but is still asked for, as every missing figure is. */
  need('Three-year outlook: earnings and demand growth', 'sectors.bellwethers.forecast',
    (r) => { const o = eff(r).outlook;
      const lack = (m, key) => !isNum(o[key]) || (o.tier && o.tier[m] === 'past');
      const g = [].concat(lack('earnings', 'earningsGrowth3y') ? ['earnings'] : [], lack('demand', 'demandGrowth3y') ? ['demand'] : []);
      const past = o.tier && o.tier.earnings === 'past' ? ' (past trend used until a forecast is found)' : '';
      return g.length ? [`${g.join(' and ')}: the consensus estimates or guidance of ${syms(r) || 'its bellwethers'}${past}`] : []; },
    'where no sector forecast is published, send EACH bellwether\'s consensus estimates EXACTLY AS THE SITE SHOWS THEM, year by year — do not work out a three-year rate yourself: sectors[].bellwethers[].forecast: { "eps": [ { "fy": "FY26", "eps": 0, "actual": true }, { "fy": "FY27", "eps": 0 }, { "fy": "FY28", "eps": 0 } ], "revenue": [ { "fy": "FY26", "value": 0, "actual": true }, { "fy": "FY27", "value": 0 }, { "fy": "FY28", "value": 0 } ], "analysts", "asOf", "source" }. Include the last actual year marked "actual": true. Two forecast years are enough: the application extends a third at their trend. Use ONE site for all the companies of a sector (StockAnalysis, Sharpely, MarketScreener, Trendlyne or Moneycontrol) and name it in "source". Where no analyst covers a company, send its own guidance from the latest earnings call or investor presentation: sectors[].bellwethers[].guidance: { "revenueGrowth", "profitGrowth" (annual %), "years", "source" }. The application takes the median across the companies; where neither exists it falls back to the companies\' past EPS trend, at half weight.');
  need('Tailwinds and risks, two of each', 'sectors.outlook.tailwinds',
    (r) => {
      const t = arr(r.outlook && r.outlook.tailwinds).filter((x) => S(x).length > 8).length;
      const k = arr(r.outlook && r.outlook.risks).filter((x) => S(x).length > 8).length;
      return [].concat(t >= 2 ? [] : [`${t} of 2 tailwinds`], k >= 2 ? [] : [`${k} of 2 risks`]);
    },
    'at least two "tailwinds" and two "risks", each a sentence with a figure where there is one. Where no sector outlook gives them, take them from the bellwethers\' own latest earnings-call transcripts, investor presentations or annual reports (management discussion and analysis), and name the company in each.');
  {
    /* Valuation: the research's own history, else the app's from the
       companies' prices and EPS. A sector whose companies sent their EPS is
       the app's to work out (until its check fails); the rest are asked. */
    /* Build 35: EPS the research already sent is never asked again. A
       sector whose companies have it is the app's to price; if the app's
       check could not, the reason is shown and the check is run again. Only
       companies with fewer than three years of EPS are asked. */
    const ask = [], app = [], why = (d && d.verified && d.verified.valuationWhy) || {};
    rows.forEach((r) => {
      if (isNum(eff(r).valuation.ratio)) return;
      const lack = bwOf(r).filter((b) => !canPrice(b)).map((b) => S(b.symbol)).filter(Boolean);
      if (bwOf(r).some(canPrice)) {
        const w = arr(why[nameKey(r.name)]);
        app.push({ name: S(r.name), note: ran && vfailed.has(nameKey(r.name)) && w.length
          ? `the app could not price ${w.map((x) => x.symbol + ': ' + x.why).join('; ')} \u2014 tap Check prices again` : 'the app works it out from prices and EPS' });
      } else ask.push(`${S(r.name)} (EPS history of ${lack.join(', ') || syms(r) || 'its bellwethers'})`);
    });
    add('Every sector', 'P/E against its own history', rows.length - ask.length - app.length, rows.length,
      'sectors.bellwethers.eps — the sector index\'s trailing "pe" and its five-year average "pe5yAvg" where the index factsheet publishes both. Where it does not (no index, or a series under three years old), do NOT look for P/E averages: send EACH bellwether\'s earnings per share, consolidated and diluted, for each of the last five financial years and the trailing twelve months, under sectors[].bellwethers[]: "eps": [ { "fy": "FY26", "eps": 0 }, … ], "epsTtm": 0, "epsSource". Every annual report and results filing states it. The application works out each company\'s P/E history from its own price feed.'
      + (ask.length ? ` Missing: ${ask.join('; ')}.` : '')
      + (app.length ? ` Do NOT send EPS again for ${app.map((a) => a.name).join(', ')}: the application already has it and works these out itself.` : ''),
      ask.concat(app.map((a) => `${a.name} (${a.note})`)).join('; '),
      !ask.length && app.length > 0);
  }
  /* Build 33: the companies' return on equity and leverage, and the change
     in consensus over three months. */
  need('Return on equity of the bellwethers', 'sectors.bellwethers.roe',
    (r) => (isNum(companyQuality(r).roe) ? [] : [`ROE and net debt to EBITDA of ${syms(r) || 'its bellwethers'}`]),
    'each bellwether\'s "roe" (return on equity, last financial year, %) and "netDebtEbitda" (net debt ÷ EBITDA, negative for net cash; leave it out for a bank, NBFC or insurer), under sectors[].bellwethers[], from its annual report or a results page (Screener.in, Moneycontrol).');
  need('Change in consensus over three months', 'sectors.bellwethers.forecast.revision3m',
    (r) => (isNum(companyQuality(r).revision) || !bwOf(r).some((b) => b.forecast && arr(b.forecast.eps).length) ? [] : [`revision3m of ${syms(r)}`]),
    'for each bellwether with consensus estimates, "revision3m" under its "forecast": the percentage change in its next-year consensus EPS over the last three months (positive when analysts raised it), from the same site as the estimates.');
  /* Stage 2, the shortlist only. Until the deep dive has been run, one item
     says so (the Deep dive prompt asks for it, not the follow-up). */
  const sc = scoreFinder(d);
  const short = sc.shortlist.map((x) => rows.find((r) => nameKey(r.name) === nameKey(x.name))).filter(Boolean);
  const started = short.some((r) => r.deepDive) || !!(d && d.macro);
  if (!started) {
    add('Deep dive on the shortlist', 'Deep dive on the ' + short.length + ' shortlisted sectors', 0, short.length,
      'run the deep dive', short.map((r) => S(r.name)).join(', '), 'deep');
  } else {
    const needS = (label, path, gaps, what) => {
      const miss = short.map((r) => ({ name: S(r.name), g: gaps(r, r.deepDive || {}) })).filter((x) => x.g.length);
      const list = miss.map((x) => `${x.name} (${x.g.join(', ')})`).join('; ');
      add('Deep dive on the shortlist', label, short.length - miss.length, short.length, `${path} — ${what} Missing: ${list}.`, list);
    };
    needS('Foreign portfolio flows', 'sectors.deepDive.flows', (r, dd) => (dd.flows && isNum(dd.flows.fpiNet12mCr) && dd.flows.fpiAucCr > 0 ? [] : ['fpiNet12mCr, fpiAucCr']),
      'from NSDL\'s fortnightly sector-wise FPI data (fpi.nsdl.co.in): "fpiNet12mCr", "fpiNet3mCr", "fpiAucCr", "asOf", "source".');
    needS('Budget allocation, five years', 'sectors.deepDive.budget', (r, dd) => { const n = arr(dd.budget).filter((x) => x && isNum(x.be)).length; return n >= 3 ? [] : [`${n} of 5 years`]; },
      'the Union Budget allocation to the sector\'s ministry or department heads for each of the last five years: { "fy", "head", "be", "re", "actual" }, in ₹ crore, from the Expenditure Budget documents (indiabudget.gov.in).');
    needS('Scheme money disbursed', 'sectors.deepDive.schemes', (r, dd) => (arr(dd.schemes).some((x) => x && x.outlay > 0 && isNum(x.disbursed)) ? [] : ['outlay and disbursed']),
      'the main schemes (PLI, missions, programmes): { "name", "outlay", "disbursed", "asOf", "endYear", "source" }, from the ministry\'s dashboard, PIB releases or the scheme\'s own portal.');
    needS('Policy, regulation and trade measures', 'sectors.deepDive.policy', (r, dd) => { const n = arr(dd.policy).filter((x) => x && isNum(x.impact)).length; return n >= 3 ? [] : [`${n} of 3`]; },
      'at least three measures of the last two years or announced: { "event", "date", "impact" (1 helps, -1 hurts, 0 neutral), "detail" } — duties, quotas, export curbs, CBAM, tax, regulation (DGTR, CBIC, PIB, the regulator).');
    needS('Global market and India\'s share', 'sectors.deepDive.global', (r, dd) => { const g = dd.global || {};
      return [].concat(isNum(g.marketGrowth3y) ? [] : ['marketGrowth3y'], isNum(g.indiaShareNow) && isNum(g.indiaSharePrev) ? [] : ['indiaShareNow, indiaSharePrev'], isNum(g.exportsCagr3y) ? [] : ['exportsCagr3y']); },
      '"marketGrowth3y", "indiaShareNow", "indiaSharePrev", "exportsCagr3y", "importsCagr3y", "source" — from industry bodies, global research houses, and DGCI&S / Ministry of Commerce trade data (tradestat.commerce.gov.in).');
    needS('Profit drivers, now and a year ago', 'sectors.deepDive.drivers', (r, dd) => { const n = arr(dd.drivers).filter((x) => x && isNum(x.now) && isNum(x.yearAgo)).length; return n >= 2 ? [] : [`${n} of 2`]; },
      'two to four prices or rates that drive its profits: { "name", "unit", "now", "yearAgo", "effect" ("rising helps" or "rising hurts"), "source" } — LME, commodity exchanges, RBI, the bellwethers\' earnings calls.');
    needS('Risks, graded', 'sectors.deepDive.risks', (r, dd) => { const n = arr(dd.risks).filter((x) => x && S(x.risk) && /high|medium|low/i.test(S(x.severity))).length; return n >= 3 ? [] : [`${n} of 3`]; },
      'at least three: { "risk", "severity" ("high", "medium", "low"), "detail" }, including regulatory and concentration risk.');
    needS('Institutional ownership, five quarters', 'sectors.bellwethers.holding', (r) => { const n = bwOf(r).filter((b) => arr(b.holding).filter((q) => q && isNum(q.fii) && isNum(q.dii)).length >= 2).length; return n >= 2 ? [] : [`shareholding of ${syms(r)}`]; },
      'each bellwether\'s shareholding pattern for the last five quarters: "holding": [{ "q": "Sep-26", "promoter", "fii", "dii" }], from its exchange filings (NSE/BSE shareholding pattern).');
    needS('Thesis, bull and bear case, catalysts', 'sectors.deepDive.commentary', (r, dd) => { const c = dd.commentary || {};
      return [].concat(S(c.thesis).length > 40 ? [] : ['thesis'], S(c.bull) && S(c.bear) ? [] : ['bull, bear'], arr(c.catalysts).length >= 2 ? [] : ['two dated catalysts']); },
      '"thesis" (three or four sentences), "bull", "bear", "catalysts": [{ "event", "date" }] — dated events in the next 12 months.');
    const m = (d && d.macro) || {};
    const mk = ['repoRate', 'cpi', 'crude', 'usdInr', 'fpiIndiaNet3mCr', 'msciIndia1y', 'msciEm1y'].filter((k) => !isNum(m[k]));
    add('Deep dive on the shortlist', 'Macro backdrop', 7 - mk.length, 7,
      `macro — the market-wide readings: ${mk.join(', ')}, with their year-ago values where asked, "asOf" and "source" (RBI, MoSPI, NSDL, MSCI factsheets).`, mk.join(', '));
  }
  return out;
}

/* ── Returns from prices ──────────────────────────────────────────────── */
/* Daily bars, oldest first, { date: 'YYYY-MM-DD', c }. The return over a
   lookback is from the last close on or before that many months back. */
export function returnsFromBars(bars) {
  const list = arr(bars).filter((b) => b && isNum(b.c) && S(b.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const end = new Date(last.date + 'T00:00:00Z');
  const back = (months) => {
    const t = new Date(end); t.setUTCMonth(t.getUTCMonth() - months);
    const iso = t.toISOString().slice(0, 10);
    let hit = null;
    for (const b of list) { if (b.date <= iso) hit = b; else break; }
    /* No close that far back: the series is too short to say. */
    return hit && hit.c ? +(((last.c / hit.c) - 1) * 100).toFixed(2) : null;
  };
  return { m3: back(3), m6: back(6), y1: back(12), asOf: last.date };
}

/* Fetches the benchmark and every sector, index first, bellwethers second.
   `fetchBars(key)` resolves daily bars or rejects; `keyFor(symbol)` gives an
   equity instrument key or null. Never rejects. */
/* A fingerprint of what a screen says, without the app's own price check
   (build 32). A check carries the fingerprint of the data it was run on, so
   a result worked out before a follow-up arrived is never stamped onto the
   merged screen: the app sees the mismatch and checks again. */
export function finderStamp(d) {
  const t = JSON.stringify({ b: d && d.benchmark, s: d && d.sectors });
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '.' + t.length.toString(36);
}

/* Build 35. Tejas's real run of 26-11-2026: the check sent some thirty
   requests at once to Upstox, some were refused, and each refused sector was
   then asked of the research tool as "EPS missing" although its EPS was
   saved. Requests now go four at a time, a refused or timed-out one is tried
   again after a pause, and a not-found (404) is not retried. */
export function politeFetch(fn, { limit = 4, tries = 3, backoff = [800, 2000, 4000], sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let active = 0; const queue = [];
  const pump = () => {
    while (active < limit && queue.length) {
      active++; const job = queue.shift();
      job().then(() => { active--; pump(); }, () => { active--; pump(); });
    }
  };
  return (...args) => new Promise((resolve, reject) => {
    queue.push(async () => {
      let last;
      for (let t = 0; t < tries; t++) {
        try { resolve(await fn(...args)); return; } catch (e) {
          last = e;
          const m = String(e && e.message || '');
          /* Only what a pause can cure is tried again: a refusal for too many
             requests, a server error, a dropped connection or a timeout. */
          if (!/HTTP 429|HTTP 5\d\d|failed to fetch|networkerror|load failed|network|abort|timed? ?out/i.test(m + ' ' + (e && e.name || ''))) break;
          if (t < tries - 1) await wait(backoff[t] != null ? backoff[t] : 4000);
        }
      }
      reject(last);
    });
    pump();
  });
}
const epsSig = (b) => arr(b && b.eps).filter((e) => e && isNum(e.eps)).map((e) => S(e.fy != null ? e.fy : e.year) + ':' + e.eps).sort().join('|') + '|' + (isNum(b && b.epsTtm) ? b.epsTtm : '');

export async function verifyReturns(d, { fetchBars: rawFetch, keyFor, now = new Date(), onProgress, previous = null, limit = 4, sleep } = {}) {
  const result = { at: now.toISOString(), benchmark: null, sectors: {}, failed: [], stamp: finderStamp(d) };
  const tell = (phase, done, total) => { try { if (typeof onProgress === 'function') onProgress(phase, done, total); } catch (e) { /* the page's display only */ } };
  if (!d || typeof rawFetch !== 'function') return result;
  const fetchBars = politeFetch(rawFetch, { limit, sleep });
  const prev = previous && typeof previous === 'object' && !previous.error ? previous : (previous || {});
  d = JSON.parse(JSON.stringify(d)); normaliseFinder(d);
  /* Build 33. Four years of weekly closes for every index and stock, so the
     1-, 2- and 3-year returns, volatility, largest fall, consistency and
     relative strength all come from the app's own prices. One fetch per
     instrument per check (memoised): a bellwether priced for a basket is
     reused for breadth. */
  const WEEKS = { unit: 'weeks', interval: 1, years: 4 };
  const memo = new Map();
  const get = (k, o = WEEKS) => {
    const id = k + '|' + o.unit + '|' + o.years;
    if (!memo.has(id)) memo.set(id, Promise.resolve().then(() => fetchBars(k, o)).then((b) => weekly(b), () => null));
    return memo.get(id);
  };
  const firstIndex = async (keys) => {
    for (const k of keys) { const w = await get(k); if (w && w.length >= 8 && isNum(periodReturn(w, 12))) return { key: k, w }; }
    return null;
  };
  const b500 = await firstIndex(indexKeys(BENCHMARK_BROAD));
  const b50 = await firstIndex(indexKeys(S(d.benchmark && d.benchmark.name) || BENCHMARK).concat(indexKeys(BENCHMARK)));
  const benchW = (b500 || b50 || {}).w || null;
  if (b50) result.benchmark = { ...priceMetrics(b50.w), basis: 'index', of: BENCHMARK };
  if (b500) result.benchmark500 = { ...priceMetrics(b500.w), basis: 'index', of: BENCHMARK_BROAD };
  result.relativeTo = b500 ? BENCHMARK_BROAD : BENCHMARK;
  const bwSeries = async (r) => {
    const picks = bwOf(r).slice(0, 5);
    const got = await Promise.all(picks.map(async (p) => {
      const key = typeof keyFor === 'function' ? keyFor(S(p.symbol), S(p.isin)) : null;
      const w = key ? await get(key) : null;
      return w && w.length >= 8 ? { sym: S(p.symbol), w } : null;
    }));
    return got.filter(Boolean);
  };
  /* Six sectors at a time (build 30). */
  const one = async (r) => {
    if (!r || !S(r.name)) return;
    const names = [S(r.index), SECTOR_INDEX[FINDER_SECTORS.find((s) => nameKey(s) === nameKey(r.name))]].filter(Boolean);
    const [ix, stocks] = await Promise.all([firstIndex([...new Set(names.flatMap(indexKeys))]), bwSeries(r)]);
    const br = breadth(stocks.map((x) => x.w));
    if (ix) {
      result.sectors[nameKey(r.name)] = { ...priceMetrics(ix.w, benchW), basis: 'index', of: ix.key.split('|')[1], breadth: br };
      return;
    }
    /* The bellwethers, equally weighted and chain-linked. Two at least, or it
       is one company. */
    const bk = stocks.length >= 2 ? basket(stocks.map((x) => x.w)) : [];
    const pm = bk.length >= 8 ? priceMetrics(bk, benchW) : null;
    if (pm && (isNum(pm.y1) || isNum(pm.m6))) {
      result.sectors[nameKey(r.name)] = { ...pm, basis: 'basket', of: stocks.map((x) => x.sym).join(', '), breadth: br };
    } else {
      /* Build 35: a sector checked before keeps that check, marked with its
         date, rather than falling back to the research's figures. */
      const old = prev.sectors && prev.sectors[nameKey(r.name)];
      if (old && (isNum(old.y1) || isNum(old.y3))) result.sectors[nameKey(r.name)] = { ...old, carried: true };
      else result.failed.push(S(r.name));
    }
  };
  const list = arr(d.sectors).slice();
  for (let i = 0; i < list.length; i += 6) { tell('returns', i, list.length); await Promise.all(list.slice(i, i + 6).map(one)); }
  tell('returns', list.length, list.length);
  result.failed.sort((a, b) => FINDER_SECTORS.indexOf(a) - FINDER_SECTORS.indexOf(b));
  /* Build 31. Valuation from the companies: for a sector whose research has
     no P/E history, each bellwether that sent three years of EPS or more is
     priced month by month over five years from its own price feed. The
     sector is the median of its companies: their P/E now, their own
     five-year average, and how far each stands from its own average. */
  result.valuation = {}; result.valuationFailed = []; result.valuationWhy = {};
  /* Build 35: each company priced before, on the same EPS, is kept if its
     prices cannot be fetched this time; and every company that cannot be
     priced carries the reason, shown in the app instead of a request to the
     research tool for EPS it already sent. */
  const prevCo = {};
  Object.values(prev.valuation || {}).forEach((v) => arr(v && v.companies).forEach((c) => { if (c && c.symbol) prevCo[S(c.symbol).toUpperCase()] = c; }));
  const sane = (v) => isNum(v) && v >= 1 && v <= 1000;
  const priceOne = async (b) => {
    const sym = S(b.symbol), sig = epsSig(b), old = prevCo[sym.toUpperCase()];
    const carry = (why) => (old && old.sig === sig && sane(old.pe) && sane(old.avg)
      ? { sym, pe: old.pe, avg: old.avg, months: old.months, asOf: old.asOf, ratio: old.pe / old.avg, sig, carried: true }
      : { sym, why });
    const key = typeof keyFor === 'function' ? keyFor(sym, S(b.isin)) : null;
    if (!key) return { sym, why: 'not in the app\u2019s list of NSE instruments' };
    let bars;
    try { bars = await fetchBars(key, { unit: 'months', interval: 1, years: 6 }); }
    catch (e) { return carry('the price feed did not answer' + (/HTTP (\d+)/.test(String(e && e.message)) ? ' (' + String(e.message).match(/HTTP \d+/)[0] + ')' : '')); }
    const h = peHistory(bars, b.eps, b.epsTtm);
    if (!h || !sane(h.pe)) return { sym, why: h && isNum(h.pe) ? 'P/E of ' + h.pe + ' is not a valuation (EPS in another unit?)' : 'no positive EPS to price against' };
    /* A P/E under 1 or over 1,000 is not a valuation: the EPS was sent in
       another unit (paise, lakh) or for another company. Left out. */
    if (!sane(h.avg)) return { sym, why: h.months < 24 ? 'only ' + h.months + ' months of prices with EPS behind them; two years are needed' : 'its average P/E is not a valuation' };
    return { sym, ...h, ratio: h.pe / h.avg, sig };
  };
  const valOne = async (r) => {
    if (!r || !S(r.name) || toolHistory(r.valuation) && real(r.valuation && r.valuation.pe)) return;
    const picks = bwOf(r).filter(canPrice).slice(0, 5);
    if (!picks.length) return;
    const all = await Promise.all(picks.map(priceOne));
    const got = all.filter((x) => x && !x.why);
    const why = all.filter((x) => x && x.why).map((x) => ({ symbol: x.sym, why: x.why }));
    if (why.length) result.valuationWhy[nameKey(r.name)] = why;
    got.sort((a, b) => picks.findIndex((p) => S(p.symbol) === a.sym) - picks.findIndex((p) => S(p.symbol) === b.sym));
    if (!got.length) { result.valuationFailed.push(S(r.name)); return; }
    result.valuation[nameKey(r.name)] = { pe: r2(medianOf(got.map((x) => x.pe))), history: r2(medianOf(got.map((x) => x.avg))),
      ratio: +medianOf(got.map((x) => x.ratio)).toFixed(3), of: got.map((x) => x.sym).join(', '),
      companies: got.map((x) => ({ symbol: x.sym, pe: x.pe, avg: x.avg, months: x.months, asOf: x.asOf, sig: x.sig, carried: x.carried || undefined })),
      asOf: got.map((x) => x.asOf).sort().pop() };
  };
  const toPrice = list.filter((r) => r && S(r.name) && !(toolHistory(r.valuation) && real(r.valuation && r.valuation.pe)) && bwOf(r).some(canPrice));
  for (let i = 0; i < toPrice.length; i += 6) { tell('valuation', i, toPrice.length); await Promise.all(toPrice.slice(i, i + 6).map(valOne)); }
  tell('valuation', toPrice.length, toPrice.length);
  result.valuationFailed.sort((a, b) => FINDER_SECTORS.indexOf(a) - FINDER_SECTORS.indexOf(b));
  return result;
}

/* ── From the companies themselves (build 31) ───────────────────────── */
/* Tejas, 23-11-2026: "It's all listed companies." A sector-wide aggregate,
   a sector P/E history or a sector forecast is often published nowhere, and
   seven follow-ups could not find them for a dozen sectors. Every listed
   company files its own results and EPS, and analysts forecast each one. So
   the tool sends each bellwether's own figures and the application does the
   adding up itself: sales and profit summed across the companies, each
   company's P/E history worked out from its own price feed and EPS, and the
   median of their forecasts. */
const medianOf = (xs) => {
  const s = xs.filter(isNum).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const bwOf = (r) => arr(r && r.bellwethers).filter((x) => x && typeof x === 'object' && S(x.symbol));
const r2 = (v) => (isNum(v) ? +v.toFixed(2) : null);

/* "FY26", "FY2026", "2025-26", "2026" → the 31 March that ends it. */
export function fyEnd(v) {
  const t = S(v);
  let y = null, m;
  /* Build 32: a calendar year ("CY21", "CY2024") ends on 31 December (ABB). */
  if ((m = /CY\s*'?(\d{4}|\d{2})(?:E|A)?\b/i.exec(t))) {
    const cy = Number(m[1].length === 2 ? '20' + m[1] : m[1]);
    return cy > 1990 && cy < 2100 ? `${cy}-12-31` : null;
  }
  if ((m = /(\d{4})\s*[-–\/]\s*(\d{2,4})/.exec(t))) y = Number(m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]);
  else if ((m = /FY\s*'?(\d{4}|\d{2})(?:E|A)?\b/i.exec(t))) y = Number(m[1].length === 2 ? '20' + m[1] : m[1]);
  else if ((m = /^(\d{4})$/.exec(t))) y = Number(m[1]);
  return y && y > 1990 && y < 2100 ? `${y}-03-31` : null;
}

/* Sales and profit over the companies that sent both quarters. Profit is
   summed, so a company that swung to a loss is counted, not dropped; where
   the year-ago total is itself a loss, the change is set against its size
   ("loss narrowed by 27%"). */
export function companyBusiness(r) {
  const qs = bwOf(r).map((b) => ({ sym: S(b.symbol), q: (b.quarter && typeof b.quarter === 'object') ? b.quarter : {} }));
  const rev = qs.filter((x) => isNum(x.q.revenue) && isNum(x.q.revenuePrev) && x.q.revenuePrev > 0 && x.q.revenue >= 0);
  const pro = qs.filter((x) => isNum(x.q.profit) && isNum(x.q.profitPrev));
  const out = { revenueGrowth: null, profitGrowth: null, lossBase: false, of: [], period: '' };
  if (rev.length) {
    const a = rev.reduce((t, x) => t + x.q.revenue, 0), b = rev.reduce((t, x) => t + x.q.revenuePrev, 0);
    out.revenueGrowth = r2((a / b - 1) * 100);
  }
  if (pro.length) {
    const a = pro.reduce((t, x) => t + x.q.profit, 0), b = pro.reduce((t, x) => t + x.q.profitPrev, 0);
    if (b > 0) out.profitGrowth = r2((a / b - 1) * 100);
    else if (b < 0) { out.profitGrowth = r2(((a - b) / Math.abs(b)) * 100); out.lossBase = true; }
  }
  out.of = [...new Set(rev.concat(pro).map((x) => x.sym))];
  out.period = S((rev[0] || pro[0] || { q: {} }).q.period);
  return out;
}

/* ── The outlook from the companies (build 32) ─────────────────────────
   Tejas, 23-11-2026: forecasts first, then the company's own guidance, then
   its past trend, and a badge on the figure saying which. In order, for each
   company and each measure:
     Published  a consensus forecast. Either a growth rate the site states
                ("epsGrowth3y"), or the yearly estimates it shows (FY27E,
                FY28E…) from which the app works out the annual growth from
                the last actual year. Where only two forecast years are
                published, the third is extended at the growth between them
                (his rule); one year is used as it stands.
     Guidance   the company's own guided growth, from its latest earnings call.
     Past       its EPS growth over the last three reported years, worked out
                by the app from the EPS already sent, capped at ±50% a year
                (his rule: one trough year must not decide a sector). Past
                counts at half weight in the score.
   A sector takes the best tier any of its companies reached, and the median
   of the companies at that tier: forecasts are never mixed with history. */
export const OUTLOOK_TIERS = ['published', 'guidance', 'past'];
export const PAST_CAP = 50;
const seriesOf = (list, key) => arr(list).map((e) => ({ end: fyEnd(e && (e.fy != null ? e.fy : e.year != null ? e.year : e.period)),
  fy: S(e && (e.fy != null ? e.fy : e.year != null ? e.year : e.period)), v: e && e[key], actual: !!(e && e.actual) }))
  .filter((e) => e.end && isNum(e.v)).sort((a, b) => (a.end < b.end ? -1 : 1));
const yrs = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / (365.25 * 864e5));

/* Annual growth from a base actual to the yearly estimates after it. */
export function forecastGrowth(base, est) {
  const f = est.filter((e) => base && e.end > base.end && e.v > 0);
  if (!base || !(base.v > 0) || !f.length) return null;
  if (f.length >= 3 || (f.length && yrs(base.end, f[f.length - 1].end) >= 3)) {
    const last = f.filter((e) => yrs(base.end, e.end) <= 3).pop() || f[f.length - 1];
    const n = Math.max(1, yrs(base.end, last.end));
    return { g: (Math.pow(last.v / base.v, 1 / n) - 1) * 100, years: `${base.fy} to ${last.fy}`, extended: false };
  }
  if (f.length === 2) {
    const g2 = f[1].v / f[0].v;
    const third = f[1].v * g2;
    const n = yrs(base.end, f[1].end) + 1;
    return { g: (Math.pow(third / base.v, 1 / n) - 1) * 100,
      years: `${base.fy} to ${f[1].fy} and one more year extended at the ${f[0].fy}–${f[1].fy} trend`, extended: true };
  }
  const n = Math.max(1, yrs(base.end, f[0].end));
  return { g: (Math.pow(f[0].v / base.v, 1 / n) - 1) * 100, years: `${base.fy} to ${f[0].fy}`, extended: false };
}

/* One company's view of one measure, at the best tier it has. */
function companyView(b, measure) {
  const fo = (b.forecast && typeof b.forecast === 'object') ? b.forecast : {};
  const gd = (b.guidance && typeof b.guidance === 'object') ? b.guidance : {};
  const sym = S(b.symbol);
  if (measure === 'earnings') {
    if (isNum(fo.epsGrowth3y)) return { sym, tier: 'published', g: fo.epsGrowth3y, years: S(fo.years), src: S(fo.source) };
    const est = seriesOf(fo.eps, 'eps');
    const act = est.filter((e) => e.actual).pop() || seriesOf(b.eps, 'eps').filter((e) => !est.some((x) => !x.actual && x.end <= e.end)).pop();
    const fg = forecastGrowth(act, est.filter((e) => !e.actual));
    if (fg) return { sym, tier: 'published', g: fg.g, years: fg.years, extended: fg.extended, src: S(fo.source) };
    const gg = isNum(gd.profitGrowth) ? gd.profitGrowth : gd.epsGrowth;
    if (isNum(gg)) return { sym, tier: 'guidance', g: gg, years: S(gd.years), src: S(gd.source) };
    const h = seriesOf(b.eps, 'eps'), last = h[h.length - 1];
    const back = last && h.filter((e) => yrs(e.end, last.end) === 3).pop();
    if (last && back && last.v > 0 && back.v > 0) {
      const g = (Math.pow(last.v / back.v, 1 / 3) - 1) * 100;
      return { sym, tier: 'past', g: Math.max(-PAST_CAP, Math.min(PAST_CAP, g)), capped: Math.abs(g) > PAST_CAP,
        years: `${back.fy} to ${last.fy}`, src: S(b.epsSource) };
    }
    return null;
  }
  if (isNum(fo.revenueGrowth3y)) return { sym, tier: 'published', g: fo.revenueGrowth3y, years: S(fo.years), src: S(fo.source) };
  const rev = seriesOf(fo.revenue, 'value');
  const base = rev.filter((e) => e.actual).pop();
  const est = rev.filter((e) => !e.actual);
  const fg = base ? forecastGrowth(base, est)
    : est.length >= 2 ? { g: (Math.pow(est[est.length - 1].v / est[0].v, 1 / Math.max(1, yrs(est[0].end, est[est.length - 1].end))) - 1) * 100,
      years: `${est[0].fy} to ${est[est.length - 1].fy}` } : null;
  if (fg) return { sym, tier: 'published', g: fg.g, years: fg.years, extended: fg.extended, src: S(fo.source) };
  if (isNum(gd.revenueGrowth)) return { sym, tier: 'guidance', g: gd.revenueGrowth, years: S(gd.years), src: S(gd.source) };
  return null;
}

export function companyOutlook(r) {
  const out = { earningsGrowth3y: null, demandGrowth3y: null, of: [], years: '', tier: {}, note: {} };
  [['earnings', 'earningsGrowth3y'], ['demand', 'demandGrowth3y']].forEach(([m, key]) => {
    const views = bwOf(r).map((b) => companyView(b, m)).filter(Boolean);
    const tier = OUTLOOK_TIERS.find((t) => views.some((v) => v.tier === t));
    if (!tier) return;
    const at = views.filter((v) => v.tier === tier);
    out[key] = r2(medianOf(at.map((v) => v.g)));
    out.tier[m] = tier;
    const word = tier === 'published' ? 'consensus forecast' : tier === 'guidance' ? 'company guidance' : 'past EPS growth';
    out.note[m] = `median of the ${word} of ${at.map((v) => v.sym).join(', ')}`
      + (at.some((v) => v.years) ? `, ${at.find((v) => v.years).years}` : '')
      + (at.some((v) => v.capped) ? `; ${at.filter((v) => v.capped).map((v) => v.sym).join(', ')} capped at ±${PAST_CAP}% a year` : '')
      + (tier === 'past' ? '; counted at half weight' : '');
    at.forEach((v) => { if (!out.of.includes(v.sym)) out.of.push(v.sym); });
    if (!out.years) out.years = (at.find((v) => v.years) || {}).years || '';
  });
  return out;
}

/* A company's P/E history from its own prices and its annual EPS. Each
   month-end close is divided by the EPS of the latest year whose accounts
   were out by then (two months after 31 March); a loss year has no P/E and
   is left out. Over the last five years; 24 months at least. */
export function peHistory(bars, eps, ttm) {
  const list = arr(bars).filter((b) => b && isNum(b.c) && b.c > 0 && S(b.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!list.length) return null;
  const years = arr(eps).map((e) => ({ end: fyEnd(e && (e.fy != null ? e.fy : e.year != null ? e.year : e.period)), v: e && e.eps }))
    .filter((e) => e.end && isNum(e.v)).sort((a, b) => (a.end < b.end ? -1 : 1));
  const out_ = (y) => { const t = new Date(y + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + 2); return t.toISOString().slice(0, 10); };
  const last = list[list.length - 1];
  const from = new Date(last.date + 'T00:00:00Z'); from.setUTCFullYear(from.getUTCFullYear() - 5);
  const cut = from.toISOString().slice(0, 10);
  const pes = [];
  for (const b of list) {
    if (b.date < cut) continue;
    const e = years.filter((y) => out_(y.end) <= b.date).pop();
    if (e && e.v > 0) pes.push(b.c / e.v);
  }
  const lastFy = years.length ? years[years.length - 1].v : null;
  const now = isNum(ttm) && ttm > 0 ? ttm : (isNum(lastFy) && lastFy > 0 ? lastFy : null);
  return { pe: now ? r2(last.c / now) : null, avg: pes.length >= 24 ? r2(pes.reduce((a, x) => a + x, 0) / pes.length) : null,
    months: pes.length, asOf: last.date };
}
const epsYears = (b) => arr(b && b.eps).filter((e) => e && isNum(e.eps) && fyEnd(e.fy != null ? e.fy : e.year != null ? e.year : e.period)).length;
/* A company the app can price over five years: three years of EPS at least. */
export const canPrice = (b) => epsYears(b) >= 3;

/* The P/E's own history as the research sent it: the five-year average, a
   five-year median, or the long-run median of a series three years old. */
function toolHistory(va) {
  if (!va) return null;
  if (real(va.pe5yAvg)) return ['pe5yAvg', va.pe5yAvg, 'five-year average'];
  if (real(va.pe5yMedian)) return ['pe5yMedian', va.pe5yMedian, 'five-year median'];
  if (real(va.peMedian) && !(isNum(va.peMedianSince) && new Date().getFullYear() - va.peMedianSince < 3))
    return ['peMedian', va.peMedian, 'long-run median' + (va.peMedianSince ? ' since ' + va.peMedianSince : '')];
  return null;
}

/* What a sector stands on, the research's own sector figure first and the
   companies' figures where it has none. `from` says which. */
export function effective(r, ver) {
  const bz = r.business || {}, ol = r.outlook || {}, va = r.valuation || {};
  const cb = companyBusiness(r), co = companyOutlook(r);
  const pick = (own, comp) => (real(own) ? [own, 'research'] : isNum(comp) ? [comp, 'companies'] : [null, '']);
  const [rv, rvF] = pick(bz.revenueGrowth, cb.revenueGrowth), [pf, pfF] = pick(bz.profitGrowth, cb.profitGrowth);
  const [eg, egF] = pick(ol.earningsGrowth3y, co.earningsGrowth3y), [dg, dgF] = pick(ol.demandGrowth3y, co.demandGrowth3y);
  const th = toolHistory(va);
  const cv = ver && ver.valuation && ver.valuation[nameKey(r.name)];
  let valuation;
  if (real(va.pe) && th) valuation = { pe: va.pe, history: th[1], historyBasis: th[2], ratio: +(va.pe / th[1]).toFixed(3), from: 'research' };
  else if (cv && isNum(cv.ratio)) valuation = { pe: cv.pe, history: cv.history, ratio: cv.ratio, from: 'app', of: cv.of,
    historyBasis: `own five-year average, worked out by the application from the prices and EPS of ${cv.of}` };
  else valuation = { pe: real(va.pe) ? va.pe : null, history: null, historyBasis: '', ratio: null, from: '' };
  return {
    business: { revenueGrowth: rv, profitGrowth: pf, from: { revenue: rvF, profit: pfF }, lossBase: pfF === 'companies' && cb.lossBase,
      period: (rvF === 'companies' || pfF === 'companies') && !S(bz.period) ? cb.period : S(bz.period), of: cb.of },
    outlook: { earningsGrowth3y: eg, demandGrowth3y: dg, from: { earnings: egF, demand: dgF }, of: co.of, years: S(ol.years) || co.years,
      /* Build 32: where each outlook figure comes from, for its badge. A
         sector figure the research found is a published forecast. */
      tier: { earnings: egF === 'research' ? 'published' : egF ? co.tier.earnings : '', demand: dgF === 'research' ? 'published' : dgF ? co.tier.demand : '' },
      note: { earnings: egF === 'research' ? `published sector forecast${S(ol.source) ? ': ' + S(ol.source) : ''}` : egF ? co.note.earnings : '',
        demand: dgF === 'research' ? `published sector forecast${S(ol.source) ? ': ' + S(ol.source) : ''}` : dgF ? co.note.demand : '' } },
    valuation,
  };
}

/* ── Scoring (build 33) ─────────────────────────────────────────────────
   Tejas, 26-11-2026, approving the proposal of that day: seven pillars, as
   in the Independent Sector Research, scored in two stages.

     Stage 1, the screen: all 41 sectors, on what the app measures from
     prices and the companies' own filings — past performance, fundamentals,
     outlook, valuation and risk. The best ten form the shortlist.
     Stage 2, the deep dive: the shortlist only, adding government and
     policy, global and regional, money flows, ownership and the graded
     risks. The Top 3 are the best three of the shortlist on all seven.

   Each measure is ranked among the sectors that have it (the stage-2 ones
   among the shortlist), and a pillar is the weighted mean of its measures'
   ranks. Past performance and the outlook must be established; any other
   pillar that could not be counts as average (50). */
export const PILLAR_WEIGHTS = Object.freeze({ performance: 20, fundamentals: 15, outlook: 20, policy: 15, global: 10, valuation: 10, risk: 10 });
export const PILLAR_NAMES = Object.freeze({ performance: 'Past performance', fundamentals: 'Business fundamentals', outlook: 'Growth outlook',
  policy: 'Government and policy', global: 'Global and regional', valuation: 'Valuation', risk: 'Risk' });
export const STAGE1_PILLARS = Object.freeze(['performance', 'fundamentals', 'outlook', 'valuation', 'risk']);
export const SHORTLIST = 10;
/* [measure, weight inside the pillar, stage (1 or 2), required]. */
export const MEASURES = Object.freeze({
  performance: [['rel1', 0.20, 1, true], ['rel2', 0.25, 1], ['rel3', 0.35, 1], ['consistency', 0.10, 1], ['flows', 0.10, 2]],
  fundamentals: [['profit', 0.25, 1], ['revenue', 0.15, 1], ['eps3y', 0.25, 1], ['roe', 0.20, 1], ['ownership', 0.15, 2]],
  outlook: [['earnings', 0.45, 1], ['demand', 0.30, 1], ['revision', 0.25, 1]],
  policy: [['budget', 0.30, 2], ['utilisation', 0.20, 2], ['schemes', 0.20, 2], ['policyNet', 0.30, 2]],
  global: [['globalGrowth', 0.30, 2], ['indiaShare', 0.20, 2], ['exports', 0.20, 2], ['drivers', 0.30, 2]],
  valuation: [['cheap', 0.6, 1], ['pegCheap', 0.4, 1]],
  risk: [['lowVol', 0.30, 1], ['smallDD', 0.30, 1], ['lowLev', 0.20, 1], ['lowRisk', 0.20, 2]],
});
export const MEASURE_NAMES = Object.freeze({
  rel1: '1-year return against the index', rel2: '2-year return a year against the index', rel3: '3-year return a year against the index',
  consistency: 'quarters beating the index, of the last 12', flows: 'foreign portfolio flows, 12 months, % of holdings',
  profit: 'profit growth, latest quarter', revenue: 'sales growth, latest quarter', eps3y: 'EPS growth a year, last 3 years',
  roe: 'return on equity', ownership: 'change in institutional holding, 4 quarters',
  earnings: 'forecast earnings growth a year', demand: 'forecast demand growth a year', revision: 'change in consensus EPS, 3 months',
  budget: 'Budget allocation growth a year', utilisation: 'Budget actually spent', schemes: 'scheme money disbursed of outlay',
  policyNet: 'policy and trade measures, net', globalGrowth: 'global market growth a year', indiaShare: 'change in India\'s global share',
  exports: 'export growth a year', drivers: 'profit drivers moving its way, net', cheap: 'P/E below its own history', pegCheap: 'P/E for its growth (PEG)',
  lowVol: 'volatility (lower is better)', smallDD: 'largest fall, 3 years (smaller is better)', lowLev: 'net debt to EBITDA (lower is better)',
  lowRisk: 'graded risks (fewer and milder is better)',
});
/* The pillars that count as average when absent. */
export const CORE_PARTS = Object.freeze(['performance', 'outlook']);
export const NEUTRAL_PARTS = Object.freeze(['fundamentals', 'policy', 'global', 'valuation', 'risk']);
/* Kept for older screens and documents: the build-28 names. */
export const FINDER_WEIGHTS = PILLAR_WEIGHTS;

function percentiles(values) {
  /* values: array of number|null. Returns 0-100 per value, null stays null. */
  const xs = values.filter(isNum);
  return values.map((v) => {
    if (!isNum(v)) return null;
    if (xs.length === 1) return 50;
    const below = xs.filter((x) => x < v).length, equal = xs.filter((x) => x === v).length;
    return +(((below + (equal - 1) / 2) / (xs.length - 1)) * 100).toFixed(1);
  });
}
/* parts: [value, weight, required?] (kept for reference). */
export const mix = (parts) => {
  if (parts.some(([v, , req]) => req && !isNum(v))) return null;
  const ok = parts.filter(([v]) => isNum(v));
  if (!ok.length) return null;
  return ok.reduce((a, [v, w]) => a + v * w, 0) / ok.reduce((a, [, w]) => a + w, 0);
};

/* The companies' quality: median ROE, leverage, past EPS growth (capped at
   ±50% a year, as for the outlook) and the 3-month change in consensus. */
export function companyQuality(r) {
  const bws = bwOf(r);
  const num = (v) => (isNum(v) ? v : null);
  const eps3 = bws.map((b) => {
    const h = seriesOf(b.eps, 'eps'), last = h[h.length - 1];
    const bk = last && h.filter((e) => yrs(e.end, last.end) === 3).pop();
    if (!(last && bk && last.v > 0 && bk.v > 0)) return null;
    return Math.max(-PAST_CAP, Math.min(PAST_CAP, (Math.pow(last.v / bk.v, 1 / 3) - 1) * 100));
  });
  const rev = bws.map((b) => num(b.forecast && b.forecast.revision3m));
  return { roe: r2(medianOf(bws.map((b) => num(b.roe)))), leverage: r2(medianOf(bws.map((b) => num(b.netDebtEbitda)))),
    eps3y: r2(medianOf(eps3)), revision: r2(medianOf(rev)),
    of: { roe: bws.filter((b) => isNum(b.roe)).map((b) => S(b.symbol)), eps3y: bws.filter((b, i) => isNum(eps3[i])).map((b) => S(b.symbol)),
      revision: bws.filter((b, i) => isNum(rev[i])).map((b) => S(b.symbol)) } };
}

/* The deep dive's measures, worked out by the app from the figures sent. */
export function deepMeasures(r, now = new Date()) {
  const dd = (r && r.deepDive && typeof r.deepDive === 'object') ? r.deepDive : {};
  const num = (v) => (isNum(v) ? v : null);
  const out = {};
  const fl = dd.flows || {};
  out.flows = isNum(fl.fpiNet12mCr) && fl.fpiAucCr > 0 ? r2(fl.fpiNet12mCr / fl.fpiAucCr * 100) : null;
  /* Institutional (FII + DII) holding: now against four quarters earlier,
     the median across the companies. */
  const own = bwOf(r).map((b) => {
    const q = arr(b.holding).filter((x) => x && isNum(x.fii) && isNum(x.dii));
    if (q.length < 2) return null;
    const ord = q.slice().sort((a, c) => (qEnd(a.q) < qEnd(c.q) ? -1 : 1));
    const last = ord[ord.length - 1], first = ord[Math.max(0, ord.length - 5)];
    return (last.fii + last.dii) - (first.fii + first.dii);
  });
  out.ownership = r2(medianOf(own));
  /* Budget: growth a year of the Budget Estimate over the years sent, and
     the share actually spent in the latest year with actuals. */
  const bud = arr(dd.budget).map((b) => ({ end: fyEnd(b && b.fy), fy: S(b && b.fy), be: num(b && b.be), actual: num(b && (b.actual != null ? b.actual : b.re)) }))
    .filter((b) => b.end).sort((a, c) => (a.end < c.end ? -1 : 1));
  const be = bud.filter((b) => b.be > 0);
  if (be.length >= 2) { const n = yrs(be[0].end, be[be.length - 1].end); if (n >= 1) out.budget = r2((Math.pow(be[be.length - 1].be / be[0].be, 1 / n) - 1) * 100); }
  const spent = bud.filter((b) => b.be > 0 && isNum(b.actual)).pop();
  out.utilisation = spent ? r2(spent.actual / spent.be * 100) : null;
  const sch = arr(dd.schemes).filter((x) => x && x.outlay > 0 && isNum(x.disbursed));
  out.schemes = sch.length ? r2(medianOf(sch.map((x) => x.disbursed / x.outlay * 100))) : null;
  const pol = arr(dd.policy).filter((x) => x && isNum(x.impact));
  out.policyNet = pol.length ? Math.max(-5, Math.min(5, pol.reduce((a, x) => a + Math.sign(x.impact), 0))) : null;
  const gl = dd.global || {};
  out.globalGrowth = num(gl.marketGrowth3y);
  out.indiaShare = isNum(gl.indiaShareNow) && isNum(gl.indiaSharePrev) ? r2(gl.indiaShareNow - gl.indiaSharePrev) : null;
  out.exports = num(gl.exportsCagr3y);
  /* A driver moving the sector's way: rising when rising helps, falling when
     rising hurts. Net of those moving against it. */
  const drv = arr(dd.drivers).filter((x) => x && isNum(x.now) && isNum(x.yearAgo) && x.yearAgo !== 0 && /help|hurt/i.test(S(x.effect)));
  out.drivers = drv.length ? drv.reduce((a, x) => a + Math.sign(x.now - x.yearAgo) * (/help/i.test(S(x.effect)) ? 1 : -1), 0) : null;
  const rk = arr(dd.risks).filter((x) => x && /high|medium|low/i.test(S(x.severity)));
  out.riskGrade = rk.length ? rk.reduce((a, x) => a + (/high/i.test(x.severity) ? 2 : /medium/i.test(x.severity) ? 1 : 0.25), 0) : null;
  void now;
  return out;
}
/* "Sep-26", "Q2 FY27", "2026-09" → a sortable date. */
function qEnd(v) {
  const t = S(v); let m;
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  if ((m = /([a-z]{3})[a-z]*[\s'\-]*(\d{2,4})/i.exec(t)) && MON[m[1].toLowerCase()]) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${String(MON[m[1].toLowerCase()]).padStart(2, '0')}`;
  }
  if ((m = /Q([1-4])\s*FY\s*'?(\d{2,4})/i.exec(t))) {
    const fy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    const mon = [6, 9, 12, 3][Number(m[1]) - 1];
    return `${mon === 3 ? fy : fy - 1}-${String(mon).padStart(2, '0')}`;
  }
  if ((m = /(\d{4})-(\d{2})/.exec(t))) return `${m[1]}-${m[2]}`;
  return t;
}

export function scoreFinder(d0, { weights = PILLAR_WEIGHTS, shortlistSize = SHORTLIST } = {}) {
  /* Saved screens that predate a reading rule are read with today's rules,
     on a copy, so the saved reply itself is never changed by scoring. */
  const d = d0 && typeof d0 === 'object' ? JSON.parse(JSON.stringify(d0)) : d0;
  if (d) normaliseFinder(d);
  const ver = (d && d.verified) || {};
  /* The benchmark: the Nifty 500 as the app measured it, else the Nifty 50
     as the app measured it, else the research's own figures. */
  const appBench = ver.benchmark500 && isNum(ver.benchmark500.y1) ? { ...ver.benchmark500, name: BENCHMARK_BROAD }
    : ver.benchmark && isNum(ver.benchmark.y1) ? { ...ver.benchmark, name: BENCHMARK } : null;
  const tb = (d && d.benchmark) || {};
  const tr = tb.returns || {};
  const toolBench = { y1: real(tr.y1) ? tr.y1 : null, y2: real(tr.y2) ? tr.y2 : null, y3: real(tr.y3) ? tr.y3 : null,
    m3: real(tr.m3) ? tr.m3 : null, m6: real(tr.m6) ? tr.m6 : null, name: S(tb.name) || BENCHMARK, asOf: S(tb.asOf), checked: false };
  const bench = appBench ? { ...appBench, checked: true } : toolBench;
  const rows = arr(d && d.sectors).filter((r) => r && S(r.name)).map((r) => {
    const v = (ver.sectors || {})[nameKey(r.name)];
    const t = r.returns || {};
    const ret = v && (isNum(v.y1) || isNum(v.y3))
      ? { ...v, checked: true, tool: { y1: t.y1, y2: t.y2, y3: t.y3 } }
      : { y1: real(t.y1) ? t.y1 : null, y2: real(t.y2) ? t.y2 : null, y3: real(t.y3) ? t.y3 : null,
          m3: real(t.m3) ? t.m3 : null, m6: real(t.m6) ? t.m6 : null,
          checked: false, basis: S(t.basis) || 'stated by the research', of: S(r.index), asOf: S(t.asOf) };
    /* A return the app measured is set against the index the app measured,
       to the same close; one the research stated, against the research's. */
    const bm = ret.checked ? (appBench || toolBench) : toolBench;
    const rel = {};
    ['y1', 'y2', 'y3', 'm3', 'm6'].forEach((k) => { rel[k] = isNum(ret[k]) && isNum(bm[k]) ? +(ret[k] - bm[k]).toFixed(2) : null; });
    const bz = r.business || {}, ol = r.outlook || {}, va = r.valuation || {};
    const ef = effective(r, ver);
    const eb = ef.business, eo = ef.outlook, ev = ef.valuation;
    const q = companyQuality(r), dm = deepMeasures(r);
    const peg = isNum(ev.pe) && isNum(eo.earningsGrowth3y) && eo.earningsGrowth3y > 0 ? r2(ev.pe / eo.earningsGrowth3y) : null;
    return {
      name: S(r.name), short: SHORT_NAMES[FINDER_SECTORS.find((x) => nameKey(x) === nameKey(r.name))] || S(r.name),
      subSector: S(r.subSector), index: S(r.index), why: S(r.why),
      returns: ret, rel, relativeTo: bm.name || BENCHMARK,
      business: { revenueGrowth: eb.revenueGrowth, profitGrowth: eb.profitGrowth, period: eb.period, source: S(bz.source),
        from: eb.from, lossBase: eb.lossBase, of: eb.of },
      quality: q,
      outlook: { earningsGrowth3y: eo.earningsGrowth3y, demandGrowth3y: eo.demandGrowth3y, years: eo.years,
        tailwinds: arr(ol.tailwinds).map(S).filter(Boolean), risks: arr(ol.risks).map(S).filter(Boolean), source: S(ol.source),
        from: eo.from, of: eo.of, tier: eo.tier, note: eo.note, revision: q.revision },
      valuation: { pe: ev.pe, pe5yAvg: real(va.pe5yAvg) && ev.from === 'research' ? va.pe5yAvg : null,
        history: ev.history, historyBasis: ev.historyBasis, ratio: ev.ratio, from: ev.from, peg,
        asOf: S(va.asOf), source: S(va.source) },
      deep: dm, deepDive: r.deepDive && typeof r.deepDive === 'object' ? r.deepDive : null,
      sub: {
        /* No benchmark at all: the sectors are ranked on their own returns
           (every sector alike), as before build 33. */
        rel1: isNum(bm.y1) ? rel.y1 : ret.y1, rel2: isNum(bm.y1) ? rel.y2 : ret.y2, rel3: isNum(bm.y1) ? rel.y3 : ret.y3,
        consistency: isNum(ret.quartersBeat) && ret.quarters >= 4 ? +(ret.quartersBeat / ret.quarters * 12).toFixed(1) : null,
        flows: dm.flows,
        profit: eb.profitGrowth, revenue: eb.revenueGrowth, eps3y: q.eps3y, roe: q.roe, ownership: dm.ownership,
        earnings: eo.earningsGrowth3y, demand: eo.demandGrowth3y, revision: q.revision,
        budget: dm.budget, utilisation: dm.utilisation, schemes: dm.schemes, policyNet: dm.policyNet,
        globalGrowth: dm.globalGrowth, indiaShare: dm.indiaShare, exports: dm.exports, drivers: dm.drivers,
        cheap: isNum(ev.ratio) ? -ev.ratio : null, pegCheap: isNum(peg) ? -peg : null,
        lowVol: isNum(ret.vol) ? -ret.vol : null, smallDD: isNum(ret.maxDD) ? ret.maxDD : null,
        lowLev: isNum(q.leverage) ? -q.leverage : null, lowRisk: isNum(dm.riskGrade) ? -dm.riskGrade : null,
      },
    };
  });
  /* A pillar from its measures' ranks. `use` is the measures allowed. */
  const pctAll = {};
  const all = Object.values(MEASURES).flat();
  all.filter(([, , st]) => st === 1).forEach(([m]) => { pctAll[m] = percentiles(rows.map((r) => r.sub[m])); });
  const halve = (pct) => ['earnings', 'demand'].forEach((m) => rows.forEach((r, i) => {
    /* Build 32: an outlook that is only the past trend counts at half weight. */
    if (pct[m] && r.outlook.tier && r.outlook.tier[m] === 'past' && isNum(pct[m][i])) pct[m][i] = +(50 + (pct[m][i] - 50) / 2).toFixed(1);
  }));
  halve(pctAll);
  const pillarOf = (pct, i, part, stage2) => {
    const ms = MEASURES[part].filter(([, , st]) => st === 1 || stage2);
    if (!ms.length) return { v: null };
    if (ms.some(([m, , , req]) => req && !isNum(pct[m] && pct[m][i]))) return { v: null };
    const got = ms.filter(([m]) => isNum(pct[m] && pct[m][i]));
    if (!got.length) return { v: null };
    return { v: +(got.reduce((a, [m, w]) => a + pct[m][i] * w, 0) / got.reduce((a, [, w]) => a + w, 0)).toFixed(1),
      partial: got.length < ms.length };
  };
  const combine = (parts, keys) => {
    const w = keys.reduce((a, k) => a + (weights[k] || 0), 0);
    return w ? +(keys.reduce((a, k) => a + parts[k] * (weights[k] || 0), 0) / w).toFixed(1) : null;
  };
  /* Stage 1: every sector, on the stage-1 measures. */
  rows.forEach((r, i) => {
    const p1 = {};
    STAGE1_PILLARS.forEach((k) => { p1[k] = pillarOf(pctAll, i, k, false).v; });
    r.missing1 = STAGE1_PILLARS.filter((k) => !isNum(p1[k]));
    r.eligible = CORE_PARTS.every((k) => isNum(p1[k]));
    STAGE1_PILLARS.forEach((k) => { if (!isNum(p1[k]) && NEUTRAL_PARTS.includes(k)) p1[k] = 50; });
    r.stage1Parts = p1;
    r.stage1Score = r.eligible ? combine(p1, STAGE1_PILLARS) : null;
  });
  const byStage1 = rows.filter((r) => r.eligible).sort((a, b) => (b.stage1Score - a.stage1Score) || a.name.localeCompare(b.name));
  const short = byStage1.slice(0, shortlistSize);
  rows.forEach((r) => { r.shortlisted = short.includes(r); r.stage1Rank = byStage1.indexOf(r) + 1 || null; });
  /* Stage 2: the shortlist, on every measure; the stage-2 ones ranked among
     the shortlist only. */
  const idx = short.map((r) => rows.indexOf(r));
  const pctS = {};
  all.forEach(([m, , st]) => {
    if (st === 1) { pctS[m] = pctAll[m]; return; }
    const ranks = percentiles(idx.map((i) => rows[i].sub[m]));
    pctS[m] = rows.map((r, i) => { const j = idx.indexOf(i); return j >= 0 ? ranks[j] : null; });
  });
  rows.forEach((r, i) => {
    const parts = {}; r.partial = []; r.neutral = []; r.missingParts = [];
    Object.keys(MEASURES).forEach((k) => {
      const p = r.shortlisted ? pillarOf(pctS, i, k, true) : (STAGE1_PILLARS.includes(k) ? pillarOf(pctAll, i, k, false) : { v: null });
      parts[k] = p.v;
      if (p.partial) r.partial.push(k);
    });
    const keys = r.shortlisted ? Object.keys(MEASURES) : STAGE1_PILLARS;
    keys.forEach((k) => {
      if (isNum(parts[k])) return;
      r.missingParts.push(k);
      if (NEUTRAL_PARTS.includes(k)) { parts[k] = 50; r.neutral.push(k); }
    });
    r.parts = parts;
    r.complete = !r.missingParts.length;
    r.finalScore = r.shortlisted && r.eligible ? combine(parts, Object.keys(MEASURES)) : null;
    r.score = r.shortlisted ? r.finalScore : r.stage1Score;
    r.stage = r.shortlisted ? 2 : 1;
    /* What each pillar contributed to the score, in points. */
    const w = keys.reduce((a, k) => a + (weights[k] || 0), 0);
    r.contrib = {};
    keys.forEach((k) => { r.contrib[k] = w && isNum(parts[k]) ? +(parts[k] * (weights[k] || 0) / w).toFixed(1) : null; });
    /* Each measure's rank, for the report. */
    r.measureRanks = {};
    all.forEach(([m]) => { const p = (r.shortlisted ? pctS : pctAll)[m]; r.measureRanks[m] = p ? p[i] : null; });
  });
  rows.sort((a, b) => (Number(b.shortlisted) - Number(a.shortlisted)) || (Number(b.eligible) - Number(a.eligible))
    || ((isNum(b.score) ? b.score : -1) - (isNum(a.score) ? a.score : -1)) || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; r.reason = reasonOf(r, bench); });
  const shortlist = rows.filter((r) => r.shortlisted);
  const top3 = shortlist.slice(0, 3);
  const deepDone = shortlist.filter((r) => r.deepDive && ['policy', 'global'].some((k) => !r.missingParts.includes(k))).length;
  return {
    benchmark: bench, relativeTo: bench.name || BENCHMARK, rows, top3, shortlist,
    counts: { screened: rows.length, complete: rows.filter((r) => r.complete).length,
      eligible: rows.filter((r) => r.eligible).length, neutral: rows.filter((r) => r.neutral.length).length,
      checked: rows.filter((r) => r.returns.checked).length, listed: FINDER_SECTORS.length,
      shortlist: shortlist.length, deepDone },
    weights, stage1: STAGE1_PILLARS, measures: MEASURES,
    basis: 'Two stages. Stage 1 scores all the sectors screened on five pillars: past performance (the 1-, 2- and '
      + '3-year returns against the ' + (bench.name || BENCHMARK) + ', weighted 20, 25 and 35, and the share of the last twelve quarters it '
      + 'beat the index in), business fundamentals (profit and sales growth in the latest quarter, EPS growth over three years, '
      + 'return on equity), the growth outlook (forecast earnings and demand growth, and the change in consensus over three '
      + 'months), valuation (P/E against its own history, and against its growth) and risk (volatility, largest fall, '
      + 'leverage). The best ' + shortlistSize + ' form the shortlist. Stage 2 adds, for the shortlist only, government and policy '
      + '(Budget allocation and how much of it was spent, scheme money disbursed, policy and trade measures), global and '
      + 'regional (global market growth, India\'s share, exports, the prices that drive the sector\'s profits), foreign '
      + 'portfolio flows, institutional ownership and the graded risks. Weights: ' + Object.keys(weights).map((k) => `${PILLAR_NAMES[k].toLowerCase()} ${weights[k]}`).join(', ')
      + '. Each measure is ranked among the sectors that have it; a pillar is the weighted mean of its measures\' ranks. '
      + 'Past performance and the outlook must be established; any other pillar that could not be counts as average (50). '
      + 'Where the research has no sector-wide figure, the application uses the bellwether companies\' own; an outlook taken '
      + 'from the past trend counts at half weight, and one company\'s past growth is capped at ±50% a year.',
  };
}

const sgn = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1);
function reasonOf(r, bench) {
  const bits = [];
  const bn = r.relativeTo || (bench && bench.name) || BENCHMARK;
  if (isNum(r.rel.y3)) bits.push(`${r.rel.y3 >= 0 ? 'beat' : 'trailed'} the ${bn} by ${Math.abs(r.rel.y3).toFixed(1)} points a year over three years`);
  else if (isNum(r.rel.y1)) bits.push(`${r.rel.y1 >= 0 ? 'beat' : 'trailed'} the ${bn} by ${Math.abs(r.rel.y1).toFixed(1)} points over a year`);
  else if (isNum(r.returns.y1)) bits.push(`${sgn(r.returns.y1)}% over a year`);
  if (isNum(r.returns.quartersBeat) && r.returns.quarters) bits.push(`ahead in ${r.returns.quartersBeat} of the last ${r.returns.quarters} quarters`);
  if (isNum(r.business.profitGrowth)) bits.push(r.business.lossBase
    ? `combined loss ${r.business.profitGrowth >= 0 ? 'narrowed' : 'widened'} by ${Math.abs(r.business.profitGrowth).toFixed(1)}% (${r.business.of.join(', ')})`
    : `profits ${sgn(r.business.profitGrowth)}%${r.business.from && r.business.from.profit === 'companies' ? ` across ${r.business.of.join(', ')}` : ' in the latest results'}`);
  if (isNum(r.outlook.earningsGrowth3y)) {
    const t = r.outlook.tier && r.outlook.tier.earnings;
    bits.push(t === 'past'
      ? `no forecast found, so earnings taken at their past growth of ${r.outlook.earningsGrowth3y.toFixed(1)}% a year (half weight)`
      : `earnings ${t === 'guidance' ? 'guided' : 'forecast'} to grow ${r.outlook.earningsGrowth3y.toFixed(1)}% a year${r.outlook.from && r.outlook.from.earnings === 'companies' ? (t === 'guidance' ? ' (median of the companies\' guidance)' : ' (median of the companies\' consensus)') : ''}`);
  }
  else if (isNum(r.outlook.demandGrowth3y)) bits.push(`demand forecast to grow ${r.outlook.demandGrowth3y.toFixed(1)}% a year`);
  if (isNum(r.outlook.revision)) bits.push(`consensus EPS ${r.outlook.revision >= 0 ? 'raised' : 'cut'} ${Math.abs(r.outlook.revision).toFixed(1)}% in three months`);
  if (isNum(r.valuation.pe) && isNum(r.valuation.history))
    bits.push(r.valuation.from === 'app'
      ? `P/E ${r.valuation.pe.toFixed(1)} against the companies' own five-year average of ${r.valuation.history.toFixed(1)}, worked out by the application`
      : `P/E ${r.valuation.pe.toFixed(1)} against its ${r.valuation.historyBasis || 'history'} of ${r.valuation.history.toFixed(1)}`);
  if (isNum(r.returns.maxDD)) bits.push(`largest fall in three years ${Math.abs(r.returns.maxDD).toFixed(1)}%`);
  if (r.neutral && r.neutral.length) bits.push(`${r.neutral.map((k) => PILLAR_NAMES[k].toLowerCase()).join(' and ')} not established, counted as average`);
  const s = bits.join('; ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + '.' : '';
}

/* ── What the report says about the ranking (build 34) ─────────────────
   Tejas, 26-11-2026: "all the selection work is currently done inside the
   application and user have very limited understanding of how ranking is
   done and why". These turn the score into things a reader can check: a
   stance, where each sector sits, why the near misses missed, how much the
   Top 3 depends on the weights, and how much of each score is evidence. */
export const STANCES = Object.freeze({ overweight: 'Overweight', neutral: 'Neutral', underweight: 'Underweight', none: 'Not rated' });

function weightsWith(base, key, delta) {
  const w = { ...base };
  const others = Object.keys(w).filter((k) => k !== key);
  const rest = others.reduce((a, k) => a + w[k], 0);
  const nk = Math.max(0, w[key] + delta);
  const scale = rest ? (100 - nk) / rest : 0;
  others.forEach((k) => { w[k] = w[k] * scale; });
  w[key] = nk;
  return w;
}

export function screenAnalysis(d, sc0) {
  const sc = sc0 || scoreFinder(d);
  const rows = sc.rows;
  const top = sc.top3.map((r) => r.name);
  const eligible = rows.filter((r) => r.eligible).sort((a, b) => (b.stage1Score - a.stage1Score));
  const quart = Math.max(1, Math.floor(eligible.length / 4));
  const under = new Set(eligible.slice(-quart).map((r) => r.name));
  const w = sc.weights || PILLAR_WEIGHTS;
  const out = { stance: {}, quadrant: {}, confidence: {}, whyNot: [], sensitivity: null };
  rows.forEach((r) => {
    out.stance[r.name] = top.includes(r.name) ? 'overweight' : r.shortlisted ? 'neutral' : under.has(r.name) ? 'underweight' : r.eligible ? 'neutral' : 'none';
    /* Past performance against the outlook, both percentiles: the standard
       sector-rotation view. */
    const x = r.parts.performance, y = r.parts.outlook;
    out.quadrant[r.name] = !isNum(x) || !isNum(y) ? null
      : x >= 50 && y >= 50 ? 'leading' : x < 50 && y >= 50 ? 'improving' : x >= 50 ? 'fading' : 'lagging';
    /* Confidence: how much of the score rests on figures found, checked
       returns, and an outlook that is a forecast rather than history. */
    /* A sector off the shortlist is never asked for the deep-dive measures,
       so they are not counted against it (build 34). */
    const ms = Object.values(MEASURES).flat().filter(([, , stage]) => r.shortlisted || stage === 1);
    const have = ms.filter(([m]) => isNum(r.sub[m])).length;
    const cover = ms.length ? have / ms.length : 0;
    const tier = r.outlook.tier || {};
    const forecast = tier.earnings === 'published' || tier.earnings === 'guidance';
    const pts = cover * 60 + (r.returns.checked ? 20 : 0) + (forecast ? 20 : tier.earnings === 'past' ? 8 : 0);
    out.confidence[r.name] = { level: pts >= 70 ? 'High' : pts >= 45 ? 'Medium' : 'Low', points: Math.round(pts),
      coverage: Math.round(cover * 100), checked: !!r.returns.checked, outlook: tier.earnings || '' };
  });
  /* Why the next three are not in the Top 3: the pillars where each trails
     the third by most, in points of score. */
  const third = sc.top3[2];
  if (third) {
    const off = new Set(arr(sc.review && sc.review.excluded));
    sc.shortlist.filter((r) => !top.includes(r.name) && !off.has(r.name)).slice(0, 3).forEach((r) => {
      const gaps = Object.keys(w).map((k) => ({ k, pts: isNum(third.parts[k]) && isNum(r.parts[k]) ? +((third.parts[k] - r.parts[k]) * w[k] / 100).toFixed(1) : 0 }))
        .sort((a, b) => b.pts - a.pts);
      out.whyNot.push({ name: r.name, rank: r.rank, behind: +(third.score - r.score).toFixed(1),
        trails: gaps.filter((g) => g.pts > 0).slice(0, 2), leads: gaps.filter((g) => g.pts < 0).sort((a, b) => a.pts - b.pts).slice(0, 1) });
    });
  }
  /* Sensitivity: every pillar's weight five points up and five down (the rest
     scaled to keep 100), and all seven equal. */
  if (d && top.length) {
    const variants = [];
    Object.keys(w).forEach((k) => { [5, -5].forEach((dl) => variants.push({ label: `${PILLAR_NAMES[k]} ${dl > 0 ? '+' : ''}${dl}`, w: weightsWith(w, k, dl) })); });
    const eq = {}; Object.keys(w).forEach((k) => { eq[k] = 100 / Object.keys(w).length; });
    variants.push({ label: 'All seven equal', w: eq });
    const res = variants.map((v) => ({ label: v.label, top3: scoreFinder(d, { weights: v.w }).top3.map((r) => r.name) }));
    /* Against the app's own Top 3: the reader's overrides are a separate
       matter, shown in their own section. */
    const appTop = sc.review && arr(sc.review.appTop3).length ? sc.review.appTop3 : top;
    const same = res.filter((x) => x.top3.length === appTop.length && x.top3.every((n) => appTop.includes(n))).length;
    const seen = {};
    res.forEach((x) => x.top3.forEach((n) => { seen[n] = (seen[n] || 0) + 1; }));
    out.sensitivity = { variants: res, same, of: res.length,
      holds: appTop.map((n) => ({ name: n, in: seen[n] || 0 })),
      entrants: Object.keys(seen).filter((n) => !appTop.includes(n)).map((n) => ({ name: n, in: seen[n] })).sort((a, b) => b.in - a.in) };
  }
  return out;
}

/* Every source the screen names, once. */
export function screenSources(d) {
  const out = new Map();
  const add = (src, what) => { const t = S(src); if (!t || t.length < 3) return; if (!out.has(t)) out.set(t, new Set()); out.get(t).add(what); };
  add(d && d.benchmark && d.benchmark.source, 'benchmark');
  add(d && d.macro && d.macro.source, 'macro backdrop');
  arr(d && d.sectors).forEach((r) => {
    if (!r) return;
    const n = S(r.name);
    ['returns', 'business', 'outlook', 'valuation'].forEach((k) => add(r[k] && r[k].source, `${n}: ${k}`));
    const dd = r.deepDive || {};
    add(dd.flows && dd.flows.source, `${n}: flows`); add(dd.global && dd.global.source, `${n}: global`);
    arr(dd.schemes).forEach((x) => add(x && x.source, `${n}: schemes`));
    arr(dd.targets).forEach((x) => add(x && x.source, `${n}: targets`));
    arr(dd.drivers).forEach((x) => add(x && x.source, `${n}: drivers`));
    bwOf(r).forEach((b) => {
      add(b.quarter && b.quarter.source, `${n}: results`); add(b.epsSource, `${n}: EPS`);
      add(b.forecast && b.forecast.source, `${n}: estimates`); add(b.guidance && b.guidance.source, `${n}: guidance`);
    });
  });
  return [...out.entries()].map(([source, w]) => ({ source, for: [...w] })).sort((a, b) => b.for.length - a.for.length);
}

/* ── Two screens compared ─────────────────────────────────────────────── */
export function compareScreens(prev, cur) {
  if (!prev || !cur) return null;
  const pr = {}; arr(prev.rows).forEach((r) => { pr[nameKey(r.name)] = r; });
  const rows = arr(cur.rows).map((r) => {
    const p = pr[nameKey(r.name)];
    return { name: r.name, rankThen: p ? p.rank : null, rankNow: r.rank,
      scoreThen: p ? p.score : null, scoreNow: r.score,
      move: p && isNum(p.rank) ? p.rank - r.rank : null,
      /* Build 35: each pillar's change of rank, and the largest, so the
         reader sees why a sector moved. */
      pillars: p ? Object.fromEntries(Object.keys(PILLAR_WEIGHTS).filter((k) => isNum(r.parts && r.parts[k]) && isNum(p.parts && p.parts[k])
        && !arr(r.neutral).includes(k) && !arr(p.neutral).includes(k)).map((k) => [k, +(r.parts[k] - p.parts[k]).toFixed(1)])) : {} };
  });
  rows.forEach((x) => {
    const e = Object.entries(x.pillars).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    x.biggest = e && Math.abs(e[1]) >= 0.5 ? { k: e[0], d: e[1] } : null;
  });
  const names = (x) => arr(x.top3).map((r) => r.name);
  const was = names(prev), now = names(cur);
  return { rows, entered: now.filter((n) => !was.includes(n)), left: was.filter((n) => !now.includes(n)),
    stayed: now.filter((n) => was.includes(n)) };
}


/* ── Build 35: the reader's own weights, review and track record ──────────
   Tejas, 26-11-2026: "there is no human judgement or review on what and why
   application has selected." The weights can be set; a sector can be taken
   out of the Top 3 or put into it, always with a note; the Top 3 is approved
   before its companies are researched; and every screen's picks are followed
   afterwards against the Nifty 500. */

/* Seven weights of 0 or more, scaled to add to 100. Anything else gives the
   defaults back. */
export function normWeights(w) {
  const keys = Object.keys(PILLAR_WEIGHTS);
  if (!w || typeof w !== 'object') return { ...PILLAR_WEIGHTS };
  const v = keys.map((k) => Number(w[k]));
  if (v.some((x) => !Number.isFinite(x) || x < 0)) return { ...PILLAR_WEIGHTS };
  const sum = v.reduce((a, x) => a + x, 0);
  if (!(sum > 0)) return { ...PILLAR_WEIGHTS };
  const out = {}; keys.forEach((k, i) => { out[k] = +(v[i] * 100 / sum).toFixed(4); });
  return out;
}
export function weightsAreDefault(w) {
  return Object.keys(PILLAR_WEIGHTS).every((k) => Math.abs((w && w[k]) - PILLAR_WEIGHTS[k]) < 0.01);
}

/* The reader's review laid over the app's ranking. An override needs a note;
   one without is ignored and listed. "exclude" takes a sector out of the Top
   3; "include" puts a ranked sector into it, ahead of the app's picks. The
   app's own Top 3 is kept beside the result. */
export function applyReview(sc, review) {
  if (!sc) return sc;
  const rv = review && typeof review === 'object' ? review : {};
  const byName = {}; arr(sc.rows).forEach((r) => { byName[nameKey(r.name)] = r; });
  const valid = [], ignored = [];
  arr(rv.overrides).forEach((o) => {
    if (!o || !byName[nameKey(o.name)] || !['exclude', 'include'].includes(o.action)) return;
    if (S(o.note).length < 3) { ignored.push({ ...o, why: 'no note' }); return; }
    if (o.action === 'include' && !byName[nameKey(o.name)].eligible) { ignored.push({ ...o, why: 'not ranked' }); return; }
    valid.push({ name: byName[nameKey(o.name)].name, action: o.action, note: S(o.note), at: o.at || null });
  });
  /* The last word on a sector stands. */
  const last = {}; valid.forEach((o) => { last[nameKey(o.name)] = o; });
  const ov = Object.values(last);
  const excluded = ov.filter((o) => o.action === 'exclude').map((o) => o.name);
  const included = ov.filter((o) => o.action === 'include').map((o) => byName[nameKey(o.name)]).sort((a, b) => a.rank - b.rank);
  const appTop3 = arr(sc.top3).map((r) => r.name);
  const pool = arr(sc.shortlist).length ? sc.shortlist : arr(sc.rows).filter((r) => r.eligible);
  const take = [...included, ...pool.filter((r) => !excluded.includes(r.name) && !included.includes(r))];
  const top3 = [];
  take.forEach((r) => { if (top3.length < 3 && !top3.includes(r)) top3.push(r); });
  const finalNames = top3.map((r) => r.name);
  const changed = finalNames.length !== appTop3.length || finalNames.some((n, i) => n !== appTop3[i]);
  const ap = rv.approved && arr(rv.approved.top3).length ? rv.approved : null;
  const approvedNow = !!ap && ap.top3.length === finalNames.length && ap.top3.every((n, i) => nameKey(n) === nameKey(finalNames[i]));
  return { ...sc, top3, review: { appTop3, overrides: ov, ignored, excluded, changed,
    approved: ap ? { at: ap.at || null, top3: ap.top3.slice(), current: approvedNow, by: S(ap.by) } : null } };
}

/* Each past screen's Top 3, followed since: the change of the sector's
   strength against the Nifty 500 (its monthly ratio to the index, from the
   app's price check) from the screen's date to the latest month. */
export function trackRecord(history, sc) {
  const rs = {}; arr(sc && sc.rows).forEach((r) => { if (arr(r.returns && r.returns.rs).length) rs[nameKey(r.name)] = r.returns.rs; });
  const t = (x) => { const v = typeof x === 'number' ? x : Date.parse(x); return Number.isFinite(v) ? v : null; };
  return arr(history).filter((h) => h && arr(h.top3).length && t(h.asOf) != null)
    .sort((a, b) => t(a.asOf) - t(b.asOf))
    .map((h) => {
      const at = t(h.asOf);
      const picks = h.top3.map((name) => {
        const s = rs[nameKey(name)];
        if (!s) return { name, rel: null, months: null };
        const pts = s.map((p) => ({ t: t(p.date), v: p.v })).filter((p) => p.t != null && isNum(p.v)).sort((a, b) => a.t - b.t);
        const base = pts.filter((p) => p.t <= at).pop();
        const end = pts[pts.length - 1];
        if (!base || !end || end.t <= base.t) return { name, rel: null, months: null };
        return { name, rel: +((end.v / base.v - 1) * 100).toFixed(1), months: Math.round((end.t - base.t) / (30.44 * 864e5)) };
      });
      const got = picks.filter((p) => isNum(p.rel));
      return { asOf: h.asOf, approved: !!h.approved, picks,
        average: got.length ? +(got.reduce((a, p) => a + p.rel, 0) / got.length).toFixed(1) : null,
        ahead: got.filter((p) => p.rel > 0).length, of: got.length };
    });
}
