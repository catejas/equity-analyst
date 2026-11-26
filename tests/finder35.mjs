/* Build 35: the price check and the follow-up, from Tejas's real replies of
 * 26-11-2026. The research tool said the app "isn't saving" its EPS and kept
 * asking for it. Replayed, the merge kept every figure; the repeated ask came
 * from the app's own price check failing (too many requests at once) and
 * being reported as missing EPS, and from one company's search-log entry
 * marking a 41-sector item as searched. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';
import * as F from '../src/core/finder.js';
import { mergeTopUp, completeness, topUpPrompt } from '../src/core/completeness.js';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const nowait = () => Promise.resolve();

console.log('\nPolite fetching');
{
  let active = 0, peak = 0, calls = 0;
  const slow = async () => { active++; peak = Math.max(peak, active); calls++; await new Promise((r) => setTimeout(r, 5)); active--; return [1]; };
  const f = F.politeFetch(slow, { limit: 4, sleep: nowait });
  await Promise.all(Array.from({ length: 30 }, () => f('k')));
  ok('thirty requests run four at a time', peak === 4 && calls === 30, `peak ${peak}`);
  let n = 0;
  const flaky = async () => { n++; if (n < 3) throw new Error('Upstox HTTP 429'); return ['ok']; };
  const r = await F.politeFetch(flaky, { sleep: nowait })('k');
  ok('a request refused for too many requests (429) is tried again, and succeeds on the third try', r[0] === 'ok' && n === 3, n);
  let m = 0;
  const gone = async () => { m++; throw new Error('Upstox HTTP 404'); };
  let threw = false; try { await F.politeFetch(gone, { sleep: nowait })('k'); } catch (e) { threw = true; }
  ok('a not-found (404) is not tried again', threw && m === 1, m);
  let t = 0;
  const net = async () => { t++; const e = new Error('Failed to fetch'); e.name = 'TypeError'; throw e; };
  try { await F.politeFetch(net, { sleep: nowait, tries: 3 })('k'); } catch (e) { /* expected */ }
  ok('a dropped connection is tried three times in all', t === 3, t);
}

console.log('\nPricing the companies, with reasons');
const monthly = (from, n, px) => Array.from({ length: n }, (_, i) => { const d = new Date(from + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + i);
  return { date: d.toISOString().slice(0, 10), c: typeof px === 'function' ? px(i) : px }; });
const eps5 = [{ fy: 'FY22', eps: 10 }, { fy: 'FY23', eps: 10 }, { fy: 'FY24', eps: 10 }, { fy: 'FY25', eps: 10 }, { fy: 'FY26', eps: 10 }];
const screen = () => ({ schema: 'equity-analyst/5', run: { kind: 'sectorScreen' }, benchmark: { name: 'Nifty 50' },
  sectors: [{ name: 'Aviation', bellwethers: [{ symbol: 'AAA', eps: eps5, epsTtm: 10 }, { symbol: 'BBB', eps: eps5, epsTtm: 10 }, { symbol: 'CCC', eps: eps5 }] }] });
{
  const d = screen();
  /* AAA priced at 200 → P/E 20 against 20 a year; BBB refused every time;
     CCC listed 14 months ago. */
  const fb = async (k, o) => {
    if (!o || o.unit !== 'months') throw new Error('no weekly');
    if (k.endsWith('BBB')) throw new Error('Upstox HTTP 429');
    if (k.endsWith('CCC')) return monthly('2025-09-01', 14, 200);
    return monthly('2020-11-01', 72, 200);
  };
  const v = await F.verifyReturns(d, { fetchBars: fb, keyFor: (s) => 'NSE_EQ|' + s, sleep: nowait });
  const va = v.valuation.aviation;
  ok('the sector is valued from the company that could be priced', va && va.of === 'AAA' && va.pe === 20, JSON.stringify(va && { pe: va.pe, of: va.of }));
  const why = v.valuationWhy.aviation || [];
  ok('BBB carries its reason: the price feed refused (HTTP 429)', why.some((w) => w.symbol === 'BBB' && /HTTP 429/.test(w.why)), JSON.stringify(why));
  ok('CCC carries its reason: too few months of prices', why.some((w) => w.symbol === 'CCC' && /months of prices/.test(w.why)));

  /* The next check cannot reach the feed at all: AAA keeps its P/E from the
     last check, because its EPS has not changed. */
  const v2 = await F.verifyReturns(d, { fetchBars: async () => { throw new Error('Failed to fetch'); }, keyFor: (s) => 'NSE_EQ|' + s, sleep: nowait, previous: v });
  ok('a company priced before keeps its P/E when the feed fails, on the same EPS', v2.valuation.aviation && v2.valuation.aviation.pe === 20
    && v2.valuation.aviation.companies[0].carried === true);
  d.sectors[0].bellwethers[0].eps = eps5.map((e) => ({ ...e, eps: 20 }));
  const v3 = await F.verifyReturns(d, { fetchBars: async () => { throw new Error('Failed to fetch'); }, keyFor: (s) => 'NSE_EQ|' + s, sleep: nowait, previous: v });
  ok('but not once its EPS has changed', !v3.valuation.aviation && v3.valuationFailed.includes('Aviation'));

  /* The follow-up after a failed pricing. */
  d.verified = v3;
  const c = F.finderChecks(d).find((x) => x.label.startsWith('P/E'));
  ok('EPS already sent is not asked again', !/Missing: [^.]*Aviation/.test(c.ask) && /Do NOT send EPS again for Aviation/.test(c.ask));
  ok('the app shows its own reason and says to check prices again', /Aviation \(the app could not price[^)]*Check prices again/.test(c.detail), c.detail.slice(0, 160));
  ok('the item is the app’s, not the tool’s', c.appOnly === true);
  d.sectors[0].bellwethers = [{ symbol: 'AAA', eps: eps5.slice(0, 2) }];
  const c2 = F.finderChecks(d).find((x) => x.label.startsWith('P/E'));
  ok('a company with under three years of EPS is still asked, by symbol', /Missing: Aviation \(EPS history of AAA\)/.test(c2.ask));
}

