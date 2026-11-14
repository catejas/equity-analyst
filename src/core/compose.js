import { top3For } from './screen.js';
import { industryFamily } from './industry.js';
// compose.js — one run assembled from separately imported pieces.
//
// The sector is researched on its own, then each of the three companies on its
// own. Each arrives as its own payload with its own copy button, which is the
// point: one reply, one block, one tap. This puts them back together so the
// documents see a single run.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Merge a sector payload and any number of company payloads into one.
 * The sector payload owns the run and all the sector research; a company
 * payload contributes its company and nothing else, so a later company import
 * can never quietly rewrite the sector work.
 */
/* Is a company reply answering the question this run asked?
 *
 * A company prompt is built from the selected sector run, so the reply's run
 * block should name that same sector. When it names a different one, the AI
 * answered about something else — which is exactly what happened: a prompt
 * that said "Sector: Banking" came back describing SpiceJet, run block stamped
 * "Aviation / Airlines", and that company was then folded into the Public
 * Sector Banks study. The document that came out carried a banking header over
 * an aviation title, which is what Tejas saw.
 *
 * Names are compared loosely — case, punctuation and the odd "sector" suffix
 * differ between runs without meaning anything. A company reply that states no
 * sector at all is accepted: silence is not a contradiction. Only a stated,
 * different sector is a mismatch, and only the sector is checked, never the
 * sub-sector: a PSB study may legitimately pull in a comparator from another
 * sub-sector of the same sector. */
