import { REAL } from './_paths.mjs';
/* The follow-up loop on peers (build 26).
 *
 * Reported 21-11-2026, in the research tool's own words while it was updating
 * Canara Bank: the app held 16 peer rows for CANBK where there were 10 distinct
 * peers; the five thin rows of the first reply stayed beside the complete
 * ones re-sent to replace them, a second Bank of Baroda row appeared, and the
 * "required" count rose with every reply (5, 10, 15, 18), so the follow-up
 * never ended. Same on SBIN, PNB and Bank of India.
 *
 * The cause: the merge chose a join key for each side separately. The first
 * reply's peers carried no ticker on some rows (so they joined on "name") and
 * the follow-up carried a ticker on every row (so it joined on "symbol"); the
 * keys did not match and every row was appended. This replays it on the real
 * PNB peers. */
import fs from 'node:fs';
import { mergeTopUp, completeness, topUpPrompt } from '../src/core/completeness.js';

let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const base = JSON.parse(fs.readFileSync(REAL + '/pnb-merged-16-11-2026.json', 'utf8'));
const co = base.companies[0];

/* The first reply: five peers, three of them thin, none with a ticker, and
   Bank of Baroda twice under two spellings. */
/* The complete rows the follow-up sends: the real names, market caps, P/E
   and ROE of the 16-11-2026 run, with the five further figures a lender's
   peers are judged on filled in HERE for the test (they are not research). */
const full = JSON.parse(JSON.stringify(co.peers)).map((p, i) => Object.assign({}, p, {
  marketCap: p.marketCap == null ? 100000 + i : p.marketCap, pe: p.pe == null ? 6 + i : p.pe, roe: p.roe == null ? 14 : p.roe,
  pb: 1 + i / 10, roa: 1.1, nim: 2.8, gnpa: 2.1, advancesGrowth: 13, source: 'test' }));
co.peers = full.map((p, i) => (i < 3 ? { name: p.name, listed: true } : p));
co.peers.push({ name: 'Bank of Baroda Ltd.', listed: true });
const peerCheck = (pl) => {
  const c = completeness(pl);
  return c.sections.flatMap((s) => s.checks || []).find((x) => x.label === 'Peers with their figures')
    || (c.missing || []).find((x) => x.label === 'Peers with their figures') || null;
};
const sectionItems = (pl) => completeness(pl).sections;
const first = peerCheck(base);
ok('a thin first reply is flagged', first && !first.ok, first && `${first.have} of ${first.want}`);
ok('  and the duplicate Bank of Baroda is one peer, not two', first && first.want === 5, first && String(first.want));

/* The follow-up: the three thin peers re-sent complete, WITH tickers and a
   "Ltd" the first reply did not use, plus Bank of Baroda once more. */
const sym = { 'State Bank of India': 'SBIN', 'Canara Bank': 'CANBK', 'Union Bank of India': 'UNIONBANK', 'Bank of India': 'BANKINDIA', 'Bank of Baroda': 'BANKBARODA' };
const reply = (rows) => ({ run: { topUp: true, schemaVersion: '5.0.0' },
  companies: [{ symbol: 'PNB', peers: rows.map((p) => Object.assign({}, p, { name: p.name + ' Ltd', symbol: sym[p.name] })) }] });
const fix = reply(full.slice(0, 3).concat([full[4]]));
const m1 = mergeTopUp(base, fix);
const peers1 = m1.merged.companies[0].peers;
ok('the follow-up merges', m1.ok);
ok('  replacing the thin rows by name instead of adding beside them', peers1.length === 5, peers1.map((p) => p.name).join('; '));
ok('  so no peer is thin any more', peers1.every((p) => p.marketCap != null && p.pe != null), peers1.filter((p) => p.pe == null).map((p) => p.name).join(', '));
const after = peerCheck(m1.merged);
ok('  and the check is met: 5 of 5, not 5 of 9', after && after.ok && after.want === 5, after && `${after.have} of ${after.want}`);
const prompt1 = topUpPrompt(m1.merged);
ok('  so the follow-up prompt no longer asks for peers', !/peers — every peer needs/.test(prompt1));

/* The same reply again changes nothing: the count does not grow with the rows received. */
const m2 = mergeTopUp(m1.merged, fix);
ok('sending the same peers again leaves five', m2.merged.companies[0].peers.length === 5);
const again = peerCheck(m2.merged);
ok('  and the required count stays five', again && again.want === 5, again && String(again.want));

/* Newest wins: a later figure overwrites the earlier one for the same peer. */
const later = reply([Object.assign({}, full[1], { pe: 7.7, asOf: '20-11-2026' })]);
const m3 = mergeTopUp(m2.merged, later);
const can = m3.merged.companies[0].peers.find((p) => /Canara/.test(p.name));
ok('a newer figure overwrites the older one for the same peer', can.pe === 7.7 && can.asOf === '20-11-2026', `pe ${can.pe}, asOf ${can.asOf}`);
ok('  still five peers', m3.merged.companies[0].peers.length === 5);

/* Rows with a multi-field identity are untouched by the entity rule: two
   registers for one subject stay two rows. */
const regs = { run: { topUp: true }, companies: [{ symbol: 'PNB', litigation: { searched: [
  { register: 'nclt', subject: 'company', outcome: 'clear', detail: 'x' },
  { register: 'nclat', subject: 'company', outcome: 'clear', detail: 'y' }] } }] };
const m4 = mergeTopUp(base, regs);
ok('register rows still join on register + subject', m4.merged.companies[0].litigation.searched.length
  === base.companies[0].litigation.searched.length, String(m4.merged.companies[0].litigation.searched.length));
void sectionItems;

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
