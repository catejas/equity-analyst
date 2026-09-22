/* The documents read as written English.
 *
 * Research text arrives from the payload already punctuated, and the renderer
 * joined sentences onto it with its own ". ". Every thesis in every company
 * report printed "Adds ~40 bps to ROA structurally.. Expected by: FY27." —
 * three times on one page, in the section a reader looks at first.
 *
 * The same class of defect covers counts concatenated onto plural nouns
 * ("1 companies were taken to full analysis"), objects printed instead of
 * their contents ("[object Object]"), and raw markup that escaped.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DOCS = ['co1', 'sector', 'exec', 'score'];

/* Each rule is a pattern that must not appear, and why it matters. Matching is
   done on the rendered text, not the HTML, so an em dash or an ellipsis in the
   research does not trip it. */
const RULES = [
  [/[a-z0-9)][.!?]\s*[.!?](?!\.)/, 'a sentence ends twice'],
  [/\[object \w+\]/, 'an object was printed instead of its contents'],
  [/\bundefined\b|\bNaN\b|\bnull\b/, 'a missing value reached the page as code'],
  [/<\/?[a-z]+[ >]/i, 'raw markup leaked into the text'],
  [/&(?:amp|lt|gt|quot|#\d+);/, 'an HTML entity was printed literally'],
  [/(?:^|\s)1 (?:companies|ratings|sections|searches|reports|years|points|claims|risks|sources|entries|things|combinations)\b/,
    'a count of one is followed by a plural'],
  [/\s,|\s\.(?!\d)| {3,}/, 'stray spacing around punctuation'],
];

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0, ran = 0;

for (const kind of DOCS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) { console.log(`FAIL  ${kind}: fixture missing`); fail++; continue; }
  const age = (Date.now() - fs.statSync(f).mtimeMs) / 3600000;
  if (age > 6) { console.log(`FAIL  ${kind}: fixture ${age.toFixed(1)}h old — regenerate`); fail++; continue; }

  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.setContent(fs.readFileSync(f, 'utf8'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  /* Page by page, so a finding can be pointed at. Each block of text is read
     on its own: joining the whole page would create sentence boundaries that
     the layout does not have. */
  const chunks = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.page').forEach((pg, i) => {
      pg.querySelectorAll('p,li,td,th,h1,h2,h3,h4,div.mut,div.note,div.lead').forEach((el) => {
        if (el.querySelector('p,li,td,div.mut,div.note')) return;   /* leaves only */
        const t = (el.textContent || '').replace(/ /g, ' ').trim();
        if (t) out.push([i + 1, t]);
      });
    });
    return out;
  });
  await p.close();

  const found = [];
  for (const [pg, text] of chunks) {
    for (const [re, why] of RULES) {
      const m = re.exec(text);
      if (!m) continue;
      const at = Math.max(0, m.index - 30);
      found.push(`page ${pg}: ${why} — "${text.slice(at, m.index + 40).trim()}"`);
    }
  }
  ran++;
  if (found.length) fail++;
  console.log(`  ${found.length ? 'FAIL' : 'ok  '}  ${kind.padEnd(7)} `
    + `${chunks.length} blocks, ${found.length} finding(s)`);
  found.slice(0, 8).forEach((x) => console.log('        ' + x));
}

await b.close();
if (!ran) { console.log('FAIL  nothing measured'); process.exit(1); }
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} documents read cleanly`);
process.exit(fail ? 1 : 0);
