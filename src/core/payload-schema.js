// payload-schema.js — the contract between the generated prompt and the app.
//
// Version 2. The payload carries evidence and drivers. It carries no scores,
// no computed ratios and no intrinsic values: the app derives all of those, so
// the methodology lives in the engine and cannot be rewritten by whatever
// produced the JSON. A score present in a payload is ignored.

import { PILLARS, OVERALL_WEIGHTS } from './scoring.js';
import { EVIDENCE } from './integrity.js';
import { FLAG_CATEGORIES, SEVERITIES, normaliseSeverity } from './ranking.js';
import { readRating } from './rubrics.js';
import { REGISTERS, OUTCOMES, SUBJECTS } from './litigation.js';
import { DISCLOSURE_CHECKS } from './forensic.js';
import { repairPayload } from './repair.js';

export const PAYLOAD_SCHEMA_VERSION = '3.0.0';

export const DIRECT_DIMENSIONS = Object.freeze([
  'financialQuality', 'managementGovernance', 'technicalEntry', 'catalysts',
]);

const REGISTER_IDS = REGISTERS.map((r) => r.id);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isArr = Array.isArray;

/* Absent and "explicitly not established" are the same thing to the validator.
   The prompt asks for null where a figure could not be found, so rejecting null
   would punish the honest payload and reward the one that dropped the key. */
const given = (v) => v !== undefined && v !== null;

/* True when a block has no actual figure anywhere inside it, however many
   nested objects it carries. A consensus block of { eps: { y1: null } } is an
   honest way of saying no consensus exists, and it must not read as populated
   merely because the shape is there. */
function hasAnyValue(v, depth = 0) {
  if (!given(v) || depth > 4) return false;
  if (Array.isArray(v)) return v.some((x) => hasAnyValue(x, depth + 1));
  if (typeof v === 'object') return Object.values(v).some((x) => hasAnyValue(x, depth + 1));
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  return typeof v === 'boolean';
}

