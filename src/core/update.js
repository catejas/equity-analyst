/* update.js — saved research brought up to date, and what changed (build 25).
 *
 * Tejas, 19-11-2026: "If I have searched Banking PSU sector 2 months ago and
 * now I want an update on it. It is possible that Top 3 at that time might be
 * a different company and now a different Top 3." And for an independently
 * researched company: "latest numbers, risk ratings, market movement, other
 * developments" — with a quick summary of previous against new, and what it
 * means, instead of comparing two full reports by hand.
 *
 * Four pieces, each a pure function of payloads:
 *
 *   lineKey()     which saved records are versions of the same research line
 *   digest()      what the saved version said, compact, for the update brief
 *   updateDiff()  previous against current, computed by the app — never by
 *                 the model — with the model's own account of the changes
 *                 checked against those numbers
 *   triggers()    why a saved version is due for an update
 *
 * The rule throughout is the one the Top 3 screen already follows: the engine
 * decides, the model rates. Every figure in "previous → now" is read from the
 * two payloads and built reports. The model's `changes` block supplies the
 * why; where its numbers disagree with the app's, the summary says so. */

import { buildReport } from './report.js';
import { top3For, screenShortlist } from './screen.js';
import { symbolKey, sameCompany } from './compose.js';
import { orderedAnnual } from './models.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const S = (v) => (v == null ? '' : String(v)).trim();
const round = (v, dp = 2) => (isNum(v) ? Math.round(v * 10 ** dp) / 10 ** dp : null);
const norm = (v) => S(v).toLowerCase().replace(/&/g, ' and ').replace(/\bsectors?\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/* ── 1. Research lines ─────────────────────────────────────────────────────
 * A line is everything that is the same research done again: one sector and
 * sub-sector; one company researched on its own; one company inside one
 * sector line. Version numbers are the order the records were saved in. */
export function lineKey({ kind, sector, subSector, symbol, name, standalone, sectorLine } = {}) {
  if (kind === 'company') {
    const who = symbolKey(symbol) || norm(name);
    if (!who) return null;
    return standalone ? 'C|' + who : 'T|' + (sectorLine || '?') + '|' + who;
  }
  const s = norm(sector);
  if (!s) return null;
  return 'S|' + s + '|' + norm(subSector);
}

/* ── dates ─────────────────────────────────────────────────────────────── */
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** The latest date a period or window can mean: "2-4 Dec 2026" is 4 Dec 2026,
 *  "Q3 FY27" is 31 Dec 2026, "FY27" is 31 Mar 2027, "16-10-2026" is that day.
 *  Null when it cannot be read — a wrong date is worse than none. */
export function windowEnd(text) {
  const t = S(text);
  if (!t) return null;
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dmys = [...t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g)];
  if (dmys.length) { const x = dmys[dmys.length - 1]; return new Date(Date.UTC(+x[3], +x[2] - 1, +x[1])); }
  const named = [...t.matchAll(/\b(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi)];
  if (named.length) {
    const x = named[named.length - 1], mo = MONTHS[x[2].toLowerCase()], yr = +x[3];
    if (x[1]) return new Date(Date.UTC(yr, mo, +x[1]));
    return new Date(Date.UTC(yr, mo + 1, 0));
  }
  m = /\b(?:mm|mo|month)?-?\s*(\d{1,2})[-/](\d{4})\b/i.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 12) return new Date(Date.UTC(+m[2], +m[1], 0));
  m = /\bQ([1-4])\s*FY\s*'?(\d{2,4})\b/i.exec(t);
  if (m) {
    const fy = +m[2] < 100 ? 2000 + +m[2] : +m[2];
    const q = +m[1];
    const endMonth = [5, 8, 11, 2][q - 1];             /* Jun, Sep, Dec, Mar */
    const yr = q === 4 ? fy : fy - 1;
    return new Date(Date.UTC(yr, endMonth + 1, 0));
  }
  m = /\bH([12])\s*FY\s*'?(\d{2,4})\b/i.exec(t);
  if (m) {
    const fy = +m[2] < 100 ? 2000 + +m[2] : +m[2];
    return +m[1] === 1 ? new Date(Date.UTC(fy - 1, 9, 0)) : new Date(Date.UTC(fy, 3, 0));
  }
  m = /\bFY\s*'?(\d{2,4})\b/i.exec(t);
  if (m) { const fy = +m[1] < 100 ? 2000 + +m[1] : +m[1]; return new Date(Date.UTC(fy, 3, 0)); }
  m = /\b(20\d{2})\b/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], 11, 31));
  return null;
}
const dayMs = 86400000;
const asOf = (payload, fallbackTs) => {
  const g = payload && payload.run && payload.run.generatedAt;
  const d = g ? new Date(g) : null;
  if (d && !isNaN(d.getTime())) return d;
  return fallbackTs ? new Date(fallbackTs) : null;
};
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);

/* ── 2. Company figures ────────────────────────────────────────────────────
 * The measures a reader checks first, each with the direction that is better
 * for an owner where there is one. Price, market value and ownership have no
 * better direction: they are reported, not judged. */
