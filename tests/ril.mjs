/* The real Reliance payload, end to end.
   It carries three live defects at once: model.sectors instead of sectors,
   drawdownSchedule as a bare number, and a price history one week long. All
   three must now survive import with the model intact. */
import fs from 'node:fs';
import { parsePayload } from '../src/core/payload-schema.js';
import { buildReport } from '../src/core/report.js';

const raw = fs.readFileSync('/tmp/ril.json', 'utf8');
const res = parsePayload(raw);

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

ok('payload parsed', !!res && !!res.payload);
const errs = res.errors || [];
ok('no blocking errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0, 5).join('\n      '));

const c = res.payload?.companies?.[0];
ok('company survived', !!c);

/* The whole point: the driver model must still be there. */
ok('driver model kept', !!c?.model);
ok('sectors read from "sectors"', Array.isArray(c?.model?.sectors) && c.model.sectors.length === 3);
ok('drawdownSchedule is a 5-year array',
   Array.isArray(c?.model?.financing?.drawdownSchedule) && c.model.financing.drawdownSchedule.length === 5);
ok('drawdown value preserved', c?.model?.financing?.drawdownSchedule?.[0] === 10000);
ok('repaymentSchedule untouched', c?.model?.financing?.repaymentSchedule?.length === 5);

const notes = res.repairs || res.notes || [];
console.log('      repairs:', Array.isArray(notes) ? notes.length : 0);
if (Array.isArray(notes)) notes.slice(0, 6).forEach((n) => console.log('        - ' + n));

/* And the report must build, with a forecast in it. */
let out = null;
try { out = buildReport(res.payload); } catch (err) { console.log('FAIL  buildReport threw: ' + err.message); fail = 1; }
ok('report built', !!out?.report);
const rc = out?.report?.full?.[0];
ok('company in report', !!rc);
ok('driver model reached the report', !!rc?.model);
ok('valuation present', !!rc?.valuation);
/* One week of closes must not crash the panel, and must not silently vanish
   without the reader being told. */
ok('technical panel handled, not crashed', rc ? ('technicalPanel' in rc) : false);
const warns = out?.warnings || [];
ok('short price history is reported, not swallowed',
   warns.some((w) => /closes supplied/.test(String(w))));
console.log('      warnings:', warns.length);

console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
