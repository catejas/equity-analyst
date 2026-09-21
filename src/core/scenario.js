/* scenario.js — re-run the valuation on assumptions the reader chooses.
 *
 * The research supplies a base case. A reader who disagrees with one
 * assumption has, until now, had no way to see what that disagreement is
 * worth: the model is computed once at import and printed. This lets the
 * drivers be moved and the whole chain recomputed — forecast, free cash flow,
 * discounted value, per share — through exactly the same engine that produced
 * the base case, so the two are comparable.
 *
 * Two rules:
 *
 *   1. The analyst's figures are never overwritten. An override is held
 *      separately and applied to a copy, so "reset" is always available and
 *      the base case remains the thing the scenario is measured against.
 *   2. A driver the reader has not touched stays null, not a default. A
 *      slider silently sitting at a value nobody chose is how a scenario
 *      quietly becomes the base case.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* `company.model` means two different things depending on where the company
   came from. In the payload it is the driver block — years, sectors, opex. In
   the report it is the computed result, { model, valuation, sensitivity }, and
   the drivers sit one level down under `drivers`. The slider page holds the
   report's shape and the engine wants the payload's, so the mismatch is
   resolved here once rather than at every call site: a scenario run against
   the wrong one fails with "years must be between 1 and 15", which reads like
   a bad assumption and is not. */
function driversOf(company) {
  const m = company?.model;
  if (!m || typeof m !== 'object') return null;
  if (isNum(m.years) && Array.isArray(m.sectors)) return m;          // payload shape
  if (m.drivers && isNum(m.drivers.years)) return m.drivers;         // report shape
  return null;
}

/* Kept in step with report.js, which suppresses the same valuation. */
const LENDER_SECTORS = new Set(['banking', 'nbfc', 'insurance']);

/* Whichever shape it is, the valuation assumptions live in one place. */
function assumptionsOf(company) {
  return company?.valuation && typeof company.valuation === 'object' ? company.valuation : {};
}

/* The drivers worth exposing. Not every field in the model — the ones a
   reader actually disagrees about, and whose effect is worth seeing. Each
   carries the range it may be moved through and the unit it is read in. */
export const DRIVERS = Object.freeze([
  { key: 'volumeCagr', label: 'Volume growth', unit: '%',
    min: -20, max: 40, step: 0.5, scale: 100,
    help: 'Applied to every operating line, in place of the rate the research assumed.' },
  { key: 'realisationCagr', label: 'Price or realisation growth', unit: '%',
    min: -20, max: 30, step: 0.5, scale: 100,
    help: 'Price per unit, per year. Separating this from volume is what makes the two arguable apart.' },
  { key: 'grossMargin', label: 'Gross margin', unit: '%',
    min: 0, max: 95, step: 0.5, scale: 100,
    help: 'The margin every line earns. The assumption most often asserted and least often evidenced.' },
  { key: 'discountRate', label: 'Discount rate', unit: '%',
    min: 5, max: 25, step: 0.25, scale: 100,
    help: 'The rate future cash is discounted at. The valuation is more sensitive to this than to any operating driver.' },
  { key: 'terminalGrowth', label: 'Terminal growth', unit: '%',
    min: 0, max: 8, step: 0.25, scale: 100,
    help: 'Growth assumed for ever after the forecast. Above the long-run growth of the economy it is not a forecast, it is an error.' },
]);

/* The last reported year, so a scenario is anchored exactly as the base case
   is. Kept local rather than imported, to hold this module free of cycles. */
function reportedBase(company) {
  const rows = Array.isArray(company?.financials?.annual) ? company.financials.annual : [];
  let best = null;
  for (const r of rows) {
    if (!r || !isNum(r.revenue) || r.revenue <= 0) continue;
    const yr = /FY\s*'?(\d{2,4})/i.exec(String(r.period || ''));
    const key = yr ? (parseInt(yr[1], 10) < 100 ? 2000 + parseInt(yr[1], 10) : parseInt(yr[1], 10)) : null;
    if (!best || (key != null && best.key != null && key > best.key)) best = { revenue: r.revenue, period: r.period ?? null, key };
    else if (!best.key && key != null) best = { revenue: r.revenue, period: r.period ?? null, key };
  }
  /* No readable periods: the schema writes newest first. */
  if (best && best.key == null) {
    const first = rows.find((r) => r && isNum(r.revenue) && r.revenue > 0);
    if (first) best = { revenue: first.revenue, period: first.period ?? null, key: null };
  }
  return best ? { revenue: best.revenue, period: best.period } : null;
}