const LOWER_BETTER = /npa|cost|slippage|churn|attrition|debt|leverage|cask|pledge|days|delinquen|stage ?3/i;
const HIGHER_BETTER = /nim|margin|casa|coverage|pcr|crar|car\b|capital adequacy|cet1|roa|roe|roce|load factor|plf|arpu|arpob|revpar|occupancy|utili[sz]ation|order ?book|book.to.bill|yield|per tonne|growth/i;
function industryDir(key, name) {
  const t = S(key) + ' ' + S(name);
  if (LOWER_BETTER.test(t)) return 'down';
  if (HIGHER_BETTER.test(t)) return 'up';
  return null;
}
function latestAnnual(raw) {
  const rows = orderedAnnual(raw && raw.financials);
  return rows.length ? rows[rows.length - 1] : null;
}
function baseFair(c) {
  const v = c && c.valuation;
  if (!v) return null;
  const sc = arr(v.scenarios).find((x) => x && x.scenario === 'base');
  if (sc && isNum(sc.fairValue)) return sc.fairValue;
  return v.base && isNum(v.base.fairValue) ? v.base.fairValue : null;
}
const PILLAR_LABEL = { businessQuality: 'Business quality', growthMultibagger: 'Growth and multibagger',
  valuationOpportunity: 'Valuation opportunity', riskQuality: 'Risk quality' };

function companyFigures(c, raw) {
  const out = [];
  const add = (key, label, kind, value, period, dir, why) => {
    const o = { key, label, kind, value: isNum(value) ? value : null, period: period || null, dir: dir || null, why: why || null };
    out.push(o);
    return o;
  };
  const v = c.valuation || {}, sn = c.snapshot || raw.snapshot || {};
  const price = isNum(v.currentPrice) ? v.currentPrice : null;
  add('price', 'Share price', 'price', price, v.priceAsOf, null,
    'What the market pays today. Its move is reported, not judged: a price is not a verdict on the business.');
  add('marketCap', 'Market capitalisation', 'money', sn.marketCap, v.priceAsOf, null);
  const fv = baseFair(c);
  add('fairValue', 'Base-case fair value', 'price', fv, null, 'up',
    'The research’s own central valuation. A higher one means the earnings or the multiple behind it were revised up.');
  add('upside', 'Upside to base case', 'pct', isNum(fv) && isNum(price) && price > 0 ? (fv / price - 1) * 100 : null,
    null, 'up', 'The margin of safety at today’s price. It shrinks when the price runs ahead of the value.');
  add('week52High', '52-week high', 'price', sn.week52High, null, null);
  add('week52Low', '52-week low', 'price', sn.week52Low, null, null);
  add('score', 'Overall score', 'score', c.overall && c.overall.score, null, 'up',
    'The application’s score from the rated evidence, out of 100.');
  Object.keys(PILLAR_LABEL).forEach((k) => {
    const p = c.pillars && c.pillars[k];
    add('pillar.' + k, PILLAR_LABEL[k], 'score', p && p.score, null, 'up');
  });
  const ya = latestAnnual(raw);
  if (ya) {
    const basis = S(ya.basis).toLowerCase() || null;
    add('revenue', c.lender ? 'Interest income, latest year' : 'Revenue, latest year', 'money', ya.revenue, ya.period, 'up').basis = basis;
    add('netProfit', 'Net profit, latest year', 'money', ya.netProfit, ya.period, 'up').basis = basis;
    add('eps', 'Earnings per share, latest year', 'price', isNum(ya.epsDiluted) ? ya.epsDiluted : ya.epsBasic, ya.period, 'up').basis = basis;
  }
  const mv = (c.metrics && c.metrics.values) || {};
  const mp = c.metrics && c.metrics.period;
  if (mv.roe && mv.roe.available) add('roe', 'Return on equity', 'pct', mv.roe.value, mp, 'up',
    'What the business earns on its owners’ capital.');
  if (mv.roa && mv.roa.available) add('roa', 'Return on assets', 'pct', mv.roa.value, mp, 'up');
  arr(c.industry && c.industry.metrics).forEach((m) => {
    if (!m || !isNum(m.value)) return;
    if (m.key === 'roe' || m.key === 'roa') return;
    const why = S(m.why).split(/(?<=\.)\s/)[0] || null;
    add('ind.' + m.key, S(m.name) || m.key, /^%/.test(S(m.unit)) ? 'pct' : 'num', m.value, m.period,
      industryDir(m.key, m.name), why).unit = S(m.unit) || null;
  });
  const own = c.ownership || raw.ownership || {};
  add('promoter', 'Promoter holding', 'pct', own.promoter, null, null);
  add('fii', 'Foreign institutions', 'pct', own.fii, null, null);
  add('dii', 'Domestic institutions', 'pct', own.dii, null, null);
  add('adv', 'Average daily traded value', 'money', sn.avgDailyValue, null, null);
  return out;
}

/* Material: a move a reader would want told about. Scores by three points,
   prices and money by five per cent, ratios by a twentieth of their level or
   a quarter of a point, whichever is smaller. */
