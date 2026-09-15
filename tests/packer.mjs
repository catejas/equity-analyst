/* The paginator deals blocks onto pages by their own measured heights, because
   the page box grows to fit its content in print and preview and so can never
   report being full. jsdom has no layout at all, so every height is defined
   here explicitly — that is the whole point: it is the only way this code has
   ever been exercised against real numbers. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const BUDGET = 700;
const H = { sec: 30, small: 60, medium: 140, big: 260, huge: 690 };

const render = fs.readFileSync('/home/claude/eqapp/render.js', 'utf8');
const m = /var FILL_AND_TOC = '<script>\(function\(\)\{\\n'([\s\S]*?)\+ '\}\)\(\);<\\\/script>';/.exec(render);
if (!m) { console.log('FAIL: could not extract the paginator from render.js'); process.exit(1); }
const code = m[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith("+ '"))
  .map((l) => l.slice(3).replace(/\\n'$/, '').replace(/'$/, ''))
  .join('\n').replace(/\\n/g, '\n').replace(/\\'/g, "'");

function run(blocks, shells, { laidOut = true, toc = true } = {}) {
  let html = '<!doctype html><html><body>';
  if (toc) html += '<section class="page"><div class="body"><div data-toc></div></div>'
    + '<b class="pgnum">1</b><span class="pgtot">1</span>'
    + '<span class="bstamp">b0</span></section>';
  for (let i = 0; i < shells; i++) {
    html += '<section class="page"><div class="body">';
    if (i === 0) blocks.forEach((b) => { html += `<div class="${b.cls}" data-h="${b.h}">x</div>`; });
    html += '</div><b class="pgnum">1</b><span class="pgtot">1</span>'
      + '<span class="bstamp">b0</span></section>';
  }
  html += '</body></html>';
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const d = dom.window.document;
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
    get() { return Number(this.getAttribute('data-h') || 0); }, configurable: true });
  dom.window.getComputedStyle = () => ({ marginTop: '0', marginBottom: '0' });
  /* the page geometry the paginator reads its budget from */
  for (const el of d.querySelectorAll('.page')) {
    el.getBoundingClientRect = () => ({ height: laidOut ? BUDGET + 12 : 0 });
  }
  try { dom.window.eval('(function(){' + code + '})()'); }
  catch (e) { console.log('   THREW:', e.message); return null; }
  const pages = [...d.querySelectorAll('.page')];
  const tocPage = d.querySelector('[data-toc]') ? d.querySelector('[data-toc]').closest('.page') : null;
  return {
    audit: dom.window.__EQ_PAGINATION || null,
    tocClean: tocPage ? tocPage.querySelectorAll('[data-h]').length === 0 : true,
    pages: pages.length,
    kept: d.querySelectorAll('[data-h]').length,
    fills: pages.map((p) => {
      let t = 0;
      for (const c of p.querySelector('.body').children) t += Number(c.getAttribute('data-h') || 0);
      return Math.round(t / BUDGET * 100);
    }),
    stranded: pages.filter((p) => {
      const kids = [...p.querySelector('.body').children];
      return kids.length === 1 && /(^| )sec( |$)/.test(kids[0].className);
    }).length,
  };
}

let fail = 0;
function check(name, got, want) {
  console.log(name);
  if (!got) { fail = 1; return; }
  console.log(`   pages ${got.pages} | blocks kept ${got.kept}/${want.blocks} | fill ${got.fills.join('%, ')}% | stranded ${got.stranded}`);
  if (got.kept !== want.blocks) { console.log('   FAIL: content lost'); fail = 1; }
  if (got.fills.some((f) => f > 100)) { console.log('   FAIL: a page is overfull, so it clips'); fail = 1; }
  if (got.stranded) { console.log('   FAIL: a heading left alone'); fail = 1; }
  if (want.minPages && got.pages < want.minPages) { console.log(`   FAIL: expected at least ${want.minPages} pages`); fail = 1; }
  if (want.maxPages && got.pages > want.maxPages) { console.log(`   FAIL: expected at most ${want.maxPages} pages`); fail = 1; }
  if (!got.tocClean) { console.log('   FAIL: content was dealt onto the contents page'); fail = 1; }
  if (got.audit) console.log(`   audit: blk${got.audit.blocks}/bud${got.audit.budget}/pg${got.audit.pages} (seeded ${got.audit.seeded}, grew ${got.audit.grew})`);
}

/* the real fault: everything in page one, empty shells after it */
check('twenty blocks in page one, thirty empty shells',
  run(Array.from({ length: 20 }, () => ({ cls: 'para', h: H.medium })), 31),
  { blocks: 20, minPages: 4, maxPages: 5 });

/* more content than seeded shells — it must grow, not truncate */
check('forty blocks, only three shells seeded',
  run(Array.from({ length: 40 }, () => ({ cls: 'para', h: H.medium })), 3),
  { blocks: 40, minPages: 8 });

check('headings stay with their content',
  run(Array.from({ length: 12 }, (_, i) => (i % 2 ? { cls: 'para', h: H.big } : { cls: 'sec', h: H.sec })), 12),
  { blocks: 12 });

check('a block taller than the budget still gets a page',
  run([{ cls: 'para', h: H.small }, { cls: 'para', h: H.huge }, { cls: 'para', h: H.small }], 6),
  { blocks: 3 });

/* When the page reports no geometry the paginator falls back to A4 in pixels
   rather than giving up, so a document still paginates instead of arriving as
   one clipped page. Nothing may be lost on that path either. */
const un = run(Array.from({ length: 8 }, () => ({ cls: 'para', h: H.medium })), 8, { laidOut: false });
console.log('no page geometry: falls back to A4 rather than giving up');
console.log(`   pages ${un.pages} | blocks kept ${un.kept}/8`
  + (un.audit ? ` | audit blk${un.audit.blocks}/bud${un.audit.budget}/pg${un.audit.pages}` : ''));
if (un.kept !== 8) { console.log('   FAIL: content lost when geometry was unavailable'); fail = 1; }
if (un.pages < 2) { console.log('   FAIL: nothing was paginated'); fail = 1; }
if (!un.tocClean) { console.log('   FAIL: content dealt onto the contents page'); fail = 1; }

console.log(fail ? 'PAGINATOR TEST FAILED' : 'paginator deals every block, fills pages, strands no heading');
process.exit(fail);
