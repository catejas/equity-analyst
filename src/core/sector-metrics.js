/* Price measures for the Sector Finder (build 33).
 *
 * Tejas, 26-11-2026: judge a sector over 1, 2 and 3 years, not 3, 6 and 12
 * months, and by return for the risk taken, as the professional houses do.
 * Every measure here is worked out by the application from prices it fetches
 * itself (Upstox), so none of it has to be found by the research tool.
 *
 * Input bars are { date: 'YYYY-MM-DD', c } in any order and any frequency
 * (daily or weekly); everything is computed on week-end closes, by date, so
 * the result does not depend on the frequency fetched. */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => (isNum(v) ? +v.toFixed(2) : null);
const DAY = 864e5;

/* One close per week (the last close of each ISO week), oldest first. */
export function weekly(bars) {
  const list = (Array.isArray(bars) ? bars : []).filter((b) => b && isNum(b.c) && b.c > 0 && typeof b.date === 'string')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const out = [];
  let lastKey = null;
  for (const b of list) {
    const t = Date.parse(b.date.slice(0, 10) + 'T00:00:00Z');
    if (!isNum(t)) continue;
    /* Week number counted from a Monday. */
    const key = Math.floor((t / DAY + 3) / 7);
    const row = { date: b.date.slice(0, 10), c: b.c };
    if (key === lastKey) out[out.length - 1] = row; else out.push(row);
    lastKey = key;
  }
  return out;
}

/* The close on or before a date. */
const at = (w, iso) => { let hit = null; for (const b of w) { if (b.date <= iso) hit = b; else break; } return hit; };
const back = (iso, months) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() - months); return t.toISOString().slice(0, 10); };
/* A lookback counts only when the series reaches back that far, give or take
   ten days (a listing a week short of three years still counts). */
const reach = (w, iso) => w.length && Date.parse(w[0].date) <= Date.parse(iso) + 10 * DAY;

/* Return over `months`, annualised when over a year. */
export function periodReturn(w, months) {
  if (w.length < 2) return null;
  const last = w[w.length - 1], from = back(last.date, months);
  if (!reach(w, from)) return null;
  const b = at(w, from) || w[0];
  if (!b || !(b.c > 0)) return null;
  const g = last.c / b.c;
  return r2((months > 12 ? Math.pow(g, 12 / months) - 1 : g - 1) * 100);
}

/* Chain-linked equal-weight basket of several stocks: each week's change is
   the average change of the stocks that traded both weeks, so a stock listed
   later joins when it lists without a jump. Two stocks at least each week. */
export function basket(seriesList) {
  const ws = seriesList.map(weekly).filter((w) => w.length >= 2);
  if (ws.length < 2) return [];
  const maps = ws.map((w) => new Map(w.map((b) => [b.date, b.c])));
  const dates = [...new Set(ws.flatMap((w) => w.map((b) => b.date)))].sort();
  const lastSeen = ws.map(() => null);
  const out = [];
  let level = 100;
  for (const d of dates) {
    const ch = [];
    maps.forEach((m, i) => {
      if (!m.has(d)) return;
      const c = m.get(d);
      if (lastSeen[i] != null) ch.push(c / lastSeen[i] - 1);
      lastSeen[i] = c;
    });
    if (out.length && ch.length < 2) continue;
    if (ch.length) level *= 1 + ch.reduce((a, x) => a + x, 0) / ch.length;
    out.push({ date: d, c: +level.toFixed(4) });
  }
  return out;
}

/* Every price measure of one series over the last three years. `bench`, when
   given, is the benchmark's bars, for consistency and relative strength. */
export function priceMetrics(bars, bench) {
  const w = weekly(bars);
  if (w.length < 8) return null;
  const last = w[w.length - 1];
  const from3 = back(last.date, 36);
  const w3 = w.filter((b) => b.date >= from3);
  /* Volatility: the spread of weekly returns, annualised. */
  const rets = [];
  for (let i = 1; i < w3.length; i++) rets.push(Math.log(w3[i].c / w3[i - 1].c));
  const mean = rets.reduce((a, x) => a + x, 0) / (rets.length || 1);
  const vol = rets.length >= 20 ? Math.sqrt(rets.reduce((a, x) => a + (x - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(52) * 100 : null;
  /* Largest fall from a high, over the three years, and where it stands now
     against its three-year high. */
  let peak = -Infinity, dd = 0;
  for (const b of w3) { peak = Math.max(peak, b.c); dd = Math.min(dd, b.c / peak - 1); }
  const hi = Math.max(...w3.map((b) => b.c));
  /* Against its own long-term averages: 52 and 100 weeks. */
  const avgOf = (n) => (w.length >= n ? w.slice(-n).reduce((a, b) => a + b.c, 0) / n : null);
  const a52 = avgOf(52), a100 = avgOf(100);
  const out = {
    y1: periodReturn(w, 12), y2: periodReturn(w, 24), y3: periodReturn(w, 36),
    m3: periodReturn(w, 3), m6: periodReturn(w, 6),
    vol: r2(vol), maxDD: r2(dd * 100), fromHigh: r2((last.c / hi - 1) * 100),
    vs52w: a52 ? r2((last.c / a52 - 1) * 100) : null, vs100w: a100 ? r2((last.c / a100 - 1) * 100) : null,
    years: r2((Date.parse(last.date) - Date.parse(w[0].date)) / (365.25 * DAY)),
    asOf: last.date,
  };
  if (bench) {
    const wb = weekly(bench);
    if (wb.length >= 8) {
      /* Consistency: of the last twelve quarters, how many it beat the
         benchmark in. */
      let beat = 0, n = 0;
      for (let q = 0; q < 12; q++) {
        const e = back(last.date, q * 3), s = back(last.date, q * 3 + 3);
        if (!reach(w, s) || !reach(wb, s)) break;
        const a = at(w, e), b0 = at(w, s), c = at(wb, e), d0 = at(wb, s);
        if (!a || !b0 || !c || !d0) break;
        n++; if (a.c / b0.c > c.c / d0.c) beat++;
      }
      out.quartersBeat = n ? beat : null; out.quarters = n;
      /* Relative strength: the sector ÷ benchmark ratio, month by month over
         the three years (100 at the start), and its change over six months
         (is the lead building or fading). */
      const rs = [];
      for (let m = 36; m >= 0; m--) {
        const iso = back(last.date, m);
        if (!reach(w, iso) || !reach(wb, iso)) continue;
        const a = at(w, iso), b = at(wb, iso);
        if (a && b) rs.push({ date: iso, r: a.c / b.c });
      }
      if (rs.length >= 2) {
        const base = rs[0].r;
        out.rs = rs.map((x) => ({ date: x.date, v: +(x.r / base * 100).toFixed(2) }));
        const six = rs.length > 6 ? rs[rs.length - 7].r : rs[0].r;
        out.rsTrend6m = r2((rs[rs.length - 1].r / six - 1) * 100);
      }
    }
  }
  return out;
}

/* Breadth: of the companies given, how many close above their own 52-week
   average. */
export function breadth(seriesList) {
  const ws = seriesList.map(weekly).filter((w) => w.length >= 52);
  if (!ws.length) return null;
  const above = ws.filter((w) => w[w.length - 1].c > w.slice(-52).reduce((a, b) => a + b.c, 0) / 52).length;
  return { above, of: ws.length, pct: +(above / ws.length * 100).toFixed(1) };
}
