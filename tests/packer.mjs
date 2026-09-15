/* jsdom has no layout, so scrollHeight is always 0 and the packer believes
   everything fits — which is why none of my tests ever caught a pagination
   fault. This gives every element a real height and runs the shipped fill pass
   against it. It tests the algorithm, not the browser's rendering: the page
   count on a device can still differ, but "does it fill, and does it strand a
   heading" is answered here. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE_H = 700;            // usable body height, points
const HEIGHTS = { sec: 30, small: 60, medium: 140, big: 260 };

function build(blocks) {
  const pages = blocks.map(() => null); // one page per block to start: worst case
  let html = '<!doctype html><html><body>';
  // deliberately pathological: every block on its own page, as a forward-only
  // spill would leave it
  blocks.forEach((b) => {
    html += `<div class="page"><div class="body"><div class="${b.cls}" data-h="${b.h}">${b.cls}</div></div></div>`;
  });
  html += '</body></html>';
  return html;
}

function measure(dom) {
  const { window: w } = dom;
  const d = w.document;
  // body height is the sum of its children's declared heights
  for (const el of d.querySelectorAll('.body')) {
    Object.defineProperty(el, 'clientHeight', { get: () => PAGE_H, configurable: true });
    Object.defineProperty(el, 'scrollHeight', {
      get() {
        let t = 0;
        for (const c of this.children) t += Number(c.getAttribute('data-h') || 0);
        return t;
      },
      configurable: true,
    });
  }
}

/* the fill pass exactly as it ships */
const render = fs.readFileSync('/home/claude/eqapp/render.js', 'utf8');
const m = /var FILL_AND_TOC = '<script>\(function\(\)\{\\n'([\s\S]*?)\+ '\}\)\(\);<\\\/script>';/.exec(render);
if (!m) { console.log('FAIL: could not extract the fill pass from render.js'); process.exit(1); }
const body = m[1].split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith("+ '"))
  .map((l) => l.slice(3).replace(/\\n'$/, '').replace(/'$/, ''))
  .join('\n')
  .replace(/\\n/g, '\n').replace(/\\'/g, "'");

const cases = [
  { name: 'many small blocks that should coalesce',
    blocks: Array.from({ length: 12 }, () => ({ cls: 'para', h: HEIGHTS.small })) },
  { name: 'headings followed by content',
    blocks: Array.from({ length: 6 }, (_, i) => (i % 2 ? { cls: 'para', h: HEIGHTS.medium } : { cls: 'sec', h: HEIGHTS.sec })) },
  { name: 'one block too tall to move',
    blocks: [{ cls: 'para', h: HEIGHTS.small }, { cls: 'para', h: 690 }, { cls: 'para', h: HEIGHTS.small }] },
];

let fail = 0;
for (const c of cases) {
  const dom = new JSDOM(build(c.blocks), { runScripts: 'outside-only' });
  measure(dom);
  const before = dom.window.document.querySelectorAll('.page').length;
  try { dom.window.eval('(function(){' + body + '})()'); } catch (e) { console.log('  THREW:', e.message); fail = 1; }
  const after = [...dom.window.document.querySelectorAll('.page')];
  const fills = after.map((p) => {
    const b = p.querySelector('.body');
    let t = 0; for (const ch of b.children) t += Number(ch.getAttribute('data-h') || 0);
    return Math.round(t / PAGE_H * 100);
  });
  const stranded = after.filter((p) => {
    const b = p.querySelector('.body');
    const kids = [...b.children].filter((k) => k.className !== 'grow');
    return kids.length === 1 && kids[0].className === 'sec';
  }).length;
  console.log(`${c.name}`);
  console.log(`   pages ${before} -> ${after.length} | fill ${fills.join('%, ')}% | headings stranded: ${stranded}`);
  if (after.length >= before && c.blocks.length > 3) { console.log('   FAIL: nothing was packed'); fail = 1; }
  if (stranded) { console.log('   FAIL: a heading was left alone on a page'); fail = 1; }
}
/* The real shape of the fault: every block in page one's box, thirty empty
   shells after it. Nothing distributed it, so the content was clipped and the
   empty shells were deleted — a forty-page report came out as two pages. */
{
  const blocks = Array.from({ length: 20 }, () => ({ cls: 'para', h: HEIGHTS.medium }));
  let html = '<!doctype html><html><body><div class="page"><div class="body">';
  blocks.forEach((b) => { html += `<div class="${b.cls}" data-h="${b.h}">${b.cls}</div>`; });
  html += '</div></div>';
  for (let i = 0; i < 30; i++) html += '<div class="page"><div class="body"></div></div>';
  html += '</body></html>';
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  measure(dom);
  try { dom.window.eval('(function(){' + body + '})()'); } catch (e) { console.log('THREW:', e.message); fail = 1; }
  const after = [...dom.window.document.querySelectorAll('.page')];
  const kept = dom.window.document.querySelectorAll('.para').length;
  const fills = after.map((p) => {
    const b = p.querySelector('.body');
    let t = 0; for (const ch of b.children) t += Number(ch.getAttribute('data-h') || 0);
    return Math.round(t / PAGE_H * 100);
  });
  console.log('everything dumped in page one, thirty empty shells after');
  console.log(`   pages 31 -> ${after.length} | blocks kept ${kept} of 20 | fill ${fills.join('%, ')}%`);
  if (kept !== 20) { console.log('   FAIL: content was lost'); fail = 1; }
  if (after.length < 3) { console.log('   FAIL: 20 blocks of 140pt cannot fit two 700pt pages'); fail = 1; }
  if (fills.some((f) => f > 100)) { console.log('   FAIL: a page is overfull, so its content is clipped'); fail = 1; }
}

/* The regression that produced a one-page report: in the staging iframe the
   script runs before layout, every box reports zero height, and a box with no
   height looks like a box with infinite room. */
{
  const dom = new JSDOM(build(Array.from({ length: 8 }, () => ({ cls: 'para', h: HEIGHTS.medium }))),
    { runScripts: 'outside-only' });
  // deliberately NOT measured: clientHeight stays 0, as before layout
  const before = dom.window.document.querySelectorAll('.page').length;
  try { dom.window.eval('(function(){' + body + '})()'); } catch (e) { console.log('THREW:', e.message); fail = 1; }
  const after = dom.window.document.querySelectorAll('.page').length;
  const blocks = dom.window.document.querySelectorAll('.para').length;
  console.log('an unlaid-out document is left alone');
  console.log(`   pages ${before} -> ${after} | blocks kept ${blocks} of 8`);
  if (after !== before || blocks !== 8) {
    console.log('   FAIL: the packer touched a document it could not measure');
    fail = 1;
  }
}

console.log(fail ? 'PACKER TEST FAILED' : 'packer fills pages, strands no headings, and leaves an unmeasured document alone');
process.exit(fail);
