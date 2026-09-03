// scoring.js — Scoring and Ranking Engine (doc 04). Pure functions, no I/O.
// Every component input is a 0-100 sub-score, or null when the underlying data
// is not available. Nulls are never treated as zero.

export const METHODOLOGY_VERSION = '2.0.0';

// Two overall scores closer than this are reported as tied. Ratings are
// judgements on a 0-100 scale with no better resolution than a few points, and
// ranking to one decimal claims a precision that does not exist.
export const NOISE_BAND = 3;

export const PILLARS = Object.freeze({
  businessQuality: {
    label: 'Business quality',
    weights: {
      moat: 15, industryPosition: 10, revenueQuality: 8, pricingPower: 7,
      customerQuality: 5, productQuality: 5, tamRunway: 10, management: 10,
      governance: 10, capitalAllocation: 10, resilience: 10,
    },
  },
  growthMultibagger: {
    label: 'Growth and multibagger',
    weights: {
      tam: 10, revenueRunway: 10, epsGrowth: 10, marketShare: 8, reinvestment: 8,
      incrementalReturns: 10, operatingLeverage: 7, marginExpansion: 7,
      newProductsMarkets: 7, exports: 5, capacity: 5, execution: 8, longevity: 5,
    },
  },
  valuationOpportunity: {
    label: 'Valuation and opportunity',
    weights: {
      dcf: 15, relativeValuation: 10, historicalValuation: 8, peerValuation: 8,
      growthAdjustedValuation: 10, fcfYield: 7, marginOfSafety: 15,
      impliedExpectations: 10, scenarioAsymmetry: 10, catalystAdjusted: 7,
    },
  },
  riskQuality: {
    label: 'Risk and quality control',
    note: 'Higher score means lower risk.',
    weights: {
      balanceSheet: 10, accounting: 12, governance: 12, promoter: 8,
      customerConcentration: 5, regulatory: 7, cyclicality: 5, competition: 7,
      technology: 5, execution: 8, liquidity: 5, geopolitics: 4,
      valuationRisk: 7, dilution: 5,
    },
  },
});

export const OVERALL_WEIGHTS = Object.freeze({
  businessQuality: 0.20,
  growthMultibagger: 0.20,
  financialQuality: 0.10,
  managementGovernance: 0.10,
  valuationExpectedReturn: 0.20,
  risk: 0.10,
  technicalEntry: 0.05,
  catalysts: 0.05,
});

// Below this share of weight present, the result is published but flagged.
export const MIN_COVERAGE = 0.60;

function validComponent(v, key) {
  if (v === null || v === undefined) return false;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`Component "${key}" must be a number 0-100 or null.`);
  }
  if (v < 0 || v > 100) throw new Error(`Component "${key}" out of range: ${v}`);
  return true;
}

/**
 * Weighted average over the components that are actually present.
 * Absent components are dropped and the remaining weights renormalised, so a
 * company is never penalised for data the provider did not supply — but the
 * coverage ratio travels with the score so the gap stays visible.
 */
export function weightedScore(weights, inputs = {}) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let used = 0, acc = 0;
  const missingKeys = [];
  for (const [key, w] of Object.entries(weights)) {
    const v = inputs[key];
    if (validComponent(v, key)) { acc += v * w; used += w; }
    else missingKeys.push(key);
  }
  if (used === 0) {
    return { score: null, coverage: 0, missing: missingKeys, sufficient: false };
  }
  const coverage = used / totalWeight;
  return {
    score: round2(acc / used),
    coverage: round4(coverage),
    missing: missingKeys,
    sufficient: coverage >= MIN_COVERAGE,
  };
}

export function scorePillar(pillarKey, inputs) {
  const pillar = PILLARS[pillarKey];
  if (!pillar) throw new Error(`Unknown pillar: ${pillarKey}`);
  return { pillar: pillarKey, label: pillar.label, ...weightedScore(pillar.weights, inputs) };
}

/**
 * Overall Investment Score.
 * `dimensions` holds 0-100 values (or null) for the eight keys in OVERALL_WEIGHTS.
 * `overrides` may replace sector weights; it must still sum to 1 and is recorded
 * on the result so the deviation is auditable.
 */
export function overallScore(dimensions = {}, { overrides = null, sector = null } = {}) {
  let weights = OVERALL_WEIGHTS;
  if (overrides) {
    const sum = Object.values(overrides).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) throw new Error(`Sector weight overrides must sum to 1, got ${sum}`);
    for (const k of Object.keys(overrides)) {
      if (!(k in OVERALL_WEIGHTS)) throw new Error(`Unknown overall dimension: ${k}`);
    }
    weights = overrides;
  }
  const r = weightedScore(weights, dimensions);
  return {
    ...r,
    methodologyVersion: METHODOLOGY_VERSION,
    weights,
    weightsOverridden: Boolean(overrides),
    sector,
  };
}

/** Forensic bands, doc 04. */
export function forensicBand(score) {
  if (score === null || score === undefined) return { band: 'Unscored', severe: false };
  if (score >= 85) return { band: 'Excellent', severe: false };
  if (score >= 70) return { band: 'Good', severe: false };
  if (score >= 55) return { band: 'Acceptable', severe: false };
  if (score >= 40) return { band: 'Concerning', severe: false };
  return { band: 'High Risk', severe: true };
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
