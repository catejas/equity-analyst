/* The disclaimer, in Tejas's wording, under the footer row of every page.
 *
 * History. Build 16 printed the full notice once, at the end, because a
 * per-page notice had made the footer tall enough to fragment the sheet.
 * Build 22 settled it the other way, on Tejas's instruction: a short footnote
 * in his own words sits under the document / page / date row on every page,
 * in small type, so the footer stays inside the A4 sheet. This suite checked
 * the build-16 rule until build 24 and failed on every document; it now
 * checks the rule in force.
 *
 * Read in a real browser from the fixtures gen-fixtures.mjs builds, because
 * "under the row" and "inside the sheet" are layout facts jsdom cannot see. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DOCS = ['co1', 'sector', 'exec', 'score'];
const MUST = [/not a SEBI-registered Investment Adviser/i, /not an investment advice/i,
  /not an offer to buy or sell/i, /CA Tejas Desai/];

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0, ran = 0;
const ok = (label, pass, detail) => { ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

for (const kind of DOCS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) { ok(`${kind}: fixture present`, false, 'run tests/gen-fixtures.mjs'); continue; }
  const age = (Date.now() - fs.statSync(f).mtimeMs) / 3600000;
  if (age > 6) { ok(`${kind}: fixture is current`, false, `${age.toFixed(1)}h old — regenerate`); continue; }

  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.setContent(fs.readFileSync(f, 'utf8'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg) => {
    const row = pg.querySelector('.rf'), note = pg.querySelector('.rfn');
    const box = pg.getBoundingClientRect();
    const nb = note && note.getBoundingClientRect(), rb = row && row.getBoundingClientRect();
    return { text: note ? note.textContent : '', under: !!(nb && rb && nb.top >= rb.bottom - 1),
      inside: !!(nb && nb.bottom <= box.bottom + 1 && nb.height > 0) };
  }));
  await p.close();

  ok(`${kind}: every one of ${r.length} pages carries the footnote`, r.length > 0 && r.every((x) => x.text));
  ok(`${kind}: it says what it must`, r.every((x) => MUST.every((m) => m.test(x.text))),
    MUST.filter((m) => !r.every((x) => m.test(x.text))).map(String).join(', '));
  ok(`${kind}: it sits under the document / page / date row`, r.every((x) => x.under));
  ok(`${kind}: and inside the sheet`, r.every((x) => x.inside));
}
await b.close();
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
