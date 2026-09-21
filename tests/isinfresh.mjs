/* The company map, and the fact that it decays.
 *
 * A symbol-to-ISIN map is not reference data. Companies list, merge, demerge
 * and get renamed — Zomato became ETERNAL — and each changes the mapping. A
 * wrong ISIN does not error: it fetches ANOTHER COMPANY'S price history and
 * the report is built on it. So the failure to defend against is not "the
 * fetch broke", which is loud, but "the fetch succeeded and the file was three
 * years old", which is silent.
 *
 * That is not hypothetical. The first source chosen for this job answered 200,
 * parsed cleanly, had every blue chip right — and its newest listing was from
 * October 2023. These assertions exist so that cannot happen unnoticed again. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import {
  parseIsinCsv, parseEquityCsv, SOURCES, STALE_AFTER_DAYS,
} from '../src/core/instruments.js';

let fail = 0;
const ok = (l, c) => { if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };

/* --- the bundled map ---------------------------------------------------- */
const bundled = JSON.parse(fs.readFileSync('data/nse-instruments.json', 'utf8'));
console.log(`      bundled: ${bundled._count} symbols, source data ${bundled._sourceUpdated}`);
ok('the bundled map covers the whole exchange, not a seed row', bundled._count > 3000);
ok('it records the date its data is current to', /^\d{4}-\d{2}-\d{2}$/.test(bundled._sourceUpdated || ''));
ok('it names where it came from', /^https:/.test(bundled._source || ''));
ok('it warns that it is a snapshot', /refresh/i.test(bundled._warning || ''));

/* The freshness trap: blue chips prove nothing, because they have been listed
   for decades and a stale file has them all. Only recent listings discriminate. */
const RECENT = ['OLAELEC', 'SWIGGY', 'HYUNDAI', 'NTPCGREEN', 'WAAREEENER', 'ETERNAL'];
const missing = RECENT.filter((s) => !bundled.map[s]);
console.log('      recent listings present: ' + (RECENT.length - missing.length) + '/' + RECENT.length
  + (missing.length ? ' — missing ' + missing.join(' ') : ''));
ok('recent listings are in it — the check a stale file fails', missing.length === 0);
ok('a rename resolves to the current entity (Zomato is now ETERNAL)',
   bundled.map.ETERNAL === 'INE758T01015');
ok('every value is a well-formed equity ISIN',
   Object.values(bundled.map).every((v) => /^INE[A-Z0-9]{9}$/.test(v)));

/* --- the parsers -------------------------------------------------------- */
{
  const csv = 'ISIN,SYMBOL,SERIES\nINE002A01018,RELIANCE,EQ\n'
    + 'INF204K01K15,SOMEFUND,\nINE758T01015,ETERNAL,EQ\nINE123X01011,OLDNAME,EQ\nINE999X01019,OLDNAME,EQ\n';
  const r = parseIsinCsv(csv);
  ok('the ISIN list parses', r.map.RELIANCE === 'INE002A01018');
  ok('a mutual fund ISIN is not treated as a company', !r.map.SOMEFUND);
  ok('where a symbol appears twice the newest row wins — which is what a '
     + 'reconstitution looks like in this file', r.map.OLDNAME === 'INE999X01019');

  const eq = parseEquityCsv('SYMBOL,NAME OF COMPANY, SERIES, ISIN NUMBER\n'
    + 'PNB,Punjab National Bank,EQ,INE160A01022\nSGBX,Sovereign Gold Bond,GB,INE020B01018\n');
  ok('the equity list parses symbol, name and ISIN', eq.map.PNB === 'INE160A01022'
     && eq.names.PNB === 'Punjab National Bank');
  ok('a non-equity series is excluded', !eq.map.SGBX);
}

/* --- the sources -------------------------------------------------------- */
ok('the primary source is a host that permits cross-origin reads',
   /^https:\/\/raw\.githubusercontent\.com\//.test(SOURCES[0].url));
ok('the primary source publishes a data date to be checked against', !!SOURCES[0].metaUrl);
ok('the browser-unreachable exchange master is last, not first',
   SOURCES[SOURCES.length - 1].url.includes('assets.upstox.com'));
ok('there is a bundled fallback so the app works with no network',
   SOURCES.some((x) => x.kind === 'bundled'));
ok('staleness has a stated threshold', STALE_AFTER_DAYS > 0 && STALE_AFTER_DAYS <= 31);

/* --- in the app: staleness, hand entries, and survival across a refresh -- */
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 430, height: 930 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
page.on('dialog', (d) => d.accept());

/* A source that answers perfectly well with data from 2023. */
await page.route('**/eod2_data/main/isin.csv', (r) => r.fulfill({
  status: 200, contentType: 'text/plain',
  body: 'ISIN,SYMBOL,SERIES\nINE002A01018,RELIANCE,EQ\nINE160A01022,PNB,EQ\n' }));
await page.route('**/eod2_data/main/meta.json', (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ lastUpdate: '2023-10-16T00:00:00+05:30' }) }));
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const r = await page.evaluate(async () => {
  const I = EQ.instruments;
  const res = await I.refresh();
  const meta = I.libraryMeta();
  /* A hand entry for a company no mirror carries. */
  I.put('NEWCO', 'INE111A01011');
  const afterPut = I.library().NEWCO;
  const res2 = await I.refresh();          // refresh again — must not wipe it
  return {
    ok: res.ok, count: res.count, dataDate: res.dataDate,
    stale: meta.stale, ageDays: meta.ageDays, reason: meta.staleReason,
    afterPut, survives: I.library().NEWCO,
    manualCount: I.libraryMeta().manualCount,
    refetched: res2.ok,
  };
});
console.log('      after refresh: ' + JSON.stringify(r));

ok('a fetch that succeeds against stale data is still reported as stale', r.ok && r.stale === true);
ok('the age is measured from the data date, not the fetch time', r.ageDays > 300);
ok('the reason names the date and says what will be missing',
   /current to 2023-10-16/.test(r.reason) && /listed since/.test(r.reason));
ok('a hand-entered company is saved', r.afterPut === 'INE111A01011');
ok('and SURVIVES a later refresh — the reason it is stored separately',
   r.survives === 'INE111A01011' && r.refetched);
ok('hand entries are counted separately so they can be seen', r.manualCount === 1);
ok('no page errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0, 3).join('\n      '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
