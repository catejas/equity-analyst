/* Every money figure says what it is in, and a bank's lines are a bank's lines.
 *
 * Two findings from the same page of the same report.
 *
 * Tejas: "At many places, just numbers are mentioned. what is that ? amount in
 * crore, amount in lacs or just the quantity number." Nothing in the schema
 * asked for a reporting unit and nothing in the documents printed one, so
 * every table of money was a table of bare integers.
 *
 * And: "1 page tear note has wrong EBIDTA calculated." It was not an
 * arithmetic error — revenue plus other income less operating costs does come
 * to 1,23,290 — it was the wrong line. For a bank, interest expense is the
 * cost of the product, so an EBITDA that excludes it gives a 96% margin, which
 * is not a margin at all. A lender's reported lines are interest income and
 * pre-provision operating profit.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { buildReport, reportingUnits } from '../src/core/report.js';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const read = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };

let fail = 0, ran = 0;
const ok = (label, pass, detail) => {
  ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

/* ---- the engine resolves a unit, and says when it assumed one ---- */
{
  const stated = reportingUnits({ run: { reporting: { currency: 'INR', unit: 'lakh' } } });
  ok('a stated unit is used as stated', stated.label === 'INR lakh' && stated.stated === true,
    stated.label);

  const notes = [];
  const guessed = reportingUnits({ run: {} }, (m) => notes.push(m));
  ok('an absent unit falls back to crore', guessed.label === 'INR crore', guessed.label);
  ok('and the fallback is recorded as an assumption',
    guessed.stated === false && notes.length === 1);

  const absolute = reportingUnits({ run: { reporting: { currency: 'INR', unit: 'absolute' } } });
  ok('an absolute payload is labelled by currency alone', absolute.label === 'INR', absolute.label);
}

/* ---- a lender's lines ---- */
const PNB = read('107fec97-attachment.txt');
const rep = buildReport(PNB);
const co = rep.report.full[0];
ok('a bank is marked as a lender', co.lender === true);
ok('the report carries the reporting unit', rep.report.run.reporting.label === 'INR crore');
ok('and records that it was assumed, not stated',
  (rep.warnings || []).some((w) => /did not state what its money figures are in/i.test(String(w))));

/* ---- and the documents print both ---- */
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
const html = fs.readFileSync('/tmp/doc-co1.html', 'utf8');
const age = (Date.now() - fs.statSync('/tmp/doc-co1.html').mtimeMs) / 3600000;
if (age > 6) { console.log(`FAIL  fixture ${age.toFixed(1)}h old — regenerate`); fail++; }
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const seen = await page.evaluate(() => document.body.innerText);
await b.close();

ok('the tear sheet names a bank\'s top line', /Interest income/.test(seen));
ok('and its operating line', /Pre-provision operating profit/.test(seen));
ok('EBITDA is not printed for a bank',
  !/\bEBITDA\b/.test(seen.split('The Three Statements')[0] || ''),
  'checked everything before the full statements');
ok('the key financials state their unit', /INR crore, except EPS/i.test(seen));
ok('the market capitalisation states its unit', /1,26,600\s*INR crore/.test(seen));
ok('a price states that it is per share', /INR a share/.test(seen));

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