export function validatePayload(payload, { repair = true } = {}) {
  const errors = [];
  const warnings = [];
  /* Repaired first, judged second. A shape a person could not reasonably be
     asked to get right is fixed and reported; only what cannot be read is
     rejected. */
  let repairs = [];
  if (repair && payload && typeof payload === 'object') {
    repairs = repairPayload(payload).notes;
  }
  const e = (m) => errors.push(m);
  const w = (m) => warnings.push(m);

  if (!isObj(payload)) {
    return { valid: false, errors: ['The file is not a JSON object.'], warnings: [], companies: 0 };
  }

  // ---------------------------------------------------------------- run
  const run = payload.run;
  if (!isObj(run)) e('Missing "run" section.');
  else {
    if (!isStr(run.segment)) e('run.segment is required.');
    if (!isStr(run.generatedAt)) e('run.generatedAt is required (ISO date).');
    else if (Number.isNaN(Date.parse(run.generatedAt))) e('run.generatedAt is not a readable date.');
    if (!isStr(run.schemaVersion)) e('run.schemaVersion is required.');
    else if (run.schemaVersion !== PAYLOAD_SCHEMA_VERSION) {
      const major = String(run.schemaVersion).split('.')[0];
      if (major !== '3') e(`Payload schema ${run.schemaVersion} predates the current contract ${PAYLOAD_SCHEMA_VERSION}. Regenerate the prompt and run it again.`);
      else w(`Payload schema ${run.schemaVersion} differs from the app's ${PAYLOAD_SCHEMA_VERSION}.`);
    }
    if (!isStr(run.horizon)) w('run.horizon not stated; defaulting to 3-5 years.');
    if (!isNum(run.searchesRun)) w('run.searchesRun not stated, so the depth of the search cannot be reported.');
    else if (run.searchesRun < 25) w(`Only ${run.searchesRun} searches recorded. Fewer than 25 is thin for a Top 3 candidate.`);
  }

  validateRunResearch(payload, e, w);
  const u = payload.universe;
  if (!isObj(u)) w('No universe summary supplied.');
  else {
    if (!isNum(u.identified)) w('universe.identified missing; the screening funnel will be incomplete.');
    if (!isArr(u.exclusions)) w('universe.exclusions missing; screened-out companies will not be explained.');
  }

  // ---------------------------------------------------------- companies
  const companies = payload.companies;

  /* A reply split across messages sends the segment work first and the
     companies after. That first block is not broken, it is incomplete, and
     saying "must be a non-empty array" sends the reader looking for a fault
     that is not there. It is accepted and reported as partial, so the rest can
     be merged into it. */
  if (isObj(run) && (!isArr(companies) || companies.length === 0)) {
    w('No companies yet. This looks like the first part of a split reply: paste the '
      + 'next block with Add To This Analysis and the companies will merge into this run.');
    repairs.forEach((r) => warnings.unshift(`Read as written: ${r}.`));
    return { valid: errors.length === 0, errors, warnings, companies: 0, partial: true, repairs };
  }
  if (!isArr(companies) || companies.length === 0) {
    e('payload.companies must be a non-empty array.');
    return { valid: false, errors, warnings, companies: 0 };
  }

  const seen = new Set();
  companies.forEach((c, i) => {
    const at = `companies[${i}]${isStr(c?.symbol) ? ` (${c.symbol})` : ''}`;
    if (!isObj(c)) { e(`${at} is not an object.`); return; }

    if (!isStr(c.symbol)) e(`${at}: symbol is required.`);
    else if (seen.has(c.symbol)) e(`${at}: duplicate symbol.`);
    else seen.add(c.symbol);
    if (!isStr(c.name)) e(`${at}: name is required.`);
    if (!isStr(c.exchange)) w(`${at}: exchange not stated.`);
    if (!isStr(c.sector)) w(`${at}: sector not stated; sector-aware metrics cannot be selected.`);

    // --- ratings, which must carry evidence to count
    let accepted = 0;
    let rejected = 0;
    for (const [pillarKey, pillar] of Object.entries(PILLARS)) {
      const supplied = c[pillarKey];
      if (!isObj(supplied)) { w(`${at}: no ${pillar.label} ratings; that pillar will be unscored.`); continue; }
      for (const key of Object.keys(pillar.weights)) {
        if (!given(supplied[key])) continue;
        const read = readRating(supplied[key]);
        if (read.score === null) { rejected++; w(`${at}: ${pillarKey}.${key} does not count. ${read.reason}`); }
        else accepted++;
      }
      const unknown = Object.keys(supplied).filter((k) => !(k in pillar.weights));
      if (unknown.length) w(`${at}: unrecognised ${pillarKey} keys ignored: ${unknown.join(', ')}.`);
    }

    const dims = c.dimensions;
    if (!isObj(dims)) w(`${at}: no dimensions block; four overall dimensions will be unscored.`);
    else {
      for (const k of DIRECT_DIMENSIONS) {
        if (!given(dims[k])) { w(`${at}: dimensions.${k} not supplied.`); continue; }
        const read = readRating(dims[k]);
        if (read.score === null) { rejected++; w(`${at}: dimensions.${k} does not count. ${read.reason}`); }
        else accepted++;
      }
      const unknown = Object.keys(dims).filter((k) => !(k in OVERALL_WEIGHTS));
      if (unknown.length) w(`${at}: unrecognised dimension keys ignored: ${unknown.join(', ')}.`);
    }
    if (accepted === 0) w(`${at}: no rating survived the evidence gate, so the company cannot be scored.`);
    else if (rejected > accepted) w(`${at}: more ratings were rejected for missing evidence (${rejected}) than accepted (${accepted}).`);

    // --- red flags stated directly
    if (given(c.redFlags)) {
      if (!isArr(c.redFlags)) e(`${at}: redFlags must be an array.`);
      else c.redFlags.forEach((fl, j) => {
        if (!isObj(fl)) { e(`${at}.redFlags[${j}] is not an object.`); return; }
        if (!FLAG_CATEGORIES.includes(fl.category)) e(`${at}.redFlags[${j}]: category "${fl.category}" is not one of ${FLAG_CATEGORIES.join(', ')}.`);
        const flSev = normaliseSeverity(fl.severity);
        if (!flSev) e(`${at}.redFlags[${j}]: severity "${fl.severity}" is not readable as low, moderate or severe.`);
        else if (flSev !== fl.severity) { fl.severity = flSev; w(`${at}.redFlags[${j}]: severity read as "${flSev}".`); }
        if (!isStr(fl.detail)) e(`${at}.redFlags[${j}]: detail is required.`);
      });
    }

    // --- forensic inputs
    const fx = c.forensic;
    if (!isObj(fx)) {
      w(`${at}: no forensic block; accounting quality cannot be assessed and the company cannot enter the Top 3.`);
    } else {
      for (const k of ['current', 'prior']) {
        if (given(fx[k]) && !isObj(fx[k])) e(`${at}: forensic.${k} must be an object of line items.`);
      }
      if (!given(fx.decade)) {
        w(`${at}: no ten-year series, so the cash-against-profit test cannot run. It is the best single test available.`);
      } else if (!isArr(fx.decade)) {
        e(`${at}: forensic.decade must be an array of years.`);
      } else if (fx.decade.length < 5) {
        w(`${at}: forensic.decade has ${fx.decade.length} years; five is the minimum and ten is what proves anything.`);
      }
      if (given(fx.disclosures)) {
        if (!isObj(fx.disclosures)) e(`${at}: forensic.disclosures must be an object.`);
        else for (const k of Object.keys(fx.disclosures)) {
          if (!(k in DISCLOSURE_CHECKS)) { e(`${at}: forensic.disclosures."${k}" is not a known check.`); continue; }
          /* null means the check was not performed. That is a different fact
             from "performed and came back clean", and the report says which.
             Only a wrong type is an error. */
          if (fx.disclosures[k] === null) { w(`${at}: forensic.disclosures.${k} was not checked, so it is reported as unknown rather than clean.`); continue; }
          if (typeof fx.disclosures[k] !== 'boolean') e(`${at}: forensic.disclosures.${k} must be true, false or null.`);
        }
      }
    }

    // --- litigation registers
    const lit = c.litigation;
    if (!isObj(lit) || !isArr(lit.searched)) {
      w(`${at}: no litigation search recorded. An empty list is not evidence that nothing exists, and the company cannot enter the Top 3.`);
    } else {
      lit.searched.forEach((sr, j) => {
        const where = `${at}.litigation.searched[${j}]`;
        if (!isObj(sr)) { e(`${where} is not an object.`); return; }
        if (!REGISTER_IDS.includes(sr.register)) e(`${where}: "${sr.register}" is not a known register.`);
        if (!OUTCOMES.includes(sr.outcome)) e(`${where}: outcome must be one of ${OUTCOMES.join(', ')}.`);
        if (given(sr.subject) && !SUBJECTS.includes(sr.subject)) e(`${where}: subject must be one of ${SUBJECTS.join(', ')}.`);
        if (sr.outcome === 'matters found' && (!isArr(sr.matters) || sr.matters.length === 0)) {
          e(`${where}: outcome is "matters found" but no matters are listed.`);
        }
        (sr.matters || []).forEach((m, k) => {
          if (!isObj(m)) { e(`${where}.matters[${k}] is not an object.`); return; }
          const mSev = normaliseSeverity(m.severity);
          if (!mSev) e(`${where}.matters[${k}]: severity "${m.severity}" is not readable as low, moderate or severe.`);
          else m.severity = mSev;
          if (!isStr(m.summary)) e(`${where}.matters[${k}]: summary is required.`);
        });
      });
    }

    // --- driver model
    const model = c.model;
    if (!isObj(model)) {
      w(`${at}: no driver model; the forecast and intrinsic value will be omitted.`);
    } else {
      if (!isNum(model.years)) e(`${at}: model.years is required.`);
      if (!isArr(model.segments) || model.segments.length === 0) {
        e(`${at}: model.segments must be a non-empty array.`);
      } else model.segments.forEach((sg, j) => {
        for (const k of ['baseVolume', 'volumeCagr', 'baseRealisation', 'realisationCagr']) {
          if (!isNum(sg?.[k])) e(`${at}: model.segments[${j}].${k} is required and must be a number.`);
        }
        if (sg?.grossMargin === undefined) e(`${at}: model.segments[${j}].grossMargin is required.`);
        if (!isStr(sg?.evidence)) w(`${at}: model.segments[${j}] states drivers with no evidence behind them.`);
      });
      for (const k of ['opex', 'depreciation', 'capex', 'workingCapital', 'financing', 'shares']) {
        if (!isObj(model[k])) e(`${at}: model.${k} is required. A partial model is rejected; omit the whole block instead.`);
      }
      if (isObj(model.shares)) {
        if (!isNum(model.shares.basic)) e(`${at}: model.shares.basic is required.`);
        if (model.shares.esop === undefined && model.shares.warrants === undefined) {
          w(`${at}: no ESOP or warrant overhang stated. If there is genuinely none, state zero.`);
        }
      }
    }

    // --- valuation
    const v = c.valuation;
    if (!isObj(v)) w(`${at}: no valuation block.`);
    else {
      for (const k of ['bear', 'base', 'bull']) {
        if (!isObj(v[k])) { w(`${at}: valuation.${k} missing.`); continue; }
        if (!isNum(v[k].fairValue)) e(`${at}: valuation.${k}.fairValue must be a number.`);
        if (!isStr(v[k].assumptions)) w(`${at}: valuation.${k} has no stated assumptions.`);
      }
      if (isObj(v.bear) && isObj(v.bull) && isNum(v.bear.fairValue) && isNum(v.bull.fairValue)
          && v.bear.fairValue > v.bull.fairValue) e(`${at}: bear fair value exceeds bull fair value.`);
      if (given(v.currentPrice) && (!isNum(v.currentPrice) || v.currentPrice <= 0)) {
        e(`${at}: valuation.currentPrice must be a positive number.`);
      }
      if (given(v.currentPrice) && !isStr(v.priceAsOf)) w(`${at}: currentPrice has no as-of date; it will be labelled undated.`);
      const probs = ['bear', 'base', 'bull'].map((k) => v[k]?.probability).filter(isNum);
      if (probs.length === 3 && Math.abs(probs.reduce((x, y) => x + y, 0) - 1) > 1e-6) {
        e(`${at}: scenario probabilities must sum to 1.`);
      }
    }

    // --- consensus
    if (!given(c.consensus)) {
      w(`${at}: no consensus supplied. Variant perception will be measured against the price alone, through the reverse DCF.`);
    } else if (!isObj(c.consensus)) {
      e(`${at}: consensus must be an object.`);
    } else {
      /* estimateCount of 0 is itself a statement that no estimate exists, so
         it does not count as content. */
      const csProbe = { ...c.consensus };
      if (csProbe.estimateCount === 0) delete csProbe.estimateCount;
      const csEmpty = !hasAnyValue(csProbe);
      if (csEmpty) {
        w(`${at}: a consensus block was supplied with nothing in it, which is read as no consensus existing.`);
      } else if (!isStr(c.consensus.source)) {
        e(`${at}: consensus.source is required, so the figure can be checked.`);
      }
      if (!isStr(c.consensus.asOf)) w(`${at}: consensus has no as-of date.`);
      if (given(c.consensus.estimateCount) && !isNum(c.consensus.estimateCount)) {
        e(`${at}: consensus.estimateCount must be a number.`);
      } else if (isNum(c.consensus.estimateCount) && c.consensus.estimateCount < 3) {
        w(`${at}: consensus rests on ${c.consensus.estimateCount} estimates. That is one opinion, not a market view.`);
      }
    }

    // --- liquidity
    if (!given(c.liquidity)) {
      w(`${at}: no liquidity data. Position sizing cannot be assessed, and it binds hardest on the smallest companies.`);
    } else if (!isObj(c.liquidity)) {
      e(`${at}: liquidity must be an object.`);
    } else {
      if (!given(c.liquidity.avgDailyValue)) {
        w(`${at}: no average daily traded value, so position sizing cannot be assessed.`);
      } else if (!isNum(c.liquidity.avgDailyValue)) {
        e(`${at}: liquidity.avgDailyValue must be a number.`);
      }
      if (!isStr(c.liquidity.currency)) w(`${at}: liquidity has no currency stated.`);
      if (given(c.liquidity.freeFloatPct) && !isNum(c.liquidity.freeFloatPct)) {
        e(`${at}: liquidity.freeFloatPct must be a number.`);
      }
    }

    if (given(c.ownership) && !isObj(c.ownership)) e(`${at}: ownership must be an object.`);

    // --- price history
    if (given(c.priceHistory)) {
      const ph = c.priceHistory;
      if (!isObj(ph)) e(`${at}: priceHistory must be an object.`);
      else {
        if (!isArr(ph.closes)) e(`${at}: priceHistory.closes must be an array.`);
        else {
          if (ph.closes.some((x) => !isNum(x))) e(`${at}: priceHistory.closes contains non-numeric values.`);
          if (ph.closes.length < 200) w(`${at}: only ${ph.closes.length} closes supplied; longer-period indicators will be withheld.`);
        }
        for (const k of ['volumes', 'benchmarkCloses', 'highs', 'lows']) {
          if (ph[k] === undefined) continue;
          if (!isArr(ph[k])) { e(`${at}: priceHistory.${k} must be an array.`); continue; }
          if (ph[k].some((x) => !isNum(x))) e(`${at}: priceHistory.${k} contains non-numeric values.`);
          if (isArr(ph.closes) && ph[k].length !== ph.closes.length) {
            e(`${at}: priceHistory.${k} must be the same length as closes.`);
          }
        }
        if (!isStr(ph.asOf)) w(`${at}: priceHistory has no as-of date.`);
        if (ph.adjusted !== true) w(`${at}: priceHistory is not marked adjusted for corporate actions; readings may be wrong rather than merely stale.`);
      }
    }

    // --- financials
    if (given(c.financials)) {
      const fin = c.financials;
      if (!isObj(fin)) e(`${at}: financials must be an object.`);
      else {
        if (given(fin.annual) && !isArr(fin.annual)) e(`${at}: financials.annual must be an array.`);
        if (isArr(fin.annual)) {
          if (fin.annual.length < 5) w(`${at}: ${fin.annual.length} annual periods supplied; ten is what reveals a cycle.`);
          fin.annual.forEach((row, j) => {
            if (!isStr(row?.period)) e(`${at}: financials.annual[${j}] has no period.`);
            if (!isStr(row?.basis)) e(`${at}: financials.annual[${j}] has no basis; consolidated and standalone must not be mixed.`);
          });
          const bases = new Set(fin.annual.map((r) => r?.basis).filter(Boolean));
          if (bases.size > 1) e(`${at}: financials.annual mixes ${[...bases].join(' and ')}. One basis per series.`);
        }
        if (given(fin.quarterly) && !isArr(fin.quarterly)) e(`${at}: financials.quarterly must be an array.`);
      }
    }

    // --- narrative requirements
    if (!isObj(c.variantPerception)) w(`${at}: no variant perception; it is mandatory for the Top 3.`);
    if (!isArr(c.thesisBreakers) || c.thesisBreakers.length < 5) w(`${at}: fewer than five thesis breakers.`);
    if (!isArr(c.upgradeTriggers) || c.upgradeTriggers.length === 0) {
      w(`${at}: no upgrade triggers. Carrying only downside triggers biases the product.`);
    }
    if (!isObj(c.bearCase)) w(`${at}: no bear case stated and answered.`);
    if (!isArr(c.managementQuestions) || c.managementQuestions.length === 0) w(`${at}: no questions for management.`);
    if (!given(c.baseRates)) {
      w(`${at}: no base rates, so the growth assumption is anchored to optimism rather than to history.`);
    } else if (!isObj(c.baseRates)) e(`${at}: baseRates must be an object.`);

    if (isArr(c.risks)) {
      c.risks.forEach((rk, j) => {
        if (!isObj(rk)) { e(`${at}.risks[${j}] is not an object.`); return; }
        const rkSev = normaliseSeverity(rk.severity);
        if (!rkSev) e(`${at}.risks[${j}]: severity "${rk.severity}" is not readable as low, moderate or severe.`);
        else rk.severity = rkSev;
        if (rk.impactPct === undefined) w(`${at}.risks[${j}] has no quantified impact; an adjective is not a risk assessment.`);
      });
    }

    validateCompanyResearch(c, at, e, w);

    // --- sources
    if (!isArr(c.sources) || c.sources.length === 0) {
      w(`${at}: no sources listed; confidence will be graded Low.`);
    } else {
      c.sources.forEach((s, j) => {
        if (!isObj(s)) { e(`${at}.sources[${j}] is not an object.`); return; }
        if (!isStr(s.title)) e(`${at}.sources[${j}]: title is required.`);
        if (![1, 2, 3, 4].includes(s.tier)) e(`${at}.sources[${j}]: tier must be 1, 2, 3 or 4.`);
        if (given(s.evidence) && !(s.evidence in EVIDENCE)) {
          e(`${at}.sources[${j}]: evidence must be one of ${Object.keys(EVIDENCE).join(', ')}.`);
        }
      });
      if (c.sources.every((s) => s.tier === 4)) {
        e(`${at}: every source is Tier 4. Tier 4 cannot independently support material claims.`);
      }
      if (!c.sources.some((s) => s.tier === 1)) w(`${at}: no Tier 1 source. Nothing here rests on a filing.`);
    }
  });

  repairs.forEach((r) => warnings.unshift(`Read as written: ${r}.`));
  return { valid: errors.length === 0, errors, warnings, companies: companies.length, repairs };
}


