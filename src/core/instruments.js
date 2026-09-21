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

/* Upstox publishes the complete master daily, around 06:00 IST. */
export const MASTER_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';

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
  return v && typeof v === 'object' ? v : {};
}

/** When it was last refreshed, and how many names it holds. */
export function libraryMeta() {
  const m = readJson(META_KEY, null);
  return m && typeof m === 'object' ? m : { count: 0, at: null, source: null };
}

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
export async function refresh({ url = MASTER_URL, timeoutMs = 45000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`the exchange master returned HTTP ${res.status}`);
    const text = await decompress(res);
    const rows = JSON.parse(text);
    const { map, kept } = distil(rows);
    if (!kept) throw new Error('the exchange master parsed but held no equity rows');
    const at = new Date().toISOString();
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
    localStorage.setItem(META_KEY, JSON.stringify({ count: kept, at, source: url }));
    return { ok: true, count: kept, at };
  } catch (err) {
    const msg = String(err?.message || err);
    /* A browser refusing a cross-origin read says nothing useful — an opaque
       TypeError with no status. Name it, because it is the one failure no
       change to this file can fix. */
    const likelyCors = err instanceof TypeError
      || /Failed to fetch|NetworkError|Load failed/i.test(msg);
    return {
      ok: false,
      error: likelyCors
        ? 'the browser blocked the request to the exchange master (CORS). The library can still be filled in by hand.'
        : msg,
      likelyCors,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Add or correct one entry by hand. Used when the master cannot be reached. */
export function put(symbol, isin) {
  const sym = String(symbol || '').trim().toUpperCase();
  const code = String(isin || '').trim().toUpperCase();
  if (!sym) return { ok: false, error: 'a symbol is required' };
  if (!isIsin(code)) return { ok: false, error: 'an ISIN is twelve characters and starts IN, e.g. INE002A01018' };
  const lib = library();
  lib[sym] = code;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(lib));
    const meta = libraryMeta();
    localStorage.setItem(META_KEY, JSON.stringify({
      count: Object.keys(lib).length,
      at: meta.at, source: meta.source, editedAt: new Date().toISOString(),
    }));
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  return { ok: true, symbol: sym, isin: code };
}

export function remove(symbol) {
  const lib = library();
  const sym = String(symbol || '').trim().toUpperCase();
  if (!(sym in lib)) return { ok: false };
  delete lib[sym];
  try { localStorage.setItem(STORE_KEY, JSON.stringify(lib)); } catch { /* ignore */ }
  return { ok: true };
}