/** What the research itself assumed, so a slider can start there. */
export function baseValues(company) {
  const m = driversOf(company);
  const v = assumptionsOf(company);
  const sectors = Array.isArray(m?.sectors) ? m.sectors : [];
  const mean = (key) => {
    const xs = sectors.map((s) => s?.[key]).filter(isNum);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return {
    volumeCagr: mean('volumeCagr'),
    realisationCagr: mean('realisationCagr'),
    grossMargin: mean('grossMargin'),
    discountRate: isNum(v.discountRate) ? v.discountRate : null,
    terminalGrowth: isNum(v.terminalGrowth) ? v.terminalGrowth : null,
  };
}

/**
 * A copy of the company with the overrides applied. The original is untouched,
 * which is what makes reset trivial and the comparison honest.
 */
export function applyOverrides(company, overrides = {}) {
  if (!driversOf(company)) return company;
  const out = clone(company);
  const drivers = driversOf(out);
  const o = overrides || {};

  if (Array.isArray(drivers.sectors)) {
    for (const s of drivers.sectors) {
      if (isNum(o.volumeCagr)) s.volumeCagr = o.volumeCagr;
      if (isNum(o.realisationCagr)) s.realisationCagr = o.realisationCagr;
      if (isNum(o.grossMargin)) s.grossMargin = o.grossMargin;
    }
  }
  out.valuation = out.valuation || {};
  if (isNum(o.discountRate)) out.valuation.discountRate = o.discountRate;
  if (isNum(o.terminalGrowth)) out.valuation.terminalGrowth = o.terminalGrowth;
  return out;
}

/** Only the drivers the reader actually moved, against the research's own. */
export function changedFrom(company, overrides = {}) {
  const base = baseValues(company);
  const out = [];
  for (const d of DRIVERS) {
    const v = overrides?.[d.key];
    if (!isNum(v)) continue;
    const b = base[d.key];
    if (isNum(b) && Math.abs(v - b) < 1e-9) continue;
    out.push({ key: d.key, label: d.label, from: b, to: v, scale: d.scale, unit: d.unit });
  }
  return out;
}

/**
 * Run the model and the valuation on a set of overrides.
 * `engine` is injected — { buildModel, dcf } — so this module stays free of
 * import cycles and remains testable on its own.
 */
export function evaluate(company, overrides, engine) {
  const { buildModel, dcf } = engine || {};
  if (typeof buildModel !== 'function' || typeof dcf !== 'function') {
    return { available: false, reason: 'the model engine was not supplied' };
  }
  const c = applyOverrides(company, overrides);
  const drivers = driversOf(c);
  if (!drivers) return { available: false, reason: 'this company has no driver model' };

  let built;
  try { built = buildModel({ ...drivers, reported: reportedBase(company) }); } catch (err) {
    return { available: false, reason: String(err?.message || err) };
  }
  if (!built?.available) {
    return { available: false, reason: built?.reason || 'the model could not be built on these drivers' };
  }
  /* The report declines to discount a lender's free cash flow, because deposits
     are a bank's funding rather than debt to net off. A slider page that
     computed the same figure the report withholds would be an invitation to
     use the number the report refused to print. */
  if (LENDER_SECTORS.has(String(company?.sector || '').trim().toLowerCase())) {
    return {
      available: false, model: built,
      reason: 'a discounted free-cash-flow value is not computed for a lender: deposits are the '
        + 'funding a bank runs on, not debt to be netted off, so the discount treats its '
        + 'liabilities as a cost of acquiring it. Move the drivers to see the forecast change; '
        + 'the valuation stays on the research\'s own book-value scenarios',
    };
  }

  /* Moving a slider cannot rescue a base year that does not tie to what the
     company reported: every scenario off it values a different business. The
     drivers are the thing to correct, not the assumptions. */
  if (built.reconciled === false) {
    const r = built.reconciliation || {};
    return {
      available: false, model: built,
      reason: `the base year does not tie to reported revenue — ${r.actual} against ${r.expected}, `
        + `out by ${r.offByPct}% — so no scenario run off it values this company`,
    };
  }

  const rate = assumptionsOf(c).discountRate;
  const g = assumptionsOf(c).terminalGrowth;
  if (!isNum(rate) || !isNum(g)) {
    return { available: false, reason: 'no discount rate or terminal growth', model: built };
  }
  if (g >= rate) {
    /* The Gordon formula divides by (rate − g). Equal or inverted, it returns
       a negative or infinite value that looks like a number and is not one. */
    return {
      available: false, model: built,
      reason: 'terminal growth is at or above the discount rate, so the valuation has no finite answer. '
        + 'Lower the growth or raise the rate.',
    };
  }

  let value;
  try {
    value = dcf({
      explicitFcff: built.fcff, discountRate: rate, terminalGrowth: g,
      netDebt: drivers.financing?.openingDebt ?? 0,
      sharesOutstanding: built.dilutedShares, midYear: true,
    });
  } catch (err) {
    return { available: false, reason: String(err?.message || err), model: built };
  }

  const perShare = isNum(value?.perShare) ? value.perShare : null;
  const price = isNum(company?.valuation?.currentPrice) ? company.valuation.currentPrice : null;
  return {
    available: true,
    model: built,
    valuation: value,
    perShare,
    price,
    upsidePct: (isNum(perShare) && isNum(price) && price > 0) ? ((perShare - price) / price) * 100 : null,
    changed: changedFrom(company, overrides),
  };
}

/** A one-line description of the scenario, for the report to print. */
export function describe(company, overrides) {
  const ch = changedFrom(company, overrides);
  if (!ch.length) return null;
  const fmt = (v, scale) => (isNum(v) ? (v * (scale || 1)).toFixed(2).replace(/\.00$/, '') : '—');
  return ch
    .map((d) => `${d.label} ${fmt(d.from, d.scale)}${d.unit} → ${fmt(d.to, d.scale)}${d.unit}`)
    .join(' · ');
}
