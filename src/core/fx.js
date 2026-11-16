/* The rupee against the dollar, on the date of the research.
 *
 * Tejas, 16 Nov 2026: "I have seen the rupee dollar rate as 83.50 which is
 * wrong. Please verify the source and fix this, this rate has to be on the date
 * of search of this report as date is also printed in the footnote."
 *
 * The 83.50 was the research tool's own figure, labelled "RBI" and dated
 * "Q1FY27" — a quarter, for a rate fixed every business day. The RBI/FBIL
 * reference rate on 13 Nov 2026 was 94.1997; 83.50 is where the rupee stood in
 * 2023-24, which is what a language model remembers when it answers instead of
 * looking. Rule 10a of the brief already asked for the spot rate on the run
 * date, and the tool ignored it. An instruction the tool can ignore is not a
 * control, so the application now fetches the rate itself, for the research
 * date, when the payload is saved, and sets it in place of whatever the tool
 * wrote. When no source can be reached, the stated figure is printed only with
 * a mark saying it could not be checked against the report date.
 *
 * Four sources, tried in turn, each keyless and readable from a page:
 *   Frankfurter (two hosts) — European Central Bank reference rates, by date;
 *                 returns the last business day on or before the date asked for.
 *   fawazahmed0 currency-api on jsDelivr — daily snapshots, by date.
 *   the same API's Cloudflare mirror — latest only, the last resort.
 * None is the FBIL fixing itself (FBIL publishes no API), and the ECB and FBIL
 * fixings differ by a few paise, which is why the source is printed with the
 * rate.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* The research date: when the tool ran, else today. */
export function researchDate(payload, now = new Date()) {
  const g = payload && payload.run && (payload.run.generatedAt || payload.run.asOf);
  const d = g ? new Date(g) : now;
  return isNaN(d) ? isoDay(now) : isoDay(d);
}
export function isoDay(d) { return new Date(d).toISOString().slice(0, 10); }
export function dmyDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso || '');
}

async function timed(url, ms = 9000, fetchImpl = globalThis.fetch) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const r = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: ctl && ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { if (t) clearTimeout(t); }
}

export const FX_SOURCES = [
  { name: 'European Central Bank reference rate (via Frankfurter)',
    url: (d) => `https://api.frankfurter.dev/v1/${d}?base=USD&symbols=INR`,
    read: (j) => (j && j.rates && isNum(j.rates.INR)) ? { value: j.rates.INR, asOf: j.date } : null },
  /* The older host of the same service, kept in case the new one is blocked. */
  { name: 'European Central Bank reference rate (via Frankfurter)',
    url: (d) => `https://api.frankfurter.app/${d}?from=USD&to=INR`,
    read: (j) => (j && j.rates && isNum(j.rates.INR)) ? { value: j.rates.INR, asOf: j.date } : null },
  { name: 'Daily reference snapshot (currency-api, jsDelivr)',
    url: (d) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/usd.json`,
    read: (j) => (j && j.usd && isNum(j.usd.inr)) ? { value: j.usd.inr, asOf: j.date } : null },
  { name: 'Latest reference snapshot (currency-api)',
    url: () => 'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
    read: (j) => (j && j.usd && isNum(j.usd.inr)) ? { value: j.usd.inr, asOf: j.date } : null },
];

/* Fetch USD/INR for a date. Never throws: returns null, with the attempts. */
export async function fetchUsdInr(date, { fetchImpl, sources = FX_SOURCES } = {}) {
  const attempts = [];
  for (const s of sources) {
    try {
      const got = s.read(await timed(s.url(date), 9000, fetchImpl));
      if (got && got.value > 20 && got.value < 500) {
        return { value: Math.round(got.value * 10000) / 10000, asOf: got.asOf || date,
          source: s.name, attempts };
      }
      attempts.push({ source: s.name, ok: false, error: 'no INR rate in the reply' });
    } catch (err) {
      attempts.push({ source: s.name, ok: false, error: String(err && err.message || err) });
    }
  }
  return { value: null, attempts };
}

/* Days between two ISO days. */
function daysApart(a, b) {
  const x = Date.parse(String(a).slice(0, 10)), y = Date.parse(String(b).slice(0, 10));
  return isNaN(x) || isNaN(y) ? null : Math.round(Math.abs(x - y) / 864e5);
}

/* Put a fetched rate into a payload. Pure: returns the same object, changed.
   The tool's own figure is kept beside it, so the report can say what it
   replaced and by how much. A fetched rate from more than ten days either
   side of the research date is not used. */
export function applyFx(payload, fx, date = researchDate(payload)) {
  if (!payload || !fx || !isNum(fx.value)) return payload;
  const gap = daysApart(fx.asOf, date);
  if (gap != null && gap > 10) return payload;
  payload.macro = payload.macro || {};
  const stated = payload.macro.currency || null;
  const before = stated && isNum(stated.value) ? stated.value : null;
  payload.macro.currency = {
    value: fx.value,
    period: dmyDay(fx.asOf),
    asOf: fx.asOf,
    source: fx.source,
    verified: true,
    researchDate: date,
    stated: before == null ? null : { value: before, period: stated.period || '', source: stated.source || '' },
    differencePct: before == null ? null : Math.round(((before - fx.value) / fx.value) * 1000) / 10,
  };
  return payload;
}

/* Is the payload's rate one the report can print as the rate on the report
   date? Used by the report whether or not the application could fetch. */
export function fxStatus(cur, runDate) {
  if (!cur || !isNum(cur.value)) return { ok: false, reason: 'not supplied' };
  if (cur.verified) return { ok: true, verified: true };
  const p = String(cur.period || cur.asOf || '');
  let iso = null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p);
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  else if ((m = /^(\d{1,2})[-/ ](\d{1,2})[-/ ](\d{4})$/.exec(p.trim()))) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (!iso) return { ok: false, reason: 'dated "' + (p || 'nothing') + '", which is not a day; the rupee is fixed every business day' };
  const gap = daysApart(iso, runDate);
  if (gap == null) return { ok: false, reason: 'its date could not be read' };
  if (gap > 10) return { ok: false, reason: `dated ${dmyDay(iso)}, ${gap} days from the report date` };
  return { ok: true, verified: false };
}
