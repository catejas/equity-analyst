/* The company and ISIN library.
 *
 * Upstox keys its price API by ISIN, not by ticker, and its symbol-search
 * endpoint needs a bearer token — so a static app has to know the mapping
 * before it can ask for a price. Asking the research model for it was the
 * wrong answer twice over: it puts a lookup the app can do itself into a
 * prompt, and a model that guesses an ISIN produces another company's price
 * history rather than an error.
 *
 * So the app keeps its own library. It is fetched once from the exchange
 * master, stored on the device, and refreshed by a button. Nothing about it
 * travels through a payload.
 *
 * The master is published as gzip. `fetch` decompresses transparently only
 * when the server sends Content-Encoding: gzip; when it sends
 * Content-Type: application/gzip instead — which is what a .gz file served as
 * a file does — the bytes arrive compressed and must be decompressed here.
 * Both paths are handled, because which one a CDN uses is not ours to decide.
 */

const STORE_KEY = 'eq.instruments';
const META_KEY = 'eq.instruments.meta';
/* Company names, when a source carries them. They make the library searchable
   by name rather than only by ticker, which is how a person actually looks. */
const NAME_KEY = 'eq.instruments.names';
/* Hand-entered symbols, never overwritten by a refresh. */
const MANUAL_KEY = 'eq.instruments.manual';

/* Upstox publishes the complete master daily, around 06:00 IST. */
/* Where a refresh reads from, in the order it tries them.

   THE PROBLEM THIS SOLVES. A symbol-to-ISIN map is not static reference data.
   Companies list, merge, demerge, split and are renamed — Zomato became
   ETERNAL — and each of those changes the mapping. A map bundled with a build
   is correct on the day it ships and decays from then on, silently, because a
   wrong ISIN does not error: it fetches ANOTHER COMPANY'S price history.

   So two rules govern everything below.

   FIRST: the app tracks how fresh the DATA is, not when it was fetched.
   "Updated 3 minutes ago" tells a reader nothing if the file they pulled was
   built in 2023. Each source therefore reports the date its data is current
   to, and that is what the Setup page shows and what staleness is judged on.

   SECOND: a source is chosen for being maintained, not for being official.
   The exchange's own file and the Upstox master are both unreachable from a
   browser — neither host sends Access-Control-Allow-Origin, and a cross-origin
   read the server does not permit will never succeed from a page, however many
   times it is retried. The primary is a GitHub mirror that IS readable and IS
   maintained daily; verified directly, and its freshness is checked on every
   refresh rather than assumed.

   A source that goes stale is the failure mode to fear, because it looks like
   success. `checkFreshness` exists for that: it reads the companion meta file
   and reports the data date, so a mirror that stops updating is visible rather
   than quietly serving three-year-old ISINs. That is exactly how the first
   candidate for this job was caught — it looked perfect and its newest listing
   was from October 2023. */
