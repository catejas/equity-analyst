/* commentary.js — say what the engine did, and what it means.
 *
 * The application performs a great deal of work that never reaches the page.
 * It screens a universe, weighs four pillars against written anchors, runs
 * fifteen forensic tests, applies a kill switch, reconciles a driver model
 * against reported revenue and runs five multibagger tests — and then prints
 * a number. A reader sees the verdict and not the argument, which is the one
 * thing an equity research report exists to carry.
 *
 * Every function here takes the company as the report carries it and returns
 * { title, text } or null. Three rules, and they are the whole design:
 *
 *   1. Never generic. Every sentence names a figure the engine computed. A
 *      paragraph that would read the same for any company is worse than no
 *      paragraph, because it looks like analysis and is not.
 *   2. Say what would change it. A reading with no stated trigger cannot be
 *      monitored, and an unmonitorable conclusion is an opinion.
 *   3. Return null rather than pad. Where the engine could not compute
 *      something, the gap is reported elsewhere; inventing prose over it
 *      hides the gap.
 */

import { MULTIBAGGER_TESTS, orderedAnnual } from './models.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const one = (n, d = 1) => (isNum(n) ? n.toFixed(d) : '—');

/* A band a reader can argue with, rather than a number they cannot. */
function band(score) {
  if (!isNum(score)) return null;
  if (score >= 80) return 'strong';
  if (score >= 65) return 'adequate';
  if (score >= 45) return 'thin';
  return 'weak';
}

/* ------------------------------------------------------- the overall score */

export function scoreCommentary(c) {
  const o = c?.overall;
  if (!o || !isNum(o.score)) return null;

  const pillars = Object.entries(c.pillars || {})
    .filter(([, p]) => isNum(p?.score))
    .map(([key, p]) => ({ key, label: p.label || key, score: p.score }));
  if (pillars.length < 2) return null;

  const sorted = pillars.slice().sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spread = best.score - worst.score;

  const parts = [];
  parts.push(
    `The overall ${one(o.score)} is a weighted result, not an average of opinions: `
    + `each pillar is scored against written anchors and the four are combined on fixed weights, `
    + `which is why two runs on the same research agree.`
  );
  parts.push(
    `${best.label} is the strongest at ${one(best.score)} and ${worst.label} the weakest at `
    + `${one(worst.score)}.`
  );
  parts.push(
    spread >= 25
      ? `A ${one(spread, 0)}-point spread between them means the overall figure is hiding a `
        + `disagreement: this is not a uniformly ${band(o.score)} company but a `
        + `${band(best.score)} one on ${best.label.toLowerCase()} and a ${band(worst.score)} one on `
        + `${worst.label.toLowerCase()}. Read the two separately before relying on the single number.`
      : `The four pillars sit within ${one(spread, 0)} points of each other, so the overall figure `
        + `is representative rather than an average of extremes.`
  );
  if (isNum(o.coverage) && o.coverage < 1) {
    parts.push(
      `Coverage is ${one(o.coverage * 100, 0)}% — some components were not rated, and the score is `
      + `computed over what was. A score built on less evidence moves more when the gap is filled.`
    );
  }
  return { title: 'What the score rests on', text: parts.join(' ') };
}

/* ----------------------------------------------------------- the forensics */

