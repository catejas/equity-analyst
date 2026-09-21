/* The reconciliation flag, which for the whole life of the application meant
   something other than what it said.
 *
 * `reconciled` was `failed.length === 0` over a list of checks that compare
 * the model to itself: sector revenues summed and compared to their own sum,
 * a closing net block defined as opening plus capex less depreciation and then
 * checked against opening plus capex less depreciation. Tautologies. The flag
 * was therefore true on every model that did not crash — including Reliance's,
 * whose base year is 95,601 against 1,071,174 reported — and the report
 * printed "the base year reconciles to reported revenue" underneath it, then a
 * target price computed from it.
 *
 * These assertions fix the meaning: reconciled is the tie to reported revenue
 * and nothing else, it is null when there is nothing to tie to, and a model
 * that fails it does not produce an intrinsic value. */
import fs from 'node:fs';
import { buildModel } from '../src/core/model.js';
import { buildReport } from '../src/core/report.js';
import { evaluate } from '../src/core/scenario.js';
import { dcf } from '../src/core/valuation.js';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const load = (f) => { const t = fs.readFileSync(U + f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

/* --- the flag, in isolation -------------------------------------------- */
const DRIVERS = {
  years: 3,
  sectors: [{ name: 'A', baseVolume: 100, baseRealisation: 10, volumeCagr: 0.05, realisationCagr: 0.02, grossMargin: 0.3 }],
  opex: { fixedBase: 100 }, depreciation: { openingNetBlock: 500, rate: 0.1 },
  capex: { maintenancePctOfRevenue: 0.03 },
  workingCapital: { receivableDays: 40, inventoryDays: 30, payableDays: 45 },
  financing: { openingDebt: 200, interestRate: 0.09, taxRate: 0.25 },
  shares: { basic: 100 },
};

{
  const none = buildModel({ ...DRIVERS });
  ok('with no reported revenue the flag is null, not true', none.reconciled === null);
  ok('internal consistency is reported under its own name', none.internallyConsistent === true);

  const tied = buildModel({ ...DRIVERS, reported: { revenue: 1000, period: 'FY25' } });
  ok('a base year that ties reads true', tied.reconciled === true);
  ok('the tie carries the two figures it compared',
     tied.reconciliation.actual === 1000 && tied.reconciliation.expected === 1000);
  ok('the period it tied to is carried', tied.reconciliation.period === 'FY25');

  const edge = buildModel({ ...DRIVERS, reported: { revenue: 1019 } });   /* 1.9% out */
  ok('within the 2% tolerance still ties', edge.reconciled === true);
  const over = buildModel({ ...DRIVERS, reported: { revenue: 1030 } });   /* 3.0% out */
  ok('outside the 2% tolerance does not', over.reconciled === false);
  ok('the failure says how far out it is', Math.abs(over.reconciliation.offByPct - 2.91) < 0.1);

  const wrong = buildModel({ ...DRIVERS, reported: { revenue: 11000 } });
  ok('a base year out by an order of magnitude fails', wrong.reconciled === false);
  ok('and is still internally consistent, which is the whole point',
     wrong.internallyConsistent === true);
  ok('the anchor is not counted among the internal failures', wrong.failedChecks.length === 0);
  ok('but it is listed among the checks the reader sees',
     wrong.checks.some((c) => /ties to reported revenue/.test(c.name)));
}

/* --- end to end, on the two payloads that exposed it -------------------- */
{
  const ril = buildReport(load('57d8e52f-attachment.txt'));
  const c = ril.report.full[0];
  const m = c.model.model;
  ok('Reliance: the base year does not reconcile', m.reconciled === false);
  ok('Reliance: the gap is 95,601 against 1,071,174',
     m.baseRevenue === 95601 && m.reportedRevenue === 1071174);
  ok('Reliance: no intrinsic value is computed from it', c.model.valuation.available === false);
  ok('Reliance: the reason names both figures',
     /95601/.test(c.model.valuation.reason) && /1071174/.test(c.model.valuation.reason));
  ok('Reliance: the sensitivity grid is withheld too', !c.model.rateGrid);
  ok('Reliance: the unreconciled model is reported as a gap',
     ril.warnings.some((w) => /base year does not reconcile to reported revenue/.test(w)));

  /* A slider cannot rescue it either. */
  const s = evaluate(c, { volumeCagr: 0.06 }, { buildModel, dcf });
  ok('Reliance: a scenario off a wrong base year is refused, not computed',
     s.available === false && /does not tie to reported revenue/.test(s.reason));
}
{
  const pnb = buildReport(load('2f13d57b-PNB_gemini-code-1789969768806.json'));
  const m = pnb.report.full[0].model.model;
  ok('PNB: the base year does reconcile', m.reconciled === true);
  ok('PNB: within a rounding of reported revenue', m.reconciliation.offByPct < 0.01);
  ok('PNB: so the check discriminates rather than always failing',
     m.reconciled === true && m.internallyConsistent === true);
}

console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
