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
import { REGISTERS } from './litigation.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/* A reading, as opposed to a placeholder: the schema's example rows are full
   of zeros, and a reply that echoes them back has not measured anything. */
const real = (v) => isNum(v) && v !== 0;
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
  /* Distinct peers, not rows: a peer sent twice is one peer (build 26). */
  const distinctPeers = isEntityList(arr(c.peers)) ? dedupeEntities(arr(c.peers)) : arr(c.peers);
  count('Peers compared', 'The argument', distinctPeers, 4, 'peers',
    'listed peers, each with marketCap, pe, roe, revGrowth and an asOf period');
  /* A peer named with nothing against it (build 23 — Bank of Baroda on the
     PNB run) is a row of dashes. Each peer needs the figures its industry is
     compared on. */
  {
    const lender = /bank|nbfc|financ|lend|credit/i.test(S(c.sector) + ' ' + S(c.subSector) + ' ' + S(run && run.sector));
    const need = lender ? ['marketCap', 'pe', 'pb', 'roe', 'roa', 'nim', 'gnpa', 'advancesGrowth']
      : ['marketCap', 'pe', 'evEbitda', 'roe', 'revGrowth', 'ebitdaMargin'];
    const ps = distinctPeers.filter((p) => p && S(p.name));
    const thin = ps.filter((p) => need.filter((k) => real(p[k])).length < Math.ceil(need.length / 2));
    if (ps.length) check(out, 'The argument', 'Peers with their figures', ps.length - thin.length, ps.length,
      `${at}.peers — every peer needs ${need.join(', ')} (percentages in percentage points), with asOf and `
      + `source. These came back with too few to compare: ${thin.map((p) => S(p.name)).join(', ')}. Return each `
      + 'peer in full, keeping its name exactly as before so it merges.',
      thin.map((p) => S(p.name)).join(', '));
  }
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

  /* The litigation registers (build 22). Tejas: "11 essential registers
     were never searched ... Fix this." The brief always asked; the reply
     recorded two. Every essential register not in the reply is named here,
     with where to search it, so the follow-up asks for exactly those. */
  const lit = arr(c.litigation && c.litigation.searched);
  const searchedIds = new Set(lit.map((x) => S(x && x.register)));
  const essential = REGISTERS.filter((r) => r.essential);
  const regMiss = essential.filter((r) => !searchedIds.has(r.id));
  check(out, 'Litigation and regulatory registers', 'Essential registers searched',
    essential.length - regMiss.length, essential.length,
    `${at}.litigation.searched — these essential registers have no entry. Search each against `
    + `${who} (and each promoter where the register allows) and add ONE row per register, as `
    + '{ "register": id, "subject": "company", "outcome": "clear" | "matters found" | "register unreachable", '
    + '"detail": "what you searched — the query or URL and the date", "matters": [ ... ] }. '
    + 'A register you cannot reach (a login, a captcha, a paywall) is recorded as "register unreachable" '
    + 'with the reason in "detail" — that is an honest answer; leaving the row out is not. The registers: '
    + regMiss.map((r) => `"${r.id}" (${r.name} — ${r.find})`).join('; ') + '.',
    regMiss.map((r) => r.name).join(', '));

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
  /* Build 22. The world block came back as India's market labelled global —
     "25,00,000 USD Millions, source RBI" — with no year, no forecast and no
     India share. Each part is now asked for by name. */
  const gUnit = S(g.unit);
  const gOk = real(g.marketSize) && S(g.source) && /usd|us\$|\$|dollar|eur|global/i.test(gUnit + ' ' + S(g.marketSizeBasis))
    && !/\brbi\b|india|inr|crore|lakh/i.test(gUnit + ' ' + S(g.source));
  check(out, 'The world', 'Global market size, in US$, dated and sourced',
    (gOk ? 1 : 0) + (S(g.marketSizeYear) ? 1 : 0), 2,
    'global.marketSize — the size of the GLOBAL market (not India\'s), in US$ billion, with '
    + '"unit": "USD billion", "marketSizeYear", "marketSizeBasis" (what was measured) and "source" '
    + '(the publisher and the date of the estimate). India\'s own market belongs in global.indiaShare and tam.');
  const gf = g.growthForecast || {};
  check(out, 'The world', 'Forecast global growth', real(gf.cagr) && S(gf.years) ? 1 : 0, 1,
    'global.growthForecast — the published forecast compound growth of the global market, as '
    + '{ "cagr": percent, "years": "2025 to 2030", "source": "" }.');
  const ish = g.indiaShare || {};
  check(out, 'The world', 'Where India sits: share of the global market',
    (real(ish.value) ? 1 : 0) + (S(ish.source) ? 1 : 0) + (S(g.indiaPosition) ? 1 : 0), 3,
    'global.indiaShare — India\'s share of the global market in percent, its rank among countries, '
    + 'the year and the source, as { "value", "rank", "year", "source", "basis" }; and global.indiaPosition, '
    + 'one paragraph on what that share implies.');
  const peers = arr(g.peers).filter((p) => !/^india$/i.test(S(p.country)));
  check(out, 'The world', 'Global peers outside India', peers.length, 5,
    'global.peers — at least FIVE listed peers OUTSIDE India, from more than one country, each with '
    + 'name, country, marketCap, marketCapCurrency ("USD"), marketCapUnit ("billion"), return5y, '
    + `forwardPe, growthPast, growthForecast and one sentence on what it makes. ${peers.length} came back.`);
  const unscaled = peers.filter((p) => isNum(p.marketCap) && !(S(p.marketCapCurrency) && S(p.marketCapUnit)));
  check(out, 'The world', 'Peer market caps with currency and scale', peers.length - unscaled.length,
    peers.length,
    'global.peers — add "marketCapCurrency" and "marketCapUnit" to: '
    + unscaled.map((p) => S(p.name)).join(', ') + '.', unscaled.map((p) => S(p.name)).join(', '));
  const noMakes = peers.filter((p) => S(p.makes).length < 12).map((p) => S(p.name));
  check(out, 'The world', 'Global peers: what each one makes', peers.length - noMakes.length, peers.length,
    'global.peers — add "makes", a sentence on what each actually makes or sells, for: ' + noMakes.join(', ') + '.',
    noMakes.join(', '));
  /* Build 27. Past growth is asked over five, three and one year. Ten- and
     fifteen-year rates were dropped: no consistent public series reaches that
     far for most sectors, so the AI tool could only stitch reports together
     or leave them out, and the follow-up kept asking for them. */
  const CAGR_WANT = { y5: 'the last five years (y5)', y3: 'the last three years (y3)', y1: 'the latest full year (y1)' };
  const cagrKeys = Object.keys(CAGR_WANT).filter((k) => !isNum(g.cagr && g.cagr[k]));
  check(out, 'The world', 'Global growth over 5, 3 and 1 year', 3 - cagrKeys.length, 3,
    'global.cagr — the past growth of the GLOBAL market in percent a year, missing: '
    + cagrKeys.map((k) => `"${k}", ${CAGR_WANT[k]}`).join('; ')
    + '. Use one series for all three; where it gives annual figures, derive y3 and y1 from it '
    + 'and say so in "source". Do not give 10- or 15-year rates.', cagrKeys.join(', '));

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
  /* A row of zeros is the schema echoed back, not a nil allocation — unless
     it says so. Years are counted, not rows: five heads in one year is one
     year of history. */
  const realAlloc = alloc.filter((a) => (real(a.announced) && isNum(a.spent))
    || /nil/i.test(S(a.spentBasis)));
  const budgetYears = new Set(realAlloc.map((a) => S(a.year))).size;
  check(out, 'Macro and policy', 'Budget years, announced (BE) against spent (Actuals or RE)', budgetYears, 5,
    'budget.allocations — one row per Budget head per year for the last FIVE Union Budgets: "head", '
    + '"year", "announced" (the Budget Estimate, INR crore), "spent" (the Actuals, or the Revised '
    + 'Estimate where Actuals are not yet out), "spentBasis" ("Actuals" or "Revised Estimate"), '
    + '"ministry" and "reachesSector". Source: Budget at a Glance and the Expenditure Profile on '
    + 'indiabudget.gov.in. If the sector has no head of its own, use the heads that reach it. '
    + `${budgetYears} year${budgetYears === 1 ? '' : 's'} with real figures came back`
    + (alloc.length > realAlloc.length ? `, and ${alloc.length - realAlloc.length} row(s) were zeros` : '') + '.');
  check(out, 'Macro and policy', 'Policy schemes', arr(d.policy).length, 3,
    `policy — every scheme touching the sector, to the full template. ${arr(d.policy).length} came back.`);
  const eras = arr(d.policyEvolution).filter((x) => S(x.era) && S(x.what));
  check(out, 'Macro and policy', 'How the regime evolved: dated eras', eras.length, 4,
    'policyEvolution — at least four eras, oldest first, each as { "era": "1991 to 2001", "what": '
    + '"the defining act, circular or reform and what it changed" }, from liberalisation (or the '
    + `sector's founding regime) to today. ${eras.length} came back.`);
  const trade = arr(d.geopolitics && d.geopolitics.tradeData).filter((x) => real(x.value) && S(x.partner) && S(x.source));
  check(out, 'Macro and policy', 'Trade data behind the claims', trade.length, 4,
    'geopolitics.tradeData — at least four rows with real values: the top import partners and the top '
    + 'export destinations for the sector\'s goods, each { "flow", "partner", "value", "unit": "USD million", '
    + '"year", "source" } from Ministry of Commerce TradeStat, DGCI&S or UN Comtrade. For a services sector, '
    + 'the cross-border flows that apply (services exports, remittances, FDI, ECB), named. '
    + `${trade.length} usable row(s) came back.`);

  check(out, 'Industry', 'Demand drivers', arr(d.industry && d.industry.demandDrivers).length, 3,
    'industry.demandDrivers — three or more, each tagged structural or cyclical.');
  const vc = arr(d.valueChain);
  const vcNamed = vc.filter((n) => arr(n.beneficiaries).filter((b) => S(b)).length > 0);
  check(out, 'Industry', 'Value-chain nodes with a listed beneficiary', vcNamed.length, 5,
    'valueChain — at least FIVE nodes, upstream to downstream, each { "name", "what", "beneficiaries": '
    + '["Company (NSESYMBOL)"], "secondOrder": ["Company (NSESYMBOL)"] }, with the listed Indian companies '
    + `named at EVERY node. ${vc.length} node(s) came back, ${vcNamed.length} with a company named.`);
  const tam = d.tam || {};
  const tamMiss = ['tam', 'sam', 'som'].filter((k) => !(tam[k] && real(tam[k].value) && S(tam[k].year) && S(tam[k].source)));
  const tamStale = ['tam', 'sam', 'som'].filter((k) => tam[k] && (monthsOld(tam[k].year, now) || 0) >= 24);
  check(out, 'Industry', 'TAM, SAM and SOM, each dated and sourced', 3 - tamMiss.length, 3,
    `tam — missing or undated: ${tamMiss.join(', ')}. Each as { "value", "unit": "INR crore", "basis", "year", `
    + '"source", "method" }: TAM is the whole Indian market for what the sector sells; SAM the part the listed '
    + 'companies can serve; SOM what they have already captured (their combined revenue in it).',
    tamMiss.join(', '));
  check(out, 'Industry', 'Market size from a recent estimate', 3 - tamMiss.length - tamStale.length,
    3 - tamMiss.length,
    `tam — ${tamStale.join(', ')} ${tamStale.length === 1 ? 'is' : 'are'} more than two years old; `
    + 'search for the most recent published estimate and its publication date.', tamStale.join(', '));
  const traced = arr(d.programs).filter((x) => arr(x.beneficiaries).some((b) => S(b && (b.symbol || b.name))));
  check(out, 'Industry', 'Programmes traced to listed suppliers', traced.length, 3,
    'programs — at least THREE national programmes, tenders or order pipelines driving demand, each with '
    + '"scale", "unit", "timeline", "participants", "challenges" and "beneficiaries": [{ "symbol", "name", '
    + '"supplies", "shareOfProgram" }] naming the listed companies that supply into it. '
    + `${arr(d.programs).length} came back, ${traced.length} traced to a listed supplier.`);

  const comp = d.competition || {};
  const players = arr(comp.players).filter((p) => isNum(p.share) && p.share > 0)
    .sort((a, b) => b.share - a.share);
  const covered = players.reduce((a, p) => a + (p.share < 1 && players.every((q) => q.share < 1) ? p.share * 100 : p.share), 0);
  check(out, 'Industry', 'Players with a measured market share', players.length, backdrop ? WANT.players : 8,
    'competition.players — at least EIGHT players, largest first, on ONE measure and ONE period, '
    + 'each "share" in percentage points of the whole market (23 for 23%), with "symbol" if listed, '
    + `"asOf" and "source". ${players.length} came back.`);
  if (!backdrop) {
    check(out, 'Industry', 'Share measure, period and market total stated',
      (S(comp.metric) ? 1 : 0) + (S(comp.period) ? 1 : 0) + (comp.marketTotal && real(comp.marketTotal.value) ? 1 : 0), 3,
      'competition — name the one measure the shares are of in "metric" (share of gross advances, of '
      + 'capacity, of revenue), the one period in "period", and the size of the whole market on that '
      + 'measure in "marketTotal": { "value", "unit", "source" }.');
    check(out, 'Industry', 'Share of the market accounted for', Math.min(80, Math.round(covered)), 80,
      `competition.players — the shares returned add up to ${Math.round(covered)}% of the market. Add the `
      + 'next largest players until at least 80% is accounted for, so the ranking is of the market and '
      + 'not of whoever was found first.');
    const bases = new Set(players.map((p) => S(p.basis).toLowerCase()).filter(Boolean));
    const periods = new Set(players.map((p) => S(p.asOf)).filter(Boolean));
    check(out, 'Industry', 'Every share on the same measure and period',
      bases.size <= 1 && periods.size <= 1 ? 1 : 0, 1,
      'competition.players — the shares mix ' + [bases.size > 1 ? 'measures (' + [...bases].join(', ') + ')' : '',
        periods.size > 1 ? 'periods (' + [...periods].join(', ') + ')' : ''].filter(Boolean).join(' and ')
      + '. Restate every player on one measure and one period.');
  }
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
const norm = (v) => S(v).toLowerCase().replace(/\s+/g, ' ');
const ID_KEYS = ['period', 'key', 'symbol', 'name', 'risk', 'quarter', 'year', 'label', 'title', 'term', 'id'];
/* Rows whose identity is more than one field. A Budget has several heads in
   one year, trade has several partners in one year, and a register is
   searched against the company and each promoter: joining any of them on
   "year" or "register" alone would fold distinct rows into one. */
