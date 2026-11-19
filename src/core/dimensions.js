/* The four overall dimensions, built from their bases (build 23).
 *
 * Tejas: "Under Overall Dimensions, Financial Quality, Management and
 * Governance, Technical Entry and Catalysts are just shown as a single line
 * without showing each basis and score points achieved against each basis
 * like it was shown in previous Dimensions ... Fix this."
 *
 * The four pillars are scored from component ratings, each with points out of
 * a weight. These four dimensions were a single rating supplied by the
 * research, so there was nothing to show beneath them. They are now built the
 * same way: the research's own rating is one basis, and the others are
 * measured by the application from what the report has already computed —
 * the accounts, the forensic score, the risk pillar's governance, promoter and
 * execution ratings, the registers, the price series and the catalyst list.
 *
 * A basis with no input is left out and the dimension is scored on the bases
 * that ran, exactly as a pillar with a missing component is; so a payload with
 * nothing but the research's rating scores exactly as it did before.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const S = (v) => (v == null ? '' : String(v).trim());
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const r2 = (v) => Math.round(v * 100) / 100;
const fy = (p) => { const m = /FY\s*'?(\d{2,4})/i.exec(S(p)); if (!m) return null; const v = +m[1]; return v < 100 ? 2000 + v : v; };
const annualOldestFirst = (c) => arr(c?.financials?.annual).filter(Boolean).slice()
  .sort((a, b) => (fy(a.period) ?? 0) - (fy(b.period) ?? 0));

function basis(key, label, of, frac, reading) {
  if (!isNum(frac)) return { key, label, of, points: null, reading: reading || 'not measurable from what was supplied' };
  return { key, label, of, points: r2(of * clamp01(frac)), reading };
}

function assemble(bases) {
  const ran = bases.filter((b) => isNum(b.points));
  const weight = ran.reduce((a, b) => a + b.of, 0);
  const got = ran.reduce((a, b) => a + b.points, 0);
  return {
    bases,
    score: weight ? r2((got / weight) * 100) : null,
    coverage: bases.length ? r2(weight / bases.reduce((a, b) => a + b.of, 0)) : 0,
  };
}

const analyst = (dm, key) => {
  const d = dm && dm[key];
  return d && isNum(d.score)
    ? basis('analyst', 'Research assessment', 30, d.score / 100, S(d.evidence) || `rated ${d.score}`)
    : basis('analyst', 'Research assessment', 30, null, 'not rated by the research');
};

export function financialQuality({ c, dm, forensicScore }) {
  const rows = annualOldestFirst(c);
  const withProfit = rows.filter((r) => isNum(r.netProfit));
  const decade = arr(c?.forensic?.decade).filter((r) => isNum(r?.netProfit));
  const years = decade.length > withProfit.length ? decade : withProfit;
  const profitable = years.filter((r) => r.netProfit > 0).length;
  const last = rows.slice().reverse().find((r) => isNum(r.netProfit) && isNum(r.shareholdersEquity) && r.shareholdersEquity > 0);
  const roe = last ? (last.netProfit / last.shareholdersEquity) * 100 : null;
  const cc = rows.filter((r) => isNum(r.cashFromOperations) && isNum(r.netProfit) && r.netProfit > 0);
  const conv = cc.length ? cc.reduce((a, r) => a + r.cashFromOperations, 0) / cc.reduce((a, r) => a + r.netProfit, 0) * 100 : null;
  return assemble([
    analyst(dm, 'financialQuality'),
    basis('earnings', 'Earnings record', 20, years.length ? profitable / years.length : null,
      years.length ? `${profitable} of ${years.length} reported years profitable` : null),
    basis('roe', 'Return on equity', 20, isNum(roe) ? (roe - 5) / 15 : null,
      isNum(roe) ? `${r2(roe)}% in ${S(last.period)}; full points at 20% or more, none at 5% or less` : null),
    basis('cash', 'Cash conversion', 15, isNum(conv) ? (conv - 50) / 50 : null,
      isNum(conv) ? `operating cash ${Math.round(conv)}% of reported profit over ${cc.length} year${cc.length === 1 ? '' : 's'}; full points at 100%` : null),
    basis('accounting', 'Accounting quality', 15, isNum(forensicScore) ? forensicScore / 100 : null,
      isNum(forensicScore) ? `forensic score ${forensicScore} of 100 from the accounting tests` : null),
  ]);
}

export function managementGovernance({ dm, risk, litigation }) {
  const comp = (k) => (risk && isNum(risk[k]) ? risk[k] : null);
  let reg = null, regText = null;
  if (litigation && litigation.available !== false) {
    const sev = arr(litigation.matters).filter((m) => /severe/i.test(S(m.severity))).length;
    const mod = arr(litigation.matters).filter((m) => /moderate/i.test(S(m.severity))).length;
    const cov = isNum(litigation.essentialCoverage) ? litigation.essentialCoverage : null;
    const base = sev ? 0 : mod ? 0.6 : 1;
    reg = cov == null ? base : base * Math.max(0.3, cov);
    regText = `${sev} severe and ${mod} moderate matter${mod === 1 ? '' : 's'}`
      + (cov == null ? '' : `; ${Math.round(cov * 100)}% of the essential registers searched`);
  }
  return assemble([
    analyst(dm, 'managementGovernance'),
    basis('governance', 'Governance', 20, comp('governance') != null ? comp('governance') / 100 : null,
      comp('governance') != null ? `risk pillar governance rating ${comp('governance')}` : null),
    basis('promoter', 'Promoter', 15, comp('promoter') != null ? comp('promoter') / 100 : null,
      comp('promoter') != null ? `risk pillar promoter rating ${comp('promoter')}` : null),
    basis('execution', 'Execution against guidance', 15, comp('execution') != null ? comp('execution') / 100 : null,
      comp('execution') != null ? `risk pillar execution rating ${comp('execution')}` : null),
    basis('registers', 'Regulatory and legal record', 20, reg, regText),
  ]);
}

export function technicalEntry({ dm, tech }) {
  const p = tech && tech.parts ? tech.parts : {};
  const ok = (x) => x && x.available;
  let trend = null, trendT = null;
  if (ok(p.sma50) && ok(p.sma200)) {
    trend = p.sma50.value > p.sma200.value ? 1 : 0.25;
    trendT = `50 day average ${p.sma50.value} ${p.sma50.value > p.sma200.value ? 'above' : 'below'} the 200 day ${p.sma200.value}`;
  }
  let mom = null, momT = null;
  if (ok(p.rsi14)) {
    const r = p.rsi14.value;
    mom = r >= 40 && r <= 65 ? 1 : (r > 75 || r < 30) ? 0.25 : 0.6;
    momT = `RSI ${r}; full points between 40 and 65, few when overbought above 75 or oversold below 30`;
  }
  let rng = null, rngT = null;
  if (ok(p.range) && isNum(p.range.value)) {
    const v = p.range.value;
    rng = v >= 50 && v <= 85 ? 1 : v > 95 ? 0.4 : v < 20 ? 0.4 : 0.7;
    rngT = `${v}% of the 52-week range; full points between 50% and 85%, fewer when stretched at the top`;
  }
  let rs = null, rsT = null;
  if (ok(p.relativeStrength) && isNum(p.relativeStrength.value)) {
    rs = (p.relativeStrength.value + 10) / 20;
    rsT = `${p.relativeStrength.value >= 0 ? '+' : ''}${p.relativeStrength.value} points against the benchmark`;
  }
  let vol = null, volT = null;
  if (ok(p.obv)) {
    vol = p.obv.trend === 'accumulation' ? 1 : p.obv.trend === 'flat' ? 0.5 : 0.2;
    volT = `on-balance volume shows ${p.obv.trend}`;
  }
  return assemble([
    analyst(dm, 'technicalEntry'),
    basis('trend', 'Trend', 20, trend, trendT),
    basis('momentum', 'Momentum (RSI)', 15, mom, momT),
    basis('range', 'Position in range', 15, rng, rngT),
    basis('relative', 'Relative strength', 10, rs, rsT),
    basis('volume', 'Volume', 10, vol, volT),
  ]);
}

export function catalysts({ c, dm, asOf }) {
  const cats = arr(c?.catalysts).filter((x) => x && S(x.event));
  const dated = cats.filter((x) => /\d/.test(S(x.expectedWindow)));
  const now = asOf ? new Date(asOf) : null;
  const yearOf = (t) => { const m = /(20\d\d)/.exec(S(t)); if (m) return +m[1]; const f = fy(t); return f; };
  const soon = now ? dated.filter((x) => { const y = yearOf(x.expectedWindow); return y && y <= now.getFullYear() + 1; }) : [];
  const mech = cats.filter((x) => S(x.impact).length >= 25);
  return assemble([
    analyst(dm, 'catalysts'),
    basis('dated', 'Dated catalysts', 30, cats.length ? Math.min(dated.length, 3) / 3 : (cats.length === 0 && arr(c?.catalysts).length === 0 ? null : 0),
      cats.length ? `${dated.length} of ${cats.length} carry a date; full points at three` : null),
    basis('near', 'Inside the next twelve months', 20, dated.length && now ? soon.length / dated.length : null,
      dated.length && now ? `${soon.length} of ${dated.length} dated catalysts fall within about a year` : null),
    basis('mechanism', 'Mechanism stated', 20, cats.length ? mech.length / cats.length : null,
      cats.length ? `${mech.length} of ${cats.length} state how they move earnings or the multiple` : null),
  ]);
}

export function dimensionBases(ctx) {
  return {
    financialQuality: financialQuality(ctx),
    managementGovernance: managementGovernance(ctx),
    technicalEntry: technicalEntry(ctx),
    catalysts: catalysts(ctx),
  };
}