export const SOURCES = Object.freeze([
  { name: 'NSE ISIN list, updated daily', kind: 'isin-csv',
    url: 'https://raw.githubusercontent.com/BennyThadikaran/eod2_data/main/isin.csv',
    metaUrl: 'https://raw.githubusercontent.com/BennyThadikaran/eod2_data/main/meta.json' },
  { name: 'NSE equity list (symbol, name, ISIN)', kind: 'equity-csv',
    url: 'https://raw.githubusercontent.com/bhavansh/isin-database/main/csv-data/equity.csv' },
  { name: 'the map bundled with this build', kind: 'bundled',
    url: 'data/nse-instruments.json' },
  { name: 'the Upstox exchange master', kind: 'upstox',
    url: 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz' },
]);
export const MASTER_URL = SOURCES[0].url;

/* How old a library may be before the app stops trusting it silently. Indian
   listings run at a few a week, so a fortnight is the point at which a recent
   IPO is likely to be missing. */
export const STALE_AFTER_DAYS = 14;

const isIsin = (v) => typeof v === 'string' && /^IN[A-Z0-9]{10}$/.test(v.trim());

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

/** The library as { SYMBOL: ISIN }. Empty until it has been fetched once. */
export function library() {
  const v = readJson(STORE_KEY, null);
  const fetched = (v && typeof v === 'object') ? v : {};
  /* Hand-entered entries sit ON TOP of the fetched map, and win. A person who
     typed an ISIN in did so because the mirror was missing or wrong about that
     company; a later refresh must not silently undo that judgement. */
  return { ...fetched, ...(readJson(MANUAL_KEY, {}) || {}) };
}

/** When it was last refreshed, and how many names it holds. */
export function libraryMeta() {
  const m = readJson(META_KEY, null);
  const base = (m && typeof m === 'object') ? m : { count: 0, at: null, source: null };
  const manual = readJson(MANUAL_KEY, {});
  const manualCount = Object.keys(manual || {}).length;

  /* Age is measured from the date the DATA is current to, not from the moment
     it was fetched. Those are different numbers and only one of them matters:
     a file pulled a minute ago can be three years old. */
  const dataDate = base.dataDate || null;
  let ageDays = null;
  if (dataDate) {
    const t = Date.parse(dataDate);
    if (Number.isFinite(t)) ageDays = Math.floor((Date.now() - t) / 86400000);
  }
  const stale = ageDays === null ? base.count > 0 : ageDays > STALE_AFTER_DAYS;

  return {
    ...base,
    manualCount,
    total: base.count + manualCount,
    dataDate, ageDays, stale,
    staleReason: !base.count
      ? 'No library has been fetched yet; the map bundled with this build is being used.'
      : ageDays === null
        ? 'This source did not state how current its data is, so it cannot be trusted to hold recent listings.'
        : stale
          ? `The data is current to ${dataDate}, ${ageDays} days ago. Companies listed since then — and any `
            + 'merger, demerger or rename since then — will not be in it.'
          : `The data is current to ${dataDate}.`,
  };
}

/* Entries typed in by hand. Kept in their own store for one reason: a refresh
   REPLACES the fetched map, and a person who has hand-entered a company the
   mirror does not carry should not lose it the next time they press Update. */
export function manualEntries() { return readJson(MANUAL_KEY, {}) || {}; }

/** One company. Accepts a ticker or a name; returns the ISIN or null. */
export function isinFor(symbolOrName) {
  const lib = library();
  const k = String(symbolOrName || '').trim().toUpperCase();
  if (!k) return null;
  if (isIsin(lib[k])) return lib[k];
  /* A name rather than a ticker: match a single unambiguous prefix. Several
     matches is not a match — picking one would be guessing, and a guessed
     ISIN is the failure this library exists to prevent. */
  const hits = Object.keys(lib).filter((s) => s.startsWith(k));
  return hits.length === 1 ? lib[hits[0]] : null;
}

/** Every entry, sorted, for the Setup page's list. */
export function entries() {
  const lib = library();
  return Object.keys(lib).sort().map((symbol) => ({ symbol, isin: lib[symbol] }));
}

export function search(query, limit = 25) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return entries().slice(0, limit);
  return entries().filter((e) => e.symbol.includes(q) || e.isin.includes(q)).slice(0, limit);
}

/* ---------------------------------------------------------------- refresh */

async function decompress(res) {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  /* 1f 8b is the gzip magic number. If it is still there, fetch did not
     decompress and we must. */
  const gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('this browser cannot decompress the exchange master (no DecompressionStream)');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Keep only listed equities, and only what we need. */
export function distil(rows) {
  const out = {};
  let kept = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    if (r.segment && String(r.segment).toUpperCase() !== 'NSE_EQ') continue;
    const type = String(r.instrument_type || '').toUpperCase();
    if (type && type !== 'EQ' && type !== 'EQUITY') continue;
    const sym = String(r.trading_symbol || r.tradingsymbol || '').trim().toUpperCase();
    const isin = String(r.isin || '').trim().toUpperCase();
    if (!sym || !isIsin(isin)) continue;
    out[sym] = isin;
    kept++;
  }
  return { map: out, kept };
}

/**
 * Fetch the exchange master and rebuild the library.
 * Returns { ok, count, at, error }. Never throws: a refresh that fails leaves
 * the previous library in place, because a stale mapping is worth more than
 * none.
 */
