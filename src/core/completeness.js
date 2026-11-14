/* What a payload is still missing — measured, named, and asked for again.
 *
 * Tejas: "I can still see many of items of data payload are still missing.
 * Fix this too."
 *
 * The import card has always said how complete a payload is, and on the most
 * recent real company payload it said 67 of 67 sections — "100% of the payload
 * carries data". That same payload had three years of accounts where ten were
 * asked for, one year of forensic history, one quarter, a bank's interest
 * expense entered as zero, and not one of the measures a bank is judged on.
 * Both statements were true. The old audit asked "is there a `financials`
 * key?" and a key with one number under it answers yes.
 *
 * So the gaps were real and the app could not see them, and — the other half —
 * there was nothing to DO about them. A research tool has an output limit; a
 * full company payload is near it; the thin sections are the ones it ran out
 * of room for. The only remedy on offer was to run the whole prompt again and
 * hope.
 *
 * This module is both halves:
 *
 *   completeness(payload)   depth, not presence. How many years, how many of
 *                           the forty statement lines in each, which named
 *                           industry measures, how old the macro prints are.
 *                           Every shortfall carries the exact request that
 *                           would close it.
 *
 *   topUpPrompt(payload)    a short follow-up for the SAME chat, asking only
 *                           for what is missing, in the same schema, marked
 *                           so the app knows it is an addition.
 *
 *   mergeTopUp(base, add)   folds the reply into the saved payload — rows by
 *                           period, metrics by key, peers by name — without
 *                           letting a blank or a zero erase a figure that was
 *                           already there.
 *
 * Nothing here invents data. It measures what arrived, says what did not, and
 * gives the reader a way to go and get it.
 */
import { PILLARS, OVERALL_WEIGHTS } from './scoring.js';
import { industryPanel, industryFamily } from './industry.js';
import { lenderLines } from './audit.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const S = (v) => (v == null ? '' : String(v).trim());
const filled = (v) => !(v == null || v === '' || (Array.isArray(v) && !v.length)
  || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length));

/* ── The statement lines ────────────────────────────────────────────────
 * The same lines the research brief lists, grouped as the report prints them.
 * A lender is asked for a lender's lines: it has no inventory, no cost of
 * goods sold and no EBITDA, and marking those missing would be asking a bank
 * for a factory's accounts. */
export const STATEMENT_LINES = {
  general: {
    'profit and loss': ['revenue', 'otherIncome', 'costOfGoodsSold', 'employeeCost',
      'otherExpenses', 'ebitda', 'depreciation', 'ebit', 'interestExpense',
      'profitBeforeTax', 'tax', 'netProfit', 'epsDiluted', 'dividendPerShare',
      'sharesOutstanding'],
    'balance sheet': ['totalAssets', 'netFixedAssets', 'investments', 'inventory',
      'receivables', 'cashAndEquivalents', 'shareholdersEquity', 'shareCapital',
      'reservesAndSurplus', 'totalDebt', 'payables', 'totalLiabilities'],
    'cash flow': ['cashFromOperations', 'capitalExpenditure', 'cashFromInvesting',
      'cashFromFinancing', 'dividendsPaid', 'netChangeInCash', 'openingCash', 'closingCash'],
  },
  lender: {
    'profit and loss': ['revenue', 'interestExpense', 'otherIncome', 'employeeCost',
      'otherExpenses', 'profitBeforeTax', 'tax', 'netProfit', 'epsDiluted',
      'dividendPerShare', 'sharesOutstanding'],
    'balance sheet': ['totalAssets', 'advances', 'deposits', 'investments',
      'cashAndEquivalents', 'shareholdersEquity', 'shareCapital', 'reservesAndSurplus',
      'totalDebt', 'totalLiabilities'],
    'cash flow': ['cashFromOperations', 'cashFromInvesting', 'cashFromFinancing',
      'dividendsPaid', 'netChangeInCash', 'openingCash', 'closingCash'],
  },
};
const YEARS_WANTED = 3;
const DIRECT_DIMENSIONS = ['financialQuality', 'managementGovernance', 'technicalEntry', 'catalysts'];

/* A fiscal period as a sortable year, and a period's age in months. The
   renderer has a fuller parser for printing; this one only has to decide
   whether a reading is more than a year old. */
