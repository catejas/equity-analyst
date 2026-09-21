/* The defects marked up on the PNB report, each asserted against a document
   built from the payload that produced it. A bank is the right test case:
   several of these are "a measure that does not apply printed as 0.0". */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SRC = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/2f13d57b-PNB_gemini-code-1789969768806.json';
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
await page.route('**/api.upstox.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const html = await page.evaluate(async (json) => {
  const full = JSON.parse(json);
  const co = full.companies[0];
  const sectorOnly = Object.assign({}, full, { companies: [] });
  const imp = async (obj) => {
    document.getElementById('importText').value = JSON.stringify(obj);
    document.getElementById('btnDoImport').click();
    await new Promise((s) => setTimeout(s, 500));
    document.getElementById('btnSaveImport').click();
    await new Promise((s) => setTimeout(s, 1800));
  };
  const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();
  tab('sector');
  document.getElementById('btnImport').click();
  await imp(sectorOnly);
  tab('company');
  await new Promise((s) => setTimeout(s, 300));
  document.querySelector('.co-import[data-rank="1"]')?.click();
  await new Promise((s) => setTimeout(s, 300));
  await imp({ run: sectorOnly.run, companies: [co] });
  const p = window.EQDocTools.currentPayload();
  if (!p || !(p.report.full || []).length) return 'NOCOMPANY';
  return window.EQDocTools.buildHTML(p, 'co1', 'en');
}, fs.readFileSync(SRC, 'utf8'));

fs.writeFileSync('/tmp/pnb-co1.html', html);
let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };
const body = html.replace(/<script[\s\S]*?<\/script>/g, '');

ok('report built from the PNB payload', html !== 'NOCOMPANY' && html.length > 20000);

/* --- figure captions and headings ------------------------------------- */
ok('no "Fig N" prefix on captions', !/<b>Fig \d+<\/b>/.test(body));
/* Four builders had their output wrapped in figure() a second time, which
   produced a figure inside a figure: two captions, the counter advanced twice,
   and an inner figure carrying no source line. */
ok('no figure is nested inside another figure',
   !/<figure class="fig[^>]*>(?:(?!<\/figure>)[\s\S])*?<figure class="fig/.test(body));
ok('headings are Title Case', /Sum of the Parts/.test(body) && /Pay and Alignment/.test(body));
ok('no sentence-case heading left', !/>Return on capital, deconstructed</.test(body));

/* --- years, not Y1..Y5 -------------------------------------------------- */
ok('forecast years are named, not Y1', !/>Y1</.test(body) && /FY27E/.test(body));
ok('projected years are marked with E', /FY2\dE/.test(body));

/* --- the instruction text must not be in the payload or the report ----- */
ok('no instruction text leaked into the document', !/RECONCILIATION RULE/.test(body));

/* --- values that do not apply --------------------------------------- */
ok('the subject company has its own peer figures',
   /Punjab National Bank<\/b><\/td>[\s\S]{0,400}?7\.9|Punjab National Bank<\/b><\/td>[\s\S]{0,400}?12\.8/.test(body));
ok('EV\\/EBITDA of zero is not printed as 0.0 for a bank', !/>0\.0</.test(body));
ok('no false "growth adds value" off a zero spread', !/0\.0 points above the cost/.test(body));
ok('capital-cycle section suppressed when it is all zeros', !/The Capital Cycle/.test(body));

