/* The company and ISIN library: it must survive a blocked fetch, accept a
   hand-entered pair, refuse a bad one, and be the thing the price layer
   consults. */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const page = await b.newPage({ viewport:{ width:430, height:930 } });
const errs=[]; page.on('pageerror', e=>errs.push(e.message.split('\n')[0]));

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
  const res = await I.refresh();
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
ok('search works', r.searchHit === 1);
ok('the price layer resolves through the library', r.key === 'NSE_EQ|INE160A01022');

/* a blocked master must not empty the library */
await page.route('**/assets.upstox.com/**', route => route.abort('failed'));
const after = await page.evaluate(async () => {
  const I = window.EQ.instruments;
  const res = await I.refresh();
  return { ok: res.ok, cors: res.likelyCors, stillThere: I.isinFor('RELIANCE'), count: I.libraryMeta().count };
});
ok('a blocked refresh reports failure', after.ok === false);
ok('and names CORS rather than a bare error', after.cors === true);
ok('and leaves the existing library intact', after.stillThere === 'INE002A01018' && after.count === 2);

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