const ID_COMBOS = [['register', 'subject', 'subjectName'], ['head', 'year'], ['flow', 'partner', 'year'], ['era']];
function identityOf(list) {
  const objs = list.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
  if (!objs.length || objs.length !== list.length) return null;
  const combo = ID_COMBOS.find((ks) => objs.every((o) => S(o[ks[0]]) !== ''));
  if (combo) return combo.join('+');
  return ID_KEYS.find((k) => objs.every((o) => S(o[k]) !== '')) || null;
}
const idOf = (o, idk) => idk.split('+').map((k) => norm(o[k])).join('|');

/* Rows that name a company — peers, players, a shortlist, programme
   beneficiaries. Build 26: they were joined on whichever key each side
   happened to carry in every row. The first CANBK reply had some peers
   without a ticker (so its rows joined on "name") and the follow-up carried a
   ticker on every row (so it joined on "symbol"): the two did not match, the
   merge fell through to "add, never swap", and every follow-up appended five
   more rows beside the thin ones it was meant to replace. The required count
   then grew with the rows (5, 10, 15, 18) and the follow-up looped. Now such
   rows match on ticker OR name, with the suffixes and punctuation that differ
   between replies taken out, and the newer row overwrites the older. */
const CO_WORDS = /\b(the|ltd|limited|plc|inc|incorporated|corp|corporation|company|co|holdings?|group|and)\b/g;
const nameKey = (v) => S(v).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
  .replace(CO_WORDS, ' ').replace(/\s+/g, ' ').trim();