/* The daily ISIN list: ISIN first, symbol second, the rest a vestigial 2011
   bhavcopy snapshot on the oldest rows. It is append-only and keyed by ISIN,
   so one symbol can appear more than once when a company has been renamed or
   reconstituted — Zomato and ETERNAL share a symbol history. Last occurrence
   wins, because the newest row is the live one. */
export function parseIsinCsv(text) {
  const lines = String(text || '').split(/\r?\n/);
  const map = {};
  let kept = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 2) continue;
    const isin = String(c[0] || '').trim().toUpperCase();
    const sym = String(c[1] || '').trim().toUpperCase();
    /* INE is an equity ISIN. INF is a mutual fund, IN9 a depository receipt —
       neither is a company this application researches. */
    if (!sym || !isIsin(isin) || !isin.startsWith('INE')) continue;
    if (!(sym in map)) kept++;
    map[sym] = isin;
  }
  return { map, names: {}, kept };
}

/* NSE's EQUITY_L.csv, as a symbol -> ISIN map. The header carries a leading
   space on most columns ("_ISIN NUMBER"), which is how the exchange writes it. */
export function parseEquityCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { map: {}, names: {}, kept: 0 };
  const head = lines[0].split(',').map((h) => h.trim().toUpperCase());
  const iSym = head.indexOf('SYMBOL');
  const iIsin = head.indexOf('ISIN NUMBER');
  const iName = head.indexOf('NAME OF COMPANY');
  const iSer = head.indexOf('SERIES');
  if (iSym < 0 || iIsin < 0) return { map: {}, names: {}, kept: 0 };
  const map = {}, names = {};
  let kept = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    if (cells.length <= Math.max(iSym, iIsin)) continue;
    const sym = String(cells[iSym] || '').trim().toUpperCase();
    const isin = String(cells[iIsin] || '').trim().toUpperCase();
    if (!sym || !isIsin(isin)) continue;
    /* Listed equity series only. A debt or SGB line shares the file. */
    if (iSer >= 0) {
      const ser = String(cells[iSer] || '').trim().toUpperCase();
      if (ser && ser !== 'EQ' && ser !== 'BE' && ser !== 'BZ') continue;
    }
    map[sym] = isin;
    if (iName >= 0 && cells[iName]) names[sym] = String(cells[iName]).trim();
    kept++;
  }
  return { map, names, kept };
}

/**
 * Rebuild the library from the first source that answers.
 *
 * Never throws, and never empties an existing library: a stale mapping is
 * worth more than none. Every source that failed is reported alongside the one
 * that worked, so a silent fallback can't hide a primary that has been down
 * for weeks.
 */
