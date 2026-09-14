// indicators.js — the technical panel, computed from a price series.
//
// Everything here is arithmetic on a series. Nothing is rated, nothing is
// opinion: the same closes always produce the same numbers, which is the whole
// reason for computing these in the app rather than asking a model for them.
//
// The series is deliberately source-agnostic. It may have been transcribed into
// a payload by a chat model, or fetched from a price API through a proxy — this
// file neither knows nor cares. What it does care about is being told how many
// points it has and at what spacing, because an indicator computed on weekly
// bars is not the same indicator computed on daily ones and must not be
// presented as though it were.
//
// Every result carries `available`. When a window is longer than the series,
// the answer is "not enough history", never a number computed on a short window
// and quietly labelled as though it were the real thing.

import { sma, ema, rsi, macd, bollinger, atr, obv, supportResistance, rangePosition } from './technicals.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clean = (a) => (Array.isArray(a) ? a.filter(isNum) : []);

/** Not enough history is a finding, not a failure. */
function absent(indicator, need, have) {
  return {
    available: false,
    indicator,
    value: null,
    reason: `needs ${need} points, has ${have}`,
  };
}

/**
 * The longest window a series can actually carry, for indicators whose label is
 * a convention rather than a requirement.
 *
 * A company listed four months ago has ninety days of history and will never
 * have two hundred. Refusing every long average leaves its report with the
 * technical section blank, which tells the reader nothing about the company and
 * everything about our arithmetic. So the window is shortened to what exists,
 * the reading is computed, and it is labelled with the period actually used —
 * "SMA 200 (90 points, the full history)" is honest and useful, where a blank
 * row is neither. Nothing is extrapolated and no figure is invented; a shorter
 * average is simply a shorter average, and the report says so.
 */
function fitWindow(want, have, { min = 5 } = {}) {
  if (have >= want + 1) return { n: want, short: false };
  const n = Math.max(min, have - 1);
  if (n < min) return null;
  return { n, short: true };
}

/* ---------------------------------------------------------------- Hull MA */

/**
 * Hull moving average. Weighted MA of (2 × WMA(n/2) − WMA(n)), smoothed over
 * √n. It turns faster than an SMA of the same length without the lag, which is
 * the only reason to prefer it.
 */
export function hullMA(closes, period = 20) {
  const c = clean(closes);
  if (c.length < period + Math.round(Math.sqrt(period))) {
    return absent(`Hull MA ${period}`, period + Math.round(Math.sqrt(period)), c.length);
  }
  const wma = (arr, n) => {
    const out = [];
    const denom = (n * (n + 1)) / 2;
    for (let i = n - 1; i < arr.length; i += 1) {
      let s = 0;
      for (let j = 0; j < n; j += 1) s += arr[i - n + 1 + j] * (j + 1);
      out.push(s / denom);
    }
    return out;
  };
  const half = Math.max(1, Math.round(period / 2));
  const sqrtN = Math.max(1, Math.round(Math.sqrt(period)));
  const wHalf = wma(c, half);
  const wFull = wma(c, period);
  const offset = wHalf.length - wFull.length;
  const raw = wFull.map((v, i) => 2 * wHalf[i + offset] - v);
  const hull = wma(raw, sqrtN);
  const value = hull[hull.length - 1];
  const prev = hull[hull.length - 2];
  return {
    available: true,
    indicator: `Hull MA ${period}`,
    value: Math.round(value * 100) / 100,
    turning: isNum(prev) ? (value > prev ? 'up' : value < prev ? 'down' : 'flat') : null,
    evidence: 'CALCULATION',
  };
}

/* ------------------------------------------------------------------- PSAR */

/**
 * Parabolic SAR. Needs highs and lows; with closes alone the stop has nothing
 * to trail and the answer is that it cannot be computed, rather than a figure
 * derived from the wrong series.
 */
