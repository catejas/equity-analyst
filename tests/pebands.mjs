/* The multiple against its own history.
 *
 * "It trades at 8x" is not an argument until you say against what. This is the
 * third of the three honest answers — against its own history — and it was the
 * last Tier 2 item, blocked until the price series actually arrived.
 *
 * The assertions that matter are about HONESTY of construction, not about
 * whether a chart appears: a band built by dividing every historical price by
 * today's earnings is the price chart rescaled, and would look identical. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { multipleBands } from '../src/core/valuation.js';

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

/* --- construction, in isolation ---------------------------------------- */
const annual = [
  { period: 'FY24', epsDiluted: 7.48, shareholdersEquity: 54000, sharesOutstanding: 1101 },
  { period: 'FY25', epsDiluted: 14.48, shareholdersEquity: 68000, sharesOutstanding: 1148 },
  { period: 'FY26', epsDiluted: 14.72, shareholdersEquity: 76202, sharesOutstanding: 1148 },
];
const dates = [], closes = [];
{
  const t0 = Date.parse('2026-07-20');
  for (let i = 104; i >= 0; i--) {
    dates.push(new Date(t0 - i * 7 * 86400000).toISOString().slice(0, 10));
    closes.push(110 * (1 - i * 0.003));
  }
}
{
  const pe = multipleBands({ closes, dates, annual, lender: false });
  ok('a non-lender is banded on earnings', pe.available && pe.metric === 'P/E');
  ok('the band has a mean and a spread', pe.mean > 0 && pe.sd > 0);
  ok('it reports where the current multiple sits', typeof pe.z === 'number');

  const pb = multipleBands({ closes, dates, annual, lender: true });
  ok('a lender is banded on book, not earnings', pb.available && pb.metric === 'P/B');
  ok('the two give different answers, as they must', pe.mean !== pb.mean);

  /* The construction test. Each point must use the figure REPORTED by that
     date. FY26 results are not knowable in August 2025, so an August 2025
     point must be on FY25 — and if the code used today's EPS throughout,
     every point would share one basis. */
  const bases = [...new Set(pe.points.map((p) => p.basis))];
  console.log('      denominators used across the series:', bases.join(' '));
  ok('the denominator changes as results are published, so the series is not '
     + 'the price chart rescaled', bases.length >= 2);
  const early = pe.points[0], late = pe.points[pe.points.length - 1];
  ok('the earliest point uses an earlier year than the latest', early.basis < late.basis);

  /* A loss year has no meaningful multiple and must be dropped, not negated. */
  const withLoss = multipleBands({ closes, dates,
    annual: [{ period: 'FY24', epsDiluted: -3.2 }, annual[1], annual[2]], lender: false });
  ok('a loss year is not turned into a negative multiple',
     withLoss.points.every((p) => p.value > 0));

  /* Refusals, stated. */
  const none = multipleBands({ closes: null, dates, annual, lender: false });
  ok('no price series is refused with a reason', !none.available && !!none.reason);
  const noEps = multipleBands({ closes, dates,
    annual: [{ period: 'FY26', epsDiluted: null }], lender: false });
  ok('no usable denominator is refused with a reason', !noEps.available && /denominator/.test(noEps.reason));
}

/* --- on the page --------------------------------------------------------- */
const FILE = '/tmp/doc-co1.html';
if (!fs.existsSync(FILE)) { console.log('FAIL  no fixture'); process.exit(1); }
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
await page.setContent(fs.readFileSync(FILE, 'utf8'), { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const r = await page.evaluate(() => {
  const t = document.body.textContent;
  return {
    heading: /The Multiple Against Its Own History/i.test(t),
    reading: /standard deviations? (BELOW|ABOVE)|within one standard deviation/.test(t),
    note: /is not the price chart\s+rescaled|not the price chart rescaled/.test(t.replace(/\s+/g, ' ')),
    dashed: document.querySelectorAll('polyline[stroke-dasharray]').length,
    solid: document.querySelectorAll('polyline:not([stroke-dasharray])').length,
    denominators: /Denominators: FY/.test(t),
  };
});
console.log('      dashed reference lines:', r.dashed, '| solid series lines:', r.solid);
ok('the section is printed', r.heading);
ok('the band is read for the reader in words', r.reading);
ok('it says how the series was built', r.note);
ok('it names the denominators used', r.denominators);
ok('mean and the two band edges are drawn as reference lines, not as data', r.dashed >= 3);
ok('no render errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0, 3).join('\n      '));
await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
