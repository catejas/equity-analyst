/* The rupee against the dollar, on the research date (build 22).
 *
 * Tejas: "I have seen the rupee dollar rate as 83.50 which is wrong. Please
 * verify the source and fix this, this rate has to be on the date of search of
 * this report." The tool wrote 83.50 dated "FY26"; the RBI reference rate in
 * November 2026 was about 94. The app now fetches a published reference rate
 * for the research date when a study is saved. Network calls are mocked. */
import { fetchUsdInr, applyFx, fxStatus, researchDate, FX_SOURCES } from '../src/core/fx.js';
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null ? '  — ' + d : ''}`); };
const reply = (body, status = 200) => async () => ({ ok: status === 200, status, json: async () => body });

const pl = () => ({ run: { generatedAt: '2026-11-13T10:00:00Z' },
  macro: { currency: { value: 83.5, period: 'FY26', source: 'RBI' } } });

ok('the research date is the day the tool ran', researchDate(pl()) === '2026-11-13');
ok('the URL asks for that day', FX_SOURCES[0].url('2026-11-13').includes('/2026-11-13?'));

{ const r = await fetchUsdInr('2026-11-13', { fetchImpl: reply({ date: '2026-11-13', rates: { INR: 94.1997 } }) });
  ok('the first source answers with the dated rate', r.value === 94.1997 && r.asOf === '2026-11-13', r.value);
  const p = applyFx(pl(), r);
  ok('the payload carries the checked rate', p.macro.currency.value === 94.1997 && p.macro.currency.verified);
  ok('dated as the day, not a quarter', p.macro.currency.period === '13-11-2026', p.macro.currency.period);
  ok('the tool\'s own figure is kept beside it', p.macro.currency.stated.value === 83.5);
  ok('and how far off it was', Math.abs(p.macro.currency.differencePct - (-11.4)) < 0.1, p.macro.currency.differencePct); }

{ let n = 0;
  const f = async (url) => { n++; if (url.includes('frankfurter')) throw new Error('offline');
    return { ok: true, status: 200, json: async () => ({ date: '2026-11-13', usd: { inr: 94.2 } }) }; };
  const r = await fetchUsdInr('2026-11-13', { fetchImpl: f });
  ok('a failed source falls through to the next', r.value === 94.2 && n === 3, r.source); }

{ const r = await fetchUsdInr('2026-11-13', { fetchImpl: async () => { throw new Error('offline'); } });
  ok('with no source reachable it returns nothing and never throws', r.value === null && r.attempts.length === 4); }

{ const r = await fetchUsdInr('2026-11-13', { fetchImpl: reply({ date: '2026-11-13', rates: { INR: 0.012 } }) });
  ok('an inverted rate (dollars per rupee) is refused', r.value !== 0.012); }

{ const p = applyFx(pl(), { value: 94, asOf: '2026-09-01', source: 'x' });
  ok('a rate from weeks before the research date is not used', p.macro.currency.value === 83.5); }

ok('an unchecked rate dated by fiscal year is not a rate on the report date',
  fxStatus({ value: 83.5, period: 'FY26' }, '2026-11-13').ok === false);
ok('an unchecked rate dated the day before passes as stated',
  fxStatus({ value: 94.1, period: '12-11-2026' }, '2026-11-13').ok === true);
ok('a rate dated months away does not',
  fxStatus({ value: 94.1, period: '2026-06-01' }, '2026-11-13').ok === false);

console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