function material(row) {
  const { prev, cur, kind } = row;
  if (!isNum(prev) || !isNum(cur)) return prev == null && isNum(cur) ? 'new' : false;
  const d = cur - prev;
  if (kind === 'score') return Math.abs(d) >= 3;
  if (kind === 'pct') return Math.abs(d) >= Math.min(0.25, Math.abs(prev) * 0.05) && Math.abs(d) >= 0.05;
  if (prev === 0) return d !== 0;
  return Math.abs(d / prev) >= 0.05;
}
function verdictOf(row) {
  if (!isNum(row.prev) && isNum(row.cur)) return 'new';
  if (isNum(row.prev) && !isNum(row.cur)) return 'dropped';
  /* Consolidated against standalone is two different companies' numbers. */
  if (row.prevBasis && row.curBasis && row.prevBasis !== row.curBasis) return 'basis';
  if (row.cur === row.prev) return 'unchanged';
  if (!row.dir) return 'neutral';
  const up = row.cur > row.prev;
  return (up && row.dir === 'up') || (!up && row.dir === 'down') ? 'better' : 'worse';
}
function joinRows(a, b) {
  const byKey = new Map();
  a.forEach((r) => byKey.set(r.key, { ...r, prev: r.value, prevPeriod: r.period, prevBasis: r.basis || null, cur: null, curPeriod: null }));
  b.forEach((r) => {
    const x = byKey.get(r.key) || { ...r, prev: null, prevPeriod: null, prevBasis: null };
    x.cur = r.value; x.curPeriod = r.period; x.curBasis = r.basis || null; x.label = r.label; x.dir = r.dir; x.why = r.why || x.why;
    if (r.unit) x.unit = r.unit;
    byKey.set(r.key, x);
  });
  return [...byKey.values()].filter((r) => isNum(r.prev) || isNum(r.cur)).map((r) => {
    const change = isNum(r.prev) && isNum(r.cur) ? round(r.cur - r.prev, 4) : null;
    const changePct = isNum(r.prev) && isNum(r.cur) && r.prev !== 0 ? round((r.cur - r.prev) / Math.abs(r.prev) * 100, 2) : null;
    const out = { key: r.key, label: r.label, kind: r.kind, unit: r.unit || null, prev: r.prev, cur: r.cur,
      prevPeriod: r.prevPeriod, curPeriod: r.curPeriod, prevBasis: r.prevBasis || null, curBasis: r.curBasis || null,
      change, changePct, dir: r.dir, why: r.why };
    out.material = material(out);
    out.verdict = verdictOf(out);
    return out;
  });
}

/* ── lists that are compared by identity ─────────────────────────────────── */
const key60 = (t) => norm(t).slice(0, 60);
function listDiff(prev, cur, keyOf) {
  const pk = new Map(arr(prev).map((x) => [keyOf(x), x]));
  const ck = new Map(arr(cur).map((x) => [keyOf(x), x]));
  return {
    added: [...ck.entries()].filter(([k]) => k && !pk.has(k)).map(([, x]) => x),
    removed: [...pk.entries()].filter(([k]) => k && !ck.has(k)).map(([, x]) => x),
    kept: [...ck.entries()].filter(([k]) => k && pk.has(k)).map(([k, x]) => ({ prev: pk.get(k), cur: x })),
  };
}
function matters(raw) {
  const out = [];
  arr(raw && raw.litigation && raw.litigation.searched).forEach((r) => {
    arr(r && r.matters).forEach((m) => out.push({ register: S(r.register), severity: S(m.severity),
      category: S(m.category), summary: S(m.summary), status: S(m.status) }));
  });
  arr(raw && raw.litigation && raw.litigation.matters).forEach((m) => out.push({ register: '', severity: S(m.severity),
    category: S(m.category), summary: S(m.summary), status: S(m.status) }));
  return out;
}

/* ── the model's account, checked against the numbers ───────────────────── */
const ALIASES = {
  price: ['share price', 'stock price', 'price'], marketCap: ['market cap', 'market capitalisation', 'market capitalization'],
  fairValue: ['fair value', 'target', 'base case'], score: ['overall score'],
  revenue: ['revenue', 'interest income', 'total income'], netProfit: ['net profit', 'pat', 'profit after tax'],
  eps: ['eps', 'earnings per share'], roe: ['roe', 'return on equity'], roa: ['roa', 'return on assets'],
  promoter: ['promoter'], fii: ['fii', 'fpi', 'foreign institution'], dii: ['dii', 'domestic institution'],
};
function firstNumber(v) {
  if (isNum(v)) return v;
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(S(v));
  return m ? Number(m[0].replace(/,/g, '')) : null;
}
function aliasesOf(row) {
  if (ALIASES[row.key]) return ALIASES[row.key];
  const k = row.key.replace(/^(ind|pillar)\./, '');
  const out = [norm(row.label)];
  if (k.length >= 3) out.push(norm(k));
  if (/gnpa|grossnpa/i.test(k)) out.push('gnpa', 'gross npa');
  if (/nnpa|netnpa/i.test(k)) out.push('nnpa', 'net npa');
  if (/^nim$/i.test(k)) out.push('nim', 'net interest margin');
  if (/casa/i.test(k)) out.push('casa');
  if (/pcr|provisioncoverage/i.test(k)) out.push('pcr', 'provision coverage');
  if (/crar|car|capital/i.test(k)) out.push('crar', 'capital adequacy');
  return out.filter((x) => x && x.length >= 3);
}
export function checkChanges(changes, rows) {
  return arr(changes).filter(isObj).map((ch) => {
    const text = ' ' + norm([ch.item, ch.area].join(' ')) + ' ';
    const row = rows.find((r) => aliasesOf(r).some((a) => text.includes(' ' + a + ' ')));
    const said = { prev: firstNumber(ch.previous), cur: firstNumber(ch.current) };
    let check = 'not checked', detail = null;
    if (row) {
      const off = (a, b) => isNum(a) && isNum(b) && Math.abs(a - b) > Math.max(0.02 * Math.abs(b), 0.011);
      const curOff = off(said.cur, row.cur), prevOff = off(said.prev, row.prev);
      if (curOff || prevOff) {
        check = 'differs';
        detail = (curOff ? `the research says ${said.cur} now; the app reads ${round(row.cur)}` : '')
          + (curOff && prevOff ? '; ' : '')
          + (prevOff ? `the research says it was ${said.prev}; the saved version had ${round(row.prev)}` : '');
      } else if (isNum(said.cur) || isNum(said.prev)) check = 'agrees';
    }
    return { area: S(ch.area), item: S(ch.item), previous: S(ch.previous), current: S(ch.current),
      why: S(ch.why), source: S(ch.source), date: S(ch.date), significance: S(ch.significance) || 'medium',
      direction: S(ch.direction), check, detail, figure: row ? row.key : null };
  });
}

