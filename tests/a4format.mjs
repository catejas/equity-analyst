/* Build 21 — the professional A4 format.
 *
 * Tejas: "proper A4 page setup, no data overflow, heading and sub-heading are
 * properly highlighted with one font size bigger and in bold letters. Footer
 * disclaimer Note, methods, glossary, references must be in small font size.
 * Footer must be same at all pages and in all reports. Graphs are all properly
 * populated with appropriate description heading of x and y axis and what it
 * means for reader with short commentary on charts."
 *
 * Each sentence of that is a check below, run on every document the app
 * writes: the sector report, the executive summary, all three company
 * reports and the score card. The PDF itself is written through the app's own
 * vector writer and its sheet size is read back.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

let fail = 0, ran = 0;
const ok = (label, pass, detail) => {
  ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

const KINDS = ['sector', 'exec', 'co1', 'co2', 'co3', 'score'];
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const feet = {};
for (const kind of KINDS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) { ok(`${kind}: document generated`, false, 'run gen-fixtures first'); continue; }
  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.setContent(fs.readFileSync(f, 'utf8'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]);
    const pages = [...document.querySelectorAll('.page')];
    const mm = (v) => v / (96 / 25.4);
    const heights = pages.map((pg) => Math.round(mm(pg.getBoundingClientRect().height)));
    const widths = pages.map((pg) => Math.round(mm(pg.getBoundingClientRect().width)));
    const over = pages.map((pg, i) => {
      const bd = pg.querySelector('.body');
      return bd && bd.scrollHeight > bd.clientHeight + 2 ? i + 1 : 0; }).filter(Boolean);
    /* Wider than the page is the other half of "no data overflow". */
    const wideKids = [];
    pages.forEach((pg, i) => {
      const bd = pg.querySelector('.body'); if (!bd) return;
      const right = bd.getBoundingClientRect().right + 1;
      bd.querySelectorAll('table, figure, svg, img').forEach((el) => {
        if (el.getBoundingClientRect().right > right) wideKids.push((i + 1) + ':' + el.tagName);
      });
    });
    const foot = pages.map((pg) => {
      const f = pg.querySelector('.rf');
      if (!f) return null;
      return [...f.children].map((c) => c.className).join('|') + '#' + (pg.querySelector('.rfn') ? 'disc' : '');
    });
    const footTxt = pages.map((pg) => {
      const f = pg.querySelector('.rf'); return f ? f.firstElementChild.textContent.trim() : ''; });
    const discPt = pages.map((pg) => { const d = pg.querySelector('.rfn'); return d ? px(d, 'fontSize') * 0.75 : 0; });
    /* Body text, and the headings against it. */
    const bodyP = document.querySelector('.body p');
    const bodyPt = bodyP ? px(bodyP, 'fontSize') * 0.75 : 0;
    const secs = [...document.querySelectorAll('.sec .ti')].map((el) => ({
      pt: px(el, 'fontSize') * 0.75, w: Number(getComputedStyle(el).fontWeight) }));
    const subs = [...document.querySelectorAll('.body h4')].map((el) => ({
      pt: px(el, 'fontSize') * 0.75, w: Number(getComputedStyle(el).fontWeight) }));
    /* Back matter in small type. */
    const fine = [...document.querySelectorAll('.fine p, .fine li, .fine td')].map((el) => px(el, 'fontSize') * 0.75);
    /* Every chart: titled, units on the value axis, a reading for the reader. */
    const figs = [...document.querySelectorAll('figure.fig')].filter((f) => f.querySelector('svg'));
    const figBad = figs.filter((f) => {
      const inline = f.classList.contains('inline');
      const title = f.querySelector('.fig-t');
      const reading = f.querySelector('.fig-n');
      return (!inline && (!title || !title.textContent.trim())) || !reading || reading.textContent.trim().length < 25;
    }).map((f) => (f.querySelector('.fig-t') || {}).textContent || '(untitled)');
    /* A chart's text must be legible once printed: no axis label under 6pt. */
    const tiny = [];
    figs.forEach((f) => {
      const svg = f.querySelector('svg'); const vb = svg.viewBox && svg.viewBox.baseVal;
      if (!vb || !vb.width) return;
      const scale = svg.getBoundingClientRect().width / vb.width;
      svg.querySelectorAll('text').forEach((t) => {
        const pt = px(t, 'fontSize') * scale * 0.75;
        if (pt < 5.9) tiny.push(((f.querySelector('.fig-t') || {}).textContent || 'inline').slice(0, 30) + ' ' + pt.toFixed(1));
      });
    });
    /* A heading stranded at the foot of a page. */
    const strand = [];
    pages.forEach((pg, i) => {
      const box = pg.querySelector('.ir-box,.sc-main,.sc-spill'); if (!box) return;
      let el = box.lastElementChild;
      while (el && el.lastElementChild && !/^(H[1-6]|TABLE|FIGURE|UL|P)$/.test(el.tagName)
        && !/(sec|ir-sub|note)/.test(el.className)) el = el.lastElementChild;
      if (el && (/^H[1-6]$/.test(el.tagName) || /\b(sec|ir-sub|ir-grp)\b/.test(el.className))) strand.push(i + 1);
    });
    const unitless = figs.filter((f) => {
      const t = [...f.querySelectorAll('svg text')].map((x) => x.textContent);
      /* A timeline or a value chain has no value axis, so no unit to state:
         only a chart with numeric tick labels is held to this. */
      if (!t.some((s) => /^[-+]?[\d,]+(\.\d+)?$/.test(s.trim()))) return false;
      return !t.some((s) => /^\(.+\)$/.test(s.trim()) || /%|₹|x$|×|Crs|share|year|companies|points|score/i.test(s));
    }).map((f) => (f.querySelector('.fig-t') || {}).textContent || 'inline');
    return { n: pages.length, heights, widths, over, wideKids, foot, footTxt, discPt, bodyPt, secs, subs,
      fine, figs: figs.length, figBad, tiny, strand, unitless,
      paired: document.querySelectorAll('figure.figrow').length };
  });
  console.log(`${kind}: ${r.n} pages, ${r.figs} charts`);
  ok(`${kind}: every page is A4, 210 × 297 mm`,
    r.heights.every((h) => h === 297) && r.widths.every((w) => w === 210),
    [...new Set(r.heights)].join(',') + ' / ' + [...new Set(r.widths)].join(','));
  ok(`${kind}: nothing runs off the foot of a page`, r.over.length === 0, r.over.join(','));
  ok(`${kind}: nothing runs off the side of a page`, r.wideKids.length === 0, r.wideKids.slice(0, 4).join(','));
  ok(`${kind}: every page carries the same footer`,
    r.foot.every((f) => f && f === r.foot[0]), r.foot[0]);
  ok(`${kind}: the footer names the document on every page`,
    r.footTxt.every((t) => t && t === r.footTxt[0]), r.footTxt[0]);
  ok(`${kind}: the disclaimer note is in small type`, r.discPt.every((v) => v > 0 && v <= 6.5),
    [...new Set(r.discPt.map((v) => v.toFixed(1)))].join(','));
  if (r.bodyPt) ok(`${kind}: running text is 9pt`, Math.abs(r.bodyPt - 9) < 0.3, r.bodyPt.toFixed(1));
  if (r.secs.length) ok(`${kind}: section headings are bold and larger than the text`,
    r.secs.every((s) => s.w >= 600 && s.pt >= 10), r.secs.map((s) => s.pt.toFixed(1)).slice(0, 3).join(','));
  if (r.subs.length) ok(`${kind}: sub-headings are bold and a size above the text`,
    r.subs.every((s) => s.w >= 600 && s.pt >= 9.5), r.subs.map((s) => s.pt.toFixed(1)).slice(0, 3).join(','));
  if (r.fine.length) ok(`${kind}: method, glossary, sources and gaps are in small type`,
    r.fine.every((v) => v <= 7.6), Math.max(...r.fine).toFixed(1) + 'pt largest');
  ok(`${kind}: every chart has a title and a reading for the reader`, r.figBad.length === 0, r.figBad.join(' | '));
  ok(`${kind}: every chart states its unit`, r.unitless.length === 0, r.unitless.join(' | '));
  ok(`${kind}: no chart text prints below 6pt`, r.tiny.length === 0, r.tiny.slice(0, 4).join(' | '));
  ok(`${kind}: no heading is stranded at the foot of a page`, r.strand.length === 0, r.strand.join(','));
  feet[kind] = r.foot[0];
  await p.close();
}
/* "Footer must be same at all pages and in all reports." */
const shapes = new Set(Object.values(feet));
ok('the footer has the same shape in every document', shapes.size === 1, [...shapes].join(' / '));

/* The PDF sheet itself. */
{
  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.setContent(fs.readFileSync('/tmp/doc-exec.html', 'utf8'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  for (const src of ['vendor/jspdf.umd.min.js', 'vendor/fonts/eqfont.js', 'vecpdf.js'])
    await p.addScriptTag({ content: fs.readFileSync(src, 'utf8') });
  const sz = await p.evaluate(async () => {
    const blob = await window.EQVecPdf.writePdf(document, '.page');
    const txt = await blob.text();
    const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(txt);
    return m ? [Number(m[1]), Number(m[2])] : null;
  });
  ok('the PDF is written on A4 sheets (595 × 842 pt)',
    sz && Math.abs(sz[0] - 595.3) < 2 && Math.abs(sz[1] - 841.9) < 2, sz && sz.join(' × '));
  await p.close();
}
await b.close();
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