export function psar(highs, lows, { step = 0.02, max = 0.2 } = {}) {
  const h = clean(highs);
  const l = clean(lows);
  if (h.length < 5 || l.length < 5 || h.length !== l.length) {
    return absent('PSAR', 5, Math.min(h.length, l.length));
  }
  let rising = true;
  let sar = l[0];
  let ep = h[0];
  let af = step;
  for (let i = 1; i < h.length; i += 1) {
    sar += af * (ep - sar);
    if (rising) {
      if (l[i] < sar) { rising = false; sar = ep; ep = l[i]; af = step; }
      else if (h[i] > ep) { ep = h[i]; af = Math.min(max, af + step); }
    } else {
      if (h[i] > sar) { rising = true; sar = ep; ep = h[i]; af = step; }
      else if (l[i] < ep) { ep = l[i]; af = Math.min(max, af + step); }
    }
  }
  return {
    available: true,
    indicator: 'PSAR',
    value: Math.round(sar * 100) / 100,
    trend: rising ? 'rising' : 'falling',
    evidence: 'CALCULATION',
  };
}

/* --------------------------------------------------------------- momentum */

/** Rate of change over a window, as a percentage. */
export function momentum(closes, period = 63) {
  const c = clean(closes);
  const fit = fitWindow(period, c.length, { min: 5 });
  if (!fit) return absent(`Momentum ${period}`, period + 1, c.length);
  const now = c[c.length - 1];
  const then = c[c.length - 1 - fit.n];
  if (!then) return absent(`Momentum ${period}`, period + 1, c.length);
  return {
    available: true,
    indicator: `Momentum ${period}` + (fit.short ? ` (${fit.n} points — the full history)` : ''),
    value: Math.round(((now - then) / then) * 1000) / 10,
    unit: '%',
    shortened: fit.short,
    windowUsed: fit.n,
    evidence: 'CALCULATION',
  };
}

/* ------------------------------------------------------------------ trend */

/**
 * Trend from the stack of moving averages and where price sits in it. This is
 * the plainest reading available and it is deliberately not a score: it names
 * the arrangement and leaves the judgement to the reader.
 */
export function trend(closes) {
  const c = clean(closes);
  if (c.length < 50) return absent('Trend', 50, c.length);
  const price = c[c.length - 1];
  const m = {};
  [20, 50, 100, 200].forEach((n) => { const r = sma(c, n); if (r.available) m[n] = r.value; });
  const have = Object.keys(m).map(Number).sort((a, b) => a - b);
  if (have.length < 2) return absent('Trend', 50, c.length);

  const stacked = have.every((n, i) => i === 0 || m[have[i - 1]] >= m[n]);
  const inverted = have.every((n, i) => i === 0 || m[have[i - 1]] <= m[n]);
  const above = have.filter((n) => price > m[n]).length;

  let reading;
  if (stacked && price > m[have[0]]) reading = 'Uptrend — price above a rising stack of averages';
  else if (inverted && price < m[have[0]]) reading = 'Downtrend — price below an inverted stack';
  else if (above === have.length) reading = 'Above every average, but the stack is not aligned';
  else if (above === 0) reading = 'Below every average';
  else reading = `Mixed — above ${above} of ${have.length} averages`;

  return {
    available: true,
    indicator: 'Trend',
    value: reading,
    averages: m,
    aboveCount: above,
    of: have.length,
    evidence: 'CALCULATION',
  };
}

/* --------------------------------------------------------------- breakout */

/**
 * The twenty-day-high test, with volume confirmation when volume is supplied.
 * A breakout on no volume is a fact worth printing differently from a breakout
 * on three times average volume, so the two are reported separately rather than
 * collapsed into one verdict.
 */
export function breakout(closes, volumes, { window = 20, unit = 'day' } = {}) {
  const c = clean(closes);
  if (c.length < window + 1) return absent(`${window}-${unit} high breakout`, window + 1, c.length);
  const price = c[c.length - 1];
  const prior = c.slice(-(window + 1), -1);
  const priorHigh = Math.max(...prior);
  const broke = price > priorHigh;

  let volumeSpike = null;
  const v = clean(volumes);
  if (v.length >= window + 1) {
    const recent = v[v.length - 1];
    const avg = v.slice(-(window + 1), -1).reduce((a, b) => a + b, 0) / window;
    if (avg > 0) volumeSpike = Math.round((recent / avg) * 100) / 100;
  }

  return {
    available: true,
    indicator: `${window}-${unit} high breakout`,
    value: broke,
    priorHigh: Math.round(priorHigh * 100) / 100,
    price: Math.round(price * 100) / 100,
    distancePct: Math.round(((price - priorHigh) / priorHigh) * 1000) / 10,
    volumeSpike,
    confirmed: broke && volumeSpike != null && volumeSpike >= 1.5,
    note: volumeSpike == null ? 'no volume supplied, so the breakout is unconfirmed' : null,
    evidence: 'CALCULATION',
  };
}