/* ── 3a. Company against company ────────────────────────────────────────── */
function firstCompany(built, raw, like) {
  const full = arr(built && built.report && built.report.full);
  if (like) {
    const hit = full.find((c) => sameCompany(c, like));
    if (hit) return hit;
  }
  return full[0] || null;
}
function companyDiff(prevP, curP, opts) {
  const pb = buildReport(prevP), cb = buildReport(curP);
  const prawCo = arr(prevP.companies)[0] || {}, crawCo = arr(curP.companies)[0] || {};
  const pc = firstCompany(pb, prevP, crawCo), cc = firstCompany(cb, curP, prawCo);
  if (!pc || !cc) return null;
  const rows = joinRows(companyFigures(pc, prawCo), companyFigures(cc, crawCo));
  const thesisCheck = arr(curP.thesisCheck).filter(isObj).map((t) => ({ thesis: S(t.thesis),
    status: /broken/i.test(S(t.status)) ? 'broken' : /weak/i.test(S(t.status)) ? 'weakened' : /hold/i.test(S(t.status)) ? 'holds' : S(t.status),
    evidence: S(t.evidence) }));
  const thesisLines = listDiff(arr(pc.thesis).map((t) => ({ t })), arr(cc.thesis).map((t) => ({ t })), (x) => key60(x.t));
  const risks = listDiff(pc.risks, cc.risks, (x) => key60(x && x.risk));
  /* A red flag is the same flag when its category is: two runs describe the
     same history in different words, and matching on the wording reported
     PNB's 2016-19 losses as a new finding. A change of severity is reported
     on its own. */
  const flags = listDiff(pc.redFlags, cc.redFlags, (x) => norm(x && x.category));
  const severityMoves = [];
  listDiff(pc.redFlags, cc.redFlags, (x) => norm(x && x.category)).kept.forEach(({ prev, cur }) => {
    if (S(prev.severity) !== S(cur.severity)) severityMoves.push({ category: S(cur.category), from: S(prev.severity), to: S(cur.severity) });
  });
  const lit = listDiff(matters(prawCo), matters(crawCo), (x) => key60(x.summary).slice(0, 40));
  const curDate = asOf(curP, opts.curTs), prevDate = asOf(prevP, opts.prevTs);
  const dueSince = arr(pc.catalysts).filter((x) => {
    const end = windowEnd(x && x.expectedWindow);
    return end && curDate && end <= curDate;
  }).map((x) => ({ event: S(x.event), window: S(x.expectedWindow), impact: S(x.impact) }));
  const newCatalysts = listDiff(pc.catalysts, cc.catalysts, (x) => key60(x && x.event)).added
    .map((x) => ({ event: S(x.event), window: S(x.expectedWindow), impact: S(x.impact) }));
  const verdict = {
    score: { prev: pc.overall && pc.overall.score, cur: cc.overall && cc.overall.score },
    eligible: { prev: !!pc.eligibleForTop3, cur: !!cc.eligibleForTop3 },
    word: { prev: band(pc.overall && pc.overall.score), cur: band(cc.overall && cc.overall.score) },
  };
  const changes = checkChanges(curP.changes, rows);
  return {
    kind: 'company',
    subject: { name: S(cc.name) || S(cc.symbol), symbol: S(cc.symbol), exchange: S(cc.exchange), sector: S(cc.sector) },
    asOf: { prev: iso(prevDate), cur: iso(curDate),
      days: prevDate && curDate ? Math.round((curDate - prevDate) / dayMs) : null },
    verdict,
    figures: rows,
    headline: headlines(rows, { verdict, flags, lit, thesisCheck }),
    thesis: { check: thesisCheck, kept: thesisLines.kept.map((x) => x.cur.t),
      added: thesisLines.added.map((x) => x.t), dropped: thesisLines.removed.map((x) => x.t) },
    thesisBreakers: arr(cc.thesisBreakers).map(S).filter(Boolean),
    risks: { added: risks.added.map(riskRow), removed: risks.removed.map(riskRow),
      changed: risks.kept.filter(({ prev, cur }) => S(prev.severity) !== S(cur.severity)
        || (isNum(prev.probability) && isNum(cur.probability) && Math.abs(prev.probability - cur.probability) >= 0.1))
        .map(({ prev, cur }) => ({ ...riskRow(cur), was: { severity: S(prev.severity), probability: prev.probability } })) },
    flags: { added: flags.added.map(flagRow), removed: flags.removed.map(flagRow), severity: severityMoves },
    litigation: { added: lit.added, removed: lit.removed },
    catalysts: { dueSince, added: newCatalysts },
    consensus: { prev: S(pc.consensus && pc.consensus.revisionDirection) || null,
      cur: S(cc.consensus && cc.consensus.revisionDirection) || null },
    changes,
    notes: S(curP.run && curP.run.researchNotes),
  };
}
const band = (s) => (!isNum(s) ? 'Not scored' : s >= 70 ? 'Strong' : s >= 55 ? 'Adequate' : s >= 40 ? 'Weak' : 'Poor');
const riskRow = (x) => ({ risk: S(x && x.risk), severity: S(x && x.severity),
  probability: x && isNum(x.probability) ? x.probability : null });
