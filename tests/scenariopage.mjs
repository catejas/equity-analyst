/* The scenario page: a page after Company where the drivers are moved and the
   report is generated on what was chosen.
 *
 * The engine for this has existed for a turn; the point of these assertions is
 * the wiring, which is where it could quietly fail. Three ways it could: the
 * sliders move and the report is built on the untouched payload anyway; the
 * report is built on the scenario but does not say so, which is worse than not
 * offering the feature; or the overrides leak across a company change and a
 * reader ends up valuing one company on another's assumptions. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SRC = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/57d8e52f-attachment.txt';
const raw = fs.readFileSync(SRC, 'utf8');
const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
await page.route('**/api.upstox.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

/* Import sector then company, the two-step flow the app actually requires. */
await page.evaluate(async (j) => {
  const full = JSON.parse(j);
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
}, json);

/* --- the page exists and is reachable --------------------------------- */
ok('a Scenario tab sits in the navigation',
   await page.$eval('nav', (n) => [...n.querySelectorAll('button')].some((b) => b.dataset.tab === 'scenario')));
ok('it comes after Company and before Score Card',
   await page.$eval('nav', (n) => {
     const t = [...n.querySelectorAll('button')].map((b) => b.dataset.tab);
     return t.indexOf('scenario') === t.indexOf('company') + 1 && t.indexOf('scenario') < t.indexOf('score');
   }));

await page.evaluate(() => [...document.querySelectorAll('nav button')]
  .find((x) => x.dataset.tab === 'scenario').click());
await page.waitForTimeout(600);

ok('the scenario page is showing', await page.$eval('#tab-scenario', (el) => !el.classList.contains('hidden')));
ok('the company page is not', await page.$eval('#tab-company', (el) => el.classList.contains('hidden')));

const drv = await page.$$eval('.scn-range', (els) => els.map((e) => ({ key: e.dataset.drv, value: e.value, disabled: e.disabled })));
console.log('      drivers:', drv.map((d) => d.key + '=' + d.value + (d.disabled ? ' (off)' : '')).join(' '));
ok('a slider is drawn for every driver the engine exposes', drv.length === 5);
ok('the sliders start on the values the research assumed',
   await page.evaluate(() => {
     const base = EQ.scenario.baseValues(scenarioSubject().co);
     return EQ.scenario.DRIVERS.every((d) => {
       const el = document.querySelector('.scn-range[data-drv="' + d.key + '"]');
       if (typeof base[d.key] !== 'number') return el.disabled;
       return Math.abs(Number(el.value) - base[d.key] * d.scale) < 0.51;
     });
   }));
ok('the base case is stated in words above them',
   /as researched: volume/.test(await page.$eval('#scnBase', (e) => e.textContent)));

