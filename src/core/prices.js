/* Historical price retrieval.
 *
 * Until now the price series travelled in the payload: the model was asked to
 * transcribe 104 weeks of closes by hand. It never did it reliably — one week
 * came back where two years were asked for — and every technical indicator
 * downstream is gated on that series, so the whole panel silently vanished.
 * Transcription is the wrong job for a language model. This module fetches the
 * series instead.
 *
 * Two providers, neither load-bearing:
 *
 *   Upstox V3  — primary. No API key of any kind; the candle endpoints are open
 *                data endpoints. Weekly candles back to January 2000. The only
 *                header needed is Accept, which keeps the request inside the
 *                CORS "simple request" rules, so no preflight is sent.
 *                Keyed by ISIN: NSE_EQ|INE002A01018.
 *   BharatStock — fallback. Needs a key, which in a static app is visible to
 *                anyone who opens the bundle, and the free tier is 50 calls a
 *                day. Daily bars only, one year, so weekly bars are rolled up
 *                here. Its X-API-Key header forces a preflight, which the
 *                server has to answer or the call dies before it is made.
 *
 * Whether either sends Access-Control-Allow-Origin is not documented by either
 * vendor and cannot be settled anywhere but a real browser on the real origin.
 * That is what `diagnose()` is for. If both fail, `fetchHistoricalPrices`
 * returns null and the caller carries on without a series — the report is
 * poorer, never broken.
 */

const UPSTOX_BASE = 'https://api.upstox.com/v3/historical-candle';
const BHARAT_BASE = 'https://bharatstockapi.com/v1';

const iso = (d) => d.toISOString().slice(0, 10);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

function yearsAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() - n);
  return d;
}

/* A fetch that cannot hang the report. A provider that never answers is a
   provider that failed; without this the await sits there forever. */
