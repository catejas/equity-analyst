/* Page one.
 *
 * Every reference report opens on a tear sheet; ours opened on a table of
 * contents, which tells a reader what is in the document and nothing about the
 * company. This was the largest structural gap against the benchmark reports
 * and the first thing anyone saw.
 *
 * The assertions are about what a reader needs before turning the page: what
 * it is, what it is worth, what the case is, what would break it — and that
 * the page states rather than calculates, so nothing here disagrees with the
 * body that argues it. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const FILE = '/tmp/doc-co1.html';
if (!fs.existsSync(FILE)) {
  console.log('FAIL  no fixture — run tests/gen-fixtures.mjs first');
  process.exit(1);
}
if (fs.statSync(FILE).mtimeMs < fs.statSync('/home/claude/eqapp/render.js').mtimeMs) {
  console.log('FAIL  fixture older than render.js — regenerate first');
  process.exit(1);
}

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1000, height: 1400 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
await page.setContent(fs.readFileSync(FILE, 'utf8'), { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const r = await page.evaluate(() => {
  const MM = 3.7795275591;
  const pages = [...document.querySelectorAll('.page')];
  const ts = document.querySelector('.tearsheet');
  const box = pages[0] && (pages[0].querySelector('.ir-tear') || pages[0]);
  const txt = (s) => (document.querySelector(s) || {}).textContent || '';
  return {
    pages: pages.length,
    onPage1: !!(pages[0] && pages[0].querySelector('.tearsheet')),
    contentsOnPage2: !!(pages[1] && pages[1].querySelector('[data-toc]')),
    contentsNotOnPage1: !(pages[0] && pages[0].querySelector('[data-toc]')),
    name: txt('.ts-name').trim(),
    sub: txt('.ts-sub').trim(),
    stance: txt('.ts-stance').trim(),
    tiles: [...document.querySelectorAll('.ts-tile')].map((t) => ({
      k: (t.querySelector('.ts-k') || {}).textContent,
      v: (t.querySelector('.ts-v') || {}).textContent })),
    thesis: document.querySelectorAll('.ts-th li').length,
    breakers: document.querySelectorAll('.ts-br li').length,
    hasStats: /Key statistics/i.test(ts ? ts.textContent : ''),
    hasFin: /Key financials/i.test(ts ? ts.textContent : ''),
    hasRange: /The range/i.test(ts ? ts.textContent : ''),
    hasRisk: !!document.querySelector('.ts-risk'),
    chart: !!(ts && ts.querySelector('svg')),
    fillPct: (ts && box) ? Math.round(ts.getBoundingClientRect().height / box.getBoundingClientRect().height * 100) : 0,
    overflow: pages[0] ? pages[0].scrollHeight > pages[0].clientHeight + 2 : null,
    /* No dashes where a figure should be: an absent figure is left out. */
    emptyTiles: [...document.querySelectorAll('.ts-tile .ts-v')].filter((v) => /^[—–-]$/.test(v.textContent.trim())).length,
  };
});

console.log('      ' + r.name + ' | ' + r.sub);
console.log('      tiles: ' + r.tiles.map((t) => t.k + ' ' + t.v).join(' | '));
console.log('      fill ' + r.fillPct + '% of page one');

ok('the tear sheet is page one', r.onPage1);
ok('contents is no longer page one', r.contentsNotOnPage1);
ok('contents is page two', r.contentsOnPage2);
ok('it names the company', r.name.length > 3);
ok('it identifies the security — ticker, exchange, ISIN', /NSE/.test(r.sub) && /IN[A-Z0-9]{10}/.test(r.sub));
ok('it states a stance in words, not only a score', r.stance.length > 20);
ok('it carries price, base case, upside and the overall score',
   r.tiles.length === 4 && r.tiles.map((t) => t.k).join(',') === 'Price,Base case,Upside,Overall');
ok('no tile is a dash — an absent figure is left out, not padded', r.emptyTiles === 0);
ok('the case is stated in three lines', r.thesis === 3);
ok('what would break the case is stated beside it', r.breakers >= 2);
ok('key statistics are printed', r.hasStats);
ok('key financials are printed', r.hasFin);
ok('the scenario range is printed, not the base case alone', r.hasRange);
ok('the most likely risk is named', r.hasRisk);
ok('the price chart is drawn from the fetched series', r.chart);
ok('page one is full — this was the wasted-space complaint', r.fillPct >= 85);
ok('and does not overflow', r.overflow === false);
/* Every exhibit carries a source line. Tier 0 #3 — the figure-numbering half
   of that item was closed by Tejas's decision to drop "Fig N" prefixes. */
{
  const f = await page.evaluate(() => {
    const figs = [...document.querySelectorAll('figure.fig')];
    return { total: figs.length,
      noSource: figs.filter((x) => !x.querySelector('.fig-s')).length,
      nested: figs.filter((x) => x.querySelector('figure.fig')).length };
  });
  console.log('      ' + f.total + ' figures, ' + f.noSource + ' without a source');
  ok('every exhibit carries a source line', f.total > 0 && f.noSource === 0);
  ok('no figure is nested inside another', f.nested === 0);
}

ok('no render errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0, 3).join('\n      '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
