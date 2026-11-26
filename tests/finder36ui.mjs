/* Build 36 in the real app in Chrome: parts held and joined, a whole day's
 * replies pasted at once, a .json file imported, and the joined screen
 * exported as one file. Upstox is mocked. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT } from './_paths.mjs';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const dir = path.join(ROOT, 'tests/fixtures/real');
const ld = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ acceptDownloads: true });
const dialogs = []; page.on('dialog', (x) => { dialogs.push(x.message()); x.accept(); });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const t0 = Date.now();
const candles = (n, mo) => { const o = []; for (let i = 0; i < n; i++) { const t = new Date(t0 - i * (mo ? 30.44 : 7) * 864e5).toISOString().slice(0, 10) + 'T00:00:00+05:30'; const c = 100 + ((n - i) % 13); o.push([t, c, c, c, c, 1, 0]); } return o; };
await page.route('**/api.upstox.com/**', (r) => { const mo = /\/months\//.test(decodeURIComponent(r.request().url())); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { candles: candles(mo ? 72 : 210, mo) } }) }); });
await page.route('**/bharatstockapi.com/**', (r) => r.abort('failed'));
await page.goto('http://127.0.0.1:8848/index.html'); await page.waitForTimeout(2500);
await page.waitForFunction(() => window.EQ && window.EQ.finder);
const ev = (f, a) => page.evaluate(f, a);
const idle = async () => { for (let i = 0; i < 150; i++) { await page.waitForTimeout(400); if (await ev(() => !FINDER_BUSY && !FINDER_AGAIN)) break; } };
const paste = async (text) => {
  await ev((t) => { document.getElementById('btnFinderImport').click(); document.getElementById('importText').value = t; }, text);
  await page.waitForTimeout(250); await ev(() => document.getElementById('btnDoImport').click()); await page.waitForTimeout(700);
};
const save = async () => { const can = await ev(() => { const s = document.getElementById('btnSaveImport'); return !!s && !s.classList.contains('hidden'); });
  if (can) await ev(() => document.getElementById('btnSaveImport').click()); await page.waitForTimeout(300); await idle(); return can; };
const fence = (o) => '```json\n' + JSON.stringify(o) + '\n```';

console.log('\nA screen in three parts');
const base = ld('finder-22-11-2026-base.json');
const S = base.sectors, k = Math.ceil(S.length / 3);
const parts = [0, 1, 2].map((i) => ({ ...(i === 0 ? base : { schema: base.schema }), run: { ...base.run, part: { n: i + 1, of: 3, id: 'screen-test' } }, sectors: S.slice(i * k, (i + 1) * k) }));
parts.forEach((p, i) => { if (i) delete p.benchmark; });
await paste('Here is part 2:\n' + fence(parts[1]));
ok('part 2 alone is held, not saved', /Part 2 of 3 received/.test(await ev(() => document.getElementById('importMsg').textContent)) && await ev(() => finderRecords().length === 0));
ok('the Finder box says which parts are still to come', /Parts waiting: 1 of 3[\s\S]*Still to come: 1, 3/.test(await ev(() => document.getElementById('finderTray').textContent)));
await paste(fence(parts[0]));
ok('part 1 is held too', /Held: 1, 2/.test(await ev(() => document.getElementById('importMsg').textContent)));
await paste(fence(parts[2]));
ok('the last part joins all three, ready to save', /3 parts joined into one/.test(await ev(() => document.getElementById('importMsg').textContent)));
ok('saved once, as one screen of every sector', await save() && await ev((n) => finderRecords().length === 1 && finderRecord().data.sectors.length === n, S.length));
ok('the tray is empty again', await ev(() => !trayRead() && !document.getElementById('finderTray').textContent.trim()));

console.log('\nA whole day’s replies pasted at once');
for (const n of ['1', '2', '3', '4', '5', '6', '7', '8a', '8b', '9']) { await paste(fence(ld(`finder-22-11-2026-topup${n}.json`))); await save(); }
const before = await ev(() => finderRecord().data.sectors.filter((s) => s.deepDive).length);
await paste(fs.readFileSync(path.join(dir, 'finder-26-11-2026-replies.txt'), 'utf8'));
ok('seventeen blocks, prose between them, joined in one paste', /17 blocks joined into one/.test(await ev(() => document.getElementById('importMsg').textContent)));
ok('and saved in one step', await save());
ok('the eleven deep dives are in', before === 0 && await ev(() => finderRecord().data.sectors.filter((s) => s.deepDive).length) === 11);

console.log('\nImport file and Export JSON');
const tmp = '/tmp/finder36-part.json';
const fu = { run: { topUp: true, kind: 'sectorScreen', searchLog: [] }, sectors: [{ name: 'Banking', why: 'TEST: read from a file' }] };
fs.writeFileSync(tmp, JSON.stringify(fu));
await ev(() => document.getElementById('btnFinderImport').click());
await page.setInputFiles('#importFile', tmp); await page.waitForTimeout(900);
const sv = await save();
ok('a .json file is read through the same import', sv && await ev(() => finderRecord().data.sectors.find((s) => s.name === 'Banking').why === 'TEST: read from a file'));
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), ev(() => document.getElementById('btnFinderExport').click())]);
let exported = null; if (dl) { const p = await dl.path(); exported = JSON.parse(fs.readFileSync(p, 'utf8')); }
const held = await ev(() => finderRecord().data.sectors.length);
ok('Export JSON saves the whole joined screen as one file', !!exported && exported.sectors.length === held && exported.sectors.filter((s) => s.deepDive).length === 11, dl && dl.suggestedFilename());
ok('no page error', !errs.length, errs.join(' | '));
await b.close();
console.log(`\n${ran - fail}/${ran} checks pass`);
process.exit(fail ? 1 : 0);
