/* Version 5 must be consistent across the prompt, the engine and the framework,
   and every earlier payload must still import — no version has removed a field. */
import fs from 'node:fs';
import { buildResearchPrompt } from '../src/core/prompt-builder.js';
import { PAYLOAD_SCHEMA_VERSION, parsePayload } from '../src/core/payload-schema.js';
import { METHODOLOGY_VERSION } from '../src/core/scoring.js';

let fail=0; const ok=(l,c)=>{ if(!c){fail=1;console.log('FAIL  '+l);} else console.log('ok    '+l); };
const p = buildResearchPrompt({ sector:'Banking', horizon:'3-5' });

ok('payload schema is 5.0.0', PAYLOAD_SCHEMA_VERSION === '5.0.0');
ok('methodology is 5.0.0', METHODOLOGY_VERSION === '5.0.0');
ok('the prompt declares schemaVersion 5.0.0', p.includes('5.0.0'));
ok('the wire tag is equity-analyst/5', /equity-analyst\/5/.test(p) && !/equity-analyst\/4/.test(p));
ok('the framework document agrees',
   !/equity-analyst\/4/.test(fs.readFileSync('EQUITY_ANALYST_FRAMEWORK.md','utf8')));

/* Older payloads still import. */
const base = JSON.parse(fs.readFileSync('/tmp/ril.json','utf8'));
for (const v of ['3.0.0','4.0.0','5.0.0']) {
  const c = JSON.parse(JSON.stringify(base));
  c.run.schemaVersion = v;
  const r = parsePayload(JSON.stringify(c));
  ok('schema ' + v + ' still imports', (r.errors||[]).length === 0);
}
const old = JSON.parse(JSON.stringify(base));
old.run.schemaVersion = '2.0.0';
const r2 = parsePayload(JSON.stringify(old));
ok('a genuinely superseded schema is refused', (r2.errors||[]).some(x=>/predates/.test(x)));

console.log('\n'+(fail?'FAIL':'PASS'));
process.exit(fail?1:0);
