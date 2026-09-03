// integrity.js — Data Source and Integrity Policy (doc 05) enforced in code.
// Every material numeric value travels inside a DataPoint envelope. Values that
// arrive without provenance are rejected, not silently accepted.

export const EVIDENCE = Object.freeze({
  FACT: 'FACT',
  CALCULATION: 'CALCULATION',
  ESTIMATE: 'ESTIMATE',
  ASSUMPTION: 'ASSUMPTION',
  INFERENCE: 'INFERENCE',
  SPECULATION: 'SPECULATION',
});

export const BASIS = Object.freeze({
  CONSOLIDATED: 'consolidated',
  STANDALONE: 'standalone',
  NOT_APPLICABLE: 'n/a',
});

export const TIER = Object.freeze({
  PRIMARY: 1,      // NSE, BSE, SEBI, RBI, filings, annual reports
  INSTITUTIONAL: 2, // World Bank, IMF, OECD, BIS, WTO, UN, industry bodies
  PROFESSIONAL: 3,  // Reuters, Bloomberg, FT, ET, Mint, Screener, Trendlyne
  ALTERNATIVE: 4,   // social/forums — discovery and sentiment only
});

export const UNAVAILABLE = 'Not available / not reliably verifiable.';

/**
 * Build a provenance-carrying numeric fact.
 * Throws rather than guessing, so a missing source can never become a silent zero.
 */
export function dataPoint({
  value, unit = null, currency = null, period = null,
  basis = BASIS.NOT_APPLICABLE, source = null, sourceTier = null,
  sourceDate = null, evidence = EVIDENCE.FACT, note = null,
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return missing(note || UNAVAILABLE);
  }
  if (!source) throw new Error('DataPoint requires a source.');
  if (!sourceTier) throw new Error('DataPoint requires a sourceTier (1-4).');
  if (!EVIDENCE[evidence]) throw new Error(`Unknown evidence label: ${evidence}`);
  if (sourceTier === TIER.ALTERNATIVE && evidence === EVIDENCE.FACT) {
    throw new Error('Tier 4 sources cannot independently support a FACT (doc 05).');
  }
  return Object.freeze({
    available: true, value, unit, currency, period, basis,
    source, sourceTier, sourceDate, evidence, note,
  });
}

export function missing(reason = UNAVAILABLE) {
  return Object.freeze({ available: false, value: null, reason });
}

export function isAvailable(dp) {
  return Boolean(dp && dp.available === true && dp.value !== null);
}

/** Reject silent mixing of reporting bases or period types (doc 05). */
export function assertComparable(a, b, label = 'comparison') {
  if (!isAvailable(a) || !isAvailable(b)) return;
  if (a.basis !== b.basis) {
    throw new Error(`Cannot mix ${a.basis} with ${b.basis} in ${label}.`);
  }
  const kind = (p) => (typeof p === 'string' && p.toUpperCase().includes('TTM') ? 'TTM' : 'FY');
  if (a.period && b.period && kind(a.period) !== kind(b.period)) {
    throw new Error(`Cannot mix ${kind(a.period)} with ${kind(b.period)} in ${label}.`);
  }
}

/**
 * Confidence from source quality, recency, consistency and completeness (doc 05).
 * asOf lets tests pin the clock; defaults to now.
 */
export function confidence({ bestTier = 4, sourceDate = null, coverage = 0, contradictions = 0 }, asOf = new Date()) {
  let score = 0;
  score += { 1: 40, 2: 30, 3: 20, 4: 0 }[bestTier] ?? 0;
  const ageDays = sourceDate ? (asOf - new Date(sourceDate)) / 86400000 : Infinity;
  score += ageDays <= 95 ? 25 : ageDays <= 400 ? 15 : ageDays <= 800 ? 5 : 0;
  score += Math.round(Math.max(0, Math.min(1, coverage)) * 25);
  score += contradictions === 0 ? 10 : contradictions === 1 ? 4 : 0;
  const label = score >= 75 ? 'High' : score >= 50 ? 'Medium' : 'Low';
  return { label, score, stale: ageDays > 400 };
}