/* --- the panels added after the markup --------------------------------- */
ok('three-statement table is printed', /The Three Statements, as Reported/i.test(body)
   && /Income statement/i.test(body) && /Balance sheet/i.test(body) && /Cash flow/i.test(body));
{
  const at = body.indexOf('The Three Statements, as Reported');
  const head = at >= 0 ? body.slice(at, at + 1600) : '';
  const cols = (head.match(/FY\d{2}E?/g) || []);
  console.log('      statement columns:', cols.join(' '));
  ok('reported and forecast years appear together',
     cols.some(x => !/E$/.test(x)) && cols.some(x => /E$/.test(x)));
  ok('at least five years in the statement', cols.length >= 5);
  ok('a thin history is called out',
     /three are needed before the cash flow shows a trend/.test(body));
}
/* Scope the order check to the statements table's own header row. FY25 and
   FY26 appear all over the document, so a global indexOf proves nothing. */
{
  const at = body.indexOf('The Three Statements, as Reported');
  const head = at >= 0 ? body.slice(at, at + 1200) : '';
  const cols = (head.match(/FY\d{2}/g) || []);
  ok('the statements run oldest year first',
     cols.length >= 2 ? cols[0] < cols[1] : cols.length === 1);
  if (cols.length >= 2 && !(cols[0] < cols[1])) console.log('      column order:', cols.join(' '));
}
ok('base rates hold the forecast against the outside view',
   /Base Rates — the Outside View/i.test(body) && /comparable cases/.test(body));
ok('a thin base rate is called out', /one company in four/i.test(body));
ok('risk matrix drawn', /likelihood against what it would cost/i.test(body));
/* A bank has no free-cash-flow grid to read: deposits are its funding, not
   debt to net off, so the discounted value and everything hanging off it is
   withheld. What the report owes the reader there is the reason, not a grid. */
ok('no discounted cash-flow grid is printed for a lender',
   !/Each cell is the value per share/.test(body));
ok('the lender suppression states its reason',
   /not computed for a lender/i.test(body) && /Deposits are the funding a bank runs on/.test(body));
ok('the football field is read for the reader',
   /Each bar is the range one method produces/.test(body));
ok('the scatters are drawn at half height', /max-height:96px/.test(body));

/* --- the five pillars -------------------------------------------------- */
{
  const PILLARS = ['PILLAR 1', 'PILLAR 2', 'PILLAR 3', 'PILLAR 4', 'PILLAR 5'];
  const missing = PILLARS.filter((x) => !body.includes(x));
  ok('all five pillars are printed', missing.length === 0);
  if (missing.length) console.log('      missing:', missing.join(' '));
  /* in order, and each one before the next */
  const at = PILLARS.map((x) => body.indexOf(x));
  ok('the pillars appear in order', at.every((v, i) => i === 0 || v > at[i - 1]));
  /* the accounts must now sit inside the financial pillar, not after Peers */
  const p3 = body.indexOf('PILLAR 3'), p4 = body.indexOf('PILLAR 4');
  const stmts = body.indexOf('The Three Statements, as Reported');
  ok('the statements sit inside the financial pillar', stmts > p3 && stmts < p4);
  const wacc = body.indexOf('How the Discount Rate Is Built');
  const p5 = body.indexOf('PILLAR 5');
  ok('the discount-rate buildup sits inside the valuation pillar', wacc > p4 && wacc < p5);
}
/* --- the commentary layer --------------------------------------------- */
{
  /* Sentence case in the source; the stylesheet renders them uppercase. These
     are not section headings, so they do not go through secTitleCase. */
  const SAYS = ['What the score rests on', 'What the accounting tests found',
    'Why this company cannot enter the Top 3', 'What the forecast assumes',
    'What the valuation is saying', 'What the multibagger tests establish'];
  const missing = SAYS.filter((x) => !body.includes(x));
  ok('every commentary block is printed', missing.length === 0);
  if (missing.length) console.log('      missing:', missing.join(' | '));

  /* The point of the layer is that it is specific. Each of these is a figure
     only this company's engine run produced. */
  ok('the score commentary names the pillars and the spread',
     /Business quality is the strongest at 77\.3/.test(body));
  ok('the forensic commentary names the tests that ran',
     /13 of 15 accounting tests/.test(body));
  /* PNB used to carry a SEVERE accounting flag, because contingent liabilities
     above half of net worth is severe — for a manufacturer. For a bank,
     guarantees and letters of credit ARE the business and run to several times
     net worth at every healthy institution. That threshold barred all three
     banks in a sub-sector run and emptied the Top 3, so lenders are now
     measured against a lender's threshold. The commentary therefore takes the
     non-severe branch, which is the correct reading of a clean bank. */
  ok('the forensic commentary reads a flag as a reason to read the note, '
     + 'not as a bar',
     /reason to read the note/.test(body));
  ok('and no severe accounting finding is raised against a bank for holding '
     + 'ordinary guarantees',
     !/bars the company from the Top 3 on its own/.test(body));
  ok('the model commentary states whether the base year reconciles',
     /base year ties to the 147,?017 of revenue|base year ties to the 147017 of revenue/.test(body));
  ok('the reconciliation line names the figure it tied to, not a count of self-checks',
     /The base year ties to reported revenue of/.test(body)
     && !/reconciliation checks pass/.test(body));
  ok('the valuation commentary reads the range against the price',
     /base case puts the business at 145 against a price of 117\.39/.test(body));
  ok('the multibagger commentary names failures in words, not keys',
     /revenue growth, return on equity, debt/.test(body) && !/revenueGrowth,/.test(body));
}