const symKey = (v) => S(v).toUpperCase().replace(/^(NSE|BSE)\s*[:\-]\s*/, '').replace(/\.(NS|BO|NSE|BSE)$/, '').replace(/[^A-Z0-9&]/g, '');
const isEntityList = (list) => list.length > 0 && list.every((o) => o && typeof o === 'object' && !Array.isArray(o)
  && (S(o.name) || S(o.symbol)));
const sameEntity = (a, b) => (symKey(a.symbol) && symKey(a.symbol) === symKey(b.symbol))
  || (nameKey(a.name) && nameKey(a.name) === nameKey(b.name));
/* One row per entity: a later duplicate is folded into the first. */
function dedupeEntities(list) {
  const out = [];
  list.forEach((item) => {
    const ix = out.findIndex((b) => sameEntity(b, item));
    if (ix < 0) out.push(item);
    else out[ix] = mergeValue(out[ix], item, '', []);
  });
  return out;
}
export { dedupeEntities, nameKey as entityNameKey };

function mergeValue(base, add, path, gained) {
  if (add === undefined || add === null || add === '') return base;
  if (Array.isArray(add)) {
    if (!add.length) return base;
    if (!Array.isArray(base) || !base.length) {
      const first = isEntityList(add) ? dedupeEntities(add) : add;
      gained.push(`${path} (+${first.length})`); return first;
    }
    /* A multi-field identity (register, Budget head, trade partner, era) is
       exact and wins; otherwise rows that name a company match by entity. */
    const combo = identityOf(add);
    if (!(combo && combo.includes('+')) && isEntityList(base) && isEntityList(add)) {
      const out = dedupeEntities(base); let added = 0, touched = 0;
      add.forEach((item) => {
        const ix = out.findIndex((b) => sameEntity(b, item));
        if (ix < 0) { out.push(item); added++; return; }
        const before = JSON.stringify(out[ix]);
        out[ix] = mergeValue(out[ix], item, `${path}[${S(item.name) || S(item.symbol)}]`, []);
        if (JSON.stringify(out[ix]) !== before) touched++;
      });
      const clean = dedupeEntities(out);
      if (added || touched) gained.push(`${path} (${added ? '+' + added + ' new' : ''}${added && touched ? ', ' : ''}${touched ? touched + ' filled in' : ''})`);
      return clean;
    }
    const idk = identityOf(add);
    if (idk && identityOf(base) === idk) {
      const out = base.slice(); let added = 0, touched = 0;
      add.forEach((item) => {
        const ix = out.findIndex((b) => idOf(b, idk) === idOf(item, idk));
        if (ix < 0) { out.push(item); added++; }
        else { const before = JSON.stringify(out[ix]);
          out[ix] = mergeValue(out[ix], item, `${path}[${idk.split('+').map((k) => S(item[k])).filter(Boolean).join(' ')}]`, []);
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
