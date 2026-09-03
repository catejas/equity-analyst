// technicals.js — price and volume analysis (doc 01).
// Pure functions over an ordered series, oldest first.
//
// Technical readings inform entry context only. They never override a severe
// fundamental red flag, and this module has no path to the kill switch.

const round2 = (n) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function refuse(reason, indicator) {
  return Object.freeze({ available: false, value: null, reason, indicator, evidence: 'CALCULATION' });
}

/** Refuse rather than pad: an indicator computed on too little history lies. */
function checkSeries(series, minimum, indicator) {
  if (!Array.isArray(series)) return refuse('A price series is required.', indicator);
  if (series.some((v) => !isNum(v))) return refuse('The series contains non-numeric values.', indicator);
  if (series.length < minimum) {
    return refuse(`Needs at least ${minimum} periods, received ${series.length}.`, indicator);
  }
  return null;
}

export function sma(series, period) {
  const bad = checkSeries(series, period, `SMA${period}`);
  if (bad) return bad;
  const window = series.slice(-period);
  return Object.freeze({
    available: true, indicator: `SMA${period}`,
    value: round2(window.reduce((a, b) => a + b, 0) / period),
    evidence: 'CALCULATION',
  });
}

export function emaSeries(series, period) {
  if (!Array.isArray(series) || series.length < period) return null;
  const k = 2 / (period + 1);
  let prev = series.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [prev];
  for (let i = period; i < series.length; i++) {
    prev = series[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(series, period) {
  const bad = checkSeries(series, period, `EMA${period}`);
  if (bad) return bad;
  const s = emaSeries(series, period);
  return Object.freeze({
    available: true, indicator: `EMA${period}`, value: round2(s[s.length - 1]), evidence: 'CALCULATION',
  });
}

/** Wilder's RSI. Needs period + 1 closes to form the first average. */
export function rsi(closes, period = 14) {
  const bad = checkSeries(closes, period + 1, `RSI${period}`);
  if (bad) return bad;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gain += change; else loss -= change;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  return Object.freeze({
    available: true, indicator: `RSI${period}`, value: round2(value), evidence: 'CALCULATION',
    reading: value >= 70 ? 'overbought' : value <= 30 ? 'oversold' : 'neutral',
  });
}

export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const bad = checkSeries(closes, slow + signal, 'MACD');
  if (bad) return bad;
  const fastLine = emaSeries(closes, fast);
  const slowLine = emaSeries(closes, slow);
  const offset = fastLine.length - slowLine.length;
  const macdLine = slowLine.map((v, i) => fastLine[i + offset] - v);
  const signalLine = emaSeries(macdLine, signal);
  if (!signalLine) return refuse('Not enough history to form the signal line.', 'MACD');
  const m = round2(macdLine[macdLine.length - 1]);
  const sig = round2(signalLine[signalLine.length - 1]);
  return Object.freeze({
    available: true, indicator: 'MACD', value: m, signal: sig,
    histogram: round2(m - sig), reading: m > sig ? 'above signal' : 'below signal',
    evidence: 'CALCULATION',
  });
}

/** Average true range. Needs highs, lows and closes of equal length. */
export function atr(highs, lows, closes, period = 14) {
  if (![highs, lows, closes].every(Array.isArray)) return refuse('Highs, lows and closes are required.', `ATR${period}`);
  if (highs.length !== lows.length || lows.length !== closes.length) {
    return refuse('Highs, lows and closes must be the same length.', `ATR${period}`);
  }
  const bad = checkSeries(closes, period + 1, `ATR${period}`);
  if (bad) return bad;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  let value = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) value = (value * (period - 1) + trs[i]) / period;
  const last = closes[closes.length - 1];
  return Object.freeze({
    available: true, indicator: `ATR${period}`, value: round2(value),
    percentOfPrice: last > 0 ? round2((value / last) * 100) : null,
    evidence: 'CALCULATION',
  });
}

export function bollinger(closes, period = 20, deviations = 2) {
  const bad = checkSeries(closes, period, 'Bollinger');
  if (bad) return bad;
  const window = closes.slice(-period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const last = closes[closes.length - 1];
  const upper = mean + deviations * sd, lower = mean - deviations * sd;
  return Object.freeze({
    available: true, indicator: 'Bollinger', middle: round2(mean),
    upper: round2(upper), lower: round2(lower), width: round2(upper - lower),
    position: upper === lower ? null : round2(((last - lower) / (upper - lower)) * 100),
    evidence: 'CALCULATION',
  });
}

/** On-balance volume. Direction matters far more than the absolute level. */
export function obv(closes, volumes) {
  if (!Array.isArray(closes) || !Array.isArray(volumes)) return refuse('Closes and volumes are required.', 'OBV');
  if (closes.length !== volumes.length) return refuse('Closes and volumes must be the same length.', 'OBV');
  const bad = checkSeries(closes, 2, 'OBV');
  if (bad) return bad;
  let value = 0;
  const line = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) value += volumes[i];
    else if (closes[i] < closes[i - 1]) value -= volumes[i];
    line.push(value);
  }
  const recent = line.slice(-Math.min(20, line.length));
  return Object.freeze({
    available: true, indicator: 'OBV', value: round2(value),
    trend: recent[recent.length - 1] > recent[0] ? 'accumulation' : recent[recent.length - 1] < recent[0] ? 'distribution' : 'flat',
    evidence: 'CALCULATION',
  });
}

