/* The rename is real: sector / subSector / sectors are the keys everywhere —
   prompt, schema, engine, reports and storage. There is no longer a
   display-vocabulary transform applied to the finished prompt text, because
   that transform is what silently rewrote "segments" to "sectors" inside the
   schema and made the engine discard every driver model it was sent.

   This test guards the property that actually matters: the prompt asks for
   exactly the keys the validator requires, and no legacy spelling survives in
   the prompt. */
import { buildResearchPrompt } from '../src/core/prompt-builder.js';

const p = buildResearchPrompt({ sector: 'Conglomerate', horizon: '3-5' });

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

/* Every key the schema and the engine actually read. */
const KEYS = [
  'sectors', 'sector', 'subSector',
  'baseVolume', 'volumeCagr', 'baseRealisation', 'realisationCagr', 'grossMargin',
  'opex', 'depreciation', 'capex', 'workingCapital', 'financing', 'shares',
  'growthSchedule', 'repaymentSchedule', 'drawdownSchedule',
  'priceHistory', 'closes', 'financials', 'annual', 'peers', 'valuation',
];
const missing = KEYS.filter((k) => !p.includes('"' + k + '"'));
ok('every engine key appears verbatim in the prompt', missing.length === 0);
if (missing.length) console.log('      missing:', missing.join(' '));

/* No legacy spelling anywhere — not as a key, not in prose. */
ok('prompt contains no "segment" spelling', !/segment/i.test(p));

/* The driver model's array, specifically: this is the one that was lost. */
ok('prompt asks for "sectors" as the model array', /"sectors"\s*:/.test(p));

/* And the transform that caused it is gone for good. */
const src = await import('node:fs').then((fs) => fs.readFileSync('src/core/prompt-builder.js', 'utf8'));
ok('no vocabulary transform remains in prompt-builder', !/sectorVocabulary/.test(src));

/* The schedules must be declared as arrays, not scalars — a scalar in the
   example is why a model returned drawdownSchedule: 10000. */
ok('drawdownSchedule shown as a 5-element array', /"drawdownSchedule":\s*\[0, 0, 0, 0, 0\]/.test(p));
ok('reconciliation rule present', /RECONCILIATION RULE/.test(p));

console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
