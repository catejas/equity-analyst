// repair.js — make a payload readable before judging it.
//
// The validator can raise over a hundred distinct rejections. Most of them are
// shape problems a person cannot reasonably be asked to avoid by care alone: a
// single object where a list was expected, a number sent as a string, three
// probabilities that sum to 0.99. None of those change what the research says.
//
// So the payload is repaired first and validated second, and every repair is
// reported. A repair that would change meaning — a bear case above a bull case,
// a severity nobody can read — is never attempted; those stay rejections.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isArr = Array.isArray;
const given = (v) => v !== undefined && v !== null;

/** A number written as a string, which every chat model does eventually. */
function asNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/,/g, '').replace(/^₹|^Rs\.?\s*/i, '').replace(/%$/, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function asBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  if (['true', 'yes', 'y'].includes(t)) return true;
  if (['false', 'no', 'n', 'none'].includes(t)) return false;
  if (['unknown', 'not checked', 'n/a', 'na'].includes(t)) return null;
  return null;
}

export function repairPayload(payload) {
  const notes = [];
  const say = (m) => { if (!notes.includes(m)) notes.push(m); };
  if (!isObj(payload)) return { payload, notes };

  /* A list that arrived as one item. Models do this constantly when a section
     happens to have a single entry. */
  const wrap = (host, key, label) => {
    if (!given(host) || !isObj(host)) return;
    if (isObj(host[key])) { host[key] = [host[key]]; say(`${label} arrived as one item and was read as a list of one`); }
  };
  /* The opposite: a list where one object was expected. */
  const unwrap = (host, key, label) => {
    if (!given(host) || !isObj(host)) return;
    if (isArr(host[key]) && host[key].length === 1 && isObj(host[key][0])) {
      host[key] = host[key][0]; say(`${label} arrived as a list of one and was read as a single block`);
    }
  };

  // ---------------------------------------------------------- run level
  for (const k of ['policy', 'policyEvolution', 'valueChain', 'programs', 'monitorables', 'glossary']) {
    wrap(payload, k, k);
  }
  for (const k of ['global', 'macro', 'budget', 'regulation', 'geopolitics', 'industry',
    'tam', 'competition', 'sectorValuation', 'universe']) {
    unwrap(payload, k, k);
  }
  if (isObj(payload.global)) wrap(payload.global, 'peers', 'global.peers');
  if (isObj(payload.budget)) wrap(payload.budget, 'allocations', 'budget.allocations');
  if (isObj(payload.industry)) wrap(payload.industry, 'demandDrivers', 'industry.demandDrivers');
  if (isObj(payload.competition)) wrap(payload.competition, 'players', 'competition.players');
  if (isObj(payload.geopolitics)) wrap(payload.geopolitics, 'tradeData', 'geopolitics.tradeData');
  if (isObj(payload.universe)) wrap(payload.universe, 'exclusions', 'universe.exclusions');

  /* A macro reading sent as a bare number rather than a value-period-source
     object. The number is kept and the missing provenance is reported by the
     validator, which is the right division of labour. */
  if (isObj(payload.macro)) {
    for (const k of Object.keys(payload.macro)) {
      const n = asNumber(payload.macro[k]);
      if (n !== null && !isObj(payload.macro[k])) {
        payload.macro[k] = { value: n, period: null, source: null };
        say(`macro.${k} arrived as a bare number and was read as a value with no period or source`);
      } else if (isObj(payload.macro[k])) {
        const v = asNumber(payload.macro[k].value);
        if (v !== null && typeof payload.macro[k].value === 'string') {
          payload.macro[k].value = v; say('numbers written as text were read as numbers');
        }
      }
    }
  }

  if (isObj(payload.budget)) {
    (payload.budget.allocations || []).forEach((a) => {
      if (!isObj(a)) return;
      for (const k of ['announced', 'spent']) {
        const n = asNumber(a[k]);
        if (n !== null && typeof a[k] === 'string') { a[k] = n; say('numbers written as text were read as numbers'); }
      }
    });
  }

  if (isObj(payload.tam)) {
    for (const k of ['tam', 'sam', 'som']) {
      const n = asNumber(payload.tam[k]);
      if (n !== null && !isObj(payload.tam[k])) {
        payload.tam[k] = { value: n, unit: null, basis: null, year: null, source: null };
        say(`tam.${k} arrived as a bare number and was read as a size with no stated basis`);
      }
    }
  }

  if (isObj(payload.competition)) {
    (payload.competition.players || []).forEach((p) => {
      if (!isObj(p)) return;
      const n = asNumber(p.share);
      if (n !== null && typeof p.share === 'string') { p.share = n; say('market shares written as text were read as numbers'); }
    });
  }

  if (isObj(payload.run)) {
    const n = asNumber(payload.run.searchesRun);
    if (n !== null && typeof payload.run.searchesRun === 'string') payload.run.searchesRun = n;
  }

  // ------------------------------------------------------ company level
  if (isObj(payload.companies)) {
    payload.companies = [payload.companies];
    say('a single company arrived on its own and was read as a list of one');
  }
  if (!isArr(payload.companies)) return { payload, notes };

  payload.companies.forEach((c) => {
    if (!isObj(c)) return;

    for (const k of ['redFlags', 'catalysts', 'risks', 'thesisBreakers', 'upgradeTriggers',
      'managementQuestions', 'sources', 'conflicts', 'theses', 'mispricing', 'peers',
      'timeline', 'shareholding', 'thesis']) {
      if (isObj(c[k])) { c[k] = [c[k]]; say(`${k} arrived as one item and was read as a list of one`); }
      if (typeof c[k] === 'string' && ['thesisBreakers', 'upgradeTriggers', 'managementQuestions', 'thesis'].includes(k)) {
        c[k] = [c[k]]; say(`${k} arrived as a single line and was read as a list of one`);
      }
    }
    for (const k of ['forensic', 'litigation', 'model', 'valuation', 'consensus', 'liquidity',
      'ownership', 'snapshot', 'moat', 'management', 'capitalAllocation', 'esg', 'baseRates',
      'variantPerception', 'bearCase', 'multibagger', 'technicals', 'priceHistory', 'financials']) {
      unwrap(c, k, k);
    }

    if (isObj(c.litigation)) wrap(c.litigation, 'searched', 'litigation.searched');
    if (isObj(c.litigation) && isArr(c.litigation.searched)) {
      c.litigation.searched.forEach((s) => { if (isObj(s)) wrap(s, 'matters', 'litigation matters'); });
    }
    if (isObj(c.forensic)) {
      wrap(c.forensic, 'decade', 'forensic.decade');
      if (isObj(c.forensic.disclosures)) {
        for (const k of Object.keys(c.forensic.disclosures)) {
          const b = asBool(c.forensic.disclosures[k]);
          if (typeof c.forensic.disclosures[k] === 'string') {
            c.forensic.disclosures[k] = b;
            say('disclosure findings written as yes or no were read as true or false');
          }
        }
      }
    }
    if (isObj(c.model)) wrap(c.model, 'segments', 'model.segments');
    if (isObj(c.management)) {
      wrap(c.management, 'people', 'management.people');
      wrap(c.management, 'guidanceRecord', 'management.guidanceRecord');
    }
    if (isObj(c.capitalAllocation)) wrap(c.capitalAllocation, 'tenYear', 'capitalAllocation.tenYear');
    if (isObj(c.financials)) {
      wrap(c.financials, 'annual', 'financials.annual');
      wrap(c.financials, 'quarterly', 'financials.quarterly');
      /* One basis per series. Where a row is silent the series basis is used,
         which is what the writer meant and is safer than rejecting. */
      if (isArr(c.financials.annual)) {
        const bases = c.financials.annual.map((r) => isObj(r) && r.basis).filter(Boolean);
        if (bases.length) {
          const dominant = bases.sort((a, b) =>
            bases.filter((x) => x === b).length - bases.filter((x) => x === a).length)[0];
          c.financials.annual.forEach((r) => {
            if (isObj(r) && !r.basis) { r.basis = dominant; say(`a financial row without a basis was read as ${dominant}`); }
          });
        }
      }
    }

    /* Source tiers written as "Tier 1" or "1". */
    (c.sources || []).forEach((s) => {
      if (!isObj(s)) return;
      if (typeof s.tier === 'string') {
        const m = /([1-4])/.exec(s.tier);
        if (m) { s.tier = Number(m[1]); say('source tiers written as text were read as numbers'); }
      }
    });

    /* Scenario probabilities that do not quite sum to one. Rejecting a payload
       because three numbers a researcher wrote come to 0.99 is not rigour. */
    const v = c.valuation;
    if (isObj(v)) {
      const keys = ['bear', 'base', 'bull'];
      keys.forEach((k) => {
        if (isObj(v[k])) {
          const fv = asNumber(v[k].fairValue);
          if (fv !== null && typeof v[k].fairValue === 'string') { v[k].fairValue = fv; say('fair values written as text were read as numbers'); }
          const pr = asNumber(v[k].probability);
          if (pr !== null && typeof v[k].probability === 'string') v[k].probability = pr;
          /* A probability given as a percentage. */
          if (typeof v[k].probability === 'number' && v[k].probability > 1 && v[k].probability <= 100) {
            v[k].probability = v[k].probability / 100;
            say('scenario probabilities given as percentages were read as fractions');
          }
        }
      });
      const ps = keys.map((k) => isObj(v[k]) ? v[k].probability : null).filter((x) => typeof x === 'number');
      if (ps.length === 3) {
        const sum = ps.reduce((a, b) => a + b, 0);
        if (sum > 0 && Math.abs(sum - 1) > 1e-6 && Math.abs(sum - 1) < 0.12) {
          keys.forEach((k) => { if (isObj(v[k])) v[k].probability = v[k].probability / sum; });
          say(`scenario probabilities summed to ${sum.toFixed(2)} and were scaled to 1`);
        }
      }
      const cp = asNumber(v.currentPrice);
      if (cp !== null && typeof v.currentPrice === 'string') { v.currentPrice = cp; say('the price written as text was read as a number'); }
    }

    /* Price history sent as strings, or with one series a different length. A
       mismatched series is dropped rather than rejecting the whole payload:
       losing one chart is a smaller loss than losing the run. */
    const ph = c.priceHistory;
    if (isObj(ph) && isArr(ph.closes)) {
      const num = (arr2) => arr2.map((x) => asNumber(x)).filter((x) => x !== null);
      if (ph.closes.some((x) => typeof x === 'string')) {
        const fixed = num(ph.closes);
        if (fixed.length === ph.closes.length) { ph.closes = fixed; say('prices written as text were read as numbers'); }
      }
      for (const k of ['volumes', 'benchmarkCloses', 'highs', 'lows']) {
        if (!isArr(ph[k])) continue;
        if (ph[k].some((x) => typeof x === 'string')) {
          const fixed = num(ph[k]);
          if (fixed.length === ph[k].length) ph[k] = fixed;
        }
        if (ph[k].length !== ph.closes.length) {
          delete ph[k];
          say(`priceHistory.${k} was a different length from closes and was set aside`);
        }
      }
    }

    /* A guidance entry missing one half is dropped rather than rejected: the
       record is only meaningful as a pair. */
    if (isObj(c.management) && isArr(c.management.guidanceRecord)) {
      const before = c.management.guidanceRecord.length;
      c.management.guidanceRecord = c.management.guidanceRecord.filter(
        (g) => isObj(g) && typeof g.promised === 'string' && typeof g.delivered === 'string');
      if (c.management.guidanceRecord.length !== before) {
        say('guidance entries missing either the promise or the delivery were set aside');
      }
    }

    /* A mispricing concern with no answer is dropped, and the drop is reported.
       An unanswered concern is not research, but it is also not a reason to
       lose the other two hundred fields. */
    if (isArr(c.mispricing)) {
      const before = c.mispricing.length;
      c.mispricing = c.mispricing.filter((m) => isObj(m) && typeof m.answer === 'string' && m.answer.trim());
      if (c.mispricing.length !== before) {
        say('mispricing concerns stated without an answer were set aside; state the answer and paste again');
      }
    }
  });

  return { payload, notes };
}
