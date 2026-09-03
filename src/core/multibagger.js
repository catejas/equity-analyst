// multibagger.js — doc 04 / doc 01 multibagger discipline.
// Potential (arithmetic) is computed here. Probability is a separate, evidenced
// judgement and is never inferred from the required CAGR alone.

export const HORIZONS = Object.freeze([
  { key: '1-3', label: '1 to 3 years', years: 3 },
  { key: '3-5', label: '3 to 5 years', years: 5 },
  { key: '5-10', label: '5 to 10 years', years: 10 },
  { key: '10+', label: '10 years or more', years: 15 },
]);

export const MULTIPLES = Object.freeze([3, 5, 10]);

/** Compound annual growth rate required to reach `multiple` over `years`. */
export function requiredCagr(multiple, years) {
  if (!(multiple > 0)) throw new Error('multiple must be > 0');
  if (!(years > 0)) throw new Error('years must be > 0');
  return Math.pow(multiple, 1 / years) - 1;
}

/**
 * Grid of required CAGRs. Returns arithmetic only.
 * `plausibility` must be supplied from evidenced analysis, or stays null.
 */
export function multibaggerGrid({ multiples = MULTIPLES, horizons = HORIZONS, plausibility = {} } = {}) {
  return multiples.map((m) => ({
    multiple: m,
    horizons: horizons.map((h) => ({
      horizon: h.key,
      years: h.years,
      requiredCagr: round4(requiredCagr(m, h.years)),
      requiredCagrPct: round2(requiredCagr(m, h.years) * 100),
      plausibility: plausibility?.[`${m}x@${h.key}`] ?? null,
    })),
  }));
}

/**
 * Implied terminal value chain: revenue -> margin -> earnings -> exit multiple.
 * Every argument must be an explicit assumption; nothing is defaulted.
 */
export function impliedValueChain({ baseRevenue, revenueCagr, years, terminalNetMargin, exitPe, sharesOutstanding }) {
  const req = { baseRevenue, revenueCagr, years, terminalNetMargin, exitPe, sharesOutstanding };
  for (const [k, v] of Object.entries(req)) {
    if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`impliedValueChain requires numeric ${k}`);
  }
  const terminalRevenue = baseRevenue * Math.pow(1 + revenueCagr, years);
  const terminalEarnings = terminalRevenue * terminalNetMargin;
  const terminalMarketCap = terminalEarnings * exitPe;
  return {
    terminalRevenue: round2(terminalRevenue),
    terminalEarnings: round2(terminalEarnings),
    terminalMarketCap: round2(terminalMarketCap),
    terminalValuePerShare: round2(terminalMarketCap / sharesOutstanding),
    evidence: 'CALCULATION from stated ASSUMPTIONS',
  };
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