/* --- the narrative through-line --------------------------------------- */
{
  ok('the report opens with the case in short', /The case, in short/.test(body));
  ok('the opening states what the market believes', /The market believes/.test(body));
  ok('the opening names the claims the case rests on', /The case rests on 3 claims/.test(body));
  ok('the opening prices the base case against the market',
     /worth 145 against a price of 117\.39/.test(body));
  ok('the opening names the risk that matters most',
     /Systemic Deposit War — 60% likely/.test(body));
  ok('a proper name keeps its capital in narrative prose',
     !/is systemic Deposit War/.test(body));
  ok('the report closes on what would change the conclusion',
     /What would change this conclusion/.test(body));
  ok('every pillar carries a bridge', (body.match(/class="bridgebox"/g) || []).length === 5);
}

ok('growth is computed forwards, not backwards',
   !/-6\.1% compound/.test(body) && /6\.5% compound/.test(body));

await page.close();

/* --- layout: the overlap and the orphan heading ------------------------ */
const lay = await (async () => {
  const p2 = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  const e2 = [];
  p2.on('pageerror', (e) => e2.push(e.message.split('\n')[0]));
  await p2.setContent(html, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(900);
  const r = await p2.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')];
    const over = [], orphan = [], narrow = [];
    pages.forEach((pg, i) => {
      const box = pg.querySelector('.ir-box');
      if (box && box.scrollHeight > box.clientHeight + 2) over.push(i + 1);
      /* a heading with nothing under it on the same page */
      [...pg.querySelectorAll('.sec')].forEach((sc) => {
        const r0 = sc.getBoundingClientRect();
        const pr = pg.getBoundingClientRect();
        if (pr.bottom - r0.bottom < 18) orphan.push(i + 1);
      });
      /* a label column crushed to nothing is what produced the overlap */
      [...pg.querySelectorAll('table.kv td:first-child')].forEach((td) => {
        if (td.getBoundingClientRect().width < 40) narrow.push(i + 1);
      });
    });
    return { pages: pages.length, over, orphan, narrow, figs: document.querySelectorAll('figure.fig').length };
  });
  await p2.close();
  return { ...r, e2 };
})();

console.log('      ' + lay.pages + ' pages, ' + lay.figs + ' figures');
ok('no box overflow', lay.over.length === 0);
ok('no heading orphaned at a page foot', lay.orphan.length === 0);
ok('no label column crushed (the overlap)', lay.narrow.length === 0);
ok('no render errors', errs.length === 0 && lay.e2.length === 0);
if (lay.over.length) console.log('      overflow pages:', lay.over.join(' '));
if (lay.orphan.length) console.log('      orphan headings on pages:', lay.orphan.join(' '));
if (lay.narrow.length) console.log('      crushed label column on pages:', lay.narrow.join(' '));
if (errs.length) console.log('      ' + errs.slice(0, 3).join('\n      '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
