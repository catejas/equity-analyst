/* The price-check queue, the "Check prices again" button, the re-check on
 * launch and the outlook badges, in the real app in Chrome (build 32).
 *
 * The fault Tejas met on 23-11-2026: three follow-ups imported one after
 * another while the first price check ran; the later checks were skipped and
 * the first, run before his EPS arrived, was stamped onto the merged screen,
 * so P/E history read "the app works it out" for good. Upstox is mocked with
 * a delay, so the first check is still running when the follow-up arrives.
 * The screen is TEST DATA (tests/_finderfix.mjs); Retail's companies are
 * given real NSE symbols so the app's instrument map resolves them. */
import { chromium } from 'playwright-core';
import { finderFixture } from './_finderfix.mjs';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };

const fx = finderFixture({ thin: ['Retail'] });
fx.sectors.forEach((s) => { s.bellwethers = s.name === 'Retail' ? [{ symbol: 'TRENT' }, { symbol: 'DMART' }, { symbol: 'ABFRL' }] : []; });
/* Aviation's outlook is left to its company's past trend, for a Past badge. */
const av = fx.sectors.find((s) => s.name === 'Aviation');
av.outlook = { tailwinds: av.outlook.tailwinds, risks: av.outlook.risks };
av.bellwethers = [{ symbol: 'INDIGO', eps: [{ fy: 'FY23', eps: 100 }, { fy: 'FY24', eps: 110 }, { fy: 'FY25', eps: 120 }, { fy: 'FY26', eps: 133.1 }] }];
const eps = (base) => ['FY21', 'FY22', 'FY23', 'FY24', 'FY25', 'FY26'].map((fy) => ({ fy, eps: base }));
const followUp = { schema: 'equity-analyst/5', run: { topUp: true, kind: 'sectorScreen', searchLog: [] },
  sectors: [{ name: 'Retail', bellwethers: [{ symbol: 'TRENT', eps: eps(5), epsTtm: 5 }, { symbol: 'DMART', eps: eps(4), epsTtm: 4 }] }] };

