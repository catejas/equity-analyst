/* The price series must be fetched when the payload arrives with a short one,
   and the import must never be blocked when no provider answers.

   The network is intercepted, not the module: EQ is frozen and EQ.prices is a
   module namespace, whose properties are read-only, so assigning over them
   silently does nothing and the test passes on a stub that was never
   installed. Routing the HTTP call exercises the real prices.js instead.

   Whether Upstox actually answers is a question about the live network,
   settled by the in-app diagnostic on the real origin. What is under test
   here is the wiring — a thin history is noticed, a fetched series reaches the
   saved record, and a total failure still saves. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

async function run(mode) {
  const page = await b.newPage({ viewport: { width: 430, height: 930 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  let called = 0;
  await page.route('**/api.upstox.com/**', async (route) => {
    called++;
    if (mode === 'fail') { await route.abort('failed'); return; }
    /* Newest first, [ts, o, h, l, c, v, oi] — the real response shape. */
    const candles = Array.from({ length: 104 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 18) - i * 7 * 86400000).toISOString();
      const c = 1200 + (104 - i);
      return [d, c, c * 1.01, c * 0.99, c, 1e6, 0];
    });
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: { candles } }) });
  });

  const r = await page.evaluate(async ({ json, mode }) => {
    document.getElementById('importText').value = json;
    document.getElementById('btnDoImport').click();
    await new Promise((s) => setTimeout(s, 600));
    document.getElementById('btnSaveImport').click();
    await new Promise((s) => setTimeout(s, 2500));

    const p = window.EQDocTools.currentPayload();
    const co = p && p.report && p.report.full && p.report.full[0];
    /* what actually got stored */
    let stored = null;
    try {
      const lib = JSON.parse(localStorage.getItem('eq.library') || '[]');
      for (const rec of lib) {
        const cs = rec && rec.data && rec.data.companies;
        if (cs && cs[0] && cs[0].priceHistory && cs[0].priceHistory.closes) {
          stored = cs[0].priceHistory.closes.length; break;
        }
      }
    } catch (e) { stored = 'threw ' + e.message; }
    return {
      storedCloses: stored,
      panelType: co ? (co.technicalPanel === null ? 'null' : typeof co.technicalPanel) : 'no company',
      saved: !!p,
      panel: !!(co && co.technicalPanel),
      points: co && co.technicalPanel ? (co.technicalPanel.points ?? null) : null,
    };
  }, { json: fs.readFileSync('/tmp/ril.json', 'utf8'), mode });

  await page.close();
  return { ...r, called, errs };
}

const good = await run('good');
ok('a thin price history triggers a fetch', good.called === 1);
ok('the payload still saves', good.saved === true);
/* Assert on what this test is actually about: the fetched series reaching the
   saved record. The technical panel is built from report.full, which is empty
   for a sector record whose companies are stored separately — asserting on it
   here tested the app's record layout, not the price wiring. */
console.log('      closes stored:', good.storedCloses);
ok('the fetched series reaches the saved record', good.storedCloses === 104);
ok('no page errors on the happy path', good.errs.length === 0);
if (good.errs.length) console.log('      ' + good.errs.slice(0, 2).join('\n      '));

const bad = await run('fail');
ok('a failing provider still triggers one attempt', bad.called === 1);
ok('the import is NOT blocked when no provider answers', bad.saved === true);
ok('a failed fetch leaves the original short series alone', bad.storedCloses === 1);
ok('no page errors when every provider fails', bad.errs.length === 0);
if (bad.errs.length) console.log('      ' + bad.errs.slice(0, 2).join('\n      '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
