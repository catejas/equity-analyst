/* The rename is complete only if it is complete everywhere the user can see or
   the engine can read. Checks the live app in a real browser:
     - no "segment" spelling in any visible text or control
     - the app still imports, saves and renders
     - the generated documents carry no legacy spelling either */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());

await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

const before = await page.evaluate(() => ({
  eq: !!window.EQ,
  tools: !!window.EQDocTools,
  /* Anything a user could read: visible text, button labels, placeholders,
     titles and option text. */
  visible: (document.body.innerText || ''),
  attrs: [...document.querySelectorAll('[placeholder],[title],[aria-label]')]
    .map((n) => [n.getAttribute('placeholder'), n.getAttribute('title'), n.getAttribute('aria-label')].join(' '))
    .join(' '),
  options: [...document.querySelectorAll('option')].map((o) => o.textContent).join(' '),
}));

ok('engine loaded', before.eq);
ok('doc tools loaded', before.tools);
ok('no "segment" in visible text', !/segment/i.test(before.visible));
ok('no "segment" in labels or placeholders', !/segment/i.test(before.attrs));
ok('no "segment" in dropdown options', !/segment/i.test(before.options));
if (/segment/i.test(before.visible)) {
  const m = before.visible.match(/.{0,60}segment.{0,60}/i);
  console.log('      visible offender:', JSON.stringify(m && m[0]));
}

/* Import a real payload through the app's own controls and render. */
await page.evaluate((json) => {
  document.getElementById('importText').value = json;
  document.getElementById('btnDoImport').click();
}, fs.readFileSync('/tmp/ril.json', 'utf8'));
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('btnSaveImport').click());
await page.waitForTimeout(1000);

const after = await page.evaluate(() => {
  const p = window.EQDocTools.currentPayload();
  let html = '';
  try { html = window.EQDocTools.buildHTML(p, 'co1', 'en'); } catch (e) { return { threw: String(e.message) }; }
  return {
    saved: !!p,
    scope: p && p.meta ? p.meta.sector : null,
    /* the record kept its scope under the new key */
    legacyInDoc: /segment/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')),
    docLen: html.length,
  };
});

ok('payload imported and saved', after.saved === true);
ok('scope read under the new key', typeof after.scope === 'string' && after.scope.length > 0);
ok('document builds', (after.docLen || 0) > 10000);
ok('no "segment" in the rendered document', after.legacyInDoc === false);
if (after.threw) console.log('      threw:', after.threw);
ok('no page errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0, 3).join('\n      '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