const candles = (n, monthly) => {
  const out = []; const now = Date.now();
  for (let i = 0; i < n; i++) {
    const t = new Date(now - i * (monthly ? 30.44 : 1) * 864e5).toISOString().slice(0, 10) + 'T00:00:00+05:30';
    const c = 100 - i * (monthly ? 0.3 : 0.01); out.push([t, c, c, c, c, 1, 0]);
  }
  return out;
};

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());
let asked = 0, monthlyAsked = [];
await page.route('**/api.upstox.com/**', async (route) => {
  const u = decodeURIComponent(route.request().url());
  const monthly = /\/months\//.test(u);
  asked++;
  if (monthly) monthlyAsked.push(u.split('/historical-candle/')[1].split('/')[0]);
  await new Promise((r) => setTimeout(r, 250));
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { candles: candles(monthly ? 72 : 420, monthly) } }) }).catch(() => {});
});
await page.route('**/bharatstockapi.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.waitForFunction(() => window.EQ && window.EQ.finder && window.EQDocTools, null, { timeout: 15000 });
await page.evaluate(() => {
  navigator.clipboard.writeText = () => Promise.resolve();
  window.__msgs = [];
  new MutationObserver(() => { const t = document.getElementById('finderMsg').textContent; if (t) window.__msgs.push(t); })
    .observe(document.getElementById('finderMsg'), { childList: true, characterData: true, subtree: true });
});
const sleep = (m) => page.waitForTimeout(m);
const ev = (fn, arg) => page.evaluate(fn, arg);
const imp = async (obj) => {
  await ev((o) => { document.getElementById('btnFinderImport').click(); document.getElementById('importText').value = '```json\n' + JSON.stringify(o) + '\n```'; }, obj);
  await sleep(300); await ev(() => document.getElementById('btnDoImport').click()); await sleep(600);
  await ev(() => document.getElementById('btnSaveImport').click()); await sleep(300);
};
const settled = async () => { for (let i = 0; i < 120; i++) { await sleep(500); if (await ev(() => !FINDER_BUSY && !FINDER_AGAIN)) return true; } return false; };
const stored = () => ev(() => { const r = libRead().filter((x) => x.kind === 'finder').slice(-1)[0];
  return { stamp: r.data.verified && r.data.verified.stamp, now: EQ.finder.finderStamp(r.data), val: Object.keys((r.data.verified || {}).valuation || {}) }; });

console.log('\nA follow-up arrives while the first check is still running');
await imp(fx);
ok('the first check is running', await ev(() => FINDER_BUSY));
await imp(followUp);
ok('the follow-up\'s check is queued, not dropped', await ev(() => FINDER_BUSY && !!FINDER_AGAIN));
ok('both checks finish', await settled());
const st = await stored();
ok('the saved check was run on the merged screen (its stamp matches)', st.stamp && st.stamp === st.now, JSON.stringify(st));
ok('so Retail\'s P/E history was worked out from the EPS the follow-up sent', st.val.includes('retail'), st.val.join(','));
ok('its companies were priced on monthly prices', monthlyAsked.some((k) => /TRENT|INE849A01020/.test(k)) || monthlyAsked.length >= 2, monthlyAsked.join(' '));
const depth = await ev(() => document.getElementById('finderDepth').innerText);
ok('the depth box no longer says the app will work out P/E history', !/the app works it out from prices/.test(depth), depth.replace(/\s+/g, ' ').slice(0, 300));

console.log('\nProgress, and checking again by hand');
const msgs = await ev(() => window.__msgs);
ok('the check showed its progress', msgs.some((m) => /Checking returns against index and stock prices: \d+ of \d+ sectors/.test(m))
  && msgs.some((m) => /Working out P\/E history from company prices and EPS: \d+ of \d+ sectors/.test(m)), msgs.slice(0, 4).join(' | '));
ok('the final message gives the P/E count', /P\/E history worked out from company prices and EPS for \d+ sector/.test(await ev(() => document.getElementById('finderMsg').textContent)));
ok('a Check prices again button is shown', await ev(() => !document.getElementById('btnFinderRecheck').classList.contains('hidden')));
const before = asked;
await ev(() => document.getElementById('btnFinderRecheck').click());
ok('tapping it runs the check again', await ev(() => FINDER_BUSY));
await settled();
ok('and asks the prices again', asked > before, `${before} → ${asked}`);

console.log('\nOn launch, a check run on older data is run again');
await ev(() => { const lib = libRead(); const r = lib.filter((x) => x.kind === 'finder').slice(-1)[0]; r.data.verified.stamp = 'stale'; libWrite(lib); });
const beforeLaunch = asked;
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.waitForFunction(() => window.EQ && window.EQ.finder && typeof FINDER_BUSY !== 'undefined', null, { timeout: 15000 });
await sleep(1500);
await settled();
const st2 = await stored();
ok('the app checks again by itself and fixes the stamp', asked > beforeLaunch && st2.stamp === st2.now, `${beforeLaunch} → ${asked}; ${JSON.stringify(st2)}`);

console.log('\nThe outlook badges');
await ev(() => { const d = document.querySelector('#finderTable details'); if (d) d.open = true; });
const badges = await ev(() => [...document.querySelectorAll('#finderTable .obadge')].map((x) => x.textContent));
ok('published forecasts carry a Published badge', badges.includes('Published'), badges.slice(0, 6).join(','));
ok('a past-trend outlook carries a Past badge', badges.includes('Past'), badges.filter((x) => x === 'Past').length);
const tap = await ev(() => {
  const btn = [...document.querySelectorAll('#finderTable .obadge')].find((x) => x.textContent === 'Past');
  const note = [...btn.closest('td').querySelectorAll('.onote')].find((n) => n.getAttribute('data-for') === btn.getAttribute('data-k'));
  const was = note.classList.contains('hidden'); btn.click();
  return { was, now: note.classList.contains('hidden'), text: note.textContent };
});
ok('tapping a badge shows where the figure comes from', tap.was && !tap.now && /past EPS growth of INDIGO/.test(tap.text) && /half weight/.test(tap.text), `${tap.was}/${tap.now} ` + tap.text);
ok('there are no badges on the other figures', await ev(() => [...document.querySelectorAll('#finderTable .obadge')].every((x) => /outlook/.test(x.getAttribute('aria-label')))));
ok('a sector whose two outlook figures share a source has one badge', await ev(() => {
  const td = [...document.querySelectorAll('#finderTable td')].find((x) => /^Banking/.test(x.textContent));
  return td && td.querySelectorAll('.obadge').length === 1; }));
const doc = await ev(() => EQDocTools.buildHTML(window.finderPayload(), 'finder', 'en'));
ok('the Sector Screen PDF carries the badges', /class="fbadge"[^>]*>Published</.test(doc));
ok('no errors on the page', !errs.length, errs.join(' | '));

await b.close();
console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