const flagRow = (x) => ({ category: S(x && x.category), severity: S(x && x.severity), detail: S(x && x.detail) });

/* The few lines that open the summary: the score, the price against the
   value, then the material moves in the measures with a better direction,
   worst first, then anything new and severe. */
function headlines(rows, { verdict, flags, lit, thesisCheck }) {
  const out = [];
  const sc = verdict.score;
  if (isNum(sc.prev) && isNum(sc.cur) && Math.abs(sc.cur - sc.prev) >= 0.5) {
    out.push({ tone: sc.cur > sc.prev ? 'better' : 'worse', key: 'score',
      text: `Overall score ${sc.cur > sc.prev ? 'rose' : 'fell'} from ${round(sc.prev, 1)} to ${round(sc.cur, 1)}`
        + (verdict.word.prev !== verdict.word.cur ? ` (${verdict.word.prev} to ${verdict.word.cur})` : '') + '.' });
  }
  if (verdict.eligible.prev !== verdict.eligible.cur) {
    out.push({ tone: verdict.eligible.cur ? 'better' : 'worse', key: 'eligible',
      text: verdict.eligible.cur ? 'It now clears the safety screen.' : 'It no longer clears the safety screen.' });
  }
  const judged = rows.filter((r) => r.material === true && /^(better|worse|neutral)$/.test(r.verdict)
    && r.key !== 'score' && !/^pillar\./.test(r.key));
  const order = { worse: 0, better: 1, neutral: 2 };
  judged.sort((a, b) => (order[a.verdict] - order[b.verdict]) || (Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0)));
  judged.slice(0, 6).forEach((r) => out.push({ tone: r.verdict, key: r.key, row: r }));
  flags.added.filter((f) => /severe/i.test(f.severity)).forEach((f) => out.push({ tone: 'worse', key: 'flag',
    text: `New severe finding: ${S(f.category)} — ${S(f.detail)}` }));
  lit.added.filter((m) => /severe|high/i.test(m.severity)).forEach((m) => out.push({ tone: 'worse', key: 'lit',
    text: `New ${S(m.severity)} legal or regulatory matter: ${S(m.summary)}` }));
  thesisCheck.filter((t) => t.status === 'broken').forEach((t) => out.push({ tone: 'worse', key: 'thesis',
    text: `Thesis broken: ${t.thesis}` }));
  return out;
}

/* ── 3b. Sector study against sector study ──────────────────────────────── */
const MACRO = [['gdpGrowth', 'GDP growth'], ['inflation', 'Inflation'], ['policyRate', 'Policy rate'],
  ['currency', 'Rupee per US dollar'], ['creditGrowth', 'Credit growth'], ['capacityUtilisation', 'Capacity utilisation']];
function screenOf(p) {
  const t = top3For(p || {});
  const ranked = t.screen ? t.screen.ranked : arr(p && p.shortlist).length ? screenShortlist(p.shortlist).ranked : [];
  return { source: t.source, top3: t.list, ranked };
}
function pillarMoves(a, b) {
  const out = [];
  Object.keys(PILLAR_LABEL).forEach((k) => {
    const x = a && a.ratings && a.ratings[k], y = b && b.ratings && b.ratings[k];
    const pv = isObj(x) ? x.score : x, cv = isObj(y) ? y.score : y;
    if (isNum(pv) && isNum(cv) && pv !== cv) out.push({ pillar: PILLAR_LABEL[k], prev: pv, cur: cv, change: cv - pv,
      evidence: isObj(y) ? S(y.evidence) : '' });
  });
  return out.sort((p, q) => Math.abs(q.change) - Math.abs(p.change));
}
/* The sector blocks as the documents print them: the engine rescales a
   payload whose rates arrived as fractions, so 0.072 and 7.8 are compared as
   7.2 and 7.8, not as 0.072 and 7.8. */