/** Relative strength against a benchmark over the same window. */
export function relativeStrength(closes, benchmarkCloses, periods = 250) {
  if (!Array.isArray(closes) || !Array.isArray(benchmarkCloses)) {
    return refuse('Both series are required.', 'Relative strength');
  }
  const n = Math.min(periods, closes.length, benchmarkCloses.length);
  if (n < 2) return refuse('Needs at least two comparable periods.', 'Relative strength');
  const stock = closes.slice(-n), bench = benchmarkCloses.slice(-n);
  if (stock[0] <= 0 || bench[0] <= 0) return refuse('Base values must be positive.', 'Relative strength');
  // Round the components first, then subtract, so the reported difference
  // matches the two numbers printed beside it. A report where 88.18 minus
  // 23.71 reads as 64.46 destroys trust in every other figure on the page.
  const stockReturn = round2((stock[n - 1] / stock[0] - 1) * 100);
  const benchReturn = round2((bench[n - 1] / bench[0] - 1) * 100);
  return Object.freeze({
    available: true, indicator: 'Relative strength', periods: n,
    stockReturn, benchmarkReturn: benchReturn,
    value: round2(stockReturn - benchReturn),
    reading: stockReturn > benchReturn ? 'outperforming' : 'underperforming',
    evidence: 'CALCULATION',
  });
}

/** Position within the 52-week range, and distance from the high. */
export function rangePosition(closes, periods = 250) {
  const bad = checkSeries(closes, 2, '52-week range');
  if (bad) return bad;
  const window = closes.slice(-Math.min(periods, closes.length));
  const high = Math.max(...window), low = Math.min(...window);
  const last = window[window.length - 1];
  return Object.freeze({
    available: true, indicator: '52-week range', high: round2(high), low: round2(low),
    value: high === low ? null : round2(((last - low) / (high - low)) * 100),
    fromHigh: high > 0 ? round2(((last - high) / high) * 100) : null,
    evidence: 'CALCULATION',
  });
}

/** Swing highs and lows as candidate support and resistance. */
export function supportResistance(closes, lookback = 5) {
  const bad = checkSeries(closes, lookback * 2 + 1, 'Support and resistance');
  if (bad) return bad;
  const highs = [], lows = [];
  for (let i = lookback; i < closes.length - lookback; i++) {
    const window = closes.slice(i - lookback, i + lookback + 1);
    if (closes[i] === Math.max(...window)) highs.push(round2(closes[i]));
    if (closes[i] === Math.min(...window)) lows.push(round2(closes[i]));
  }
  const last = closes[closes.length - 1];
  return Object.freeze({
    available: true, indicator: 'Support and resistance',
    resistance: highs.filter((h) => h > last).sort((a, b) => a - b).slice(0, 3),
    support: lows.filter((l) => l < last).sort((a, b) => b - a).slice(0, 3),
    evidence: 'CALCULATION',
  });
}

/**
 * Entry context only. Returns a plain summary and an explicit reminder that a
 * fundamental red flag outranks anything here (doc 01).
 */
export function entryContext({ closes, volumes = null, benchmarkCloses = null }) {
  const parts = {
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    bollinger: bollinger(closes),
    range: rangePosition(closes),
    levels: supportResistance(closes),
    obv: volumes ? obv(closes, volumes) : refuse('No volume series supplied.', 'OBV'),
    relativeStrength: benchmarkCloses
      ? relativeStrength(closes, benchmarkCloses)
      : refuse('No benchmark series supplied.', 'Relative strength'),
  };
  const available = Object.values(parts).filter((p) => p.available).length;
  return Object.freeze({
    parts,
    coverage: Object.keys(parts).length ? available / Object.keys(parts).length : 0,
    trend: parts.sma50.available && parts.sma200.available
      ? (parts.sma50.value > parts.sma200.value ? 'above the 200 day average' : 'below the 200 day average')
      : 'not determinable',
    caveat: 'Entry context only. A severe fundamental red flag outranks every reading here.',
  });
}
