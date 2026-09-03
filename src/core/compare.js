// compare.js — doc 06 makes "What Changed?" and "Why?" mandatory on a re-run.
//
// The comparison states what moved and attributes it to the underlying driver.
// Where the cause cannot be established from the two payloads, it says so
// rather than inventing an explanation.

const round2 = (n) => (Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const MATERIAL_SCORE_MOVE = 3;   // points
const MATERIAL_PRICE_MOVE = 5;   // percent

function delta(before, after) {
  if (!isNum(before) || !isNum(after)) return null;
  return round2(after - before);
}

function pctDelta(before, after) {
  if (!isNum(before) || !isNum(after) || before === 0) return null;
  return round2(((after - before) / Math.abs(before)) * 100);
}

/**
 * Attribute an overall score move to the pillar that moved most.
 * This is the "Why?" half of the requirement.
 */
function attribute(before, after) {
  const pillars = ['businessQuality', 'growthMultibagger', 'valuationOpportunity', 'riskQuality'];
  const moves = pillars
    .map((k) => ({ pillar: k, move: delta(before.pillars?.[k]?.score, after.pillars?.[k]?.score) }))
    .filter((m) => m.move !== null && Math.abs(m.move) >= 0.01)
    .sort((a, b) => Math.abs(b.move) - Math.abs(a.move));

  const coverageMove = delta(before.overall?.coverage, after.overall?.coverage);
  const reasons = [];

  if (moves.length) {
    const top = moves[0];
    reasons.push(`${top.pillar} moved ${top.move > 0 ? 'up' : 'down'} by ${Math.abs(top.move).toFixed(2)} points.`);
    if (moves.length > 1 && Math.abs(moves[1].move) >= Math.abs(top.move) / 2) {
      reasons.push(`${moves[1].pillar} also moved by ${moves[1].move.toFixed(2)} points.`);
    }
  }
  if (coverageMove !== null && Math.abs(coverageMove) >= 0.05) {
    reasons.push(`Data coverage ${coverageMove > 0 ? 'improved' : 'fell'} by ${Math.abs(coverageMove * 100).toFixed(0)} percentage points, so the score is built on a ${coverageMove > 0 ? 'wider' : 'narrower'} base.`);
  }
  if (!reasons.length) {
    reasons.push('The cause is not identifiable from the two payloads. The component ratings that moved were not supplied in both runs.');
  }
  return reasons;
}

function compareCompany(before, after) {
  const scoreMove = delta(before.overall?.score, after.overall?.score);
  const priceMove = pctDelta(before.valuation?.currentPrice, after.valuation?.currentPrice);
  const rankMove = isNum(before.rank) && isNum(after.rank) ? before.rank - after.rank : null;

  const beforeSevere = (before.redFlags || []).filter((f) => f.severity === 'severe').map((f) => f.category);
  const afterSevere = (after.redFlags || []).filter((f) => f.severity === 'severe').map((f) => f.category);
  const newFlags = afterSevere.filter((c) => !beforeSevere.includes(c));
  const clearedFlags = beforeSevere.filter((c) => !afterSevere.includes(c));

  const changes = [];
  if (scoreMove !== null && Math.abs(scoreMove) >= MATERIAL_SCORE_MOVE) {
    changes.push(`Overall score ${scoreMove > 0 ? 'rose' : 'fell'} ${Math.abs(scoreMove).toFixed(1)} points to ${after.overall.score.toFixed(1)}.`);
  }
  if (rankMove !== null && rankMove !== 0) {
    changes.push(`Rank moved from ${before.rank} to ${after.rank}.`);
  }
  if (priceMove !== null && Math.abs(priceMove) >= MATERIAL_PRICE_MOVE) {
    changes.push(`Price ${priceMove > 0 ? 'rose' : 'fell'} ${Math.abs(priceMove).toFixed(1)}%.`);
  }
  for (const c of newFlags) changes.push(`New severe ${c} flag.`);
  for (const c of clearedFlags) changes.push(`Severe ${c} flag no longer reported.`);
  if (before.eligibleForTop3 && !after.eligibleForTop3) changes.push('No longer eligible for the Top 3.');
  if (!before.eligibleForTop3 && after.eligibleForTop3) changes.push('Now eligible for the Top 3.');

  const mosMove = delta(before.valuation?.marginOfSafety?.value, after.valuation?.marginOfSafety?.value);
  if (mosMove !== null && Math.abs(mosMove) >= MATERIAL_SCORE_MOVE) {
    changes.push(`Margin of safety ${mosMove > 0 ? 'widened' : 'narrowed'} by ${Math.abs(mosMove).toFixed(1)} points.`);
  }

  return {
    symbol: after.symbol,
    name: after.name,
    scoreMove,
    priceMove,
    rankMove,
    newSevereFlags: newFlags,
    clearedSevereFlags: clearedFlags,
    changes,
    why: changes.length ? attribute(before, after) : [],
    material: changes.length > 0,
  };
}

/**
 * Compare two reports for the same segment.
 * Returns entered, exited and changed companies, plus a plain summary.
 */
export function compareReports(previous, current) {
  if (!previous || !current) {
    return { available: false, reason: 'Two reports are required to compare.' };
  }
  if (previous.run.segment !== current.run.segment) {
    return { available: false, reason: 'The two reports cover different segments and are not comparable.' };
  }

  const before = new Map(previous.full.map((c) => [c.symbol, c]));
  const after = new Map(current.full.map((c) => [c.symbol, c]));

  const entered = [...after.keys()].filter((s) => !before.has(s))
    .map((s) => ({ symbol: s, name: after.get(s).name, rank: after.get(s).rank }));
  const exited = [...before.keys()].filter((s) => !after.has(s))
    .map((s) => ({ symbol: s, name: before.get(s).name, reason: 'Not present in the new payload. It may have been screened out, or simply not covered.' }));

  const compared = [...after.keys()].filter((s) => before.has(s))
    .map((s) => compareCompany(before.get(s), after.get(s)))
    .filter((c) => c.material)
    .sort((a, b) => Math.abs(b.scoreMove ?? 0) - Math.abs(a.scoreMove ?? 0));

  const beforeTop3 = previous.top3.map((c) => c.symbol);
  const afterTop3 = current.top3.map((c) => c.symbol);
  const top3Changed = beforeTop3.join('|') !== afterTop3.join('|');

  const methodologyChanged = previous.run.methodologyVersion !== current.run.methodologyVersion;

  const summary = [];
  if (methodologyChanged) {
    summary.push(`The scoring methodology changed from ${previous.run.methodologyVersion} to ${current.run.methodologyVersion}. Some of the movement below is the method, not the companies.`);
  }
  if (top3Changed) {
    summary.push(`The Top 3 changed from ${beforeTop3.join(', ') || 'none'} to ${afterTop3.join(', ') || 'none'}.`);
  } else {
    summary.push('The Top 3 is unchanged.');
  }
  if (entered.length) summary.push(`${entered.length} company${entered.length > 1 ? 'ies' : ''} newly covered.`);
  if (exited.length) summary.push(`${exited.length} no longer covered.`);
  if (!compared.length) summary.push('No company moved materially.');

  return {
    available: true,
    from: previous.run.payloadGeneratedAt,
    to: current.run.payloadGeneratedAt,
    segment: current.run.segment,
    methodologyChanged,
    top3Changed,
    previousTop3: beforeTop3,
    currentTop3: afterTop3,
    entered,
    exited,
    changed: compared,
    summary,
    thresholds: {
      score: `${MATERIAL_SCORE_MOVE} points`,
      price: `${MATERIAL_PRICE_MOVE}%`,
    },
  };
}
