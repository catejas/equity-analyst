// screen.js — the engine chooses the Top 3, not the model.
//
// The segment run used to name three companies directly, with one line each on
// why. That was the single judgement in the whole system with no rubric behind
// it: no anchors, no weights, no evidence requirement. Two tools given the same
// facts returned different threes, because the choice was opinion and nothing
// downstream checked it.
//
// Now the segment run rates every shortlisted company on the four pillars, with
// a sentence of evidence for each rating, and this file ranks them. The same
// payload always yields the same three, and the reason each one is there can be
// read off the numbers.
//
// This is a screen, not the full 52-component score. It exists to decide which
// companies are worth a full research run; the real scoring happens after those
// runs come back, on far more evidence.

import { PILLARS } from './scoring.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** The four pillars carry equal weight at the screening stage. */
export const SCREEN_WEIGHTS = Object.freeze({
  businessQuality: 0.25,
  growthMultibagger: 0.25,
  valuationOpportunity: 0.25,
  riskQuality: 0.25,
});

export const SCREEN_KEYS = Object.freeze(Object.keys(SCREEN_WEIGHTS));

/** How many pillars a company must be rated on before it can be ranked. */
export const MIN_RATED = 3;

/**
 * Score one shortlisted company. Missing pillars are not counted as zero — the
 * weight is renormalised over what was rated, exactly as the full scorer does,
 * so a company is never punished for a gap it was honest about.
 */
export function screenScore(entry) {
  if (!isObj(entry)) return { score: null, rated: 0, coverage: 0, missing: SCREEN_KEYS.slice() };
  const ratings = isObj(entry.ratings) ? entry.ratings : {};
  let weighted = 0;
  let weight = 0;
  const missing = [];
  const evidenceless = [];

  for (const k of SCREEN_KEYS) {
    const r = ratings[k];
    const value = isObj(r) ? r.score : r;
    if (!isNum(value)) { missing.push(k); continue; }
    /* A rating with no evidence behind it is the thing this whole design exists
       to stop. It still counts, because refusing it would push the model back
       toward supplying nothing, but it is recorded and reported. */
    if (isObj(r) && !(typeof r.evidence === 'string' && r.evidence.trim())) evidenceless.push(k);
    const w = SCREEN_WEIGHTS[k];
    weighted += Math.max(0, Math.min(100, value)) * w;
    weight += w;
  }

  const rated = SCREEN_KEYS.length - missing.length;
  return {
    score: weight > 0 ? weighted / weight : null,
    rated,
    coverage: weight,
    missing,
    evidenceless,
    sufficient: rated >= MIN_RATED,
  };
}

/**
 * Rank the shortlist and take the three. Ties are reported rather than broken
 * silently: two companies within the noise band are genuinely not separated by
 * this screen, and saying so is more useful than an arbitrary order.
 */
export const SCREEN_NOISE_BAND = 2.0;

export function screenShortlist(shortlist) {
  const rows = (Array.isArray(shortlist) ? shortlist : [])
    .filter((x) => isObj(x) && (x.symbol || x.name))
    .map((x) => {
      const s = screenScore(x);
      return {
        symbol: x.symbol || null,
        name: x.name || x.symbol,
        score: s.score,
        rated: s.rated,
        sufficient: s.sufficient,
        missing: s.missing,
        evidenceless: s.evidenceless,
        why: typeof x.why === 'string' ? x.why : null,
        ratings: isObj(x.ratings) ? x.ratings : {},
      };
    });

  /* A company rated on too few pillars cannot be compared with one rated on all
     four, so it ranks below every sufficient company however high it scores.
     This is the same precondition the full ranker applies. */
  const ranked = rows.slice().sort((a, b) => {
    if (a.sufficient !== b.sufficient) return a.sufficient ? -1 : 1;
    if (a.score === null || b.score === null) return a.score === null ? 1 : -1;
    return b.score - a.score;
  });
  ranked.forEach((r, i) => { r.rank = i + 1; });

  const ties = [];
  for (let i = 0; i < Math.min(ranked.length, 6) - 1; i += 1) {
    const a = ranked[i];
    const b = ranked[i + 1];
    if (a.score !== null && b.score !== null && a.sufficient === b.sufficient
        && Math.abs(a.score - b.score) < SCREEN_NOISE_BAND) {
      ties.push({ a: a.name, b: b.name, gap: Math.abs(a.score - b.score) });
    }
  }

  const chosen = ranked.filter((r) => r.sufficient && r.score !== null).slice(0, 3);
  return {
    ranked,
    top3: chosen,
    ties,
    counts: {
      shortlisted: rows.length,
      rated: rows.filter((r) => r.sufficient).length,
      chosen: chosen.length,
    },
  };
}

/**
 * The three names the app shows, in the shape the rest of the application
 * already expects from run.top3 — so nothing downstream has to know whether the
 * choice was computed or supplied.
 *
 * A payload that carries a shortlist is screened. A payload that carries only
 * run.top3 is an older run, or one from a model that would not supply twelve;
 * its names are used as given and flagged as unscreened, because a name chosen
 * by opinion should not look the same as one chosen by the engine.
 */
export function top3For(payload) {
  const run = isObj(payload) && isObj(payload.run) ? payload.run : {};
  const shortlist = Array.isArray(payload && payload.shortlist) ? payload.shortlist : null;

  if (shortlist && shortlist.length) {
    const s = screenShortlist(shortlist);
    return {
      source: 'screened',
      list: s.top3.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        why: r.why || screenWhy(r),
        score: r.score,
        rank: r.rank,
      })),
      screen: s,
    };
  }

  const given = Array.isArray(run.top3) ? run.top3.slice(0, 3) : [];
  return {
    source: given.length ? 'stated' : 'none',
    list: given.map((x, i) => ({
      symbol: x.symbol || null,
      name: x.name || x.symbol,
      why: x.why || null,
      score: null,
      rank: i + 1,
    })),
    screen: null,
  };
}

/** A one-line reason built from the ratings, for when the payload gives none. */
function screenWhy(row) {
  const parts = SCREEN_KEYS
    .map((k) => {
      const r = row.ratings[k];
      const v = isObj(r) ? r.score : r;
      return isNum(v) ? `${PILLARS[k] ? PILLARS[k].label : k} ${Math.round(v)}` : null;
    })
    .filter(Boolean);
  if (!parts.length) return null;
  return `Screened ${row.score == null ? '' : row.score.toFixed(1) + ' of 100'} — ${parts.join(', ')}.`;
}