export function forensicCommentary(c) {
  const f = c?.forensic;
  if (!f || !f.available || !isNum(f.score)) return null;

  const severe = arr(f.severeFlags).length;
  const flags = arr(f.flags).length;
  const tested = isNum(f.tested) ? f.tested : null;
  const attempted = isNum(f.testsAttempted) ? f.testsAttempted : null;

  const parts = [];
  parts.push(
    tested != null && attempted != null
      ? `${tested} of ${attempted} accounting tests could be run on what the payload carried, `
        + `and the forensic score is ${one(f.score, 0)} out of 100 across those.`
      : `The forensic score is ${one(f.score, 0)} out of 100.`
  );

  if (severe > 0) {
    parts.push(
      `${severe === 1 ? 'One finding is' : `${severe} findings are`} severe. A severe finding bars `
      + `the company from the Top 3 on its own, whatever the other three pillars say — the screen `
      + `does not trade accounting quality against growth.`
    );
  } else if (flags > 0) {
    parts.push(
      `${flags === 1 ? 'One test' : `${flags} tests`} raised a flag without reaching severity. `
      + `A flag is a reason to read the note, not a reason to walk away.`
    );
  } else {
    parts.push('No test raised a flag. That is an absence of evidence against the accounts, which '
      + 'is weaker than evidence for them.');
  }

  if (isNum(f.coverage) && f.coverage < 0.7) {
    parts.push(
      `Coverage is only ${one(f.coverage * 100, 0)}%, so most of this score rests on tests that `
      + `could not run. Treat it as provisional until the missing inputs are supplied.`
    );
  }
  return { title: 'What the accounting tests found', text: parts.join(' ') };
}

/* ------------------------------------------------------- the kill switch */

export function eligibilityCommentary(c) {
  if (c?.eligibleForTop3 !== false) return null;
  const reasons = arr(c.exclusionReasons);
  if (!reasons.length) return null;
  return {
    title: 'Why this company cannot enter the Top 3',
    text: 'The screen bars a company outright rather than scoring it down, because the findings '
      + 'below are not the kind a high score elsewhere should be allowed to outweigh. '
      + `${reasons.length === 1 ? 'The reason' : `All ${reasons.length} reasons`} must be cleared `
      + 'before the company is comparable with the rest of the shortlist; until then its overall '
      + 'score describes a company that is not eligible to be chosen.',
  };
}

/* ------------------------------------------------- the model, reconciled */

export function modelCommentary(c) {
  const m = c?.model?.model;
  if (!m || !m.available) return null;
  const years = arr(m.years);
  if (!years.length) return null;

  const first = years[0];
  const last = years[years.length - 1];
  const parts = [];

  const rec = m.reconciliation || {};
  if (m.reconciled === true) {
    parts.push(
      'The forecast is built from operating drivers — volume and realisation for each line of '
      + `the business — and the base year ties to the ${one(rec.expected, 0)} of revenue the company `
      + `reported${rec.period ? ` in ${rec.period}` : ''}, so the model is forecasting this `
      + 'company rather than an abstraction of it.'
    );
  } else if (m.reconciled === false) {
    parts.push(
      'The forecast is built from operating drivers, but the base year does NOT tie to reported '
      + `revenue: the drivers produce ${one(rec.actual, 0)} against ${one(rec.expected, 0)} reported, `
      + `out by ${one(rec.offByPct)}%. Every figure downstream of it describes a company whose `
      + 'starting point is wrong, so no intrinsic value has been computed from it. The forecast '
      + 'is shown because it is what the research supplied and the gap is worth seeing, not '
      + 'because it can be relied on.'
    );
  } else {
    parts.push(
      'The forecast is built from operating drivers — volume and realisation for each line of '
      + 'the business — and its three statements tie to each other each year. What could not be '
      + 'checked is the base year itself: no reported revenue was supplied to tie it to, so the '
      + 'model is internally consistent without being anchored to anything the company published.'
    );
  }

  if (isNum(first?.revenue) && isNum(last?.revenue) && first.revenue > 0 && years.length > 1) {
    const cagr = (Math.pow(last.revenue / first.revenue, 1 / (years.length - 1)) - 1) * 100;
    parts.push(
      `Revenue compounds at ${one(cagr)}% a year across the forecast.`
      + (cagr > 20
        ? ' That is a demanding rate to sustain; the base rate section is where to test whether '
          + 'companies of this size have managed it.'
        : cagr < 5
          ? ' That is a modest rate, so the valuation is resting on margins or on the multiple '
            + 'rather than on growth.'
          : '')
    );
  }
  if (isNum(first?.ebitdaMargin) && isNum(last?.ebitdaMargin)) {
    const delta = last.ebitdaMargin - first.ebitdaMargin;
    if (Math.abs(delta) >= 1) {
      parts.push(
        `The EBITDA margin ${delta > 0 ? 'expands' : 'contracts'} by ${one(Math.abs(delta))} `
        + `percentage points over the same period, to ${one(last.ebitdaMargin)}%. `
        + (delta > 0
          ? 'Margin expansion is the assumption most often asserted and least often evidenced — '
            + 'the mechanism for it should be named in the theses.'
          : 'A contracting margin in the base case is a conservative assumption, and worth noting '
            + 'as such.')
      );
    }
  }
  return { title: 'What the forecast assumes', text: parts.join(' ') };
}