/* ==================== version 3 research blocks =====================
   Everything below is research content rather than scoring input. None of it
   changes a score. It is what makes the difference between a scoring appendix
   and a research report, and it is all optional in the sense that an absent
   block costs a section and produces a stated gap — never a silent one. */

function validateRunResearch(payload, e, w) {
  const r = payload.run || {};

  const g = payload.global;
  if (!isObj(g)) w('No global context. The report will open on India with nothing to place it against.');
  else {
    if (!isNum(g.marketSize)) w('global.marketSize not stated.');
    if (!isStr(g.source)) w('global context has no source.');
    if (given(g.peers) && !isArr(g.peers)) e('global.peers must be an array.');
    (g.peers || []).forEach((x, i) => {
      if (!isObj(x)) { e(`global.peers[${i}] is not an object.`); return; }
      if (!isStr(x.name)) e(`global.peers[${i}]: name is required.`);
      if (!isStr(x.makes)) w(`global.peers[${i}]: no note on what the company makes, which is the point of the table.`);
    });
  }

  const m = payload.macro;
  if (!isObj(m)) w('No macro frame. Doc 01 makes Indian and global macroeconomics mandatory coverage.');
  else {
    for (const k of ['gdpGrowth', 'inflation', 'policyRate', 'currency', 'creditGrowth', 'capacityUtilisation']) {
      if (!given(m[k])) { w(`macro.${k} not supplied.`); continue; }
      if (!isObj(m[k])) { e(`macro.${k} must be an object with value, period and source.`); continue; }
      if (!given(m[k].value)) w(`macro.${k} carries no value; it will print as not established.`);
      else if (!isNum(m[k].value)) e(`macro.${k}.value must be a number.`);
      if (!isStr(m[k].period)) w(`macro.${k} has no period; an undated macro figure is not usable.`);
      if (!isStr(m[k].source)) e(`macro.${k}.source is required.`);
    }
  }

  const b = payload.budget;
  if (!isObj(b)) w('No Union Budget block. Doc 01 makes the Budget mandatory coverage.');
  else {
    if (!isArr(b.allocations)) e('budget.allocations must be an array.');
    (b.allocations || []).forEach((x, i) => {
      if (!isObj(x)) { e(`budget.allocations[${i}] is not an object.`); return; }
      if (!isStr(x.head)) e(`budget.allocations[${i}]: head is required.`);
      if (!given(x.announced)) w(`budget.allocations[${i}]: nothing stated for the announced amount.`);
      else if (!isNum(x.announced)) e(`budget.allocations[${i}]: announced must be a number.`);
      if (given(x.spent) && !isNum(x.spent)) e(`budget.allocations[${i}]: spent must be a number.`);
      if (x.spent === undefined) w(`budget.allocations[${i}]: nothing stated on what was actually spent. Announced against spent is the whole point.`);
      if (!isStr(x.year)) e(`budget.allocations[${i}]: year is required.`);
    });
    if (!isStr(b.economicSurvey)) w('No Economic Survey reading supplied.');
  }

  if (given(payload.policy)) {
    if (!isArr(payload.policy)) e('policy must be an array of schemes.');
    else payload.policy.forEach((s, i) => {
      if (!isObj(s)) { e(`policy[${i}] is not an object.`); return; }
      if (!isStr(s.name)) e(`policy[${i}]: name is required.`);
      for (const k of ['objective', 'funding', 'outcomes', 'challenges', 'reachesSegment']) {
        if (!isStr(s[k])) w(`policy[${i}] (${s.name || 'unnamed'}): ${k} not stated.`);
      }
      if (!isStr(s.ministry)) w(`policy[${i}]: no ministry named, so the scheme cannot be verified.`);
    });
  } else w('No policy schemes. A segment thesis that never mentions policy is not an Indian equity thesis.');

  if (given(payload.policyEvolution) && !isArr(payload.policyEvolution)) {
    e('policyEvolution must be an array of eras.');
  }

  if (given(payload.regulation) && !isObj(payload.regulation)) e('regulation must be an object.');
  else if (payload.regulation === undefined) w('No regulation block.');

  const geo = payload.geopolitics;
  if (!isObj(geo)) w('No geopolitics or supply chain block. Doc 01 makes it mandatory coverage.');
  else if (given(geo.tradeData) && !isArr(geo.tradeData)) e('geopolitics.tradeData must be an array.');

  const ind = payload.industry;
  if (!isObj(ind)) w('No industry block.');
  else {
    if (given(ind.demandDrivers)) {
      if (!isArr(ind.demandDrivers)) e('industry.demandDrivers must be an array.');
      else ind.demandDrivers.forEach((d, i) => {
        if (!isObj(d)) { e(`industry.demandDrivers[${i}] is not an object.`); return; }
        if (!isStr(d.driver)) e(`industry.demandDrivers[${i}]: driver is required.`);
        if (d.direction !== 'positive' && d.direction !== 'negative') {
          e(`industry.demandDrivers[${i}]: direction must be "positive" or "negative".`);
        }
      });
    }
    if (!isStr(ind.cyclePosition)) w('industry.cyclePosition not stated.');
  }

  if (given(payload.valueChain)) {
    if (!isArr(payload.valueChain)) e('valueChain must be an array of nodes.');
    else payload.valueChain.forEach((n, i) => {
      if (!isObj(n)) { e(`valueChain[${i}] is not an object.`); return; }
      if (!isStr(n.name)) e(`valueChain[${i}]: name is required.`);
      if (!isArr(n.beneficiaries)) w(`valueChain[${i}]: no listed beneficiaries named at this node.`);
    });
  } else w('No value chain. The second and third order beneficiaries doc 02 asks for have nowhere to go.');

  const tam = payload.tam;
  if (!isObj(tam)) w('No TAM, SAM or SOM.');
  else {
    for (const k of ['tam', 'sam', 'som']) {
      if (!given(tam[k])) { w(`tam.${k} not supplied.`); continue; }
      if (!isObj(tam[k])) { e(`tam.${k} must be an object.`); continue; }
      if (!given(tam[k].value)) w(`tam.${k} carries no figure; it will print as not verifiable.`);
      else if (!isNum(tam[k].value)) e(`tam.${k}.value must be a number.`);
      else if (!isStr(tam[k].basis)) w(`tam.${k} has no stated basis, so the number cannot be checked.`);
    }
  }

  if (given(payload.programs)) {
    if (!isArr(payload.programs)) e('programs must be an array.');
    else payload.programs.forEach((pr, i) => {
      if (!isObj(pr)) { e(`programs[${i}] is not an object.`); return; }
      if (!isStr(pr.name)) e(`programs[${i}]: name is required.`);
      if (!isArr(pr.beneficiaries)) {
        w(`programs[${i}]: no beneficiaries named. A programme that is not traced to a listed supplier is background, not research.`);
      } else pr.beneficiaries.forEach((bn, j) => {
        if (!isObj(bn)) { e(`programs[${i}].beneficiaries[${j}] is not an object.`); return; }
        if (!isStr(bn.symbol) && !isStr(bn.name)) e(`programs[${i}].beneficiaries[${j}]: a symbol or name is required.`);
        if (!isStr(bn.supplies)) w(`programs[${i}].beneficiaries[${j}]: what they supply is not stated.`);
      });
      if (!isStr(pr.timeline)) w(`programs[${i}]: no timeline.`);
    });
  } else w('No programmes or contracts. This is how a segment thesis becomes a company forecast.');

  const comp = payload.competition;
  if (!isObj(comp)) w('No competition block; market share has nowhere to go.');
  else if (given(comp.players)) {
    if (!isArr(comp.players)) e('competition.players must be an array.');
    else comp.players.forEach((pl, i) => {
      if (!isObj(pl)) { e(`competition.players[${i}] is not an object.`); return; }
      if (!isStr(pl.name)) e(`competition.players[${i}]: name is required.`);
      if (given(pl.share) && !isNum(pl.share)) e(`competition.players[${i}]: share must be a number.`);
      if (!isStr(pl.basis)) w(`competition.players[${i}]: share basis not stated. Volume and value share are different numbers.`);
    });
  }

  if (given(payload.sectorValuation) && !isObj(payload.sectorValuation)) {
    e('sectorValuation must be an object.');
  }
  if (given(payload.monitorables) && !isArr(payload.monitorables)) {
    e('monitorables must be an array.');
  } else if (payload.monitorables === undefined) {
    w('No key monitorables. There is no sector-level equivalent of a thesis breaker without them.');
  }
  if (given(payload.glossary) && !isArr(payload.glossary)) e('glossary must be an array.');

  if (r.mode === 'company' && !isStr(r.company)) e('run.mode is "company" but run.company is not stated.');
}

