/* No page ends on a heading with nothing under it.
 *
 * The sector study printed "MEASURE / VALUE" as the last thing on page 2 and
 * its six readings at the top of page 3. The packer had handed every body row
 * to the next page and left the column header standing over the break. A
 * reader meets a header that labels nothing, then a table with no header.
 *
 * Two shapes are checked, on every document:
 *   - a table on a page whose body has no rows at all;
 *   - a section heading that is the last visible thing on its page.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DOCS = ['co1', 'sector', 'exec', 'score'];
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0, ran = 0;

for (const kind of DOCS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) { console.log(`FAIL  ${kind}: fixture missing`); fail++; continue; }
  const age = (Date.now() - fs.statSync(f).mtimeMs) / 3600000;
  if (age > 6) { console.log(`FAIL  ${kind}: fixture ${age.toFixed(1)}h old — regenerate`); fail++; continue; }

  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  /* The packer runs as a script inside the finished document. A syntax error
     in it does not throw anywhere a test was watching — the document simply
     renders unpacked, and the sector study came out at 49 pages with most of
     them blank while every suite still passed. The document's own errors are
     now part of the assertion. */
  const docErrs = [];
  p.on('pageerror', (e) => docErrs.push(e.message.split('\n')[0]));
  await p.setContent(fs.readFileSync(f, 'utf8'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);

  const bad = await p.evaluate(() => {
    const out = [];
    const pages = [...document.querySelectorAll('.page')];
    pages.forEach((pg, i) => {
      pg.querySelectorAll('table').forEach((t) => {
        const rows = t.tBodies.length ? t.tBodies[0].rows.length : 0;
        if (!rows) {
          const head = t.tHead ? t.tHead.textContent.trim().slice(0, 40) : '(no head)';
          out.push(`page ${i + 1}: table "${head}" has a header and no rows`);
        }
        /* And the other half of the same defect: rows carried onto a new page
           with the column headings left behind, so the reader has to page back
           to learn what the columns are. */
        /* A repeated header must be the header of the table it sits on.
           Matching a continuation to "the nearest table of the same width"
           once stamped STAGE / COMPANIES over six rows of methodology
           versions, which is worse than no header at all: it is a label the
           reader has no reason to doubt. */
        /* A repeated header must have the same shape as the rows under it.
           An earlier attempt matched continuations to "the nearest table of
           the same width" and stamped STAGE / COMPANIES over six rows of
           methodology versions, which is worse than no header at all. */
        if (t.tHead && t.tHead.getAttribute('data-repeat') && rows) {
          const hc = t.tHead.rows[t.tHead.rows.length - 1].cells.length;
          const bc = t.tBodies[0].rows[0].cells.length;
          if (hc !== bc) {
            out.push(`page ${i + 1}: repeated header has ${hc} columns over ${bc} of body`);
          }
        }
        if (rows && !t.tHead && t.closest('[data-cont]')) {
          const first = [...t.tBodies[0].rows[0].cells].map((c) => c.textContent.trim().slice(0, 14));
          out.push(`page ${i + 1}: continuation of ${rows} rows carries no header (${first.join(' | ')})`);
        }
      });
      /* A heading alone at the foot of a page. The last element with any
         visible extent is the test — trailing empty spacers do not count. */
      const body = pg.querySelector('.body');
      if (!body) return;
      /* The lowest thing on the page, by geometry rather than by document
         order — a trailing wrapper or an empty spacer comes last in the DOM
         and was hiding the heading underneath it, which is why a page ending
         on "Global peers" with its table overleaf went unreported. */
      const isHeading = (el) => /(^|\s)(sec|sc-h|ir-h|ir-grp)(\s|$)/.test(el.className || '')
        || /^H[1-6]$/.test(el.tagName);
      const boxTop = body.getBoundingClientRect().top;
      let lowest = null, lowestBottom = boxTop;
      [...body.querySelectorAll('*')].forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height < 3 || r.width < 3) return;
        if (getComputedStyle(el).visibility === 'hidden') return;
        if (el.querySelector('*')) return;          /* leaves only */
        if (r.bottom >= lowestBottom) { lowestBottom = r.bottom; lowest = el; }
      });
      const cand = lowest && (isHeading(lowest) ? lowest
        : (lowest.parentElement && isHeading(lowest.parentElement) ? lowest.parentElement : null));
      if (cand) out.push(`page ${i + 1}: ends on the heading "${cand.textContent.trim().slice(0, 40)}"`);
    });
    return out;
  });
  /* And a page count that is roughly what the content asks for. An unpacked
     document is not subtly wrong; it is two to three times too long. */
  const pageCount = await p.evaluate(() => document.querySelectorAll('.page').length);
  const filled = await p.evaluate(() => [...document.querySelectorAll('.page .body')]
    .filter((x) => x.textContent.trim().length > 40).length);
  await p.close();

  docErrs.forEach((e) => bad.push(`the document's own script threw: ${e}`));
  if (pageCount && filled / pageCount < 0.9) {
    bad.push(`${pageCount - filled} of ${pageCount} pages are effectively blank — the packer did not run`);
  }

  ran++;
  if (bad.length) fail++;
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '}  ${kind.padEnd(7)} ${bad.length ? bad.length + ' orphan(s)' : 'no orphans'}`);
  bad.slice(0, 6).forEach((x) => console.log('        ' + x));
}

await b.close();
if (!ran) { console.log('FAIL  nothing measured'); process.exit(1); }
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} documents, no orphaned headers`);
process.exit(fail ? 1 : 0);