/* ------------------------------------------------------------- valuation */

export function valuationCommentary(c) {
  const v = c?.valuation;
  if (!v || !isNum(v.currentPrice)) return null;
  const sc = arr(v.scenarios).filter((s) => isNum(s?.fairValue));
  if (sc.length < 2) return null;

  const price = v.currentPrice;
  const base = sc.find((s) => /base/i.test(String(s.label || s.name || ''))) || sc[Math.floor(sc.length / 2)];
  const lo = Math.min(...sc.map((s) => s.fairValue));
  const hi = Math.max(...sc.map((s) => s.fairValue));

  const parts = [];
  if (isNum(base?.fairValue)) {
    const up = ((base.fairValue - price) / price) * 100;
    parts.push(
      `The base case puts the business at ${one(base.fairValue, 0)} against a price of `
      + `${one(price, 2)} — ${up >= 0 ? 'an upside' : 'a downside'} of ${one(Math.abs(up))}%.`
    );
  }
  parts.push(
    `Across the scenarios the value runs from ${one(lo, 0)} to ${one(hi, 0)}.`
    + (lo > price
      ? ' Even the bear case sits above the price, so the argument does not depend on the bull '
        + 'case being right — it depends on the bear case being wrong, which is a materially '
        + 'easier thing to establish.'
      : hi < price
        ? ' Even the bull case sits below the price, so no scenario in this research supports '
          + 'buying at this level.'
        : ' The price sits inside the range, so the conclusion depends on which scenario is '
          + 'believed rather than on the valuation itself.')
  );
  return { title: 'What the valuation is saying', text: parts.join(' ') };
}

/* The tests are named for the reader, not for the code. Printing the raw keys
   put "revenueGrowth, returnOnEquity, debt" in a sentence. */