function validateCompanyResearch(c, at, e, w) {
  const snap = c.snapshot;
  if (!isObj(snap)) w(`${at}: no snapshot; the cover cannot carry market cap, free float or performance.`);
  else {
    for (const k of ['marketCap', 'freeFloatPct', 'avgDailyValue']) {
      if (given(snap[k]) && !isNum(snap[k])) e(`${at}: snapshot.${k} must be a number.`);
    }
    if (given(snap.performance) && !isObj(snap.performance)) {
      e(`${at}: snapshot.performance must be an object of 3m, 6m and 12m readings.`);
    }
  }

  if (given(c.shareholding)) {
    if (!isArr(c.shareholding)) e(`${at}: shareholding must be an array of quarters.`);
    else c.shareholding.forEach((q, i) => {
      if (!isObj(q)) { e(`${at}.shareholding[${i}] is not an object.`); return; }
      if (!isStr(q.period)) e(`${at}.shareholding[${i}]: period is required.`);
      if (q.pledged === undefined) w(`${at}.shareholding[${i}]: pledged share not stated.`);
    });
  }

  if (given(c.theses)) {
    if (!isArr(c.theses)) e(`${at}: theses must be an array.`);
    else {
      if (c.theses.length < 3) w(`${at}: ${c.theses.length} numbered theses. Three is the reference standard.`);
      c.theses.forEach((t, i) => {
        if (!isObj(t)) { e(`${at}.theses[${i}] is not an object.`); return; }
        if (!isStr(t.claim)) e(`${at}.theses[${i}]: claim is required.`);
        if (!isStr(t.mechanism)) w(`${at}.theses[${i}]: no mechanism. A claim without one is an opinion.`);
        if (!isStr(t.evidence)) w(`${at}.theses[${i}]: no evidence.`);
      });
    }
  } else w(`${at}: no numbered theses. The report will have scores but no argument.`);

  if (given(c.moat) && !isObj(c.moat)) e(`${at}: moat must be an object.`);
  else if (c.moat === undefined) w(`${at}: moat is rated but never argued.`);

  if (given(c.management)) {
    if (!isObj(c.management)) e(`${at}: management must be an object.`);
    else {
      if (given(c.management.people) && !isArr(c.management.people)) {
        e(`${at}: management.people must be an array.`);
      }
      if (given(c.management.guidanceRecord)) {
        if (!isArr(c.management.guidanceRecord)) e(`${at}: management.guidanceRecord must be an array.`);
        else c.management.guidanceRecord.forEach((g, i) => {
          if (!isObj(g)) { e(`${at}.management.guidanceRecord[${i}] is not an object.`); return; }
          if (!isStr(g.promised) || !isStr(g.delivered)) {
            e(`${at}.management.guidanceRecord[${i}]: both promised and delivered are required.`);
          }
        });
      } else w(`${at}: no record of guidance against delivery, which is how management is actually judged.`);
    }
  } else w(`${at}: no management block.`);

  if (given(c.capitalAllocation) && !isObj(c.capitalAllocation)) {
    e(`${at}: capitalAllocation must be an object.`);
  }

  if (given(c.mispricing)) {
    if (!isArr(c.mispricing)) e(`${at}: mispricing must be an array of concerns.`);
    else c.mispricing.forEach((m, i) => {
      if (!isObj(m)) { e(`${at}.mispricing[${i}] is not an object.`); return; }
      if (!isStr(m.concern)) e(`${at}.mispricing[${i}]: the concern is required, in the bear's own words.`);
      if (!isStr(m.answer)) e(`${at}.mispricing[${i}]: an answer is required. Stating the bear case and leaving it is not research.`);
    });
  } else w(`${at}: no numbered mispricing concerns.`);

  if (given(c.peers)) {
    if (!isArr(c.peers)) e(`${at}: peers must be an array.`);
    else c.peers.forEach((pr, i) => {
      if (!isObj(pr)) { e(`${at}.peers[${i}] is not an object.`); return; }
      if (!isStr(pr.name)) e(`${at}.peers[${i}]: name is required.`);
    });
  } else w(`${at}: no peer comparison.`);

  if (given(c.esg) && !isObj(c.esg)) e(`${at}: esg must be an object.`);
  if (given(c.timeline) && !isArr(c.timeline)) e(`${at}: timeline must be an array.`);
}

export function parsePayload(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { valid: false, payload: null, companies: 0, warnings: [], errors: [`The text is not valid JSON. ${err.message}`] };
  }
  return { payload: parsed, ...validatePayload(parsed) };
}
