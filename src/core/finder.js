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

export const FINDER_WEIGHTS = Object.freeze({ momentum: 35, business: 20, outlook: 35, valuation: 10 });
export const FINDER_LINE = 'F|screen';
export const BENCHMARK = 'Nifty 50';
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
  'nifty 50': 'Nifty 50', 'nifty bank': 'Nifty Bank', 'nifty it': 'Nifty IT', 'nifty pharma': 'Nifty Pharma',
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
  return Array.isArray(d.sectors) && !arr(d.companies).length && !d.macro && !d.shortlist;
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
      if (isO(b.forecast)) {
        const fo = b.forecast;
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
how the sector has done over the last 3 months, 6 months and 1 year, what is
behind that in the businesses themselves, and how it is expected to grow over
the next three years.
${upd}
NUMBERS ARE NUMBERS. Write 12.5, not "12.5%", "12.5 percent" or "12-13". A
range is its midpoint. A P/E is 22.4, not "22.4x".

YOU DO NOT RANK THE SECTORS AND YOU DO NOT PICK THE BEST ONES.
The application scores and ranks every sector from the figures you return:
past momentum against the Nifty 50 (35%), business momentum over the last four
quarters (20%), the three-year outlook (35%) and valuation against the
sector's own history (10%). Your job is to get each figure right, dated and
sourced. A sector without its returns or its outlook cannot be ranked among
the leaders, and a missing business or valuation figure is counted as merely
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
  returns       the index's price return over the last 3 months ("m3"),
                6 months ("m6") and 1 year ("y1") to the latest close, in
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
                  forecast  its consensus forecast: annual EPS growth
                            ("epsGrowth3y") and revenue growth
                            ("revenueGrowth3y") over the next three years
                            (Trendlyne forecaster, MarketScreener,
                            Moneycontrol estimates; else its own guidance).
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
                where there is none, send each bellwether's "forecast" and
                the application takes their median. Tailwinds and risks can
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

And the benchmark: the Nifty 50's return over the same three periods, to the
same close.

THE SECTORS (${FINDER_SECTORS.length})

${list}

HOW TO SEND IT

Return ONE fenced code block tagged json, as the last thing in your reply:

\`\`\`json
{"schema":"equity-analyst/5","run":{"kind":"sectorScreen", ... },"benchmark":{ ... },"sectors":[ ... ]}
\`\`\`

  1. Put the JSON on ONE LINE, minified, so it renders as a single box with a
     copy button.
  2. Put "schema" first.
  3. Nothing after the closing fence.

If your interface cannot render a code block, wrap the object in a line
reading <<<EQUITY-ANALYST-DATA before it and >>>EQUITY-ANALYST-DATA after it.

If it will not all fit in one reply, send as many sectors as fit, in the
order listed, end the block cleanly and say CONTINUE. The application asks for
the rest in a follow-up and adds them to what you sent.

THE JSON (shown laid out here; send it minified)

{
  "schema": "equity-analyst/5",
  "run": {
    "kind": "sectorScreen",
    "schemaVersion": "5.0.0",
    "generatedAt": "ISO 8601 timestamp",
    "tool": "the name of the AI tool producing this payload",
    "searchesRun": 0,
    "researchNotes": "what you could and could not establish, and why",
    "searchLog": [ { "path": "sectors[Banking].valuation.pe5yAvg", "searched": ["source tried"], "reason": "why it could not be established" } ]
  },
  "benchmark": { "name": "${BENCHMARK}", "returns": { "m3": 0, "m6": 0, "y1": 0 }, "asOf": "DD-MM-YYYY", "source": "" },
  "sectors": [
    {
      "name": "Banking",
      "subSector": "Public sector banks",
      "index": "Nifty Bank",
      "returns": { "m3": 0, "m6": 0, "y1": 0, "asOf": "DD-MM-YYYY", "basis": "index", "source": "" },
      "bellwethers": [ { "symbol": "SBIN", "name": "State Bank of India",
                         "quarter": { "period": "Q2 FY27", "revenue": 0, "revenuePrev": 0, "profit": 0, "profitPrev": 0, "source": "" },
                         "eps": [ { "fy": "FY26", "eps": 0 } ], "epsTtm": 0, "epsSource": "",
                         "forecast": { "epsGrowth3y": 0, "revenueGrowth3y": 0, "years": "FY26 to FY29", "analysts": 0, "source": "" } } ],
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

/* ── What is missing ──────────────────────────────────────────────────── */
/* Returned as plain findings; completeness.js turns them into checks, so the
   depth box, the search record and the follow-up work for the screen exactly
   as they do for a sector study. */
export function finderChecks(d0) {
  const d = d0 && typeof d0 === 'object' ? JSON.parse(JSON.stringify(d0)) : d0;
  if (d) normaliseFinder(d);
  const ver = (d && d.verified && d.verified.sectors) || {};
  const out = [];
  const add = (group, label, have, want, ask, detail, appOnly) => out.push({ group, label, have, want, ask, detail, appOnly: !!appOnly });
  const rows = arr(d && d.sectors).filter((x) => x && S(x.name));
  const have = FINDER_SECTORS.filter((s) => rows.some((r) => nameKey(r.name) === nameKey(s)));
  const absent = FINDER_SECTORS.filter((s) => !have.includes(s));
  add('The screen', 'Sectors screened', have.length, FINDER_SECTORS.length,
    `sectors — every sector in the list must be screened. Missing: ${absent.join(', ')}. Send each with all its blocks.`,
    absent.join(', '));
  const b = (d && d.benchmark && d.benchmark.returns) || {};
  const bMiss = ['m3', 'm6', 'y1'].filter((k) => !real(b[k]));
  add('The screen', 'Nifty 50 returns over 3 months, 6 months and 1 year', 3 - bMiss.length, 3,
    `benchmark.returns — the Nifty 50's price return over ${bMiss.join(', ')} to the latest close, with "asOf" and "source".`,
    bMiss.join(', '));
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
      if (v && isNum(v.y1)) return;
      const g = lacks(r.returns, ['m3', 'm6', 'y1']);
      if (!g.length) return;
      const measurable = S(r.index) || SECTOR_INDEX[FINDER_SECTORS.find((x) => nameKey(x) === nameKey(r.name))]
        || bwOf(r).length >= 2;
      (measurable && !failed.has(nameKey(r.name)) ? appsJob : miss).push(`${S(r.name)} (${g.join(', ')})`);
    });
    const gaps = miss.length + appsJob.length;
    add('Every sector', 'Returns over 3 months, 6 months and 1 year', rows.length - gaps, rows.length,
      'sectors.returns — the sector index\'s return over 3 months ("m3"), 6 months ("m6") and 1 year ("y1"), with "asOf" and "source".'
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
  need('Three-year outlook: earnings and demand growth', 'sectors.bellwethers.forecast',
    (r) => { const o = eff(r).outlook; const g = [].concat(isNum(o.earningsGrowth3y) ? [] : ['earnings'], isNum(o.demandGrowth3y) ? [] : ['demand']);
      return g.length ? [`${g.join(' and ')}: the consensus forecasts of ${syms(r) || 'its bellwethers'}`] : []; },
    'where no sector forecast is published, send EACH bellwether\'s own consensus forecast under sectors[].bellwethers[].forecast: { "epsGrowth3y" (forecast annual EPS growth over the next three years), "revenueGrowth3y" (forecast annual revenue growth), "years": "FY26 to FY29", "analysts" (how many), "source" }. Trendlyne\'s forecaster, MarketScreener\'s consensus and Moneycontrol\'s estimates publish these for listed companies; where no analyst covers a company, its own guidance from the latest earnings call, named as such in "source". The application takes the median across the companies.');
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
    const ask = [], app = [];
    rows.forEach((r) => {
      if (isNum(eff(r).valuation.ratio)) return;
      if (bwOf(r).some(canPrice) && !(ran && vfailed.has(nameKey(r.name)))) app.push(S(r.name));
      else ask.push(`${S(r.name)} (EPS history of ${syms(r) || 'its bellwethers'})`);
    });
    add('Every sector', 'P/E against its own history', rows.length - ask.length - app.length, rows.length,
      'sectors.bellwethers.eps — the sector index\'s trailing "pe" and its five-year average "pe5yAvg" where the index factsheet publishes both. Where it does not (no index, or a series under three years old), do NOT look for P/E averages: send EACH bellwether\'s earnings per share, consolidated and diluted, for each of the last five financial years and the trailing twelve months, under sectors[].bellwethers[]: "eps": [ { "fy": "FY26", "eps": 0 }, … ], "epsTtm": 0, "epsSource". Every annual report and results filing states it. The application works out each company\'s P/E history from its own price feed.'
      + (ask.length ? ` Missing: ${ask.join('; ')}.` : '')
      + (app.length ? ` Not needed for ${app.join(', ')}: the application works these out from the EPS already sent.` : ''),
      ask.concat(app.map((n) => `${n} (the app works it out from prices and EPS)`)).join('; '),
      !ask.length && app.length > 0);
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
export async function verifyReturns(d, { fetchBars, keyFor, now = new Date() } = {}) {
  const result = { at: now.toISOString(), benchmark: null, sectors: {}, failed: [] };
  if (!d || typeof fetchBars !== 'function') return result;
  d = JSON.parse(JSON.stringify(d)); normaliseFinder(d);
  const tryKeys = async (keys) => {
    for (const k of keys) {
      try {
        const r = returnsFromBars(await fetchBars(k));
        if (r && isNum(r.y1)) return { ...r, key: k };
      } catch (e) { /* the next name */ }
    }
    return null;
  };
  /* A stock counts with 3- and 6-month returns even if it has no year yet. */
  const tryStock = async (k) => {
    try { const rr = returnsFromBars(await fetchBars(k)); return rr && isNum(rr.m6) ? { ...rr, key: k } : null; } catch (e) { return null; }
  };
  const bench = await tryKeys(indexKeys(S(d.benchmark && d.benchmark.name) || BENCHMARK).concat(indexKeys(BENCHMARK)));
  if (bench) result.benchmark = { ...bench, basis: 'index', of: BENCHMARK };
  /* Six sectors at a time (build 30): 41 sectors, some with five stocks each,
     one request after another took over a minute on a phone. */
  const one = async (r) => {
    if (!r || !S(r.name)) return;
    const names = [S(r.index), SECTOR_INDEX[FINDER_SECTORS.find((s) => nameKey(s) === nameKey(r.name))]].filter(Boolean);
    let got = await tryKeys([...new Set(names.flatMap(indexKeys))]);
    if (got) { result.sectors[nameKey(r.name)] = { ...got, basis: 'index', of: got.key.split('|')[1] }; return; }
    /* The bellwethers, equally weighted. Two at least, or it is one company. */
    const picks = arr(r.bellwethers).filter((x) => x && S(x.symbol)).slice(0, 5);
    const each = [];
    await Promise.all(picks.map(async (p) => {
      const key = typeof keyFor === 'function' ? keyFor(S(p.symbol), S(p.isin)) : null;
      if (!key) return;
      const got1 = await tryStock(key);
      if (got1 && isNum(got1.m3) && isNum(got1.m6)) each.push({ sym: S(p.symbol), ...got1 });
    }));
    each.sort((a, b) => picks.findIndex((p) => S(p.symbol) === a.sym) - picks.findIndex((p) => S(p.symbol) === b.sym));
    if (each.length >= 2) {
      /* Each period over the stocks that have it: a stock listed under a year
         ago (Pine Labs, LG Electronics India in the 22-11 run) has no 1-year
         return and must not turn the average into "not a number". */
      const avg = (k) => { const xs = each.filter((x) => isNum(x[k])); return xs.length >= 2 ? +(xs.reduce((a, x) => a + x[k], 0) / xs.length).toFixed(2) : null; };
      result.sectors[nameKey(r.name)] = { m3: avg('m3'), m6: avg('m6'), y1: avg('y1'),
        asOf: each.map((x) => x.asOf).sort().pop(), basis: 'basket', of: each.map((x) => x.sym).join(', ') };
    } else result.failed.push(S(r.name));
  };
  const list = arr(d.sectors).slice();
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(one));
  result.failed.sort((a, b) => FINDER_SECTORS.indexOf(a) - FINDER_SECTORS.indexOf(b));
  /* Build 31. Valuation from the companies: for a sector whose research has
     no P/E history, each bellwether that sent three years of EPS or more is
     priced month by month over five years from its own price feed. The
     sector is the median of its companies: their P/E now, their own
     five-year average, and how far each stands from its own average. */
  result.valuation = {}; result.valuationFailed = [];
  const priceOne = async (b) => {
    const key = typeof keyFor === 'function' ? keyFor(S(b.symbol), S(b.isin)) : null;
    if (!key) return null;
    try {
      const h = peHistory(await fetchBars(key, { unit: 'months', interval: 1, years: 6 }), b.eps, b.epsTtm);
      /* A P/E under 1 or over 1,000 is not a valuation: the EPS was sent in
         another unit (paise, lakh) or for another company. Left out. */
      const sane = (v) => isNum(v) && v >= 1 && v <= 1000;
      return h && sane(h.pe) && sane(h.avg) ? { sym: S(b.symbol), ...h, ratio: h.pe / h.avg } : null;
    } catch (e) { return null; }
  };
  const valOne = async (r) => {
    if (!r || !S(r.name) || toolHistory(r.valuation) && real(r.valuation && r.valuation.pe)) return;
    const picks = bwOf(r).filter(canPrice).slice(0, 5);
    if (!picks.length) return;
    const got = (await Promise.all(picks.map(priceOne))).filter(Boolean);
    got.sort((a, b) => picks.findIndex((p) => S(p.symbol) === a.sym) - picks.findIndex((p) => S(p.symbol) === b.sym));
    if (!got.length) { result.valuationFailed.push(S(r.name)); return; }
    result.valuation[nameKey(r.name)] = { pe: r2(medianOf(got.map((x) => x.pe))), history: r2(medianOf(got.map((x) => x.avg))),
      ratio: +medianOf(got.map((x) => x.ratio)).toFixed(3), of: got.map((x) => x.sym).join(', '),
      companies: got.map((x) => ({ symbol: x.sym, pe: x.pe, avg: x.avg, months: x.months })), asOf: got.map((x) => x.asOf).sort().pop() };
  };
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(valOne));
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
  if ((m = /(\d{4})\s*[-–\/]\s*(\d{2,4})/.exec(t))) y = Number(m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]);
  else if ((m = /FY\s*'?(\d{4}|\d{2})\b/i.exec(t))) y = Number(m[1].length === 2 ? '20' + m[1] : m[1]);
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

/* The median of the companies' consensus forecasts. */
export function companyOutlook(r) {
  const fs = bwOf(r).map((b) => ({ sym: S(b.symbol), f: (b.forecast && typeof b.forecast === 'object') ? b.forecast : {} }));
  const e = fs.filter((x) => isNum(x.f.epsGrowth3y)), g = fs.filter((x) => isNum(x.f.revenueGrowth3y));
  return { earningsGrowth3y: e.length ? r2(medianOf(e.map((x) => x.f.epsGrowth3y))) : null,
    demandGrowth3y: g.length ? r2(medianOf(g.map((x) => x.f.revenueGrowth3y))) : null,
    of: [...new Set(e.concat(g).map((x) => x.sym))], years: S((e[0] || g[0] || { f: {} }).f.years) };
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
    outlook: { earningsGrowth3y: eg, demandGrowth3y: dg, from: { earnings: egF, demand: dgF }, of: co.of, years: S(ol.years) || co.years },
    valuation,
  };
}

/* ── Scoring ──────────────────────────────────────────────────────────── */
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
/* parts: [value, weight, required?]. Missing optional sub-parts are left out
   and the rest re-weighted; a missing required one leaves the part empty. */
/* (kept for reference: the build-29 composite) */
export const mix = (parts) => {
  if (parts.some(([v, , req]) => req && !isNum(v))) return null;
  const ok = parts.filter(([v]) => isNum(v));
  if (!ok.length) return null;
  return ok.reduce((a, [v, w]) => a + v * w, 0) / ok.reduce((a, [, w]) => a + w, 0);
};
/* The parts a sector cannot do without, and those counted as average when
   absent. */
export const CORE_PARTS = Object.freeze(['momentum', 'outlook']);
export const NEUTRAL_PARTS = Object.freeze(['business', 'valuation']);

export function scoreFinder(d0) {
  /* Saved screens that predate a reading rule are read with today's rules,
     on a copy, so the saved reply itself is never changed by scoring. */
  const d = d0 && typeof d0 === 'object' ? JSON.parse(JSON.stringify(d0)) : d0;
  if (d) normaliseFinder(d);
  const ver = (d && d.verified) || {};
  const bTool = (d && d.benchmark && d.benchmark.returns) || {};
  const benchTool = { m3: real(bTool.m3) ? bTool.m3 : null, m6: real(bTool.m6) ? bTool.m6 : null, y1: real(bTool.y1) ? bTool.y1 : null,
    checked: false, asOf: S(d && d.benchmark && d.benchmark.asOf) };
  const benchApp = ver.benchmark && isNum(ver.benchmark.y1)
    ? { m3: ver.benchmark.m3, m6: ver.benchmark.m6, y1: ver.benchmark.y1, checked: true, asOf: ver.benchmark.asOf }
    : benchTool;
  const bench = benchApp;
  const rows = arr(d && d.sectors).filter((r) => r && S(r.name)).map((r) => {
    const v = (ver.sectors || {})[nameKey(r.name)];
    const t = r.returns || {};
    const ret = v && isNum(v.y1)
      ? { m3: v.m3, m6: v.m6, y1: v.y1, checked: true, basis: v.basis, of: v.of, asOf: v.asOf,
          tool: { m3: t.m3, m6: t.m6, y1: t.y1 } }
      : { m3: real(t.m3) ? t.m3 : null, m6: real(t.m6) ? t.m6 : null, y1: real(t.y1) ? t.y1 : null,
          checked: false, basis: S(t.basis) || 'stated by the research', of: S(r.index), asOf: S(t.asOf) };
    /* Build 30: a return the app measured is set against the Nifty 50 as the
       app measured it, to the same close; a return the research stated is set
       against the Nifty 50 as the research stated it. Mixing the two compared
       an October close with a November one (the 22-11-2026 run used month-end
       dashboards to 31-10-2026). */
    const bm = ret.checked ? benchApp : benchTool;
    const rel = {};
    ['m3', 'm6', 'y1'].forEach((k) => { rel[k] = isNum(ret[k]) && isNum(bm[k]) ? +(ret[k] - bm[k]).toFixed(2) : null; });
    const base = isNum(bm.y1) ? rel : ret;
    const bz = r.business || {}, ol = r.outlook || {}, va = r.valuation || {};
    /* Build 31: the research's sector figure first, the companies' own
       figures where it has none. */
    const ef = effective(r, ver);
    const eb = ef.business, eo = ef.outlook, ev = ef.valuation;
    return {
      name: S(r.name), short: SHORT_NAMES[FINDER_SECTORS.find((x) => nameKey(x) === nameKey(r.name))] || S(r.name),
      subSector: S(r.subSector), index: S(r.index), why: S(r.why),
      returns: ret, rel,
      business: { revenueGrowth: eb.revenueGrowth, profitGrowth: eb.profitGrowth, period: eb.period, source: S(bz.source),
        from: eb.from, lossBase: eb.lossBase, of: eb.of },
      outlook: { earningsGrowth3y: eo.earningsGrowth3y, demandGrowth3y: eo.demandGrowth3y, years: eo.years,
        tailwinds: arr(ol.tailwinds).map(S).filter(Boolean), risks: arr(ol.risks).map(S).filter(Boolean), source: S(ol.source),
        from: eo.from, of: eo.of },
      valuation: { pe: ev.pe, pe5yAvg: real(va.pe5yAvg) && ev.from === 'research' ? va.pe5yAvg : null,
        history: ev.history, historyBasis: ev.historyBasis, ratio: ev.ratio, from: ev.from,
        asOf: S(va.asOf), source: S(va.source) },
      sub: {
        m3: base.m3, m6: base.m6, y1: base.y1,
        profit: eb.profitGrowth, revenue: eb.revenueGrowth,
        earnings: eo.earningsGrowth3y, demand: eo.demandGrowth3y,
      },
    };
  });
  rows.forEach((r) => { r.sub.cheap = isNum(r.valuation.ratio) ? -r.valuation.ratio : null; });
  /* Build 30. Each measure is ranked among the sectors on its own, and a
     part is the weighted mean of its measures' percentiles. Ranking the
     measures separately keeps unlike scales apart: a 9% demand forecast is
     not set against a 30% earnings forecast. A part needs its required
     measure (the 1-year return) or, where none is required, any one. */
  const SUB = {
    momentum: [['m3', MOMENTUM_MIX.m3], ['m6', MOMENTUM_MIX.m6], ['y1', MOMENTUM_MIX.y1, true]],
    business: [['profit', 0.6], ['revenue', 0.4]],
    outlook: [['earnings', 0.6], ['demand', 0.4]],
    valuation: [['cheap', 1, true]],
  };
  const pct = {};
  Object.values(SUB).flat().forEach(([m]) => { if (!pct[m]) pct[m] = percentiles(rows.map((r) => r.sub[m])); });
  rows.forEach((r, i) => {
    r.parts = {};
    r.partial = [];
    Object.keys(SUB).forEach((part) => {
      const ms = SUB[part];
      if (ms.some(([m, , req]) => req && !isNum(pct[m][i]))) { r.parts[part] = null; return; }
      const got = ms.filter(([m]) => isNum(pct[m][i]));
      if (!got.length) { r.parts[part] = null; return; }
      if (got.length < ms.length) r.partial.push(part);
      r.parts[part] = +(got.reduce((a, [m, w]) => a + pct[m][i] * w, 0) / got.reduce((a, [, w]) => a + w, 0)).toFixed(1);
    });
  });
  rows.forEach((r) => {
    r.missingParts = Object.keys(FINDER_WEIGHTS).filter((k) => !isNum(r.parts[k]));
    /* Business and valuation, when absent, count as average. */
    r.neutral = r.missingParts.filter((k) => NEUTRAL_PARTS.includes(k));
    r.neutral.forEach((k) => { r.parts[k] = 50; });
    const have = Object.keys(FINDER_WEIGHTS).filter((k) => isNum(r.parts[k]));
    const w = have.reduce((a, k) => a + FINDER_WEIGHTS[k], 0);
    r.score = w ? +(have.reduce((a, k) => a + r.parts[k] * FINDER_WEIGHTS[k], 0) / w).toFixed(1) : null;
    r.complete = !r.missingParts.length;
    r.eligible = CORE_PARTS.every((k) => !r.missingParts.includes(k));
  });
  rows.sort((a, b) => (Number(b.eligible) - Number(a.eligible))
    || ((isNum(b.score) ? b.score : -1) - (isNum(a.score) ? a.score : -1)) || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; r.reason = reasonOf(r, bench); });
  const top3 = rows.filter((r) => r.eligible).slice(0, 3);
  return {
    benchmark: bench, rows, top3,
    counts: { screened: rows.length, complete: rows.filter((r) => r.complete).length,
      eligible: rows.filter((r) => r.eligible).length, neutral: rows.filter((r) => r.neutral.length).length,
      checked: rows.filter((r) => r.returns.checked).length, listed: FINDER_SECTORS.length },
    weights: FINDER_WEIGHTS, mix: MOMENTUM_MIX,
    basis: 'Each part is a percentile among the sectors screened: past momentum from the 3-month, '
      + '6-month and 1-year returns against the Nifty 50 (weighted 25, 35 and 40); business momentum from '
      + 'profit and sales growth over the last four quarters (60 and 40); the three-year outlook from forecast '
      + 'earnings and demand growth (60 and 40); valuation from the P/E against its own five-year average (or, where '
      + 'the index is younger, its five-year or long-run median), cheaper scoring higher. Where the research has no '
      + 'sector-wide figure, the application uses the bellwether companies\' own: their sales and profit summed, the '
      + 'median of their consensus forecasts, and each company\'s P/E history worked out from its prices and EPS. Each measure is ranked on '
      + 'its own and a part is the weighted mean of its measures\' ranks; a part with one measure missing uses the other. Past momentum and the outlook must be established for a sector to be ranked '
      + 'among the leaders; business momentum or valuation that could not be established counts as average '
      + '(the 50th percentile), neither reward nor penalty.',
  };
}

