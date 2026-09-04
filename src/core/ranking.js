// ranking.js — Top 3 / Top 10 / full screened universe, plus the kill switch.
// A company excluded from the Top 3 still appears in the full universe with a
// stated reason. Nothing disappears silently.

import { forensicBand, NOISE_BAND } from './scoring.js';

// Only these five can trigger the kill switch (doc 01).
export const KILL_SWITCH_CATEGORIES = Object.freeze([
  'accounting', 'governance', 'promoter', 'solvency', 'dataIntegrity',
]);

// The full taxonomy a flag may use. Categories outside the kill-switch set are
// recorded and scored, but never on their own bar a company from the Top 3.
export const FLAG_CATEGORIES = Object.freeze([
  ...KILL_SWITCH_CATEGORIES,
  'regulatory', 'cyclicality', 'competition', 'technology', 'execution',
  'liquidity', 'geopolitics', 'valuation', 'dilution', 'customerConcentration',
]);

export const SEVERITIES = Object.freeze(['low', 'moderate', 'severe']);

/* Words that mean the same thing. A researcher writing "high" for a risk is not
   making a mistake, they are using the ordinary word; rejecting a whole payload
   over it would be pedantry dressed up as rigour. Anything unambiguous is
   normalised to the canonical three and the payload is accepted. */
const SEVERITY_SYNONYMS = Object.freeze({
  severe: 'severe', high: 'severe', critical: 'severe', major: 'severe',
  serious: 'severe', 'very high': 'severe', extreme: 'severe',
  moderate: 'moderate', medium: 'moderate', mid: 'moderate', material: 'moderate',
  significant: 'moderate',
  low: 'low', minor: 'low', small: 'low', negligible: 'low', immaterial: 'low',
  'very low': 'low', limited: 'low',
});

/** Canonical severity, or null when the word cannot be read as one of the three. */
export function normaliseSeverity(v) {
  if (typeof v !== 'string') return null;
  return SEVERITY_SYNONYMS[v.trim().toLowerCase()] || null;
}

/**
 * Decide Top-3 eligibility (doc 01 red-flag kill switch, DEC-009).
 * Returns every reason found, not just the first.
 */
export function evaluateKillSwitch(company) {
  const reasons = [];

  // Flags raised by the forensic engine and the register battery are treated
  // exactly like flags stated in the payload. A finding the app computed is not
  // weaker evidence than a finding the payload asserted.
  const flags = [
    ...(company.redFlags || []),
    ...(company.forensic?.killSwitchFlags || []),
    ...(company.litigation?.killSwitchFlags || []),
  ];

  for (const flag of flags) {
    if (!FLAG_CATEGORIES.includes(flag.category)) {
      throw new Error(`Unknown red-flag category: ${flag.category}`);
    }
    const severity = normaliseSeverity(flag.severity);
    if (!severity) throw new Error(`Unknown severity: ${flag.severity}`);
    if (severity === 'severe' && KILL_SWITCH_CATEGORIES.includes(flag.category)) {
      reasons.push(`Severe ${flag.category} concern: ${flag.detail}`);
    }
  }
  const fb = forensicBand(company.forensicScore ?? null);
  if (fb.severe) reasons.push(`Forensic score ${company.forensicScore} falls in the High Risk band.`);
  if (company.forensicScore === null || company.forensicScore === undefined) {
    reasons.push('Forensic assessment not completed.');
  }

  // Litigation coverage. A clean record found across two registers is not a
  // clean record; it is two registers. Thin coverage bars the Top 3.
  if (company.litigation && company.litigation.available === true && company.litigation.sufficient === false) {
    reasons.push(company.litigation.caveat
      || 'Essential litigation registers were never searched, so the absence of findings means nothing.');
  }
  if (company.litigation && company.litigation.available === false) {
    reasons.push('No litigation search was recorded. An empty list is not evidence that nothing exists.');
  }
  if (company.overall && company.overall.sufficient === false) {
    reasons.push(`Data coverage ${(company.overall.coverage * 100).toFixed(0)}% is below the 60% threshold.`);
  }
  return { eligibleForTop3: reasons.length === 0, exclusionReasons: reasons };
}

/**
 * Deterministic ordering. Unscored companies always sort last rather than
 * ranking as zero. Ties break on risk, then coverage, then symbol.
 */