function sectorView(p) {
  let rep = null;
  try { const b = buildReport(p); rep = b && b.ok ? b.report : null; } catch (e) { rep = null; }
  return Object.assign({}, p, rep ? { macro: rep.macro || p.macro, tam: rep.tam || p.tam,
    competition: rep.competition || p.competition, global: rep.global || p.global,
    sectorValuation: rep.sectorValuation || p.sectorValuation, policy: rep.policy || p.policy,
    regulation: rep.regulation || p.regulation, monitorables: rep.monitorables || p.monitorables } : {});
}
function sectorDiff(prevRaw, curRaw, opts) {
  const prevP = sectorView(prevRaw), curP = sectorView(curRaw);
  const P = screenOf(prevRaw), C = screenOf(curRaw);
  const find = (list, x) => list.find((y) => sameCompany(y, x)) || null;
  const names = [];
  [...C.top3, ...P.top3].forEach((x) => { if (!names.some((y) => sameCompany(y, x))) names.push(x); });
  const top3 = names.map((x) => {
    const inPrev = !!find(P.top3, x), inCur = !!find(C.top3, x);
    const pr = find(P.ranked, x), cr = find(C.ranked, x);
    const status = inPrev && inCur ? 'stayed' : inCur ? 'entered' : 'left';
    const moves = pillarMoves(pr, cr);
    let why;
    if (status === 'entered' && !pr) why = 'Not on the previous shortlist; rated for the first time in this version.';
    else if (status === 'left' && !cr) why = 'Not on this version’s shortlist.';
    else {
      why = (pr && cr ? `Rank ${pr.rank} to ${cr.rank}, screen score ${round(pr.score, 1)} to ${round(cr.score, 1)}.` : '')
        + (moves.length ? ' ' + moves.slice(0, 2).map((m) => `${m.pillar} ${m.prev} to ${m.cur}`).join('; ') + '.' : '');
    }
    return { name: S(x.name) || S(x.symbol), symbol: S(x.symbol), status,
      prevRank: pr ? pr.rank : null, curRank: cr ? cr.rank : null,
      prevScore: pr ? round(pr.score, 2) : null, curScore: cr ? round(cr.score, 2) : null,
      moves, why: why.trim() };
  });
  const order = { entered: 0, left: 1, stayed: 2 };
  top3.sort((a, b) => order[a.status] - order[b.status] || (a.curRank || 99) - (b.curRank || 99));

  const allNames = [];
  [...C.ranked, ...P.ranked].forEach((x) => { if (!allNames.some((y) => sameCompany(y, x))) allNames.push(x); });
  const ranking = allNames.map((x) => {
    const pr = find(P.ranked, x), cr = find(C.ranked, x);
    return { name: S(x.name) || S(x.symbol), symbol: S(x.symbol),
      prevRank: pr ? pr.rank : null, curRank: cr ? cr.rank : null,
      prevScore: pr ? round(pr.score, 2) : null, curScore: cr ? round(cr.score, 2) : null };
  }).sort((a, b) => (a.curRank || 99) - (b.curRank || 99) || (a.prevRank || 99) - (b.prevRank || 99));

  const macro = MACRO.map(([k, label]) => {
    const a = prevP.macro && prevP.macro[k], b = curP.macro && curP.macro[k];
    return { key: k, label, prev: a && isNum(a.value) ? a.value : null, prevPeriod: S(a && a.period) || null,
      cur: b && isNum(b.value) ? b.value : null, curPeriod: S(b && b.period) || null };
  }).filter((r) => isNum(r.prev) || isNum(r.cur));

  const tamRow = (k, label) => {
    const a = prevP.tam && prevP.tam[k], b = curP.tam && curP.tam[k];
    return { key: k, label, prev: a && isNum(a.value) ? a.value : null, prevUnit: S(a && a.unit), prevYear: S(a && a.year),
      cur: b && isNum(b.value) ? b.value : null, curUnit: S(b && b.unit), curYear: S(b && b.year) };
  };
  const market = [tamRow('tam', 'Total addressable market'), tamRow('sam', 'Serviceable addressable market'),
    tamRow('som', 'Serviceable obtainable market')].filter((r) => isNum(r.prev) || isNum(r.cur));

  const pc = prevP.competition || {}, cc = curP.competition || {};
  const players = [];
  [...arr(cc.players), ...arr(pc.players)].forEach((x) => {
    if (!isObj(x) || players.some((y) => norm(y.name) === norm(x.name))) return;
    const a = arr(pc.players).find((y) => norm(y.name) === norm(x.name));
    const b = arr(cc.players).find((y) => norm(y.name) === norm(x.name));
    players.push({ name: S(x.name), prev: a && isNum(a.share) ? a.share : null, cur: b && isNum(b.share) ? b.share : null,
      prevAsOf: S(a && a.asOf), curAsOf: S(b && b.asOf) });
  });
  const competition = { prevMetric: S(pc.metric), curMetric: S(cc.metric), prevPeriod: S(pc.period), curPeriod: S(cc.period),
    comparable: !!(S(pc.metric) && norm(pc.metric) === norm(cc.metric)), players };

  const sv = (p) => (p.sectorValuation && isNum(p.sectorValuation.currentMultiple))
    ? { value: p.sectorValuation.currentMultiple, metric: S(p.sectorValuation.metric) } : null;
  const policies = listDiff(prevP.policy, curP.policy, (x) => key60(x && x.name));
  const monit = listDiff(arr(prevP.monitorables).map((t) => ({ t })), arr(curP.monitorables).map((t) => ({ t })), (x) => key60(x.t));
  const curDate = asOf(curP, opts.curTs), prevDate = asOf(prevP, opts.prevTs);
  const curRows = macro.map((m) => ({ key: m.key, label: m.label, kind: 'pct', prev: m.prev, cur: m.cur }));
  return {
    kind: 'sector',
    subject: { name: [S(curP.run && curP.run.sector), S(curP.run && curP.run.subSector)].filter(Boolean).join(' — '),
      sector: S(curP.run && curP.run.sector), subSector: S(curP.run && curP.run.subSector) },
    asOf: { prev: iso(prevDate), cur: iso(curDate),
      days: prevDate && curDate ? Math.round((curDate - prevDate) / dayMs) : null },
    top3: { prevSource: P.source, curSource: C.source, rows: top3,
      entered: top3.filter((r) => r.status === 'entered').map((r) => r.name),
      left: top3.filter((r) => r.status === 'left').map((r) => r.name),
      stayed: top3.filter((r) => r.status === 'stayed').map((r) => r.name) },
    ranking,
    macro,
    market,
    competition,
    valuation: { prev: sv(prevP), cur: sv(curP) },
    globalMarket: { prev: prevP.global && isNum(prevP.global.marketSize) ? { value: prevP.global.marketSize, unit: S(prevP.global.unit) } : null,
      cur: curP.global && isNum(curP.global.marketSize) ? { value: curP.global.marketSize, unit: S(curP.global.unit) } : null },
    policy: { added: policies.added.map((x) => ({ name: S(x.name), objective: S(x.objective), reachesSector: S(x.reachesSector) })),
      removed: policies.removed.map((x) => ({ name: S(x.name) })) },
    underReview: { prev: S(prevP.regulation && prevP.regulation.underReview), cur: S(curP.regulation && curP.regulation.underReview) },
    monitorables: { added: monit.added.map((x) => x.t), removed: monit.removed.map((x) => x.t) },
    changes: checkChanges(curRaw.changes, curRows),
    notes: S(curRaw.run && curRaw.run.researchNotes),
  };
}

