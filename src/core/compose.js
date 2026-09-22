import { top3For } from './screen.js';
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

export function sectorMismatch(baseRun, coRun) {
  const want = norm(baseRun && baseRun.sector);
  const got = norm(coRun && coRun.sector);
  if (!want || !got) return null;
  if (want === got) return null;
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
    const bad = sectorMismatch(base.run, p.run);
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
      if (seen.has(c.symbol)) continue;   /* first import of a symbol wins */
      seen.add(c.symbol);
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
    const order = new Map(nominated.map((x, i) => [String(x.symbol || x.name).toUpperCase(), i]));
    base.companies.sort((a, b) => {
      const ai = order.has(String(a.symbol).toUpperCase()) ? order.get(String(a.symbol).toUpperCase()) : 99;
      const bi = order.has(String(b.symbol).toUpperCase()) ? order.get(String(b.symbol).toUpperCase()) : 99;
      return ai - bi;
    });
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
  for (let i = 0; i < 3; i++) {
    const nom = nominated[i] || null;
    const rec = companyRecords.find((r) => {
      const c = r && r.data && Array.isArray(r.data.companies) ? r.data.companies[0] : null;
      if (!c) return false;
      if (nom) {
        return String(c.symbol || '').toUpperCase() === String(nom.symbol || '').toUpperCase()
          || String(c.name || '').toLowerCase() === String(nom.name || '').toLowerCase();
      }
      return r.rank === i + 1;
    }) || null;
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
      state: rec ? 'imported' : (nom ? 'named' : 'empty'),
    });
  }
  return out;
}
