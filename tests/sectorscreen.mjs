/* The sector study is about the screen, not about one company.
 *
 * Tejas: "Sector report talks about PNB company which is not in top 3 (top 3
 * here is SBI, Indian bank and Maharashtra bank). Ideally sector should talk
 * about the screening funnel and how many companies are screened and the
 * criteria/basis of selection process of top 3 in the report rather than just
 * naming top 3."
 *
 * The cause was that the screen never reached the report at all. The document
 * had only `full` to work from — the companies that had come back from a full
 * research run — so it named the three from THAT list and then reproduced the
 * whole company report for whichever of them existed. On a Banking run where
 * PNB was the only company researched, a study of twelve public sector banks
 * came out as twenty pages about PNB, which the screen had ranked seventh.
 *
 * This replays that exact case: the Banking sector payload with twelve PSBs,
 * and PNB imported as the company research.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const U = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/';
const read = (f) => { const r = fs.readFileSync(U + f, 'utf8');
  return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); };
const BANK = read('da0c46c1-attachment.txt');
const PNB = read('107fec97-attachment.txt');

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
page.on('dialog', (d) => d.accept());
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
await page.route('**/assets.upstox.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const r = await page.evaluate(async (P) => {
  const sleep = (m) => new Promise((s) => setTimeout(s, m));
  const imp = async (obj) => {
    document.getElementById('importText').value = JSON.stringify(obj);
    document.getElementById('btnDoImport').click(); await sleep(500);
    document.getElementById('btnSaveImport').click(); await sleep(2500);
  };
  const tab = (t) => [...document.querySelectorAll('nav button')].find((x) => x.dataset.tab === t)?.click();
  tab('sector');
  document.getElementById('btnImport').click();
  await imp(Object.assign({}, P.BANK, { companies: [] }));
  tab('company'); await sleep(300);
  document.querySelector('.co-import[data-rank="1"]')?.click(); await sleep(300);
  await imp({ run: P.BANK.run, companies: P.PNB.companies });

  const p = window.EQDocTools.currentPayload('sector');
  const html = p ? window.EQDocTools.buildHTML(p, 'sector', 'en') : '';
  const sc = p && p.report && p.report.screen;
  return {
    screen: sc ? {
      counts: sc.counts,
      nominated: sc.top3.map((x) => x.name),
      ranked: sc.ranked.length,
      pnbRank: (sc.ranked.find((x) => x.symbol === 'PNB') || {}).rank || null,
    } : null,
    html,
  };
}, { BANK, PNB });

await b.close();

let fail = 0, ran = 0;
const ok = (label, pass, detail) => {
  ran++; if (!pass) fail++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

if (!r.screen) {
  console.log('FAIL  the composed run carries no screen at all — this is the original defect');
  process.exit(1);
}

const h = r.html;
const NOMINATED = ['State Bank of India', 'Indian Bank', 'Bank of Maharashtra'];

ok('the screen reaches the report', r.screen.ranked === 12, `${r.screen.ranked} ranked`);
ok('and nominates the three the ratings support',
  NOMINATED.every((n) => r.screen.nominated.includes(n)), r.screen.nominated.join(', '));
ok('PNB is not one of them', !r.screen.nominated.includes('Punjab National Bank'),
  `PNB ranks ${r.screen.pnbRank} of 12`);

/* The document itself. */
ok('the cover names the screen\'s three, not the researched one',
  NOMINATED.every((n) => h.includes(n)));
ok('it states the basis of selection', /rated 0-100 on four pillars against the same written/.test(h));
ok('it shows the weight each pillar carries in the screen', /Weight in the screen/.test(h));
ok('it ranks the whole shortlist', /The screen, ranked/i.test(h));
ok('it gives the evidence behind every nominated rating', /The evidence behind it/.test(h));
ok('it says what the screen actually separated', /did most of the separating/.test(h));
ok('the funnel counts the screen, not the one researched company',
  /Shortlisted and rated/.test(h) && /Nominated for full research/.test(h));

/* And the thing that made it a company report: PNB's own sections. A brief is
   fine and is the point; twenty sections of one company is the defect. */
const pnbSections = (h.match(/Punjab National Bank —|PNB —/g) || []).length;
ok('the researched company gets a brief, not a second company report',
  pnbSections <= 2, `${pnbSections} PNB section heading(s)`);
ok('and is labelled as research, not as a nomination',
  /what the full research found/i.test(h));
ok('with its screen rating set against its researched rating',
  /On the screen/.test(h) && /On full research/.test(h));

if (errs.length) { console.log('  page errors: ' + errs.slice(0, 3).join(' | ')); fail++; }
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