/* ------------------------------------------------------------------ panel */

/** Windows scaled for the spacing of the series. */
function windowsFor(spacing) {
  if (spacing === 'weekly') {
    /* A 200-day average is roughly 40 weekly bars. The names keep the daily
       convention because that is what a reader recognises, and the panel states
       the spacing so the two are never confused. */
    return { mas: [[20, 4], [50, 10], [100, 20], [200, 40]], rsi: 14, momentum: 13, breakout: 4 };
  }
  return { mas: [[20, 20], [50, 50], [100, 100], [200, 200]], rsi: 14, momentum: 63, breakout: 20 };
}

/**
 * Everything, from one series.
 *
 * @param {object} series  { closes, highs, lows, volumes, spacing, asOf, source }
 */
export function panel(series) {
  const s = series && typeof series === 'object' ? series : {};
  const closes = clean(s.closes);
  const spacing = s.spacing === 'weekly' ? 'weekly' : 'daily';
  const W = windowsFor(spacing);

  if (closes.length < 10) {
    return {
      available: false,
      reason: `a price series of at least 10 points is needed; ${closes.length} supplied`,
      spacing, points: closes.length, source: s.source || null, indicators: {},
    };
  }

  const out = {};
  W.mas.forEach(([label, n]) => {
    const fit = fitWindow(n, closes.length);
    if (!fit) { out[`sma${label}`] = absent(`SMA ${label}`, n, closes.length); return; }
    const r = sma(closes, fit.n);
    if (!r.available) { out[`sma${label}`] = absent(`SMA ${label}`, n, closes.length); return; }
    const suffix = fit.short
      ? ` (${fit.n} of ${n} points \u2014 the full history)`
      : (spacing === 'weekly' ? ` (\u2248${n} weekly bars)` : '');
    out[`sma${label}`] = { ...r, indicator: `SMA ${label}${suffix}`, shortened: fit.short,
      windowUsed: fit.n, windowWanted: n };
  });
  out.rsi = rsi(closes, W.rsi);
  out.macd = macd(closes);
  out.bollinger = bollinger(closes, 20, 2);
  out.hull = hullMA(closes, 20);
  out.psar = psar(s.highs, s.lows);
  out.momentum = momentum(closes, W.momentum);
  out.trend = trend(closes);
  out.breakout = breakout(closes, s.volumes,
    { window: W.breakout, unit: spacing === 'weekly' ? 'week' : 'day' });
  out.supportResistance = supportResistance(closes);
  out.range = rangePosition(closes);
  if (clean(s.volumes).length >= 20) {
    out.obv = obv(closes, s.volumes);
    out.volumeProfile = volumeProfile(closes, s.volumes, { window: W.breakout });
  }
  out.renko = renko(closes, { highs: s.highs, lows: s.lows });
  if (clean(s.highs).length && clean(s.lows).length) out.atr = atr(s.highs, s.lows, closes);

  const computed = Object.values(out).filter((x) => x && x.available).length;
  const shortened = Object.values(out).filter((x) => x && x.shortened);
  /* A newly listed company has a short history and always will. Saying so once,
     plainly, is better than leaving half the panel blank or letting a reader
     assume a 200-day average rests on 200 days. */
  const shortNote = shortened.length
    ? `This company has ${closes.length} ${spacing} points of price history. `
      + `${shortened.length} reading${shortened.length > 1 ? 's were' : ' was'} computed over the `
      + 'full history available rather than the usual window, and each says so. Treat the longer '
      + 'averages as indicative until more history exists.'
    : null;
  return {
    available: computed > 0,
    shortHistory: shortened.length > 0,
    shortNote,
    spacing,
    points: closes.length,
    asOf: s.asOf || null,
    source: s.source || null,
    computed,
    of: Object.keys(out).length,
    indicators: out,
  };
}