function testLabel(key) {
  const hit = (MULTIBAGGER_TESTS || []).find((t) => t.key === key);
  return String((hit && hit.label) || key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

/* ----------------------------------------------------------- multibagger */

export function multibaggerCommentary(c) {
  const m = c?.multibaggerModel;
  if (!m) return null;
  const tests = arr(m.tests);
  if (!tests.length) return null;
  const ran = tests.filter((t) => t.ran);
  const passed = ran.filter((t) => t.passed === true);
  const failed = ran.filter((t) => t.passed === false);
  const unrun = tests.filter((t) => !t.ran);

  const parts = [];
  parts.push(
    `${ran.length} of ${tests.length} tests could run: ${passed.length} passed and `
    + `${failed.length} failed.`
  );
  if (failed.length) {
    parts.push(
      `The ${failed.length === 1 ? 'test that failed is' : 'tests that failed are'} `
      + failed.map((t) => testLabel(t.key)).join(', ')
      + '. A failed test is a specific claim about the business, not a mark against it in general.'
    );
  }
  if (unrun.length) {
    parts.push(
      `${unrun.length} could not run for want of an input, and ${unrun.length === 1 ? 'it is' : 'they are'} `
      + 'reported as unrun rather than failed — a company is never marked down for a gap it was '
      + 'honest about.'
    );
  }
  return { title: 'What the multibagger tests establish', text: parts.join(' ') };
}

/* ------------------------------------------------------------------- all */

export function commentaryFor(c) {
  return {
    score: scoreCommentary(c),
    forensic: forensicCommentary(c),
    eligibility: eligibilityCommentary(c),
    model: modelCommentary(c),
    valuation: valuationCommentary(c),
    multibagger: multibaggerCommentary(c),
  };
}

/* ======================= storytelling ====================================
 *
 * The commentary above explains each computed result where it sits. This is
 * the through-line between them: the report should read as one argument that
 * arrives somewhere, not as forty sections that each happen to be true.
 *
 * A story here has a fixed shape, because equity research does:
 *   what the business is  ->  what the market thinks  ->  what this research
 *   found  ->  what it is worth  ->  what would prove it wrong.
 *
 * Built from the engine's own figures and the analyst's own words. Nothing is
 * invented: where a piece is missing the sentence is dropped, and where the
 * whole arc is missing nothing is printed at all. A narrative that reads the
 * same for every company is the failure mode this is written against.
 */

const sentence = (t) => {
  const s = String(t || '').trim();
  if (!s) return '';
  return /[.!?]$/.test(s) ? s : s + '.';
};

/** The opening: the case in a few paragraphs, before the sections begin. */
export function openingNarrative(c) {
  if (!c) return null;
  const name = String(c.name || c.symbol || 'The company').trim();
  const paras = [];

  /* 1 — what it is, and what the engine made of it. */
  const bits = [];
  if (c.business) bits.push(sentence(c.business));
  if (isNum(c.overall?.score)) {
    const b = band(c.overall.score);
    bits.push(
      `The application scores it ${one(c.overall.score)} out of 100 — ${b} — against written `
      + `anchors rather than impressions.`
      + (c.eligibleForTop3 === false
        ? ' It is barred from the Top 3 regardless of that score, for the reasons set out at the end.'
        : '')
    );
  }
  if (bits.length) paras.push(bits.join(' '));

  /* 2 — the disagreement. A thesis only matters where the market differs. */
  const vp = c.variantPerception;
  if (vp && (vp.marketBelieves || vp.researchIndicates)) {
    const v = [];
    if (vp.marketBelieves) v.push(`The market believes ${lowerFirst(sentence(vp.marketBelieves))}`);
    if (vp.researchIndicates) v.push(`This research finds ${lowerFirst(sentence(vp.researchIndicates))}`);
    if (vp.consequence) v.push(sentence(vp.consequence));
    paras.push(v.join(' '));
  }

  /* 3 — the argument, in the analyst's own claims. */
  const th = arr(c.theses).filter((t) => t && t.claim);
  if (th.length) {
    paras.push(
      `The case rests on ${th.length === 1 ? 'one claim' : `${th.length} claims`}: `
      + th.map((t, i) => `(${i + 1}) ${lowerFirst(sentence(t.claim))}`).join(' ')
      + ` Each is argued with its mechanism and its evidence in the sections that follow, and each `
      + `is testable — a claim that cannot be checked is not a thesis.`
    );
  }

  /* 4 — what it is worth, and what has to be true. */
  const v = c.valuation;
  const sc = arr(v?.scenarios).filter((s) => isNum(s?.fairValue));
  if (isNum(v?.currentPrice) && sc.length) {
    const base = sc.find((s) => /base/i.test(String(s.label || s.name || ''))) || sc[Math.floor(sc.length / 2)];
    if (isNum(base?.fairValue)) {
      const up = ((base.fairValue - v.currentPrice) / v.currentPrice) * 100;
      paras.push(
        `On the base case the business is worth ${one(base.fairValue, 0)} against a price of `
        + `${one(v.currentPrice, 2)}, ${up >= 0 ? 'an upside' : 'a downside'} of `
        + `${one(Math.abs(up))}%. Whether that gap is real is the question the rest of this report `
        + `is trying to answer, and the valuation section is where the assumptions behind it are `
        + `set out rather than asserted.`
      );
    }
  }

  /* 5 — what would break it. A case with no stated breaker is an opinion. */
  const br = arr(c.thesisBreakers).filter(Boolean);
  const topRisk = arr(c.risks)
    .filter((r) => isNum(r?.probability) && isNum(r?.impactPct))
    .sort((a, b) => (b.probability * b.impactPct) - (a.probability * a.impactPct))[0];
  const tail = [];
  if (topRisk?.risk) {
    tail.push(
      `The risk that matters most on likelihood and cost together is `
      + `${lowerFirst(String(topRisk.risk))} — ${one(topRisk.probability * 100, 0)}% likely, `
      + `${one(topRisk.impactPct, 0)}% of value at stake.`
    );
  }
  if (br.length) {
    tail.push(
      `${br.length === 1 ? 'One thing' : `${br.length} things`} would break the case outright, and `
      + `${br.length === 1 ? 'it is' : 'they are'} listed so the reader can watch for `
      + `${br.length === 1 ? 'it' : 'them'} rather than rediscover ${br.length === 1 ? 'it' : 'them'} later.`
    );
  }
  if (tail.length) paras.push(tail.join(' '));

  if (paras.length < 2) return null;
  return { title: 'The case, in short', paragraphs: paras };
}

function lowerFirst(t) {
  const s = String(t || '');
  if (!s) return s;
  /* An acronym: PNB, CASA. */
  if (/^[A-Z]{2,}/.test(s)) return s;
  /* A proper name rather than a sentence. Checking only the second character
     turned "Systemic Deposit War" into "systemic Deposit War" — the test has
     to look at the words, not at one letter. Two or more capitalised words in
     the opening clause means a name, and a name keeps its capital. */
  const head = s.split(/[.;:]/)[0];
  const caps = (head.match(/\b[A-Z][a-z]+/g) || []).length;
  const words = (head.match(/\b[A-Za-z][A-Za-z']*/g) || []).length;
  if (caps >= 2 && words <= 6) return s;
  const second = s.charAt(1);
  if (second && second === second.toUpperCase() && /[A-Za-z]/.test(second)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** A bridge at each pillar: what this part of the report is about to settle. */
export function pillarNarrative(c, pillar) {
  if (!c) return null;
  const say = (text) => ({ title: null, text });

  switch (pillar) {
    case 1: {
      const th = arr(c.theses).length;
      return say(
        'This pillar sets out what the business is and what the argument for it is. '
        + (th ? `The ${th} claims here are the ones the rest of the report tests; ` : '')
        + 'nothing later contradicts them without saying so.'
      );
    }
    case 2:
      return say(
        'A business is only as durable as the thing stopping a competitor copying it. '
        + (c.moat?.barrier
          ? `The barrier claimed here is ${lowerFirst(sentence(String(c.moat.barrier)))} `
          : '')
        + 'What follows is the evidence for it, and what it has already survived.'
      );
    case 3: {
      const rec = c.model?.model?.reconciled;
      return say(
        'The accounts, and what management did with the money. '
        + (rec === true
          ? 'The forecast that follows is tied to the revenue reported here, within 2%, so the two cannot drift apart.'
          : rec === false
            ? 'Note that the forecast does NOT tie to the revenue reported here — read the two together carefully, '
              + 'and note that no intrinsic value has been computed from it.'
            : 'Read the reported years first; the forecast years are built on them.')
      );
    }
    case 4:
      return say(
        'What the business is worth, and on what assumptions. Every figure in this pillar is '
        + 'computed by the application from the drivers supplied — the research states the '
        + 'assumptions and the arithmetic is done here, so the two can be argued with separately.'
      );
    case 5: {
      const severe = arr(c.forensic?.severeFlags).length;
      return say(
        'What could go wrong, and what the accounts already say. '
        + (severe
          ? `${severe === 1 ? 'A severe finding' : `${severe} severe findings`} sits in this pillar, `
            + 'and it governs the conclusion regardless of everything above it.'
          : 'Nothing here overrides the case above, but each finding qualifies it.')
      );
    }
    default:
      return null;
  }
}

/** The close: what to watch, and what would change the answer. */
export function closingNarrative(c) {
  if (!c) return null;
  const br = arr(c.thesisBreakers).filter(Boolean);
  const up = arr(c.upgradeTriggers).filter(Boolean);
  if (!br.length && !up.length) return null;

  const paras = [];
  paras.push(
    'A conclusion that cannot be falsified cannot be monitored, so the report ends with both '
    + 'directions stated in advance rather than explained afterwards.'
  );
  if (br.length) {
    paras.push(
      `${br.length} ${br.length === 1 ? 'thing breaks' : 'things break'} the case: `
      + br.map((x) => lowerFirst(sentence(String(x)))).join(' ')
      + ' Any one of them is sufficient — they are not a scorecard.'
    );
  }
  if (up.length) {
    paras.push(
      `${up.length} would strengthen it: `
      + up.map((x) => lowerFirst(sentence(String(x)))).join(' ')
    );
  }
  return { title: 'What would change this conclusion', paragraphs: paras };
}

/* ===================== READINGS AGAINST EXHIBITS =====================
 *
 * Tejas: "I don't find rich commentary yet, lots of charts and numbers but no
 * commentary of what that mean."
 *
 * A chart states a fact. A reading says what the fact implies and what would
 * change it, and it is the reading a reader is actually paying for. Everything
 * below sits next to a specific exhibit and names the figures in it — the same
 * three rules as the rest of this file: never generic, always say what would
 * change it, return null rather than pad.
 */

/* The screen's own distribution. A ranking says who won; this says by how
   much, and whether the order means anything. */
export function screenCommentary(report) {
  const sc = report?.screen;
  if (!sc || !arr(sc.ranked).length) return null;
  const rated = arr(sc.ranked).filter((r) => r.sufficient && isNum(r.score));
  if (rated.length < 2) return null;
  const top = rated[0];
  const bottom = rated[rated.length - 1];
  const chosen = arr(sc.top3);
  const cut = chosen.length ? chosen[chosen.length - 1] : null;
  const next = rated[chosen.length] || null;
  const spread = top.score - bottom.score;

  const bits = [];
  bits.push(`${rated.length} of ${sc.counts.shortlisted} shortlisted companies were rated on all `
    + `four pillars and could be ranked. The screen runs from ${one(top.score)} at the top `
    + `(${top.name}) to ${one(bottom.score)} at the bottom (${bottom.name}) — a spread of `
    + `${one(spread)} points.`);

  if (cut && next && isNum(cut.score) && isNum(next.score)) {
    const margin = cut.score - next.score;
    bits.push(margin < 3
      ? `The cut is narrow: ${cut.name} takes the third place by ${one(margin)} points over `
        + `${next.name}, which is inside the noise of any rating scale. Treat the third slot as `
        + 'contested rather than settled — if one rating moved by three points the order changes.'
      : `The cut is clear: ${cut.name} takes the third place by ${one(margin)} points over `
        + `${next.name}. It would take a material change in the evidence to displace it.`);
  }

  /* Which pillar actually did the separating. A screen where every company
     scores the same on three pillars is a screen decided by the fourth, and
     the reader should know which one that was. */
  const keys = ['businessQuality', 'growthMultibagger', 'valuationOpportunity', 'riskQuality'];
  const labels = { businessQuality: 'business quality', growthMultibagger: 'growth',
    valuationOpportunity: 'valuation', riskQuality: 'risk and quality control' };
  let widest = null; let widestRange = -1;
  for (const k of keys) {
    const vals = rated.map((r) => {
      const x = r.ratings?.[k];
      return (x && typeof x === 'object') ? x.score : x;
    }).filter(isNum);
    if (vals.length < 2) continue;
    const range = Math.max(...vals) - Math.min(...vals);
    if (range > widestRange) { widestRange = range; widest = k; }
  }
  if (widest && widestRange > 0) {
    bits.push(`${labels[widest][0].toUpperCase()}${labels[widest].slice(1)} did most of the `
      + `separating, ranging ${one(widestRange, 0)} points across the shortlist. That is the `
      + 'pillar to argue with if you disagree with the three.');
  }

  const unrated = sc.counts.shortlisted - rated.length;
  if (unrated > 0) {
    bits.push(`${unrated} shortlisted ${unrated === 1 ? 'company was' : 'companies were'} rated on `
      + 'too few pillars to be compared and ranked below every fully rated one. That is a gap in '
      + 'the research, not a verdict on the company.');
  }

  return { title: 'What the screen actually separated', text: bits.join(' ') };
}

/* The reported accounts. Three years of numbers, and what the direction of
   travel in them is. */
export function statementsCommentary(c) {
  /* Oldest year first. The payload lists them newest first, and reading them
     in that order produced "moved from 1,28,206 in FY26 to 96,000 in FY24,
     compounding at -13.5% a year" — a growing bank described as shrinking. */
  const rows = orderedAnnual(c?.financials).filter((r) => isNum(r.revenue));
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const years = rows.length - 1;
  const lender = !!c.lender;
  const topLine = lender ? 'Interest income' : 'Revenue';
  const growth = first.revenue > 0
    ? (Math.pow(last.revenue / first.revenue, 1 / years) - 1) * 100 : null;

  const bits = [];
  bits.push(`${topLine} moved from ${Math.round(first.revenue).toLocaleString('en-IN')} in `
    + `${first.period} to ${Math.round(last.revenue).toLocaleString('en-IN')} in ${last.period}`
    + (isNum(growth) ? `, compounding at ${one(growth)}% a year over ${years} `
      + `${years === 1 ? 'year' : 'years'}.` : '.'));

  /* Margin — but only where a margin means something.
   *
     For a lender it does not. Dividing pre-provision operating profit by gross
     interest income gave "95.3%", because a bank's biggest cost sits below
     that line, and a 95% margin is not a number any reader should be handed.
     What a bank is judged on instead is whether profit grew faster than the
     book it was earned on. */
  if (lender) {
    if (isNum(first.netProfit) && isNum(last.netProfit) && first.netProfit > 0) {
      const pg = (Math.pow(last.netProfit / first.netProfit, 1 / years) - 1) * 100;
      const cmp = isNum(growth) ? pg - growth : null;
      bits.push(`Profit after tax compounded at ${one(pg)}% against interest income at `
        + `${one(growth)}%`
        + (cmp === null ? '.'
          : cmp > 1 ? `, ${one(cmp)} points faster — the bank is earning more on each rupee of `
            + 'income, which is operating leverage or a falling credit cost and the sections '
            + 'below say which.'
          : cmp < -1 ? `, ${one(Math.abs(cmp))} points slower. Income grew and profit did not `
            + 'keep up, so cost of funds, operating cost or provisions absorbed it.'
          : ' — profit and income grew together, so nothing in the cost structure changed.'));
    }
    if (isNum(last.netProfit) && isNum(last.totalAssets) && last.totalAssets > 0) {
      const roa = (last.netProfit / last.totalAssets) * 100;
      bits.push(`Return on assets is ${one(roa, 2)}% in ${last.period}, which is the figure a `
        + 'bank is actually compared on — above 1% is strong for an Indian public sector bank.');
    }
  } else {
    const opKey = 'ebitda';
    if (isNum(first[opKey]) && isNum(last[opKey]) && first.revenue > 0 && last.revenue > 0) {
      const m0 = (first[opKey] / first.revenue) * 100;
      const m1 = (last[opKey] / last.revenue) * 100;
      const move = m1 - m0;
      bits.push(`EBITDA margin went from ${one(m0)}% to ${one(m1)}%, `
        + (Math.abs(move) < 0.5 ? 'essentially flat — the business grew without changing shape.'
          : move > 0 ? `${one(move)} points of expansion. Margin expansion is the assumption most `
            + 'often asserted and least often evidenced, so the mechanism behind it is what to test.'
          : `${one(Math.abs(move))} points of contraction, which the growth above does not offset `
            + 'unless it continues.'));
    }
  }

  /* Profit against cash, which is where an accounting problem shows first. */
  if (isNum(last.netProfit) && isNum(last.cashFromOperations) && last.netProfit > 0) {
    const conv = (last.cashFromOperations / last.netProfit) * 100;
    bits.push(conv < 60
      ? `Cash from operations was only ${one(conv, 0)}% of reported profit in ${last.period}. `
        + 'Profit that does not arrive as cash is the single most common early sign of an '
        + 'accounting problem; the working-capital line is where to look for it.'
      : `Cash from operations covered ${one(conv, 0)}% of reported profit in ${last.period}, so `
        + 'the earnings are arriving as cash.');
  }

  return { title: 'What three years of accounts say', text: bits.join(' ') };
}

/* The share price line, against what the business did underneath it. */
export function priceCommentary(c) {
  const perf = c?.snapshot?.performance;
  if (!perf || !isNum(perf.m12)) return null;
  const bits = [];
  const rel = isNum(perf.m12Relative) ? perf.m12Relative : null;
  bits.push(`The shares are ${perf.m12 >= 0 ? 'up' : 'down'} ${one(Math.abs(perf.m12))}% over `
    + 'twelve months'
    + (rel === null ? '.'
      : `, ${one(Math.abs(rel))} points ${rel >= 0 ? 'ahead of' : 'behind'} `
        + `${perf.benchmark || 'the index'}.`));

  const sn = c.snapshot || {};
  if (isNum(sn.week52High) && isNum(sn.week52Low) && sn.week52High > sn.week52Low) {
    const px = c.valuation?.currentPrice;
    if (isNum(px)) {
      const pos = ((px - sn.week52Low) / (sn.week52High - sn.week52Low)) * 100;
      bits.push(`It sits ${one(pos, 0)}% of the way up its 52-week range. `
        + (pos > 80 ? 'Buying at the top of the range does not make a thesis wrong, but it does '
            + 'mean the market has already been told most of it.'
          : pos < 20 ? 'A price near the bottom of its range is either the opportunity or the '
            + 'market pricing something the research has not found. The risks section is where '
            + 'that question gets settled.'
          : 'That is the middle of the range, which tells you nothing on its own — the valuation '
            + 'section is what decides whether it is cheap.'));
    }
  }
  return { title: 'What the price has already done', text: bits.join(' ') };
}

/* Who owns it, and what changed. */
export function ownershipCommentary(c) {
  const q = arr(c?.shareholding);
  if (!q.length) return null;
  const now = q[0];
  const then = q.length > 1 ? q[q.length - 1] : null;
  if (!isNum(now.promoter)) return null;
  const bits = [];
  bits.push(`The promoter holds ${one(now.promoter)}%`
    + (isNum(now.fii) && isNum(now.dii)
      ? `, with FIIs at ${one(now.fii)}% and DIIs at ${one(now.dii)}%.` : '.'));
  if (then && isNum(then.promoter)) {
    const move = now.promoter - then.promoter;
    if (Math.abs(move) >= 0.2) {
      bits.push(`Promoter holding has ${move > 0 ? 'risen' : 'fallen'} `
        + `${one(Math.abs(move))} points since ${then.period}. `
        + (move < 0 ? 'A falling promoter stake is worth a reason: dilution from a capital raise '
            + 'is a different fact from a sale, and the two read identically in this table.'
          : 'Promoters adding to a holding they already control is the most direct signal of '
            + 'confidence available, provided it was bought rather than allotted.'));
    }
  }
  if (isNum(now.pledged) && now.pledged > 0) {
    bits.push(`${one(now.pledged)}% of the promoter holding is pledged, which links the share `
      + 'price to the promoter\'s own solvency and is the risk that compounds fastest in a fall.');
  }
  return { title: 'What the register says', text: bits.join(' ') };
}
