/* The disclaimer, in full, exactly once.
 *
 * Every page carries a one-line reminder. Shrinking that line is what stopped
 * the footer pushing a 297mm page box past the sheet, which had been doubling
 * the printed page count on the iPhone — and the short line necessarily drops
 * who prepared the report, that they are not SEBI-registered, and that it is
 * not an offer to buy or sell.
 *
 * So the full notice is printed once, at the end. Once, not never and not
 * twenty-four times: printing it on every page is what made the footer tall
 * enough to fragment the sheet, and printing it nowhere leaves a research
 * document circulating without its disclaimer.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DOCS = ['co1', 'sector', 'exec', 'score'];
const MUST = ['not a SEBI-registered investment adviser', 'not investment advice',
  'not an offer to buy or sell'];

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0, ran = 0;

for (const kind of DOCS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) { console.log(`FAIL  ${kind}: fixture missing`); fail++; continue; }
  const age = (Date.now() - fs.statSync(f).mtimeMs) / 3600000;
  if (age > 6) { console.log(`FAIL  ${kind}: fixture ${age.toFixed(1)}h old — regenerate`); fail++; continue; }

  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.setContent(fs.readFileSync(f, 'utf8'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const r = await p.evaluate((phrases) => {
    const pages = [...document.querySelectorAll('.page')];
    /* Wherever it ended up: its own block above the footer, or, on a document
       packed to the millimetre, the last page's footer line itself. */
    const carriers = [...document.querySelectorAll('.rfull, .rfn')]
      .filter((el) => phrases.every((s) => el.textContent.includes(s)));
    const onPage = carriers.map((el) => pages.indexOf(el.closest('.page')) + 1);
    /* And it must actually be visible — .page is overflow:hidden, so a notice
       pushed past the bottom is a notice that is not there. */
    const visible = carriers.filter((el) => {
      const pg = el.closest('.page');
      if (!pg) return false;
      const a = el.getBoundingClientRect(), b = pg.getBoundingClientRect();
      return a.height > 2 && a.bottom <= b.bottom + 1 && a.top >= b.top - 1;
    }).length;
    const shortOnEvery = pages.every((pg) => !!pg.querySelector('.rfn'));
    return { pages: pages.length, count: carriers.length, onPage, visible, shortOnEvery };
  }, MUST);
  await p.close();

  const bad = [];
  if (r.count !== 1) bad.push(`the full notice appears ${r.count} times, not once`);
  if (r.visible !== r.count) bad.push('it is clipped by the page box');
  if (r.count === 1 && r.onPage[0] < r.pages - 2) {
    bad.push(`it is on page ${r.onPage[0]} of ${r.pages}, not at the end`);
  }
  if (!r.shortOnEvery) bad.push('some page carries no footer line at all');

  ran++;
  if (bad.length) fail++;
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '}  ${kind.padEnd(7)} `
    + `full notice on page ${r.onPage[0] || '—'} of ${r.pages}`);
  bad.forEach((x) => console.log('        ' + x));
}

await b.close();
if (!ran) { console.log('FAIL  nothing measured'); process.exit(1); }
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} documents carry the notice once`);
process.exit(fail ? 1 : 0);
