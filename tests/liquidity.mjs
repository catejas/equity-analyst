/* Liquidity and position sizing — in the reporting unit.
 *
 * The section printed "Average daily traded value ₹3,50,00,000 Crs" for a bank
 * the snapshot showed trading ₹350 Crs a day, and sized positions as if the
 * figure were absolute rupees. Traded value is a money figure like any other
 * and arrives in the payload's reporting unit. */
import fs from 'node:fs';
import { buildReport } from '../src/core/report.js';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null ? '  — ' + d : ''}`); };
const load = (f) => { const t = fs.readFileSync(f, 'utf8'); return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); };

{ /* PNB: ₹150 Crs a day, in crore as the payload says. */
  const l = buildReport(load('tests/fixtures/psu.json')).report.full[0].liquidity;
  ok('traded value stays in the reporting unit', l.avgDailyValue === 150, l.avgDailyValue);
  ok('position sizes are ₹1, ₹10 and ₹100 crore', l.sizes.map((s) => s.positionSize).join(',') === '1,10,100');
  const d100 = l.sizes[2].daysToBuild;
  ok('₹100 Crs at 20% of ₹150 Crs a day takes 3.3 days', Math.abs(d100 - 3.3) < 0.05, d100);
}
{ /* A tool that wrote absolute rupees in the liquidity block while the
     snapshot, beside market capitalisation, is in crore. */
  const p = load('tests/fixtures/psu-banks-3.json');
  const r = buildReport(p).report.full;
  r.forEach((c) => {
    const snap = c.snapshot && c.snapshot.avgDailyValue;
    ok(`${c.symbol}: liquidity agrees with the snapshot`, c.liquidity.available
      && (!snap || Math.abs(c.liquidity.avgDailyValue / snap - 1) < 0.5),
      `${c.liquidity.avgDailyValue} against ${snap}`);
  });
}
{ /* A figure plainly in rupees, with no snapshot to reconcile against. */
  const p = load('tests/fixtures/psu.json');
  p.companies[0].liquidity.avgDailyValue = 1.5e9;
  delete p.companies[0].snapshot.avgDailyValue;
  const l = buildReport(p).report.full[0].liquidity;
  ok('an absolute-rupee figure is recognised and put into crore', Math.abs(l.avgDailyValue - 150) < 0.01, l.avgDailyValue);
}
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