const norm = (s) => String(s == null ? '' : s).toLowerCase()
  .replace(/\bsectors?\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/* ── Is it the same sector? Is it the same company? ─────────────────────
 *
 * Tejas, after the Banking study had worked and Power and Chemicals had not:
 * "Remove the bug that doesn't allow to save top 3 companies of second and all
 * subsequent search for different segments. Also the second segment Top 3
 * companies doesn't load in scorecard page."
 *
 * The comparison above was exact, after tidying. "Banking" against "banking"
 * passes. "Power and utilities" — the name on the app's own sector list —
 * against a company reply that says "Power", or "Power & Utilities", does not:
 * the first normalises to "power and utilities" and the second to "power
 * utilities". So every company of that study was judged to be about a
 * different sector, kept out of it, and the Score Card and the reports had no
 * company to show. Banking was the one sector where the two strings happened
 * to be identical, which is why this only appeared with the second.
 *
 * The rule exists to stop an airline being folded into a banking study, and it
 * still does. But "a different string" is not "a different sector". A reply is
 * foreign only when all three of these are true:
 *
 *   - its sector and sub-sector share no meaningful word with the study's;
 *   - the two do not classify into the same industry family; and
 *   - the company is not on the study's own shortlist.
 *
 * The last is the strongest. A company the screen itself nominated belongs to
 * the study whatever label the research tool put on its reply. */
const SECTOR_STOP = new Set(['and', 'the', 'of', 'for', 'in', 'sector', 'sectors', 'industry',
  'industries', 'services', 'service', 'products', 'product', 'general', 'other', 'others',
  'india', 'indian', 'public', 'private', 'listed']);
const stem = (w) => w.replace(/ies$/, 'y').replace(/(ing|als|al)$/, '').replace(/s$/, '');
function sectorWords(run) {
  return new Set(norm(`${(run && run.sector) || ''} ${(run && run.subSector) || ''}`).split(' ')
    .filter((w) => w.length > 2 && !SECTOR_STOP.has(w)).map(stem).filter((w) => w.length > 2));
}

/* A ticker as the exchange knows it: no exchange prefix or suffix, no series
   tag, no punctuation. "NSE:TATAPOWER", "TATAPOWER.NS" and "tatapower-EQ" are
   one company. */
export function symbolKey(v) {
  return String(v == null ? '' : v).toUpperCase().trim()
    .replace(/^(NSE|BSE|NSEI|BOM)\s*[:\-]\s*/, '')
    .replace(/\.(NS|BO|NSE|BSE)$/, '').replace(/-(EQ|BE|BZ)$/, '')
    .replace(/[^A-Z0-9]/g, '');
}
/* A company name without the words that only say it is a company. */
const LEGAL = new Set(['limited', 'ltd', 'the', 'co', 'company', 'corporation', 'corp', 'inc',
  'plc', 'pvt', 'private']);
export function nameKey(v) {
  return norm(v).split(' ').filter((w) => w && !LEGAL.has(w)).join(' ');
}
/* The same company, by ticker or by name. A name may be the other's opening
   words — "Power Grid" for "Power Grid Corporation of India" — but only when
   the shorter runs to two words: "Tata" is not "Tata Power", and "Bank of
   India" is not "State Bank of India" because it does not open it. */
export function sameCompany(a, b) {
  if (!a || !b) return false;
  const sa = symbolKey(a.symbol), sb = symbolKey(b.symbol);
  if (sa && sb && sa === sb) return true;
  const na = nameKey(a.name), nb = nameKey(b.name);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.split(' ').length >= 2 && long.startsWith(short + ' ');
}
function onShortlist(sectorPayload, company) {
  if (!sectorPayload || !company) return false;
  const lists = [sectorPayload.shortlist, sectorPayload.run && sectorPayload.run.top3,
    sectorPayload.screen && sectorPayload.screen.shortlist];
  return lists.some((l) => Array.isArray(l) && l.some((e) => sameCompany(e, company)));
}

/* `ctx` is optional: { sector: the study's payload, company: the company in
   the reply }. With it, a shortlisted company is never foreign. */
export function sectorMismatch(baseRun, coRun, ctx) {
  const want = norm(baseRun && baseRun.sector);
  const got = norm(coRun && coRun.sector);
  if (!want || !got) return null;
  if (want === got) return null;
  const a = sectorWords(baseRun), b = sectorWords(coRun);
  for (const w of a) if (b.has(w)) return null;
  const fa = industryFamily({ sector: baseRun.sector, subSector: baseRun.subSector }, {}).key;
  const fb = industryFamily({ sector: coRun.sector, subSector: coRun.subSector }, {}).key;
  if (fa !== 'general' && fa === fb) return null;
  if (ctx && onShortlist(ctx.sector, ctx.company)) return null;
  return { expected: String(baseRun.sector), found: String(coRun.sector),
    foundSub: (coRun && coRun.subSector) || null };
}

export function composePayload(sector, companyPayloads = []) {
  const base = sector && isObj(sector) ? JSON.parse(JSON.stringify(sector)) : { run: {} };
  base.companies = [];
  if (!isObj(base.run)) base.run = {};
  const foreign = [];

  const seen = new Set();
  for (const p of companyPayloads) {
    if (!isObj(p) || !Array.isArray(p.companies)) continue;
    /* A reply about a different sector contributes nothing — not its company,
       and not its sector research either. Dropping it silently would only move
       the confusion, so it is recorded and the report prints it. */
    const bad = p.companies.every((c) => sectorMismatch(base.run, p.run, { sector: base, company: c }))
      ? sectorMismatch(base.run, p.run) : null;
    if (bad) {
      for (const c of p.companies) {
        if (isObj(c) && (c.symbol || c.name)) {
          foreign.push({ symbol: String(c.symbol || ''), name: String(c.name || c.symbol || ''),
            sector: bad.found, subSector: bad.foundSub, expected: bad.expected });
        }
      }
      continue;
    }
    for (const c of p.companies) {
      if (!isObj(c) || !c.symbol) continue;
      if (seen.has(symbolKey(c.symbol))) continue;   /* first import of a symbol wins */
      seen.add(symbolKey(c.symbol));
      base.companies.push(c);
    }
    /* A company run may carry sector research the sector run lacked. Fill
       gaps, never overwrite: the sector study is the authority on the sector. */
    for (const k of ['global', 'macro', 'budget', 'policy', 'policyEvolution', 'regulation',
      'geopolitics', 'industry', 'valueChain', 'tam', 'programs', 'competition',
      'sectorValuation', 'monitorables', 'glossary', 'industryMap', 'universe']) {
      if (base[k] == null && p[k] != null) base[k] = p[k];
    }
  }

  /* Order the companies by the sector's own shortlist, so rank 1 in the app is
     rank 1 in the research even before scoring runs. */
  if (foreign.length) base.run.foreignImports = foreign;

  const nominated = top3For(base).list;
  if (nominated.length && base.companies.length > 1) {
    const pos = (c) => { const i = nominated.findIndex((x) => sameCompany(x, c)); return i < 0 ? 99 : i; };
    base.companies.sort((a, b) => pos(a) - pos(b));
  }
  return base;
}

/** The three slots the Company page shows, filled or waiting. */
export function slots(sectorPayload, companyRecords = []) {
  /* The three come from the screen when the sector run supplied a shortlist,
     and from run.top3 only for an older run that named them itself. */
  const chosen = top3For(sectorPayload || {});
  const nominated = chosen.list.slice(0, 3);
  const out = [];
  /* Which record fills which slot.
   *
   * First by identity: the record whose company is the one nominated. Then by
   * where it was put: a record imported into rank 2 that matched no nominated
   * name still belongs in slot 2, because someone pressed Import on slot 2.
   *
   * Without the second pass a company whose reply spelt its ticker or its name
   * differently from the screen — "TATAPOWER.NS" for "TATAPOWER", "NTPC
   * Limited" for "NTPC" — was saved and then shown nowhere: the slot went on
   * saying "to research", and the import looked as if it had not been kept. */
  const firstCo = (r) => (r && r.data && Array.isArray(r.data.companies) ? r.data.companies[0] : null);
  const assigned = [null, null, null];
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const nom = nominated[i];
    if (!nom) continue;
    const rec = companyRecords.find((r) => !used.has(r) && firstCo(r) && sameCompany(firstCo(r), nom));
    if (rec) { assigned[i] = rec; used.add(rec); }
  }
  for (let i = 0; i < 3; i++) {
    if (assigned[i]) continue;
    const rec = companyRecords.find((r) => !used.has(r) && firstCo(r) && r.rank === i + 1);
    if (rec) { assigned[i] = rec; used.add(rec); }
  }
  for (let i = 0; i < 3; i++) {
    const nom = nominated[i] || null;
    const rec = assigned[i];
    const imported = rec && rec.data && rec.data.companies && rec.data.companies[0];
    out.push({
      rank: i + 1,
      name: (imported && (imported.name || imported.symbol))
        || (nom && (nom.name || nom.symbol)) || null,
      symbol: (imported && imported.symbol) || (nom && nom.symbol) || null,
      why: nom ? nom.why : null,
      screenScore: nom && typeof nom.score === 'number' ? nom.score : null,
      chosenBy: chosen.source,
      record: rec,
      /* Said when the company in the slot is not the one the screen named. */
      inPlaceOf: (rec && nom && !sameCompany(firstCo(rec), nom)) ? (nom.name || nom.symbol) : null,
      state: rec ? 'imported' : (nom ? 'named' : 'empty'),
    });
  }
  return out;
}