/* --- moving one --------------------------------------------------------- */
await page.evaluate(() => {
  const el = document.querySelector('.scn-range[data-drv="discountRate"]');
  el.value = String(Number(el.value) + 3);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(700);

/* Reliance's own drivers do not tie to its reported revenue, so the honest
   answer on this payload is a refusal whatever the sliders say — and a page
   that printed a confident number here would be the defect the reconciliation
   work exists to stop. The live arithmetic is asserted below, on a company
   whose base year does tie. */
const panel = await page.$eval('#scnResult', (e) => e.textContent.trim());
console.log('      panel:', panel.slice(0, 110));
ok('a company whose base year does not tie is refused, not valued',
   /No value on these assumptions/.test(panel) && /does not tie to reported revenue/.test(panel));
ok('the refusal reads as a sentence', !/assumptions\.\s+[a-z]/.test(panel));

ok('the value moves when the discount rate does, on a model that ties',
   await page.evaluate(() => {
     const c = JSON.parse(JSON.stringify(scenarioSubject().co));
     /* Give it a base year that ties: one sector carrying reported revenue. */
     const rev = c.financials.annual[0].revenue;
     c.sector = 'manufacturing';
     c.model.sectors = [{ name: 'All', baseVolume: 1, baseRealisation: rev,
       volumeCagr: 0.08, realisationCagr: 0.02, grossMargin: 0.3 }];
     /* Reliance's own opex base belongs to the broken model and swamps this
        revenue, driving free cash flow negative — where a HIGHER discount rate
        correctly produces a HIGHER value, which is not the relationship under
        test. Sized to the revenue, the cash flows are positive and the
        ordinary direction holds. */
     c.model.opex = { fixedBase: rev * 0.1, variablePctOfRevenue: 0.05 };
     c.model.financing = Object.assign({}, c.model.financing,
       { openingDebt: 0, repaymentSchedule: 0, drawdownSchedule: 0 });
     const eng = { buildModel: EQ.model.buildModel, dcf: EQ.valuation.dcf };
     const lo = EQ.scenario.evaluate(c, { discountRate: 0.10 }, eng);
     const hi = EQ.scenario.evaluate(c, { discountRate: 0.16 }, eng);
     window.__scn = { lo: lo.perShare, hi: hi.perShare, ok: lo.available && hi.available };
     /* A higher discount rate must produce a lower value. If it does not, the
        chain is not being re-run — it is being re-printed. */
     return lo.available && hi.available && lo.perShare > hi.perShare;
   }));
console.log('      per share at 10% vs 16%:', await page.evaluate(() => window.__scn));

ok('a lender is refused on the same grounds the report refuses it',
   await page.evaluate(() => {
     const c = JSON.parse(JSON.stringify(scenarioSubject().co));
     const rev = c.financials.annual[0].revenue;
     c.sector = 'banking';
     c.model.opex = { fixedBase: rev * 0.1, variablePctOfRevenue: 0.05 };
     c.model.sectors = [{ name: 'All', baseVolume: 1, baseRealisation: rev,
       volumeCagr: 0.08, realisationCagr: 0.02, grossMargin: 0.3 }];
     const r = EQ.scenario.evaluate(c, { discountRate: 0.12 },
       { buildModel: EQ.model.buildModel, dcf: EQ.valuation.dcf });
     return r.available === false && /not computed for a lender/.test(r.reason);
   }));
ok('the moved driver is marked as moved',
   await page.$eval('.scn-drv.moved .scn-lab', (e) => /Discount rate/i.test(e.textContent)));
ok('the page says what the research had assumed instead',
   /Research assumed/.test(await page.$eval('.scn-drv.moved .scn-help', (e) => e.textContent)));
ok('the untouched drivers are not marked',
   (await page.$$('.scn-drv.moved')).length === 1);

/* --- the report is built on it ----------------------------------------- */
const html = await page.evaluate(() => {
  const p = EQDocTools.currentPayload('co1');
  if (!p || !(p.report.full || []).length) return 'NOCOMPANY';
  return EQDocTools.buildHTML(p, 'co1', 'en');
});
ok('a report builds from the scenario page', html !== 'NOCOMPANY' && html.length > 20000);
const body = html.replace(/<script[\s\S]*?<\/script>/g, '');
ok('the report announces that it is a scenario',
   /This report is a scenario, not the research’s own case/.test(body));
ok('it names the driver that was moved', /Discount rate/.test(body));
ok('it prints the research’s figure beside the reader’s',
   /Left column: what the research assumed/.test(body));
ok('the banner appears before the opening narrative',
   body.indexOf('scnban') < body.indexOf('The case, in short')
   || body.indexOf('scnban') < body.indexOf('PILLAR 1'));

/* The numbers below it have to have moved too, or the banner is a label on an
   unchanged document. */
const rebuilt = await page.evaluate(() => {
  const withScn = EQ.buildReport(composedPayload());
  const base = EQ.buildReport(EQ.compose.composePayload(segRecord().data,
    coRecords().map((r) => r.data)));
  const g = (b) => b?.report?.full?.[0]?.model?.model?.summary?.cumulativeFcff ?? null;
  const rate = (b) => b?.report?.full?.[0]?.valuation?.discountRate ?? null;
  return { scn: rate(withScn), base: rate(base), fcffSame: g(withScn) === g(base) };
});
console.log('      discount rate  base', rebuilt.base, '-> scenario', rebuilt.scn);
ok('the engine is actually re-run on the moved assumption', rebuilt.scn !== rebuilt.base);

/* --- reset, and the isolation between companies ------------------------ */
await page.click('#btnScnReset');
await page.waitForTimeout(600);
ok('reset returns to the research’s own assumptions',
   (await page.$$('.scn-drv.moved')).length === 0);
ok('and the report stops calling itself a scenario',
   await page.evaluate(() => {
     const p = EQDocTools.currentPayload('co1');
     return !/This report is a scenario/.test(EQDocTools.buildHTML(p, 'co1', 'en'));
   }));
ok('a scenario survives being written to the device',
   await page.evaluate(() => {
     SCENARIO.overrides = { discountRate: 0.2 }; scenarioSave();
     const held = JSON.parse(localStorage.getItem('eq.scenario'));
     return held && Math.abs(held.overrides.discountRate - 0.2) < 1e-9;
   }));
ok('changing company clears overrides set against another one’s drivers',
   await page.evaluate(() => {
     const sel = document.getElementById('scnCompany');
     sel.dispatchEvent(new Event('change', { bubbles: true }));
     return Object.keys(SCENARIO.overrides).length === 0;
   }));

ok('no page errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0, 4).join('\n      '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