async function timedFetch(url, opts = {}, ms = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- Upstox -- */

/* Upstox is keyed by ISIN, not by ticker. The live instrument-search endpoint
   needs a bearer token, so it is no use to us; the daily master file is 70k
   rows of gzip, far too much to pull into a phone browser on every report. We
   ship a trimmed symbol -> instrument_key map as a static asset instead and
   look the symbol up in it. */
let _instrumentMap = null;

export async function loadInstrumentMap(url = 'data/nse-instruments.json') {
  if (_instrumentMap) return _instrumentMap;
  try {
    const res = await timedFetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return (_instrumentMap = {});
    _instrumentMap = await res.json();
  } catch {
    _instrumentMap = {};
  }
  return _instrumentMap;
}

export function instrumentKeyFor(symbol, map, isin = null) {
  /* An ISIN stated in the payload beats the map: the map is a build-time
     snapshot and a newly listed company will not be in it yet. */
  if (typeof isin === 'string' && /^IN[A-Z0-9]{10}$/.test(isin.trim())) {
    return `NSE_EQ|${isin.trim().toUpperCase()}`;
  }
  const k = String(symbol || '').trim().toUpperCase();
  const hit = map?.[k];
  if (!hit) return null;
  return hit.startsWith('NSE_EQ|') || hit.startsWith('BSE_EQ|') ? hit : `NSE_EQ|${hit}`;
}

export async function fetchUpstox(instrumentKey, { unit = 'weeks', interval = 1, years = 2 } = {}) {
  /* The path order is to_date then from_date — the reverse of the reading
     order, and an easy thing to get backwards. Units are plural: weeks, days,
     months. The pipe in the instrument key must be percent-encoded. */
  const to = iso(new Date());
  const from = iso(yearsAgo(years));
  const url = `${UPSTOX_BASE}/${encodeURIComponent(instrumentKey)}/${unit}/${interval}/${to}/${from}`;

  const res = await timedFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Upstox HTTP ${res.status}`);

  const body = await res.json();
  if (body?.status !== 'success' || !Array.isArray(body?.data?.candles)) {
    throw new Error('Upstox returned no candles');
  }

  /* Candles arrive newest first and are [ts, o, h, l, c, v, oi]. */
  return body.data.candles
    .slice()
    .reverse()
    .map(([ts, o, h, l, c, v]) => ({ date: String(ts).slice(0, 10), o, h, l, c, v }));
}

/* ----------------------------------------------------------- BharatStock -- */

export async function fetchBharatStock(symbol, apiKey, { years = 1 } = {}) {
  if (!apiKey) throw new Error('BharatStock needs an API key');

  const bars = [];
  const pageSize = 100;

  /* Paginated, and the wire parameters are from/to — not from_date/to_date,
     which is what the vendor's own SDK calls them in its arguments. */
  for (let page = 1; page <= 10; page++) {
    const url = new URL(`${BHARAT_BASE}/stocks/${encodeURIComponent(String(symbol).toUpperCase())}/prices`);
    url.searchParams.set('from', iso(yearsAgo(years)));
    url.searchParams.set('to', iso(new Date()));
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(pageSize));

    const res = await timedFetch(url, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    });
    if (res.status === 429) throw new Error('BharatStock daily cap reached (50/day free)');
    if (!res.ok) throw new Error(`BharatStock HTTP ${res.status}`);

    const body = await res.json();
    const rows = Array.isArray(body?.data) ? body.data : [];
    for (const r of rows) {
      bars.push({
        date: r.trade_date,
        o: r.open, h: r.high, l: r.low,
        /* Bonus and split adjusted, so a 1:1 bonus does not read as a 50%
           crash in every indicator downstream. */
        c: isNum(r.adjusted_close) ? r.adjusted_close : r.close,
        v: r.volume,
      });
    }
    const pg = body?.pagination;
    if (!pg || !isNum(pg.total_pages) || page >= pg.total_pages) break;
  }

  bars.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return bars;
}

/* BharatStock has no weekly bars, so they are rolled from the daily ones:
   open of the first day in the week, high and low across it, close of the
   last, volume summed. ISO weeks, Monday-anchored. */
export function toWeekly(daily) {
  if (!Array.isArray(daily) || !daily.length) return [];
  const weeks = new Map();

  for (const b of daily) {
    const d = new Date(`${b.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = iso(monday);

    const w = weeks.get(key);
    if (!w) {
      weeks.set(key, { date: key, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 });
    } else {
      if (isNum(b.h) && (!isNum(w.h) || b.h > w.h)) w.h = b.h;
      if (isNum(b.l) && (!isNum(w.l) || b.l < w.l)) w.l = b.l;
      w.c = b.c;
      w.v = (w.v || 0) + (b.v || 0);
    }
  }
  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------- normalise -- */

/* The shape report.js already consumes as c.priceHistory. Building it here
   rather than teaching the report a second shape keeps the change to one
   seam. */
export function toPriceHistory(bars, { spacing = 'weekly', source = null } = {}) {
  if (!Array.isArray(bars) || bars.length < 2) return null;
  const num = (v) => (isNum(v) ? v : null);
  return {
    closes: bars.map((b) => num(b.c)),
    highs: bars.map((b) => num(b.h)),
    lows: bars.map((b) => num(b.l)),
    volumes: bars.map((b) => num(b.v)),
    dates: bars.map((b) => b.date),
    spacing,
    asOf: bars[bars.length - 1]?.date ?? null,
    adjusted: true,
    points: bars.length,
    source,
  };
}

/* ---------------------------------------------------------------- public -- */

/* Tries each provider in turn and returns the first that answers. Everything
   that went wrong is reported alongside the result rather than thrown, so the
   report can say which provider it used and why the others did not answer —
   a silent fallback is how you end up not knowing your primary has been down
   for a month. */
export async function fetchHistoricalPrices(company, opts = {}) {
  const {
    years = 2,
    bharatKey = null,
    instrumentMapUrl = 'data/nse-instruments.json',
    providers = ['upstox', 'bharatstock'],
  } = opts;

  const symbol = company?.ticker ?? company?.symbol ?? company?.name ?? null;
  const isin = company?.isin ?? null;
  const attempts = [];

  for (const name of providers) {
    try {
      if (name === 'upstox') {
        const map = await loadInstrumentMap(instrumentMapUrl);
        const key = instrumentKeyFor(symbol, map, isin);
        if (!key) throw new Error(`no instrument key for "${symbol}"`);
        const bars = await fetchUpstox(key, { unit: 'weeks', interval: 1, years });
        const ph = toPriceHistory(bars, { spacing: 'weekly', source: 'upstox' });
        if (!ph) throw new Error('too few candles');
        attempts.push({ provider: name, ok: true, points: ph.points });
        return { priceHistory: ph, attempts };
      }

      if (name === 'bharatstock') {
        if (!bharatKey) throw new Error('no API key configured');
        const daily = await fetchBharatStock(symbol, bharatKey, { years: Math.min(years, 1) });
        const ph = toPriceHistory(toWeekly(daily), { spacing: 'weekly', source: 'bharatstock' });
        if (!ph) throw new Error('too few bars');
        attempts.push({ provider: name, ok: true, points: ph.points });
        return { priceHistory: ph, attempts };
      }
    } catch (err) {
      /* A CORS rejection surfaces as an opaque TypeError with no status and no
         detail — the browser will not tell a script why it blocked a read.
         Worth naming, because it is the one failure a code change here cannot
         fix. */
      const msg = String(err?.message || err);
      const likelyCors = err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(msg);
      attempts.push({ provider: name, ok: false, error: msg, likelyCors });
    }
  }

  return { priceHistory: null, attempts };
}

/* What the payload carries, when it carries anything. Kept as a last resort
   behind the live providers: transcribed series are short and often wrong,
   but a short real series still beats no series. */
export function fromPayload(c) {
  const ph = c?.priceHistory;
  if (!ph?.closes?.length) return null;
  return { ...ph, source: ph.source ?? 'payload', points: ph.closes.length };
}

/* Runs both providers against one symbol and reports exactly what happened.
   This exists because the CORS question cannot be answered from a build
   container, a terminal, Node or Postman — none of them enforce CORS, so a
   success in any of them proves nothing about the browser. It has to run from
   the real origin, in a real browser. */
export async function diagnose(symbol = 'RELIANCE', opts = {}) {
  const out = { symbol, at: new Date().toISOString(), results: [] };

  try {
    const map = await loadInstrumentMap(opts.instrumentMapUrl ?? 'data/nse-instruments.json');
    const key = instrumentKeyFor(symbol, map, opts.isin ?? null);
    out.instrumentKey = key;
    if (!key) throw new Error('symbol not in instrument map');
    const bars = await fetchUpstox(key, { unit: 'weeks', interval: 1, years: 2 });
    out.results.push({ provider: 'upstox', ok: true, bars: bars.length, first: bars[0], last: bars[bars.length - 1] });
  } catch (err) {
    const msg = String(err?.message || err);
    out.results.push({
      provider: 'upstox', ok: false, error: msg,
      likelyCors: err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(msg),
    });
  }

  if (opts.bharatKey) {
    try {
      const daily = await fetchBharatStock(symbol, opts.bharatKey, { years: 1 });
      out.results.push({ provider: 'bharatstock', ok: true, bars: daily.length, weekly: toWeekly(daily).length });
    } catch (err) {
      const msg = String(err?.message || err);
      out.results.push({
        provider: 'bharatstock', ok: false, error: msg,
        likelyCors: err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(msg),
      });
    }
  }

  return out;
}