/* ============================ Tier 2: volume =============================
   Volume is what separates a price that moved from a price that was pushed.
   Everything here needs a volume series and says so plainly when it has none —
   a volume reading invented from prices would be worse than no reading. */

/**
 * Volume analysis: the trend in participation, and whether the latest bar is
 * unusual against its own recent history.
 */
export function volumeProfile(closes, volumes, { window = 20 } = {}) {
  const v = clean(volumes);
  const c = clean(closes);
  if (v.length < window + 1) return absent('Volume analysis', window + 1, v.length);

  const recent = v[v.length - 1];
  const base = v.slice(-(window + 1), -1);
  const avg = base.reduce((a, b) => a + b, 0) / base.length;
  const ratio = avg > 0 ? recent / avg : null;

  /* Volume on up bars against volume on down bars: accumulation or
     distribution, which a raw average cannot show. */
  let up = 0; let down = 0;
  const n = Math.min(window, c.length - 1, v.length - 1);
  for (let i = v.length - n; i < v.length; i += 1) {
    const ci = c.length - (v.length - i);
    if (ci <= 0) continue;
    if (c[ci] > c[ci - 1]) up += v[i]; else if (c[ci] < c[ci - 1]) down += v[i];
  }
  const pressure = (up + down) > 0 ? up / (up + down) : null;

  return {
    available: true,
    indicator: 'Volume analysis',
    value: ratio == null ? null : Math.round(ratio * 100) / 100,
    unit: '× average',
    averageVolume: Math.round(avg),
    latestVolume: Math.round(recent),
    buyingPressure: pressure == null ? null : Math.round(pressure * 1000) / 10,
    reading: ratio == null ? null
      : ratio >= 2 ? 'heavy' : ratio >= 1.5 ? 'elevated' : ratio <= 0.5 ? 'thin' : 'ordinary',
    evidence: 'CALCULATION',
  };
}

/**
 * Renko. Price is reduced to bricks of a fixed size and time is discarded, so
 * only moves that clear the brick size register. The brick is set from ATR when
 * highs and lows are available, and from a percentage of price otherwise —
 * stated either way, because a Renko chart means nothing without its brick size.
 */
export function renko(closes, { brick = null, highs = null, lows = null } = {}) {
  const c = clean(closes);
  if (c.length < 20) return absent('Renko', 20, c.length);

  let size = brick;
  let basis = 'given';
  if (!isNum(size) || size <= 0) {
    const h = clean(highs); const l = clean(lows);
    if (h.length === c.length && l.length === c.length) {
      const a = atr(h, l, c);
      if (a && a.available && isNum(a.value)) { size = a.value; basis = 'ATR'; }
    }
    if (!isNum(size) || size <= 0) { size = c[c.length - 1] * 0.02; basis = '2% of price'; }
  }

  const bricks = [];
  let anchor = c[0];
  let dir = 0;
  for (let i = 1; i < c.length; i += 1) {
    const move = c[i] - anchor;
    const count = Math.floor(Math.abs(move) / size);
    if (count < 1) continue;
    const step = move > 0 ? 1 : -1;
    for (let k = 0; k < count; k += 1) {
      anchor += step * size;
      bricks.push(step);
    }
    dir = step;
  }
  if (!bricks.length) return absent('Renko', 20, c.length);

  let run = 1;
  for (let i = bricks.length - 2; i >= 0; i -= 1) {
    if (bricks[i] === bricks[bricks.length - 1]) run += 1; else break;
  }
  const ups = bricks.filter((b) => b > 0).length;
  return {
    available: true,
    indicator: 'Renko',
    value: dir > 0 ? 'rising' : dir < 0 ? 'falling' : 'flat',
    brickSize: Math.round(size * 100) / 100,
    brickBasis: basis,
    bricks: bricks.length,
    upBricks: ups,
    downBricks: bricks.length - ups,
    currentRun: run,
    evidence: 'CALCULATION',
  };
}
