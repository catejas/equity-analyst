/* The company and ISIN library: it must survive a blocked fetch, accept a
   hand-entered pair, refuse a bad one, and be the thing the price layer
   consults.

   Rewritten for the multi-source refresh. It used to mock the Upstox master
   alone, which was the only source there was; the library now tries a list in
   order, so a test that blocks one host and leaves the rest live is testing
   the network rather than the code. Every source is mocked here, and the
   Upstox master is exercised through its own position at the end. */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const page = await b.newPage({ viewport:{ width:430, height:930 } });
const errs=[]; page.on('pageerror', e=>errs.push(e.message.split('\n')[0]));

/* The sources ahead of the master are blocked, so the master is what answers —
   which is the arrangement this file was written to check. */
await page.route('**/raw.githubusercontent.com/**', route => route.abort('failed'));
await page.route('**/nse-instruments.json*', route => route.abort('failed'));

/* A stand-in for the exchange master, gzip-free: the code must handle a server
   that sends plain JSON as well as one that sends the .gz bytes. */
await page.route('**/assets.upstox.com/**', async route => {
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify([
    { segment:'NSE_EQ', instrument_type:'EQ', trading_symbol:'RELIANCE', isin:'INE002A01018' },
    { segment:'NSE_EQ', instrument_type:'EQ', trading_symbol:'PNB',      isin:'INE160A01022' },
    { segment:'NSE_FO', instrument_type:'FUT', trading_symbol:'RELIANCE24', isin:'INE002A01018' },
    { segment:'NSE_EQ', instrument_type:'EQ', trading_symbol:'BROKEN',   isin:'not-an-isin' },
  ])});
});
await page.goto('http://127.0.0.1:8848/index.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);

let fail=0; const ok=(l,c)=>{ if(!c){fail=1;console.log('FAIL  '+l);} else console.log('ok    '+l); };

const r = await page.evaluate(async () => {
  const I = window.EQ.instruments;
  const before = I.libraryMeta().count;
  /* Point it straight at the master, so this exercises the Upstox parse rather
     than whichever source happens to answer first. */
  const res = await I.refresh({ url: 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz' });
  return {
    before, ok: res.ok, count: res.count,
    reliance: I.isinFor('RELIANCE'), pnb: I.isinFor('pnb'),
    futuresExcluded: !I.isinFor('RELIANCE24'),
    badExcluded: !I.isinFor('BROKEN'),
    entries: I.entries().length,
    searchHit: I.search('RELI').length,
    /* the price layer must resolve through the library, with no payload isin */
    key: window.EQ.prices.instrumentKeyFor('PNB', {}, null),
  };
});
ok('library starts empty', r.before === 0);
ok('refresh succeeds', r.ok === true);
ok('only equities kept', r.count === 2 && r.futuresExcluded);
ok('a malformed ISIN is dropped', r.badExcluded);
ok('lookup by ticker', r.reliance === 'INE002A01018');
ok('lookup is case-insensitive', r.pnb === 'INE160A01022');
ok('search works', r.searchHit >= 1);
ok('the price layer resolves through the library', r.key === 'NSE_EQ|INE160A01022');

/* Every REMOTE source blocked.
   The bundled map cannot be blocked and should not be: the service worker
   precaches it, which is what makes the app work on a phone with no signal.
   So the guarantee under test is not "the refresh fails" — it is that a
   refresh which cannot reach the internet still leaves a usable library. */
await page.route('**/assets.upstox.com/**', route => route.abort('failed'));
const after = await page.evaluate(async () => {
  const I = window.EQ.instruments;
  const res = await I.refresh();
  return { ok: res.ok, source: res.source, attempts: res.attempts,
    reliance: I.isinFor('RELIANCE'), pnb: I.isinFor('PNB'), count: I.libraryMeta().count };
});
console.log('      fell back to: ' + after.source + ' (' + after.count + ' companies)');
ok('with every remote source blocked the library still resolves',
   after.reliance === 'INE002A01018' && after.pnb === 'INE160A01022');
ok('it fell back to the map bundled with the build', /bundled/.test(after.source || ''));
ok('the library is not left empty', after.count > 1000);
ok('every source that was tried is reported, not just the one that answered',
   Array.isArray(after.attempts) && after.attempts.length >= 3);
/* A browser refusing a cross-origin read gives an opaque TypeError with no
   status. Naming it is the difference between a person retrying forever and
   understanding that the host will never permit the read. */
ok('a cross-origin refusal is named as one, not left as a bare error',
   after.attempts.some((a) => /blocked the request/.test(a.error || '')));

const hand = await page.evaluate(() => {
  const I = window.EQ.instruments;
  const bad = I.put('TEST', 'nonsense');
  const good = I.put('tcs', 'INE467B01029');
  return { badRejected: bad.ok === false, good: good.ok, tcs: I.isinFor('TCS') };
});
ok('a bad ISIN is refused by hand entry', hand.badRejected);
ok('a good one is accepted and upper-cased', hand.good && hand.tcs === 'INE467B01029');
ok('no page errors', errs.length === 0);
if (errs.length) console.log('      ' + errs.slice(0,3).join('\n      '));

await b.close();
console.log('\n' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail?1:0);