function fyOf(period) {
  const m = /FY\s*'?(\d{2,4})/i.exec(S(period));
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v < 100 ? 2000 + v : v;
}
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function monthsOld(period, now = new Date()) {
  const t = S(period);
  if (!t) return null;
  let end = null, m;
  if ((m = /^Q([1-4])\s*(?:of\s*)?FY\s*'?(\d{2,4})/i.exec(t))) {
    let fy = Number(m[2]); if (fy < 100) fy += 2000;
    const q = Number(m[1]);
    end = new Date(q === 4 ? fy : fy - 1, [5, 8, 11, 2][q - 1] + 1, 0);
  } else if ((m = /^FY\s*'?(\d{2,4})$/i.exec(t))) {
    let y = Number(m[1]); if (y < 100) y += 2000;
    end = new Date(y, 3, 0);
  } else if ((m = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(t)) && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) {
    end = new Date(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
  } else if ((m = /([A-Za-z]{3,})\s+(\d{4})$/.exec(t)) && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) {
    end = new Date(Number(m[2]), MONTHS[m[1].slice(0, 3).toLowerCase()] + 1, 0);
  } else if ((m = /^(\d{4})-(\d{2})/.exec(t))) {
    end = new Date(Number(m[1]), Number(m[2]), 0);
  } else if ((m = /^(19|20)\d{2}$/.exec(t))) {
    end = new Date(Number(t), 11, 31);
  }
  if (!end || isNaN(end.getTime())) return null;
  return (now.getFullYear() - end.getFullYear()) * 12 + (now.getMonth() - end.getMonth());
}

function orderedAnnual(rows) {
  const list = arr(rows).filter((r) => r && typeof r === 'object');
  const keyed = list.map((r, i) => ({ r, k: fyOf(r.period), i }));
  if (keyed.some((x) => x.k == null)) return list;
  return keyed.sort((a, b) => (b.k - a.k) || (a.i - b.i)).map((x) => x.r);   /* newest first */
}

/* One finding. `have` and `want` are counts in whatever unit the label names;
   `ask` is the sentence the follow-up prompt will carry. */
function check(out, group, label, have, want, ask, detail) {
  /* Nothing to judge: a "how recent are the readings" check on a block with no
     readings is already reported by the check that found the block empty. */
  if (!(want > 0)) return;
  const ok = have >= want;
  out.push({ group, label, have, want, ok, ask: ok ? '' : ask, detail: ok ? '' : (detail || '') });
}

/* ── A company ────────────────────────────────────────────────────────── */
function companyChecks(c, run, now) {
  const out = [];
  const who = S(c.name) || S(c.symbol) || 'the company';
  const sym = S(c.symbol);
  const at = `companies[symbol=${sym || '?'}]`;
  const lender = industryFamily(c, run).key === 'lender';
  const annual = orderedAnnual(c.financials && c.financials.annual);
  const years = annual.slice(0, YEARS_WANTED);

  check(out, 'The three statements', 'Audited years', annual.length, YEARS_WANTED,
    `${at}.financials.annual — ${YEARS_WANTED} completed financial years are needed and `
    + `${annual.length} came back. Add the missing year(s), each with every line of the `
    + 'profit and loss account, balance sheet and cash flow statement.');

  const sets = STATEMENT_LINES[lender ? 'lender' : 'general'];
  Object.keys(sets).forEach((stmt) => {
    const lines = sets[stmt];
    const absent = {};          /* line -> periods it is missing from */
    let have = 0;
    years.forEach((row) => {
      lines.forEach((k) => {
        const v = row[k];
        /* A lender's interest expense of zero is a line nobody filled in. */
        const good = isNum(v) && !(lender && k === 'interestExpense' && v === 0);
        if (good) have++;
        else (absent[k] = absent[k] || []).push(S(row.period) || '?');
      });
    });
    const want = years.length * lines.length;
    const names = Object.keys(absent);
    check(out, 'The three statements', `${stmt[0].toUpperCase()}${stmt.slice(1)} lines`, have, want || lines.length,
      `${at}.financials.annual — the ${stmt} is missing these lines: `
      + names.map((k) => `"${k}" (${absent[k].join(', ')})`).join('; ')
      + '. Return each as a number from the annual report, on the same basis and in the '
      + 'same unit as the rows already sent. Omit a line only if the company genuinely '
      + 'does not report it — never write 0 for a figure you did not find.',
      names.join(', '));
  });

  const q = arr(c.financials && c.financials.quarterly).length;
  check(out, 'The three statements', 'Recent quarters', q, 4,
    `${at}.financials.quarterly — the last four reported quarters (period, basis, revenue, `
    + `${lender ? 'netInterestIncome, provisions' : 'ebitda'}, netProfit). ${q} came back.`);

  const dec = arr(c.forensic && c.forensic.decade).length;
  check(out, 'Forensic', 'Years of profit against operating cash', dec, 5,
    `${at}.forensic.decade — one row per year for at least the last five years (ten if `
    + 'available): period, netProfit, cashFromOperations, capex, depreciation. '
    + `${dec} came back, and a cash-conversion test on ${dec === 1 ? 'one year' : dec + ' years'} proves nothing.`);

  /* The industry measures: what the engine could neither derive nor read. */
  const ll = lender ? annual.slice().reverse().map((r) => lenderLines(r)).filter(Boolean) : null;
  const panel = industryPanel(c, run, { lenderLines: ll });
  const total = panel.metrics.length + panel.missing.length;
  check(out, 'Industry measures', `${panel.label} — the measures this industry is judged on`,
    panel.metrics.length, total,
    `${at}.industryMetrics — add one entry per measure, each as `
    + '{ "key", "value", "unit", "period", "source" }, for: '
    + panel.missing.map((m) => `"${m.key}" (${m.name}, ${m.unit})`).join('; ')
    + '. Take each from the latest results presentation or annual report and state the '
    + 'period it is for.',
    panel.missing.map((m) => m.name).join(', '));

  /* Ratings: every weighted line of the four models and the four dimensions. */
  let rated = 0, lines = 0; const unrated = [];
  Object.keys(PILLARS).forEach((p) => {
    Object.keys(PILLARS[p].weights).forEach((k) => {
      /* Free cash flow yield does not exist for a lender, and the scoring
         engine already sets it aside; asking for it again would be asking a
         bank for a number it cannot have. */
      if (lender && p === 'valuationOpportunity' && k === 'fcfYield') return;
      lines++;
      const r = c[p] && c[p][k];
      if (r && isNum(r.score) && S(r.evidence).length >= 12) rated++;
      else unrated.push(`${p}.${k}`);
    });
  });
  /* Four of the eight overall dimensions are rated directly; the other four
     are the pillars themselves, or computed from them. */
  DIRECT_DIMENSIONS.filter((k) => k in OVERALL_WEIGHTS).forEach((k) => {
    lines++;
    const r = c.dimensions && c.dimensions[k];
    if (r && isNum(r.score) && S(r.evidence).length >= 12) rated++;
    else unrated.push(`dimensions.${k}`);
  });
  check(out, 'Ratings', 'Rating lines carrying a score and its evidence', rated, lines,
    `${at} — these rating lines have no score or no evidence: ${unrated.join(', ')}. `
    + 'Return each as { "score": 0-100, "band": "", "evidence": "one sentence with a figure and its period" }.',
    unrated.join(', '));

  const count = (label, group, v, want, path, what) =>
    check(out, group, label, arr(v).length, want,
      `${at}.${path} — ${want} or more ${what}; ${arr(v).length} came back.`);
  count('Peers compared', 'The argument', c.peers, 4, 'peers',
    'listed peers, each with marketCap, pe, roe, revGrowth and an asOf period');
  count('Numbered theses', 'The argument', c.theses, 3, 'theses', 'theses, each with its evidence');
  count('Management guidance, checked against delivery', 'The argument',
    c.management && c.management.guidanceRecord, 3, 'management.guidanceRecord',
    'instances of guidance given and what was delivered');
  count('Shareholding, quarter by quarter', 'Market context', c.shareholding, 4, 'shareholding',
    'quarters of the shareholding pattern');
  count('Catalysts', 'Narrative', c.catalysts, 3, 'catalysts', 'dated catalysts');
  count('Risks with a quantified impact', 'Narrative', c.risks, 5, 'risks',
    'risks, each with probability and impact');
  count('Sources', 'Sources', c.sources, 8, 'sources', 'sources, each with its tier and date');

  const snap = c.snapshot || {};
  const snapKeys = ['marketCap', 'freeFloatPct', 'avgDailyValue', 'week52High', 'week52Low'];
  const snapMiss = snapKeys.filter((k) => !isNum(snap[k]));
  check(out, 'Market context', 'Market snapshot', snapKeys.length - snapMiss.length, snapKeys.length,
    `${at}.snapshot — missing: ${snapMiss.join(', ')}.`, snapMiss.join(', '));
  check(out, 'Market context', 'ISIN', /^IN[A-Z0-9]{10}$/.test(S(c.isin)) ? 1 : 0, 1,
    `${at}.isin — the 12-character ISIN, so the app can fetch the price history itself.`);

  const val = c.valuation || {};
  const valKeys = ['currentPrice', 'discountRate', 'bear', 'base', 'bull'];
  const valMiss = valKeys.filter((k) => !filled(val[k]));
  check(out, 'Valuation', 'Price, discount rate and three cases', valKeys.length - valMiss.length, valKeys.length,
    `${at}.valuation — missing: ${valMiss.join(', ')}.`, valMiss.join(', '));

  const model = c.model || {};
  const modelKeys = ['sectors', 'opex', 'capex', 'workingCapital', 'financing', 'shares'];
  const modelMiss = modelKeys.filter((k) => !filled(model[k]));
  check(out, 'Financial model', 'Driver model blocks', modelKeys.length - modelMiss.length, modelKeys.length,
    `${at}.model — missing: ${modelMiss.join(', ')}. The five projected years of statements `
    + 'are built from these, so a missing block leaves projected columns blank.',
    modelMiss.join(', '));

  return { who, symbol: sym, lender, family: panel.label, checks: out };
}

/* ── A sector study ───────────────────────────────────────────────────── */
function sectorChecks(d, now, backdrop) {
  /* `backdrop` is the two pages of context a single-company run carries. It is
     judged on what it is for — the macro prints, who the company competes with,
     how big the market is — and not as the sector study it was told not to be:
     no shortlist of eight, no five global peers, no glossary. */
  const all = [];
  const out = backdrop ? { push(c) {
    if (BACKDROP_LABELS.includes(c.label)) all.push(c); } } : all;
  const WANT = backdrop ? { players: 3 } : { players: 6 };
  const g = d.global || {};
  const peers = arr(g.peers);
  check(out, 'The world', 'Global peers', peers.length, 5,
    'global.peers — at least FIVE listed global peers from more than one country, each with '
    + 'name, country, marketCap, marketCapCurrency ("USD"), marketCapUnit ("billion"), return5y, '
    + `forwardPe, growthPast, growthForecast and one sentence on what it makes. ${peers.length} came back.`);
  const unscaled = peers.filter((p) => isNum(p.marketCap) && !(S(p.marketCapCurrency) && S(p.marketCapUnit)));
  check(out, 'The world', 'Peer market caps with currency and scale', peers.length - unscaled.length,
    peers.length,
    'global.peers — add "marketCapCurrency" and "marketCapUnit" to: '
    + unscaled.map((p) => S(p.name)).join(', ') + '.', unscaled.map((p) => S(p.name)).join(', '));
  const cagrKeys = ['y15', 'y10', 'y5', 'y3'].filter((k) => !isNum(g.cagr && g.cagr[k]));
  check(out, 'The world', 'Global growth over 15, 10, 5 and 3 years', 4 - cagrKeys.length, 4,
    `global.cagr — missing: ${cagrKeys.join(', ')}.`, cagrKeys.join(', '));

  const MAC = { gdpGrowth: 'GDP growth (latest quarterly release, MoSPI)',
    inflation: 'CPI inflation (latest monthly print, MoSPI)',
    policyRate: 'the repo rate set at the most recent MPC meeting, with its date (RBI)',
    currency: 'the rupee against the dollar (RBI reference rate, on or near today)',
    creditGrowth: 'bank credit growth (latest RBI fortnightly or monthly release)',
    capacityUtilisation: 'capacity utilisation (latest RBI OBICUS round)' };
  const mac = d.macro || {};
  const macMissing = [], macStale = [];
  Object.keys(MAC).forEach((k) => {
    const x = mac[k];
    if (!x || !isNum(x.value) || !S(x.period) || !S(x.source)) { macMissing.push(k); return; }
    const age = monthsOld(x.period, now);
    if (age != null && age >= 12) macStale.push(`${k} (${S(x.period)}, ${age} months old)`);
  });
  check(out, 'Macro and policy', 'Macro readings with period and source', 6 - macMissing.length, 6,
    'macro — missing or undated: ' + macMissing.map((k) => `"${k}" — ${MAC[k]}`).join('; ')
    + '. Each as { "value", "period", "source" }.', macMissing.join(', '));
  check(out, 'Macro and policy', 'Macro readings less than a year old',
    6 - macMissing.length - macStale.length, 6 - macMissing.length,
    'macro — these readings are more than a year old; SEARCH for the latest published print '
    + 'of each as at today and replace it: ' + macStale.join('; ')
    + '. For each: ' + macStale.map((s) => MAC[s.split(' ')[0]]).join('; ') + '.',
    macStale.join('; '));

  const alloc = arr(d.budget && d.budget.allocations);
  check(out, 'Macro and policy', 'Budget allocations, announced against spent', alloc.length, 3,
    'budget.allocations — at least three years of the allocations touching this sector, each with '
    + `what was announced AND what was actually spent. ${alloc.length} came back.`);
  check(out, 'Macro and policy', 'Policy schemes', arr(d.policy).length, 3,
    `policy — every scheme touching the sector, to the full template. ${arr(d.policy).length} came back.`);
  const trade = arr(d.geopolitics && d.geopolitics.tradeData);
  check(out, 'Macro and policy', 'Trade data behind the geopolitics', trade.length, 2,
    'geopolitics.tradeData — at least two rows of import or export data (flow, partner, value, '
    + `year, source) behind the dependence claims. ${trade.length} came back.`);

  check(out, 'Industry', 'Demand drivers', arr(d.industry && d.industry.demandDrivers).length, 3,
    'industry.demandDrivers — three or more, each tagged structural or cyclical.');
  check(out, 'Industry', 'Value-chain nodes', arr(d.valueChain).length, 3,
    'valueChain — every node of the chain, with the listed companies at each one.');
  const tam = d.tam || {};
  const tamMiss = ['tam', 'sam', 'som'].filter((k) => !(tam[k] && isNum(tam[k].value) && S(tam[k].year) && S(tam[k].source)));
  const tamStale = ['tam', 'sam', 'som'].filter((k) => tam[k] && (monthsOld(tam[k].year, now) || 0) >= 24);
  check(out, 'Industry', 'TAM, SAM and SOM, each dated and sourced', 3 - tamMiss.length, 3,
    `tam — missing or undated: ${tamMiss.join(', ')}. Each as { "value", "unit", "basis", "year", "source" }.`,
    tamMiss.join(', '));
  check(out, 'Industry', 'Market size from a recent estimate', 3 - tamMiss.length - tamStale.length,
    3 - tamMiss.length,
    `tam — ${tamStale.join(', ')} ${tamStale.length === 1 ? 'is' : 'are'} more than two years old; `
    + 'search for the most recent published estimate and its publication date.', tamStale.join(', '));
  check(out, 'Industry', 'Programmes traced to suppliers', arr(d.programs).length, 2,
    'programs — the contracts and programmes driving demand, traced to listed suppliers.');

  const players = arr(d.competition && d.competition.players).filter((p) => isNum(p.share) && p.share > 0)
    .sort((a, b) => b.share - a.share);
  check(out, 'Industry', 'Players with a measured market share', players.length, WANT.players,
    'competition.players — every player a share can be established for (aim for the whole market, '
    + `not just the leaders), each with share, basis, asOf and source. ${players.length} came back.`);
  const staleShare = players.filter((p) => (monthsOld(p.asOf, now) || 0) >= 18).map((p) => `${S(p.name)} (${S(p.asOf)})`);
  check(out, 'Industry', 'Market shares from a recent period', players.length - staleShare.length,
    players.length,
    'competition.players — these shares are from an old period; replace with the latest period '
    + 'for which every player has reported: ' + staleShare.join(', ') + '.', staleShare.join(', '));
  const top3 = players.slice(0, 3);
  const noMoat = top3.filter((p) => !(S(p.moat) && S(p.whyLeader))).map((p) => S(p.name));
  check(out, 'Industry', 'Moat and reason for leadership, three largest', top3.length - noMoat.length,
    top3.length,
    'competition.players — add "moat" (what the advantage actually is) and "whyLeader" (why it '
    + 'has held) for: ' + noMoat.join(', ') + '.', noMoat.join(', '));
  check(out, 'Industry', 'Key monitorables', arr(d.monitorables).length, 5,
    'monitorables — five or more, each with the level that would change the view.');
  check(out, 'Industry', 'Glossary', arr(d.glossary).length, 8, 'glossary — the terms a reader needs.');

  const sl = arr(d.shortlist || (d.screen && d.screen.shortlist));
  const fullyRated = sl.filter((e) => {
    const r = e && e.ratings;
    return r && ['businessQuality', 'growthMultibagger', 'valuationOpportunity', 'riskQuality']
      .every((k) => r[k] && isNum(r[k].score) && S(r[k].evidence).length >= 12);
  }).length;
  check(out, 'The screen', 'Companies on the shortlist', sl.length, 8,
    `shortlist — at least eight companies rated; ${sl.length} came back. A Top 3 chosen from a `
    + 'handful is not a screen.');
  check(out, 'The screen', 'Shortlisted companies rated on all four pillars', fullyRated, sl.length,
    'shortlist — every entry needs all four ratings (businessQuality, growthMultibagger, '
    + 'valuationOpportunity, riskQuality), each with a score and one sentence of dated evidence.');
  const searches = isNum(d.run && d.run.searchesRun) ? d.run.searchesRun : 0;
  check(out, 'The run', 'Searches recorded', Math.min(searches, 25), 25,
    `run.searchesRun — ${searches} searches were recorded; fewer than 25 is thin for a sector study.`);
  check(out, 'The run', 'Reporting unit stated', (d.run && d.run.reporting && S(d.run.reporting.unit)) ? 1 : 0, 1,
    'run.reporting — { "currency": "INR", "unit": "crore", "basis": "consolidated" }.');
  return all;
}
const BACKDROP_LABELS = ['Macro readings with period and source', 'Macro readings less than a year old',
  'Players with a measured market share', 'Market shares from a recent period',
  'TAM, SAM and SOM, each dated and sourced', 'Market size from a recent estimate',
  'Reporting unit stated'];

/* ── The whole payload ────────────────────────────────────────────────── */
export function completeness(payload, { now = new Date() } = {}) {
  const d = payload || {};
  const cos = arr(d.companies);
  const hasSector = !!(d.macro || d.budget || d.policy || d.programs || d.competition || d.global);
  /* One company and no shortlist beyond it is a company run, whatever
     backdrop it carries. */
  const single = cos.length === 1 && arr(d.shortlist || (d.screen && d.screen.shortlist)).length <= 1;
  const kind = single ? 'company' : (!cos.length ? 'sector' : 'run');
  const sections = [];
  if (kind !== 'company') {
    sections.push({ title: (S(d.run && d.run.sector) || 'Sector') + ' — the sector study',
      checks: sectorChecks(d, now, false) });
  }
  cos.forEach((c) => {
    const r = companyChecks(c, d.run || {}, now);
    sections.push({ title: r.who, symbol: r.symbol, lender: r.lender, family: r.family, checks: r.checks });
    if (kind === 'company' && hasSector) {
      sections.push({ title: 'The backdrop ' + r.who + ' is read against',
        checks: sectorChecks(d, now, true) });
    } else if (kind === 'company' && !(d.run && d.run.reporting && S(d.run.reporting.unit))) {
      check(r.checks, 'The three statements', 'Reporting unit stated', 0, 1,
        'run.reporting — { "currency": "INR", "unit": "crore", "basis": "consolidated" }: what the '
        + 'money figures are in.');
    }
  });
  const all = sections.flatMap((s) => s.checks);
  /* Each check counts once, in proportion to how far it got — a statement with
     38 of 45 cells filled is mostly there, and should score that way. */
  const score = all.length
    ? all.reduce((a, c) => a + Math.max(0, Math.min(1, c.want ? c.have / c.want : 1)), 0) / all.length : 0;
  const missing = all.filter((c) => !c.ok);
  return { kind, sections, pct: Math.round(score * 100), total: all.length,
    met: all.length - missing.length, missing };
}

/* ── The follow-up prompt ─────────────────────────────────────────────── */
export function topUpPrompt(payload, { now = new Date() } = {}) {
  const comp = completeness(payload, { now });
  if (!comp.missing.length) return '';
  const d = payload || {};
  const p2 = (v) => (v < 10 ? '0' : '') + v;
  const today = `${p2(now.getDate())}-${p2(now.getMonth() + 1)}-${now.getFullYear()}`;
  const subject = comp.kind === 'sector'
    ? `the ${S(d.run && d.run.sector) || 'sector'}${S(d.run && d.run.subSector) ? ' — ' + S(d.run.subSector) : ''} sector study`
    : arr(d.companies).map((c) => `${S(c.name)} (${S(c.symbol)})`).join(', ');
  const body = comp.sections.map((s) => {
    const miss = s.checks.filter((c) => !c.ok);
    if (!miss.length) return '';
    return `── ${s.title} ──\n` + miss.map((c, i) =>
      `${i + 1}. ${c.label} — ${c.have} of ${c.want}.\n   ${c.ask}`).join('\n\n');
  }).filter(Boolean).join('\n\n');
  const unit = d.run && d.run.reporting && S(d.run.reporting.unit)
    ? `${S(d.run.reporting.currency) || 'INR'} ${S(d.run.reporting.unit)}` : 'the unit the earlier payload used';

  return `FOLLOW-UP — COMPLETE THE PAYLOAD YOU JUST SENT

Today is ${today}. The JSON payload you returned for ${subject} has been read by the
application. It is usable, but the items below are missing or too thin, and each
one leaves a blank in the finished report. This message asks for those items
ONLY.

HOW TO ANSWER

1. SEARCH for each item. Do not answer from memory, and do not estimate: every
   figure is taken from an annual report, a results presentation, an exchange
   filing or an official release, and carries its period.
2. Return ONE fenced json block and nothing else. It uses the SAME schema, the
   same key names and the same unit (${unit}) as the payload you already sent.
3. Send ONLY the keys listed below. Do not repeat anything you already
   returned — the application merges this block into the earlier one: annual
   rows are matched by "period", industry metrics by "key", peers and players
   by "name", companies by "symbol".
4. The block MUST start like this, so the application knows it is an addition
   and not a new run:

   { "run": { "topUp": true, "schemaVersion": "${S(d.run && d.run.schemaVersion) || '5.0.0'}"${
     S(d.run && d.run.sector) ? `, "sector": ${JSON.stringify(d.run.sector)}` : ''}${
     S(d.run && d.run.subSector) ? `, "subSector": ${JSON.stringify(d.run.subSector)}` : ''} },${
     comp.kind === 'sector' ? `
     "companies": [], ... }` : `
     "companies": [ { "symbol": "${S(arr(d.companies)[0] && arr(d.companies)[0].symbol)}", ... } ] }`}

5. Never write 0, "" or null for something you could not find. Leave the key
   out, and add a line to "run.researchNotes" saying what you searched and why
   it could not be established. A zero is a reading; a reading you did not take
   is a false statement about the accounts.
6. If the block will not fit in one reply, send as much as fits, end it
   cleanly, and say CONTINUE — the rest can be sent the same way.

WHAT IS MISSING

${body}
`;
}

/* ── Merging the reply ────────────────────────────────────────────────── */
const ID_KEYS = ['period', 'key', 'symbol', 'name', 'risk', 'quarter', 'year', 'label', 'title', 'term', 'id'];
function identityOf(list) {
  const objs = list.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
  if (!objs.length || objs.length !== list.length) return null;
  return ID_KEYS.find((k) => objs.every((o) => S(o[k]) !== '')) || null;
}
const norm = (v) => S(v).toLowerCase().replace(/\s+/g, ' ');

function mergeValue(base, add, path, gained) {
  if (add === undefined || add === null || add === '') return base;
  if (Array.isArray(add)) {
    if (!add.length) return base;
    if (!Array.isArray(base) || !base.length) { gained.push(`${path} (+${add.length})`); return add; }
    const idk = identityOf(add);
    if (idk && identityOf(base) === idk) {
      const out = base.slice(); let added = 0, touched = 0;
      add.forEach((item) => {
        const ix = out.findIndex((b) => norm(b[idk]) === norm(item[idk]));
        if (ix < 0) { out.push(item); added++; }
        else { const before = JSON.stringify(out[ix]);
          out[ix] = mergeValue(out[ix], item, `${path}[${S(item[idk])}]`, []);
          if (JSON.stringify(out[ix]) !== before) touched++; }
      });
      if (added || touched) gained.push(`${path} (${added ? '+' + added + ' new' : ''}${added && touched ? ', ' : ''}${touched ? touched + ' filled in' : ''})`);
      return out;
    }
    /* No shared identity to join on. The follow-up is asked for additions
       only, so its rows are added to what is there — never swapped in for it:
       replacing one risk with two new ones would have lost the first. Exact
       repeats are dropped. */
    const seen = new Set(base.map((x) => JSON.stringify(x)));
    const fresh = add.filter((x) => !seen.has(JSON.stringify(x)));
    if (!fresh.length) return base;
    gained.push(`${path} (+${fresh.length})`);
    return base.concat(fresh);
  }
  if (typeof add === 'object') {
    if (!base || typeof base !== 'object' || Array.isArray(base)) { gained.push(path); return add; }
    const out = { ...base };
    Object.keys(add).forEach((k) => {
      out[k] = mergeValue(base[k], add[k], path ? `${path}.${k}` : k, gained);
    });
    return out;
  }
  /* A scalar. The addition wins — it is the newer search — except that a zero
     never replaces a figure, because a zero in a reply is far more often "not
     found" than "nil". */
  if (add === 0 && isNum(base) && base !== 0) return base;
  if (base !== add && !filled(base)) gained.push(path);
  return add;
}

export function isTopUp(payload) {
  return !!(payload && payload.run && payload.run.topUp === true);
}

/* Fold a follow-up reply into the saved payload. Returns the merged payload
   and a plain list of what changed; `ok: false` when the reply is about
   something else and must not be merged. */
export function mergeTopUp(base, add) {
  const gained = [];
  if (!base || !add || typeof add !== 'object') return { ok: false, reason: 'Nothing to merge.' };
  const bc = arr(base.companies), ac = arr(add.companies);
  if (ac.length && bc.length) {
    const stray = ac.filter((c) => !bc.some((b) => norm(b.symbol) === norm(c.symbol)
      || (S(c.name) && norm(b.name) === norm(c.name))));
    if (stray.length) {
      return { ok: false, reason: 'This follow-up is about ' + stray.map((c) => S(c.name) || S(c.symbol)).join(', ')
        + ', not ' + bc.map((c) => S(c.name) || S(c.symbol)).join(', ') + '.' };
    }
  }
  const out = JSON.parse(JSON.stringify(base));
  Object.keys(add).forEach((k) => {
    if (k === 'run') {
      const r = add.run || {};
      ['reporting', 'researchNotes', 'searchesRun'].forEach((rk) => {
        if (r[rk] == null) return;
        if (rk === 'searchesRun') {
          if (isNum(r[rk])) { out.run.searchesRun = (isNum(out.run.searchesRun) ? out.run.searchesRun : 0) + r[rk];
            gained.push(`run.searchesRun (+${r[rk]})`); }
        } else if (rk === 'researchNotes') {
          /* Notes are prose, and arrive as a string or a list of them. */
          const a = [].concat(out.run.researchNotes || [], r[rk] || []).filter(Boolean);
          out.run.researchNotes = typeof out.run.researchNotes === 'string' || typeof r[rk] === 'string'
            ? a.join(' ') : a;
          gained.push('run.researchNotes');
        } else out.run[rk] = mergeValue(out.run[rk], r[rk], 'run.' + rk, gained);
      });
      return;
    }
    if (k === 'schema') return;
    if (k === 'companies') {
      ac.forEach((c) => {
        const ix = out.companies.findIndex((b) => norm(b.symbol) === norm(c.symbol)
          || (S(c.name) && norm(b.name) === norm(c.name)));
        if (ix < 0) return;
        const patch = { ...c }; delete patch.symbol; delete patch.name;
        out.companies[ix] = mergeValue(out.companies[ix], patch, S(out.companies[ix].symbol), gained);
      });
      return;
    }
    out[k] = mergeValue(out[k], add[k], k, gained);
  });
  return { ok: true, merged: out, gained };
}
