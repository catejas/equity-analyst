// compose.js — one run assembled from separately imported pieces.
//
// The segment is researched on its own, then each of the three companies on its
// own. Each arrives as its own payload with its own copy button, which is the
// point: one reply, one block, one tap. This puts them back together so the
// documents see a single run.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Merge a segment payload and any number of company payloads into one.
 * The segment payload owns the run and all the segment research; a company
 * payload contributes its company and nothing else, so a later company import
 * can never quietly rewrite the segment work.
 */
export function composePayload(segment, companyPayloads = []) {
  const base = segment && isObj(segment) ? JSON.parse(JSON.stringify(segment)) : { run: {} };
  base.companies = [];

  const seen = new Set();
  for (const p of companyPayloads) {
    if (!isObj(p) || !Array.isArray(p.companies)) continue;
    for (const c of p.companies) {
      if (!isObj(c) || !c.symbol) continue;
      if (seen.has(c.symbol)) continue;   /* first import of a symbol wins */
      seen.add(c.symbol);
      base.companies.push(c);
    }
    /* A company run may carry segment research the segment run lacked. Fill
       gaps, never overwrite: the segment study is the authority on the segment. */
    for (const k of ['global', 'macro', 'budget', 'policy', 'policyEvolution', 'regulation',
      'geopolitics', 'industry', 'valueChain', 'tam', 'programs', 'competition',
      'sectorValuation', 'monitorables', 'glossary', 'industryMap', 'universe']) {
      if (base[k] == null && p[k] != null) base[k] = p[k];
    }
  }

  /* Order the companies by the segment's own shortlist, so rank 1 in the app is
     rank 1 in the research even before scoring runs. */
  const nominated = (base.run && Array.isArray(base.run.top3)) ? base.run.top3 : [];
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

/** The three slots the Report page shows, filled or waiting. */
export function slots(segmentPayload, companyRecords = []) {
  const nominated = (segmentPayload && segmentPayload.run && Array.isArray(segmentPayload.run.top3))
    ? segmentPayload.run.top3.slice(0, 3) : [];
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
      record: rec,
      state: rec ? 'imported' : (nom ? 'named' : 'empty'),
    });
  }
  return out;
}