export function compareCompanies(a, b) {
  const sa = a.overall?.score, sb = b.overall?.score;
  if (sa === null || sa === undefined) return (sb === null || sb === undefined) ? cmpSymbol(a, b) : 1;
  if (sb === null || sb === undefined) return -1;

  /* Coverage is a precondition for comparison, not a tiebreak. A company rated
     on one component out of fifty-two can score higher than a fully researched
     one, because the missing weights are renormalised away — so a thin entry
     would outrank thorough work on the strength of a single lucky rating. Every
     company that clears the coverage floor sorts above every company that does
     not, whatever the scores say. */
  const suffA = a.overall?.sufficient !== false;
  const suffB = b.overall?.sufficient !== false;
  if (suffA !== suffB) return suffA ? -1 : 1;

  if (sb !== sa) return sb - sa;
  const ra = a.dimensions?.risk ?? -1, rb = b.dimensions?.risk ?? -1;
  if (rb !== ra) return rb - ra;
  const ca = a.overall?.coverage ?? 0, cb = b.overall?.coverage ?? 0;
  if (cb !== ca) return cb - ca;
  return cmpSymbol(a, b);
}

const cmpSymbol = (a, b) => String(a.symbol || '').localeCompare(String(b.symbol || ''));

/**
 * Rank a screened universe.
 * Returns Top 3 (kill-switch filtered), Top 10 and the full ranked list with
 * exclusion reasons attached to each excluded company.
 */
export function rankUniverse(companies = []) {
  const assessed = companies.map((c) => {
    const ks = evaluateKillSwitch(c);
    return { ...c, ...ks, forensicBand: forensicBand(c.forensicScore ?? null).band };
  });
  const sorted = [...assessed].sort(compareCompanies);

  // Companies within the noise band share a rank. A dense ranking is used, so
  // three companies tied first are all rank 1 and the next is rank 2.
  let rank = 0;
  let anchor = null;
  let anchorSufficient = null;
  const ranked = sorted.map((c) => {
    const score = c.overall?.score;
    if (score === null || score === undefined) return { ...c, rank: null, tied: false };
    const sufficient = c.overall?.sufficient !== false;
    if (anchor === null || sufficient !== anchorSufficient
        || Math.abs(anchor - score) > NOISE_BAND) {
      rank += 1; anchor = score; anchorSufficient = sufficient;
    }
    return { ...c, rank, tiedWithinBand: anchor !== score };
  });
  const tiedCount = new Map();
  for (const c of ranked) if (c.rank !== null) tiedCount.set(c.rank, (tiedCount.get(c.rank) || 0) + 1);
  for (const c of ranked) c.tied = c.rank !== null && tiedCount.get(c.rank) > 1;

  const eligible = ranked.filter((c) => c.eligibleForTop3 && c.overall?.score !== null && c.overall?.score !== undefined);
  const scored = ranked.filter((c) => c.overall?.score !== null && c.overall?.score !== undefined);

  return {
    top3: eligible.slice(0, 3),
    top10: scored.slice(0, 10),
    full: ranked,
    excludedFromTop3: ranked.filter((c) => !c.eligibleForTop3),
    unscored: ranked.filter((c) => c.overall?.score === null || c.overall?.score === undefined),
    counts: { universe: ranked.length, scored: scored.length, top3Eligible: eligible.length },
    noiseBand: NOISE_BAND,
    ties: [...tiedCount.entries()].filter(([, n]) => n > 1)
      .map(([r, n]) => `${n} companies are tied at rank ${r}; their scores differ by less than the ${NOISE_BAND}-point noise band.`),
  };
}

/** Lens rankings (doc 02). These deliberately return different companies. */
export const LENSES = Object.freeze({
  bestBusiness: (c) => c.pillars?.businessQuality?.score ?? null,
  bestInvestmentToday: (c) => c.overall?.score ?? null,
  highestMultibagger: (c) => c.pillars?.growthMultibagger?.score ?? null,
  bestValueGarp: (c) => c.pillars?.valuationOpportunity?.score ?? null,
});

export function rankByLens(companies, lens) {
  const fn = LENSES[lens];
  if (!fn) throw new Error(`Unknown lens: ${lens}`);
  return [...companies]
    .filter((c) => fn(c) !== null && fn(c) !== undefined)
    .sort((a, b) => (fn(b) - fn(a)) || cmpSymbol(a, b));
}