console.log('\nThe search record, sector by sector');
{
  const d = screen();
  d.sectors.push({ name: 'Railways', bellwethers: [{ symbol: 'IRFC' }] }, { name: 'Education', bellwethers: [{ symbol: 'NIITLTD' }] });
  d.sectors[0].bellwethers = [{ symbol: 'AAA' }];
  d.run.searchLog = [{ path: 'sectors[Education].bellwethers[NIITLTD].eps', searched: ['Screener'], reason: 'Not on Screener.' }];
  const it = completeness(d).sections[0].checks.find((x) => x.label.startsWith('P/E'));
  ok('one sector’s log entry does not mark a three-sector item searched', it.state === 'open', it.state);
  ok('its reason is shown against that sector only', it.reasons.length === 1 && /^Education: Not on Screener/.test(it.reasons[0]), JSON.stringify(it.reasons));
  d.run.searchLog.push({ path: 'sectors[Aviation].bellwethers.eps', searched: ['x'], reason: 'a' }, { path: 'sectors[Railways].bellwethers.eps', searched: ['y'], reason: 'b' });
  const it2 = completeness(d).sections[0].checks.find((x) => x.label.startsWith('P/E'));
  ok('once every sector has its own entry, the item is searched', it2.state === 'searched' && it2.searchedFor === 3);
}

console.log('\nThe real replies of 26-11-2026');
{
  const dir = path.join(ROOT, 'tests/fixtures/real');
  const ld = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  let d = ld('finder-22-11-2026-base.json');
  for (const n of ['1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9']) { const a = ld(`finder-22-11-2026-topup${n}.json`); if (!Array.isArray(a.companies)) a.companies = []; const m = mergeTopUp(d, a); if (m.ok) d = m.merged; }
  const lines = fs.readFileSync(path.join(dir, 'finder-26-11-2026-replies.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{'));
  ok('seventeen JSON blocks in the file, three of them "no change"', lines.length === 17, lines.length);
  const epsOf = (x) => { const o = {}; x.sectors.forEach((s) => (s.bellwethers || []).forEach((b) => { if (Array.isArray(b.eps) && b.eps.length) o[s.name + '|' + b.symbol] = b.eps.length; })); return o; };
  let lost = 0, merged = 0;
  for (const l of lines) {
    const b = JSON.parse(l); if (!Array.isArray(b.companies)) b.companies = [];
    const before = epsOf(d); const m = mergeTopUp(d, b); if (!m.ok) continue; merged++;
    const after = epsOf(m.merged); Object.keys(before).forEach((k) => { if (!after[k]) lost++; }); d = m.merged;
  }
  ok('every block merges', merged === 17, merged);
  ok('no EPS the app held is lost by any merge', lost === 0, lost);
  const eps = epsOf(d);
  const sent = JSON.parse(lines[12]).sectors.flatMap((s) => s.bellwethers.map((b) => s.name + '|' + b.symbol));
  ok('all 64 companies of the EPS block have their EPS after the merge', sent.length === 64 && sent.every((k) => {
    const [sec, sym] = k.split('|'); return Object.keys(eps).some((x) => F.nameKey(x.split('|')[0]) === F.nameKey(sec) && x.split('|')[1] === sym); }), sent.length);
  const deep = d.sectors.filter((s) => s.deepDive).map((s) => s.name);
  ok('eleven sectors carry their deep dive, Electronics among them', deep.length === 11 && deep.includes('Electronics manufacturing'), deep.length);
  ok('the macro block is kept', !!(d.macro && d.macro.repoRate != null));
  /* With no price check yet, the P/E of every sector with EPS is the app's. */
  const pe = F.finderChecks(d).find((x) => x.label.startsWith('P/E'));
  ok('the follow-up asks no EPS of the 15 sectors in the EPS block', JSON.parse(lines[12]).sectors.every((s) => !new RegExp('Missing: [^.]*' + s.name.replace(/[()]/g, '.') + ' \\(EPS').test(pe.ask)));
  const tp = topUpPrompt(d);
  ok('nor does the follow-up prompt', !/bellwethers\.eps/.test(tp) || !/Missing: [^.]*Electronics manufacturing \(EPS/.test(tp));
}
console.log(`\n${ran - fail}/${ran} checks pass`);
process.exit(fail ? 1 : 0);
