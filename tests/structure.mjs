/* The markup must balance and the four pages must be siblings. An unclosed div
   in the import card made every section after it a child of that card, so
   hiding the card blanked the Score Card and Setup pages — and jsdom repairs
   that silently, which is why every other test passed. */
import fs from 'node:fs';
const s = fs.readFileSync('/home/claude/eqapp/index.html', 'utf8');
const body = s.slice(s.indexOf('<body'), s.indexOf('<script>', s.indexOf('<body')));
let depth = 0, fail = 0;
const opens = [];
for (const m of body.matchAll(/<(\/?)(div|section)\b[^>]*>/g)) {
  const [, close, tag] = m;
  if (tag === 'div') depth += close ? -1 : 1;
  if (tag === 'section' && !close) {
    const id = /id="([\w-]+)"/.exec(m[0]);
    opens.push([id ? id[1] : '?', depth]);
  }
  if (depth < 0) { console.log('FAIL: a div closes that was never opened'); fail = 1; }
}
console.log('final div depth:', depth, depth === 0 ? 'OK' : 'FAIL — markup does not balance');
if (depth !== 0) fail = 1;
const bad = opens.filter(([, d]) => d !== opens[0][1]);
opens.forEach(([id, d]) => console.log('  section', id.padEnd(12), 'nested at depth', d));
if (bad.length) { console.log('FAIL: sections are not siblings:', bad.map(b => b[0]).join(', ')); fail = 1; }
else console.log('all four pages are siblings');
process.exit(fail);