export async function refresh({ url = null, timeoutMs = 45000 } = {}) {
  /* A URL the person supplied is TRIED FIRST and then the public sources are
     still tried behind it. Replacing the list outright would mean one typo in
     a URL leaves them with no library at all. */
  const kindOf = (u) => {
    if (/\.json\.gz($|\?)/i.test(u) || /assets\.upstox\.com/i.test(u)) return 'upstox';
    if (/\.csv($|\?)/i.test(u)) return /isin[^/]*\.csv/i.test(u) ? 'isin-csv' : 'equity-csv';
    return 'bundled';                     // a JSON map in this app's own shape
  };
  const own = url ? [{ name: 'your own list', kind: kindOf(url), url }] : [];
  const sources = [...own, ...SOURCES];
  const attempts = [];
  let bundledDate = null;

  for (const src of sources) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(src.url, { headers: { Accept: '*/*' }, signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let map = {}, names = {}, kept = 0;
      if (src.kind === 'isin-csv') {
        ({ map, names, kept } = parseIsinCsv(await res.text()));
      } else if (src.kind === 'csv' || src.kind === 'equity-csv') {
        ({ map, names, kept } = parseEquityCsv(await res.text()));
      } else if (src.kind === 'bundled') {
        const body = await res.json();
        bundledDate = body && body._sourceUpdated ? String(body._sourceUpdated).slice(0, 10) : null;
        const m = (body && body.map && typeof body.map === 'object') ? body.map : body;
        for (const k of Object.keys(m || {})) {
          if (k.startsWith('_')) continue;
          const v = String(m[k] || '').trim().toUpperCase().replace(/^NSE_EQ\|/, '');
          if (isIsin(v)) { map[String(k).toUpperCase()] = v; kept++; }
        }
        if (body && body.names) names = body.names;
      } else {
        const { map: m, kept: k } = distil(JSON.parse(await decompress(res)));
        map = m; kept = k;
      }
      if (!kept) throw new Error('parsed, but held no equity rows');

      /* How current the DATA is, asked of the source. Recorded beside the
         fetch time, because a successful fetch of a stale file is the failure
         this whole arrangement exists to make visible. */
      let dataDate = src.dataDate || null;
      if (!dataDate && src.metaUrl) {
        const f = await checkFreshness(src, Math.min(timeoutMs, 15000));
        dataDate = f.dataDate;
      }
      if (!dataDate && src.kind === 'bundled') dataDate = bundledDate;

      const at = new Date().toISOString();
      localStorage.setItem(STORE_KEY, JSON.stringify(map));
      localStorage.setItem(META_KEY, JSON.stringify({
        count: kept, at, dataDate, source: src.url, sourceName: src.name }));
      try { localStorage.setItem(NAME_KEY, JSON.stringify(names || {})); } catch { /* names are a bonus */ }
      attempts.push({ source: src.name, ok: true, count: kept, dataDate });
      return { ok: true, count: kept, at, dataDate, source: src.name, attempts };
    } catch (err) {
      const msg = String(err?.message || err);
      /* A browser refusing a cross-origin read says nothing useful — an opaque
         TypeError with no status. Name it, because it is the one failure a
         reader cannot diagnose from the message they are given. */
      const cors = /Failed to fetch|NetworkError|Load failed/i.test(msg);
      attempts.push({ source: src.name, ok: false,
        error: cors ? 'the browser blocked the request (no CORS header from that host)' : msg });
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, count: 0, attempts,
    error: 'No source answered. ' + attempts.map((a) => `${a.source}: ${a.error}`).join('; ') };
}

/** Add or correct one entry by hand. Used when the master cannot be reached. */
export function put(symbol, isin) {
  const sym = String(symbol || '').trim().toUpperCase();
  const code = String(isin || '').trim().toUpperCase();
  if (!sym) return { ok: false, error: 'a symbol is required' };
  if (!isIsin(code)) return { ok: false, error: 'an ISIN is twelve characters and starts IN, e.g. INE002A01018' };
  /* Into the manual store, which a refresh does not touch. */
  const manual = manualEntries();
  manual[sym] = code;
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(manual));
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  return { ok: true, symbol: sym, isin: code, manual: true };
}

export function remove(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  const manual = manualEntries();
  const fetched = readJson(STORE_KEY, {}) || {};
  if (!(sym in manual) && !(sym in fetched)) return { ok: false };
  delete manual[sym];
  delete fetched[sym];
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(manual));
    localStorage.setItem(STORE_KEY, JSON.stringify(fetched));
  } catch { /* ignore */ }
  return { ok: true };
}

/* How current a source's data is, asked of the source itself.

   A mirror that has stopped updating still answers 200 with a well-formed
   file, so "did the fetch succeed" is the wrong question. Where a source
   publishes a companion meta file, its stated date is read; otherwise the data
   is inspected for the latest date it contains. A source that can say neither
   is reported as unknown rather than assumed current. */
export async function checkFreshness(src, timeoutMs = 15000) {
  if (!src?.metaUrl) return { dataDate: null, reason: 'this source does not publish a data date' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(src.metaUrl, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) return { dataDate: null, reason: `the data date could not be read (HTTP ${res.status})` };
    const meta = await res.json();
    const raw = meta?.lastUpdate || meta?.last_update || meta?.updated || null;
    if (!raw) return { dataDate: null, reason: 'the source published no data date' };
    return { dataDate: String(raw).slice(0, 10), reason: null };
  } catch (err) {
    return { dataDate: null, reason: String(err?.message || err) };
  } finally { clearTimeout(timer); }
}
