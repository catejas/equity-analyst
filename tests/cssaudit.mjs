/* CSS that never applies is invisible in every JS test we have: the declaration
   is dropped, the page still renders, and nothing throws. The gold chevron sat
   broken for two builds because linear-gradient(var(--grad-gold)) is invalid —
   --grad-gold is already a gradient. This checks for that class of mistake. */
import fs from 'node:fs';
const s = fs.readFileSync('/home/claude/eqapp/index.html', 'utf8');
const css = [...s.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
let fail = 0;

const tokens = {};
for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();

/* a gradient token used inside another gradient function */
for (const m of css.matchAll(/(linear|radial|conic)-gradient\(\s*var\(--([\w-]+)\)/g)) {
  const val = tokens[m[2]] || '';
  if (/gradient\(/.test(val)) {
    console.log(`FAIL: ${m[1]}-gradient(var(--${m[2]})) — that token is already a gradient`);
    fail = 1;
  }
}
/* a colour token used where a gradient is required, and the reverse */
for (const m of css.matchAll(/background-image\s*:\s*var\(--([\w-]+)\)/g)) {
  const val = tokens[m[1]] || '';
  if (val && !/gradient\(|url\(/.test(val)) {
    console.log(`FAIL: background-image: var(--${m[1]}) — that token is a colour, not an image`);
    fail = 1;
  }
}
/* braces */
let depth = 0;
for (const ch of css) { if (ch === '{') depth += 1; else if (ch === '}') depth -= 1; }
if (depth !== 0) { console.log('FAIL: stylesheet braces do not balance:', depth); fail = 1; }

/* every wrapper the chevron needs must exist and wrap a select */
const wraps = (s.match(/<div class="selwrap">\s*<select/g) || []).length;
const selects = (s.match(/<select id="(segSel|subSel|horizon|segPick|soloPick|coPick|scSector|scCompany)"/g) || []).length;
console.log(`selwrap wrappers: ${wraps}, visible selects: ${selects}`);
if (wraps < selects) { console.log('FAIL: some visible selects have no chevron wrapper'); fail = 1; }
if (!/\.selwrap::after\{[^}]*background:var\(--grad-gold\)/.test(css.replace(/\s+/g, ''))) {
  console.log('FAIL: the chevron has no gold background'); fail = 1;
}
console.log(fail ? 'CSS AUDIT FAILED' : 'css audit passes');
process.exit(fail);