/** Previous against current. `opts.prevTs` / `opts.curTs` are the save times,
 *  used where a payload does not date itself. */
export function updateDiff(prev, cur, opts = {}) {
  if (!isObj(prev) || !isObj(cur)) return null;
  const isCo = arr(cur.companies).length > 0 && arr(prev.companies).length > 0;
  return isCo ? companyDiff(prev, cur, opts) : sectorDiff(prev, cur, opts);
}

/* ── 4. The digest the update brief carries ─────────────────────────────── */
const fmt = (v, dp = 2) => (isNum(v) ? String(round(v, dp)) : 'n/a');
export function digest(payload, { savedTs, version } = {}) {
  if (!isObj(payload)) return '';
  const when = asOf(payload, savedTs);
  const head = `Saved version${version ? ' ' + version : ''}, research dated ${iso(when) || 'unknown'}.`;
  const cos = arr(payload.companies);
  if (cos.length) {
    const b = buildReport(payload);
    const c = firstCompany(b, payload, cos[0]);
    if (!c) return head;
    const rows = companyFigures(c, cos[0]).filter((r) => isNum(r.value));
    const lines = [head, `Company: ${S(c.name)} (${S(c.symbol)}${c.exchange ? ', ' + S(c.exchange) : ''}).`,
      'Figures then:'];
    rows.forEach((r) => lines.push(`- ${r.label}${r.period ? ' (' + r.period + ')' : ''}: ${fmt(r.value)}${r.unit ? ' ' + r.unit : ''}`));
    if (arr(c.thesis).length) { lines.push('Thesis then:'); arr(c.thesis).forEach((t, i) => lines.push(`${i + 1}. ${S(t)}`)); }
    if (arr(c.thesisBreakers).length) { lines.push('Thesis breakers then:'); arr(c.thesisBreakers).forEach((t) => lines.push(`- ${S(t)}`)); }
    if (arr(c.risks).length) { lines.push('Risks then:'); arr(c.risks).forEach((r) => lines.push(`- ${S(r.risk)} [${S(r.severity)}${isNum(r.probability) ? ', p=' + r.probability : ''}]`)); }
    if (arr(c.redFlags).length) { lines.push('Red flags then:'); arr(c.redFlags).forEach((f) => lines.push(`- ${S(f.category)} (${S(f.severity)}): ${S(f.detail)}`)); }
    if (arr(c.catalysts).length) { lines.push('Catalysts then:'); arr(c.catalysts).forEach((x) => lines.push(`- ${S(x.event)} — ${S(x.expectedWindow)}`)); }
    const lm = matters(cos[0]);
    if (lm.length) { lines.push('Legal and regulatory matters then:'); lm.forEach((m) => lines.push(`- ${m.severity}: ${m.summary}`)); }
    if (c.consensus && S(c.consensus.revisionDirection)) lines.push(`Consensus revisions then: ${S(c.consensus.revisionDirection)}.`);
    return lines.join('\n');
  }
  const sc = screenOf(payload);
  const lines = [head, `Sector: ${S(payload.run && payload.run.sector)}${payload.run && payload.run.subSector ? ' — ' + S(payload.run.subSector) : ''}.`];
  if (sc.top3.length) lines.push('Top 3 then (chosen by the app’s screen): ' + sc.top3.map((x, i) => `${i + 1}. ${S(x.name)} (${S(x.symbol)})`).join('; ') + '.');
  if (sc.ranked.length) {
    lines.push('Shortlist ratings then (business quality / growth / valuation / risk):');
    sc.ranked.forEach((r) => {
      const g = (k) => { const x = r.ratings && r.ratings[k]; return isObj(x) ? x.score : x; };
      lines.push(`- ${S(r.name)} (${S(r.symbol)}): ${g('businessQuality')} / ${g('growthMultibagger')} / ${g('valuationOpportunity')} / ${g('riskQuality')}`);
    });
  }
  const m = payload.macro || {};
  const ml = MACRO.filter(([k]) => m[k] && isNum(m[k].value)).map(([k, l]) => `${l} ${fmt(m[k].value)} (${S(m[k].period)})`);
  if (ml.length) lines.push('Macro then: ' + ml.join('; ') + '.');
  const t = payload.tam || {};
  if (t.tam && isNum(t.tam.value)) lines.push(`TAM then: ${fmt(t.tam.value, 0)} ${S(t.tam.unit)} (${S(t.tam.year)}).`);
  const cp = payload.competition || {};
  if (arr(cp.players).length) lines.push(`Competition then (${S(cp.metric) || 'measure not stated'}, ${S(cp.period) || 'period not stated'}): `
    + arr(cp.players).map((x) => `${S(x.name)} ${fmt(x.share)}`).join('; ') + '.');
  if (payload.sectorValuation && isNum(payload.sectorValuation.currentMultiple)) {
    lines.push(`Sector valuation then: ${fmt(payload.sectorValuation.currentMultiple)} (${S(payload.sectorValuation.metric)}).`);
  }
  if (arr(payload.policy).length) lines.push('Policies then: ' + arr(payload.policy).map((x) => S(x.name)).join('; ') + '.');
  if (arr(payload.monitorables).length) { lines.push('Monitorables then:'); arr(payload.monitorables).forEach((x) => lines.push(`- ${S(x)}`)); }
  return lines.join('\n');
}

