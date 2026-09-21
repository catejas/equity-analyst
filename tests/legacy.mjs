/* A payload written before the rename must still import, still keep its driver
   model, and still build a report. Runs already in someone's library are
   research they paid for; a rename is not a reason to make them unreadable.

   The fixture is built by rewriting the real Reliance payload BACK to the old
   spelling, so this tests the actual migration path rather than a hand-made
   shape that might not match what was really stored. */
import fs from 'node:fs';
import { parsePayload } from '../src/core/payload-schema.js';
import { buildReport } from '../src/core/report.js';

/* The captured Reliance run is itself a pre-rename payload — it carries
   run.segment and model.sectors from the window when the prompt's schema key
   had been rewritten. Use it as it was actually stored rather than
   manufacturing a legacy shape, then force the model array to the older
   "segments" spelling too so both migration paths are exercised. */
const legacy = JSON.parse(fs.readFileSync('/tmp/ril.json', 'utf8'));
for (const c of legacy.companies || []) {
  if (c.model && Array.isArray(c.model.sectors)) {
    c.model.segments = c.model.sectors;
    delete c.model.sectors;
  }
}

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

ok('fixture really is legacy', 'segment' in legacy.run && 'segments' in (legacy.companies[0].model || {}));

const res = parsePayload(JSON.stringify(legacy));
ok('legacy payload parsed', !!res?.payload);
ok('no blocking errors', (res.errors || []).length === 0);
if ((res.errors || []).length) console.log('      ' + res.errors.slice(0, 3).join('\n      '));

const c0 = res.payload?.companies?.[0];
ok('run scope migrated to sector', res.payload?.run?.sector != null);
ok('old run key removed', !(res.payload?.run && 'segment' in res.payload.run));
ok('driver model migrated to sectors', Array.isArray(c0?.model?.sectors) && c0.model.sectors.length === 3);
ok('old model key removed', !(c0?.model && 'segments' in c0.model));

const notes = res.repairs || res.notes || [];
if (Array.isArray(notes)) notes.filter((n) => /old key/.test(n)).forEach((n) => console.log('      - ' + n));

const out = buildReport(res.payload);
ok('report built from legacy payload', !!out?.report);
ok('forecast survived the migration', !!out?.report?.full?.[0]?.model);

console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