const sgn = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1);
function reasonOf(r, bench) {
  const bits = [];
  if (isNum(r.rel.y1)) bits.push(`${r.rel.y1 >= 0 ? 'beat' : 'trailed'} the ${BENCHMARK} by ${Math.abs(r.rel.y1).toFixed(1)} points over a year`);
  else if (isNum(r.returns.y1)) bits.push(`${sgn(r.returns.y1)}% over a year`);
  if (isNum(r.business.profitGrowth)) bits.push(r.business.lossBase
    ? `combined loss ${r.business.profitGrowth >= 0 ? 'narrowed' : 'widened'} by ${Math.abs(r.business.profitGrowth).toFixed(1)}% (${r.business.of.join(', ')})`
    : `profits ${sgn(r.business.profitGrowth)}%${r.business.from && r.business.from.profit === 'companies' ? ` across ${r.business.of.join(', ')}` : ' over four quarters'}`);
  if (isNum(r.outlook.earningsGrowth3y)) bits.push(`earnings forecast to grow ${r.outlook.earningsGrowth3y.toFixed(1)}% a year${r.outlook.from && r.outlook.from.earnings === 'companies' ? ' (median of the companies\' consensus)' : ''}`);
  else if (isNum(r.outlook.demandGrowth3y)) bits.push(`demand forecast to grow ${r.outlook.demandGrowth3y.toFixed(1)}% a year`);
  if (isNum(r.valuation.pe) && isNum(r.valuation.pe5yAvg)) bits.push(`P/E ${r.valuation.pe.toFixed(1)} against a five-year average of ${r.valuation.pe5yAvg.toFixed(1)}`);
  void bench;
  if (r.neutral && r.neutral.length) bits.push(`${r.neutral.join(' and ')} not established, counted as average`);
  if (r.valuation && r.valuation.historyBasis && r.valuation.historyBasis !== 'five-year average' && isNum(r.valuation.history))
    bits.push(r.valuation.from === 'app'
      ? `P/E ${isNum(r.valuation.pe) ? r.valuation.pe.toFixed(1) + ' ' : ''}against the companies' own five-year average of ${r.valuation.history.toFixed(1)}, worked out by the application`
      : `P/E set against its ${r.valuation.historyBasis} of ${r.valuation.history.toFixed(1)}`);
  const s = bits.join('; ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + '.' : '';
}

/* ── Two screens compared ─────────────────────────────────────────────── */
export function compareScreens(prev, cur) {
  if (!prev || !cur) return null;
  const pr = {}; arr(prev.rows).forEach((r) => { pr[nameKey(r.name)] = r; });
  const rows = arr(cur.rows).map((r) => {
    const p = pr[nameKey(r.name)];
    return { name: r.name, rankThen: p ? p.rank : null, rankNow: r.rank,
      scoreThen: p ? p.score : null, scoreNow: r.score,
      move: p && isNum(p.rank) ? p.rank - r.rank : null };
  });
  const names = (x) => arr(x.top3).map((r) => r.name);
  const was = names(prev), now = names(cur);
  return { rows, entered: now.filter((n) => !was.includes(n)), left: was.filter((n) => !now.includes(n)),
    stayed: now.filter((n) => was.includes(n)) };
}