/* ── 5. Why a saved version is due for an update ────────────────────────── */
export function triggers(payload, { savedTs, now = new Date(), livePrice = null } = {}) {
  const out = [];
  if (!isObj(payload)) return out;
  const when = asOf(payload, savedTs) || (savedTs ? new Date(savedTs) : null);
  const days = when ? Math.floor((now - when) / dayMs) : null;
  if (isNum(days) && days > 90) out.push({ level: 'red', key: 'age', why: `Researched ${days} days ago.` });
  else if (isNum(days) && days > 30) out.push({ level: 'amber', key: 'age', why: `Researched ${days} days ago.` });
  const c = arr(payload.companies)[0];
  if (c) {
    const price = c.valuation && c.valuation.currentPrice;
    if (isObj(livePrice) && isNum(livePrice.price) && isNum(price) && price > 0) {
      const mv = (livePrice.price / price - 1) * 100;
      if (Math.abs(mv) >= 10) out.push({ level: 'red', key: 'price',
        why: `Price ${mv > 0 ? 'up' : 'down'} ${Math.abs(round(mv, 1))}% since the research (${fmt(price)} to ${fmt(livePrice.price)}).` });
    }
    const passed = arr(c.catalysts).filter((x) => {
      const end = windowEnd(x && x.expectedWindow);
      return end && when && end > when && end <= now;
    });
    if (passed.length) out.push({ level: 'amber', key: 'catalyst',
      why: `${passed.length} dated ${passed.length === 1 ? 'event has' : 'events have'} passed since: ${passed.slice(0, 2).map((x) => S(x.event)).join('; ')}.` });
    const q = arr(c.financials && c.financials.quarterly).map((x) => windowEnd(x && x.period)).filter(Boolean)
      .sort((a, b) => b - a)[0];
    if (q) {
      /* Results for the next quarter are due 45 days after it ends. */
      const nextEnd = new Date(Date.UTC(q.getUTCFullYear(), q.getUTCMonth() + 4, 0));
      const due = new Date(nextEnd.getTime() + 45 * dayMs);
      if (due <= now) out.push({ level: 'amber', key: 'results', why: 'A quarter’s results have been due since the research.' });
    }
  } else {
    const stale = MACRO.filter(([k]) => {
      const r = payload.macro && payload.macro[k];
      const end = r && windowEnd(r.period);
      return end && (now - end) / dayMs > 365;
    });
    if (stale.length) out.push({ level: 'amber', key: 'macro', why: `${stale.length} macro ${stale.length === 1 ? 'reading is' : 'readings are'} more than a year old.` });
  }
  return out;
}
