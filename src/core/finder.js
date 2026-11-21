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
 * a sector stands against the others today, not against a fixed bar. A sector
 * missing a part ranks below every sector that has all four, however high it
 * scores, because it cannot be compared (the same rule as the company screen).
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
YOU DO NOT RANK THE SECTORS AND YOU DO NOT PICK THE BEST ONES.
The application scores and ranks every sector from the figures you return:
past momentum against the Nifty 50 (35%), business momentum over the last four
quarters (20%), the three-year outlook (35%) and valuation against the
sector's own history (10%). Your job is to get each figure right, dated and
sourced. A sector missing a figure ranks below every complete one, so a
missing figure costs that sector its place.

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
                companies, and say so in "basis".
  bellwethers   the 3 to 5 largest NSE-listed companies in the sector, each
                with its NSE symbol. The application fetches their prices
                itself to check the returns.
  business      year-on-year growth of the sector's listed companies in
                aggregate: "revenueGrowth" and "profitGrowth" (net profit),
                over the last four reported quarters, with "period" (e.g.
                "four quarters to Q2 FY27 against the year before"), "basis"
                (which companies are included) and "source".
  outlook       "earningsGrowth3y" — forecast annual earnings growth over the
                next three years; "demandGrowth3y" — forecast annual growth of
                the industry's demand or revenue over the same years; "years"
                (e.g. "FY26 to FY29"); at least TWO "tailwinds" and TWO
                "risks", each a sentence with a figure where there is one;
                and "source" (a brokerage or rating-agency sector outlook, an
                industry body, a government projection), with its date.
  valuation     the sector index's trailing P/E ("pe") and its five-year
                average ("pe5yAvg"), with "asOf" and "source" (the NSE index
                factsheet gives both).
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
      "bellwethers": [ { "symbol": "SBIN", "name": "State Bank of India" } ],
      "business": { "revenueGrowth": 0, "profitGrowth": 0, "period": "", "basis": "", "source": "" },
      "outlook": { "earningsGrowth3y": 0, "demandGrowth3y": 0, "years": "FY26 to FY29",
                   "tailwinds": [""], "risks": [""], "source": "" },
      "valuation": { "pe": 0, "pe5yAvg": 0, "asOf": "DD-MM-YYYY", "source": "" },
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
export function finderChecks(d) {
  const out = [];
  const add = (group, label, have, want, ask, detail) => out.push({ group, label, have, want, ask, detail });
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
  const need = (label, path, test, what) => {
    const miss = rows.filter((r) => !test(r)).map((r) => S(r.name));
    add('Every sector', label, rows.length - miss.length, rows.length,
      `${path} — ${what} Missing for: ${miss.join(', ')}.`, miss.join(', '));
  };
  need('Returns over 3 months, 6 months and 1 year', 'sectors.returns',
    (r) => r.returns && ['m3', 'm6', 'y1'].every((k) => real(r.returns[k])),
    'the sector index\'s return over 3 months ("m3"), 6 months ("m6") and 1 year ("y1"), with "asOf" and "source".');
  need('Bellwether stocks for the price check', 'sectors.bellwethers',
    (r) => arr(r.bellwethers).filter((x) => x && S(x.symbol)).length >= 3,
    'the 3 to 5 largest NSE-listed companies, each with its NSE "symbol".');
  need('Business momentum: sales and profit growth', 'sectors.business',
    (r) => r.business && real(r.business.revenueGrowth) && real(r.business.profitGrowth) && S(r.business.period),
    'aggregate "revenueGrowth" and "profitGrowth" over the last four reported quarters, year on year, with "period", "basis" and "source".');
  need('Three-year outlook: earnings and demand growth', 'sectors.outlook',
    (r) => r.outlook && real(r.outlook.earningsGrowth3y) && real(r.outlook.demandGrowth3y) && S(r.outlook.source),
    'forecast annual "earningsGrowth3y" and "demandGrowth3y" over the next three years, with "years" and a dated "source".');
  need('Tailwinds and risks, two of each', 'sectors.outlook.tailwinds',
    (r) => r.outlook && arr(r.outlook.tailwinds).filter((x) => S(x).length > 8).length >= 2
      && arr(r.outlook.risks).filter((x) => S(x).length > 8).length >= 2,
    'at least two "tailwinds" and two "risks", each a sentence with a figure where there is one.');
  need('P/E against its five-year average', 'sectors.valuation',
    (r) => r.valuation && real(r.valuation.pe) && real(r.valuation.pe5yAvg),
    'the sector index\'s trailing "pe" and its five-year average "pe5yAvg", with "asOf" and "source".');
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
  const tryKeys = async (keys) => {
    for (const k of keys) {
      try {
        const r = returnsFromBars(await fetchBars(k));
        if (r && isNum(r.y1)) return { ...r, key: k };
      } catch (e) { /* the next name */ }
    }
    return null;
  };
  const bench = await tryKeys(indexKeys(S(d.benchmark && d.benchmark.name) || BENCHMARK).concat(indexKeys(BENCHMARK)));
  if (bench) result.benchmark = { ...bench, basis: 'index', of: BENCHMARK };
  for (const r of arr(d.sectors)) {
    if (!r || !S(r.name)) continue;
    const names = [S(r.index), SECTOR_INDEX[FINDER_SECTORS.find((s) => nameKey(s) === nameKey(r.name))]].filter(Boolean);
    let got = await tryKeys([...new Set(names.flatMap(indexKeys))]);
    if (got) { result.sectors[nameKey(r.name)] = { ...got, basis: 'index', of: got.key.split('|')[1] }; continue; }
    /* The bellwethers, equally weighted. Two at least, or it is one company. */
    const picks = arr(r.bellwethers).filter((x) => x && S(x.symbol)).slice(0, 5);
    const each = [];
    for (const p of picks) {
      const key = typeof keyFor === 'function' ? keyFor(S(p.symbol), S(p.isin)) : null;
      if (!key) continue;
      const one = await tryKeys([key]);
      if (one && isNum(one.m3) && isNum(one.m6)) each.push({ sym: S(p.symbol), ...one });
    }
    if (each.length >= 2) {
      const avg = (k) => +(each.reduce((a, x) => a + x[k], 0) / each.length).toFixed(2);
      result.sectors[nameKey(r.name)] = { m3: avg('m3'), m6: avg('m6'), y1: avg('y1'),
        asOf: each.map((x) => x.asOf).sort().pop(), basis: 'basket', of: each.map((x) => x.sym).join(', ') };
    } else result.failed.push(S(r.name));
  }
  return result;
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
const mix = (parts) => {
  const ok = parts.filter(([v]) => isNum(v));
  if (ok.length !== parts.length) return null;
  return ok.reduce((a, [v, w]) => a + v * w, 0) / ok.reduce((a, [, w]) => a + w, 0);
};

export function scoreFinder(d) {
  const ver = (d && d.verified) || {};
  const bTool = (d && d.benchmark && d.benchmark.returns) || {};
  const bench = ver.benchmark && isNum(ver.benchmark.y1)
    ? { m3: ver.benchmark.m3, m6: ver.benchmark.m6, y1: ver.benchmark.y1, checked: true, asOf: ver.benchmark.asOf }
    : { m3: real(bTool.m3) ? bTool.m3 : null, m6: real(bTool.m6) ? bTool.m6 : null, y1: real(bTool.y1) ? bTool.y1 : null,
        checked: false, asOf: S(d && d.benchmark && d.benchmark.asOf) };
  const rows = arr(d && d.sectors).filter((r) => r && S(r.name)).map((r) => {
    const v = (ver.sectors || {})[nameKey(r.name)];
    const t = r.returns || {};
    const ret = v && isNum(v.y1)
      ? { m3: v.m3, m6: v.m6, y1: v.y1, checked: true, basis: v.basis, of: v.of, asOf: v.asOf,
          tool: { m3: t.m3, m6: t.m6, y1: t.y1 } }
      : { m3: real(t.m3) ? t.m3 : null, m6: real(t.m6) ? t.m6 : null, y1: real(t.y1) ? t.y1 : null,
          checked: false, basis: S(t.basis) || 'stated by the research', of: S(r.index), asOf: S(t.asOf) };
    const rel = {};
    ['m3', 'm6', 'y1'].forEach((k) => { rel[k] = isNum(ret[k]) && isNum(bench[k]) ? +(ret[k] - bench[k]).toFixed(2) : null; });
    const base = isNum(bench.y1) ? rel : ret;
    const bz = r.business || {}, ol = r.outlook || {}, va = r.valuation || {};
    return {
      name: S(r.name), short: SHORT_NAMES[FINDER_SECTORS.find((x) => nameKey(x) === nameKey(r.name))] || S(r.name),
      subSector: S(r.subSector), index: S(r.index), why: S(r.why),
      returns: ret, rel,
      business: { revenueGrowth: real(bz.revenueGrowth) ? bz.revenueGrowth : null,
        profitGrowth: real(bz.profitGrowth) ? bz.profitGrowth : null, period: S(bz.period), source: S(bz.source) },
      outlook: { earningsGrowth3y: real(ol.earningsGrowth3y) ? ol.earningsGrowth3y : null,
        demandGrowth3y: real(ol.demandGrowth3y) ? ol.demandGrowth3y : null, years: S(ol.years),
        tailwinds: arr(ol.tailwinds).map(S).filter(Boolean), risks: arr(ol.risks).map(S).filter(Boolean), source: S(ol.source) },
      valuation: { pe: real(va.pe) ? va.pe : null, pe5yAvg: real(va.pe5yAvg) ? va.pe5yAvg : null,
        ratio: real(va.pe) && real(va.pe5yAvg) && va.pe5yAvg > 0 ? +(va.pe / va.pe5yAvg).toFixed(3) : null,
        asOf: S(va.asOf), source: S(va.source) },
      raw: {
        momentum: mix([[base.m3, MOMENTUM_MIX.m3], [base.m6, MOMENTUM_MIX.m6], [base.y1, MOMENTUM_MIX.y1]]),
        business: mix([[real(bz.profitGrowth) ? bz.profitGrowth : null, 0.6], [real(bz.revenueGrowth) ? bz.revenueGrowth : null, 0.4]]),
        outlook: mix([[real(ol.earningsGrowth3y) ? ol.earningsGrowth3y : null, 0.6], [real(ol.demandGrowth3y) ? ol.demandGrowth3y : null, 0.4]]),
        valuation: null,
      },
    };
  });
  rows.forEach((r) => { r.raw.valuation = isNum(r.valuation.ratio) ? -r.valuation.ratio : null; });
  Object.keys(FINDER_WEIGHTS).forEach((k) => {
    const p = percentiles(rows.map((r) => r.raw[k]));
    rows.forEach((r, i) => { (r.parts = r.parts || {})[k] = p[i]; });
  });
  rows.forEach((r) => {
    const have = Object.keys(FINDER_WEIGHTS).filter((k) => isNum(r.parts[k]));
    const w = have.reduce((a, k) => a + FINDER_WEIGHTS[k], 0);
    r.score = w ? +(have.reduce((a, k) => a + r.parts[k] * FINDER_WEIGHTS[k], 0) / w).toFixed(1) : null;
    r.complete = have.length === Object.keys(FINDER_WEIGHTS).length;
    r.missingParts = Object.keys(FINDER_WEIGHTS).filter((k) => !isNum(r.parts[k]));
  });
  rows.sort((a, b) => (Number(b.complete) - Number(a.complete))
    || ((isNum(b.score) ? b.score : -1) - (isNum(a.score) ? a.score : -1)) || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; r.reason = reasonOf(r, bench); });
  const top3 = rows.filter((r) => r.complete).slice(0, 3);
  return {
    benchmark: bench, rows, top3,
    counts: { screened: rows.length, complete: rows.filter((r) => r.complete).length,
      checked: rows.filter((r) => r.returns.checked).length, listed: FINDER_SECTORS.length },
    weights: FINDER_WEIGHTS, mix: MOMENTUM_MIX,
    basis: 'Each part is a percentile among the sectors screened: past momentum from the 3-month, '
      + '6-month and 1-year returns against the Nifty 50 (weighted 25, 35 and 40); business momentum from '
      + 'profit and sales growth over the last four quarters (60 and 40); the three-year outlook from forecast '
      + 'earnings and demand growth (60 and 40); valuation from the P/E against its own five-year average, '
      + 'cheaper scoring higher. A sector missing a part ranks below every complete sector.',
  };
}

const sgn = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1);
function reasonOf(r, bench) {
  const bits = [];
  if (isNum(r.rel.y1)) bits.push(`${r.rel.y1 >= 0 ? 'beat' : 'trailed'} the ${BENCHMARK} by ${Math.abs(r.rel.y1).toFixed(1)} points over a year`);
  else if (isNum(r.returns.y1)) bits.push(`${sgn(r.returns.y1)}% over a year`);
  if (isNum(r.business.profitGrowth)) bits.push(`profits ${sgn(r.business.profitGrowth)}% over four quarters`);
  if (isNum(r.outlook.earningsGrowth3y)) bits.push(`earnings forecast to grow ${r.outlook.earningsGrowth3y.toFixed(1)}% a year`);
  if (isNum(r.valuation.pe) && isNum(r.valuation.pe5yAvg)) bits.push(`P/E ${r.valuation.pe.toFixed(1)} against a five-year average of ${r.valuation.pe5yAvg.toFixed(1)}`);
  void bench;
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
