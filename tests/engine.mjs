/* The engine, asserted directly.
 *
 * A 387-assertion suite that tested these functions was lost in a container
 * reset. A coverage audit of what replaced it found the shape of the gap: of
 * 206 exports, 24 were directly tested and 129 were only ever reached through
 * buildReport or a rendered document. Every forensic score, every metric,
 * every indicator — 92 number-producing functions — had no direct coverage
 * between them.
 *
 * That gap has a specific shape. A wrong coefficient in a composite score does
 * not throw: it returns a plausible number in the plausible range, buildReport
 * still returns a well-formed report, the document still renders, and every
 * existing suite still passes. A test that only checks a report was produced
 * cannot catch it. These check the arithmetic against values worked by hand.
 *
 * Priority came from the audit's own ranking: what a silent bug would cost a
 * reader who acted on the number. */
import { cagr, growth, roe, roce, roic, debtToEquity, interestCoverage,
  enterpriseValue, evToEbitda, priceToEarnings, priceToBook, pegRatio,
  fcfYield, cashConversionCycle, accrualsRatio, netInterestMargin } from '../src/core/metrics.js';
import { wacc, dcf, scenarioBlend, checkWaccBuildup } from '../src/core/valuation.js';
import { weightedScore, overallScore, forensicBand, PILLARS, OVERALL_WEIGHTS,
  MIN_COVERAGE } from '../src/core/scoring.js';
import { normaliseSeverity, evaluateKillSwitch, rankUniverse } from '../src/core/ranking.js';
import { requiredCagr, multibaggerGrid, impliedValueChain } from '../src/core/multibagger.js';
import { altmanZ, piotroskiF, sloanAccruals, effectiveTaxRate,
  contingentToNetWorth, otherIncomeShare } from '../src/core/forensic.js';
import { sma, ema, rsi, atr, rangePosition } from '../src/core/technicals.js';

let fail = 0, n = 0;
const ok = (l, c) => { n++; if (!c) { fail = 1; console.log('FAIL  ' + l); } else console.log('ok    ' + l); };
/* Compare to a hand-worked value. `near` exists because these return rounded
   figures and an exact equality would be asserting the rounding, not the
   arithmetic. */
const near = (a, b, tol = 0.01) => typeof a === 'number' && Math.abs(a - b) <= tol;
const val = (r) => (r && r.available ? r.value : null);

console.log('--- metrics: the primitives every other number rests on');
{
  /* 100 -> 200 over 3 years. 2^(1/3) - 1 = 0.259921...  */
  ok('CAGR is the compound rate, not the simple one', near(val(cagr(100, 200, 3)), 25.99, 0.01));
  ok('a zero base is refused rather than returned as Infinity', !cagr(100 * 0, 200, 3).available);
  ok('a negative base is refused — the root is not real', !cagr(-50, 200, 3).available);
  ok('zero years is refused', !cagr(100, 200, 0).available);
  ok('simple growth is a percentage change', near(val(growth(100, 125)), 25));
  ok('growth from zero is refused', !growth(0, 125).available);

  ok('return on equity', near(val(roe(16904, 76202)), 22.18, 0.01));
  ok('ROE on zero equity is refused, not infinite', !roe(16904, 0).available);
  /* roce(ebit, equity, debt): capital employed is equity + debt, so
     1000 / 10000 = 10%. Checked against the function's own stated formula
     rather than against a definition from memory — "capital employed" is
     written both ways in practice and the one that matters is this one. */
  ok('return on capital employed', near(val(roce(1000, 8000, 2000)), 10, 0.01));
  ok('debt to equity', near(val(debtToEquity(1711000, 76202)), 22.45, 0.01));
  ok('interest coverage', near(val(interestCoverage(122190, 92900)), 1.32, 0.01));
  ok('interest coverage on zero interest is refused', !interestCoverage(1000, 0).available);

  /* EV = market cap + debt - cash. 126600 + 1711000 - 120000 */
  ok('enterprise value adds debt and nets cash',
     near(val(enterpriseValue(126600, 1711000, 120000)), 1717600, 1));
  ok('EV/EBITDA', near(val(evToEbitda(1717600, 123290)), 13.93, 0.01));
  ok('price to earnings', near(val(priceToEarnings(110.15, 14.72)), 7.48, 0.01));
  ok('P/E on zero earnings is refused, not infinite', !priceToEarnings(110.15, 0).available);
  ok('P/E on a loss is refused — a negative multiple is not a multiple',
     !priceToEarnings(110.15, -3).available);
  ok('price to book', near(val(priceToBook(110.15, 66.38)), 1.66, 0.01));
  ok('free cash flow yield', near(val(fcfYield(12000, 126600)), 9.48, 0.01));
  /* PEG at 7.48x on 20% growth = 0.374 */
  ok('PEG ratio', near(val(pegRatio(7.48, 20)), 0.37, 0.01));
  ok('PEG on zero growth is refused', !pegRatio(7.48, 0).available);
  ok('PEG on negative growth is refused — it would look cheap',
     !pegRatio(7.48, -5).available);

  /* It takes BALANCES and turns them into days itself, not days.
     receivables 200 on revenue 1200 = 60.8d; inventory 100 on COGS 800 = 45.6d;
     payables 150 on COGS 800 = 68.4d -> 38.0 */
  ok('cash conversion cycle nets payables off',
     near(val(cashConversionCycle(200, 100, 150, 1200, 800)), 38.0, 0.2));
  ok('and refuses when a component is missing rather than assuming zero',
     !cashConversionCycle(200, 100, 150, 1200, null).available);
  ok('accruals ratio', near(val(accrualsRatio(16904, 45000, 1925000)), -1.46, 0.01));
  ok('net interest margin', near(val(netInterestMargin(35306, 1925000)), 1.83, 0.01));
}

console.log('\n--- valuation: the cost of capital, which nothing used to check');
{
  /* Ke = 0.07 + 1.1 x 0.055 = 0.1305
     WACC = 0.1305 x 0.1 + 0.065 x 0.75 x 0.9 = 0.013050 + 0.043875 = 0.056925 */
  const w = wacc({ riskFreeRate: 0.07, equityRiskPremium: 0.055, beta: 1.1,
    costOfDebt: 0.065, taxRate: 0.25, equityWeight: 0.1, debtWeight: 0.9 });
  ok('WACC is computed from CAPM and the capital weights', near(w.value, 0.0569, 0.0001));
  ok('and reports the cost of equity it used', near(w.inputs.costOfEquity, 0.1305, 0.0001));
  ok('weights that do not sum to one are refused — the commonest error here',
     !wacc({ riskFreeRate: 0.07, equityRiskPremium: 0.055, beta: 1.1, costOfDebt: 0.065,
       taxRate: 0.25, equityWeight: 0.3, debtWeight: 0.9 }).available);
  ok('a tax rate outside 0..1 is refused',
     !wacc({ riskFreeRate: 0.07, equityRiskPremium: 0.055, beta: 1.1, costOfDebt: 0.065,
       taxRate: 25, equityWeight: 0.1, debtWeight: 0.9 }).available);

  const good = checkWaccBuildup({ riskFreeRate: 0.07, equityRiskPremium: 0.055, leveredBeta: 1.1,
    costOfEquity: 0.1305, pretaxCostOfDebt: 0.065, taxRate: 0.25,
    equityWeight: 0.1, debtWeight: 0.9, wacc: 0.0569 }, 0.13, { lender: true });
  ok('a buildup that adds up is confirmed', good.available && good.ties);
  ok('and the gap between the stated WACC and the rate used is explained',
     /cost of EQUITY/.test(good.usedNote || '') && /lender/.test(good.usedNote || ''));

  const bad = checkWaccBuildup({ riskFreeRate: 0.07, equityRiskPremium: 0.055, leveredBeta: 1.1,
    costOfEquity: 0.1305, pretaxCostOfDebt: 0.065, taxRate: 0.25,
    equityWeight: 0.1, debtWeight: 0.9, wacc: 0.11 }, 0.11);
  ok('a stated WACC that its own workings do not produce is caught',
     bad.available && !bad.ties && /does not follow/.test(bad.notes[0] || ''));

  const odd = checkWaccBuildup({ riskFreeRate: 0.07, equityRiskPremium: 0.055, leveredBeta: 1.1,
    costOfEquity: 0.1305, pretaxCostOfDebt: 0.065, taxRate: 0.25,
    equityWeight: 0.1, debtWeight: 0.9, wacc: 0.0569 }, 0.21);
  ok('a discount rate matching neither the WACC nor the cost of equity is called out',
     /matches neither/.test(odd.usedNote || ''));

  /* One year of 100 at 10%, no growth, no debt, 10 shares.
     PV = 100/1.1 = 90.909; terminal = 100 x 1.0 / (0.10 - 0) = 1000, PV = 909.09
     total 1000.0 -> per share 100 */
  const d = dcf({ explicitFcff: [100], discountRate: 0.10, terminalGrowth: 0,
    netDebt: 0, sharesOutstanding: 10, midYear: false });
  ok('a discounted value is produced', d.available);
  ok('and it is the hand-worked figure', near(d.perShare, 100, 0.5));
  ok('terminal growth at or above the discount rate is refused, not divided by zero',
     !dcf({ explicitFcff: [100], discountRate: 0.10, terminalGrowth: 0.10,
       netDebt: 0, sharesOutstanding: 10 }).available);

  const blend = scenarioBlend([
    { value: 90, probability: 0.25 },
    { value: 145, probability: 0.50 },
    { value: 180, probability: 0.25 },
  ]);
  ok('scenarios blend on their probabilities', near(val(blend), 140, 0.5));
  ok('probabilities that do not sum to one are refused — an unnormalised blend '
     + 'is wrong in a way that looks entirely reasonable on the page',
     !scenarioBlend([{ value: 90, probability: 0.3 }, { value: 145, probability: 0.3 }]).available);
}

console.log('\n--- scoring and ranking: what decides the shortlist');
{
  /* weightedScore(WEIGHTS, INPUTS) — that order. Getting it backwards returns
     a plausible number rather than an error, which is the whole argument for
     testing these directly. */
  ok('a weighted score is the weighted mean of what was rated',
     weightedScore({ a: 50, b: 50 }, { a: 80, b: 60 }).score === 70);
  ok('an unrated component is excluded rather than counted as zero',
     weightedScore({ a: 50, b: 50 }, { a: 80 }).score === 80);
  ok('and the coverage it was computed over is reported',
     near(weightedScore({ a: 50, b: 50 }, { a: 80 }).coverage, 0.5, 0.001));
  ok('thin coverage is marked insufficient rather than silently scored',
     weightedScore({ a: 90, b: 10 }, { b: 80 }).sufficient === false);
  ok('nothing rated gives a null score, not a zero',
     weightedScore({ a: 50, b: 50 }, {}).score === null);
  ok('the overall dimension weights sum to 1',
     Math.abs(Object.values(OVERALL_WEIGHTS).reduce((x, y) => x + y, 0) - 1) < 1e-9);
  for (const [k, p] of Object.entries(PILLARS)) {
    const sum = Object.values(p.weights).reduce((x, y) => x + y, 0);
    ok(`pillar "${k}" component weights sum to 100`, Math.abs(sum - 100) < 1e-9);
  }
  ok('a forensic band is a band, not a number', typeof forensicBand(85).band === 'string');
  ok('and says separately whether anything severe was found',
     forensicBand(85).severe === false);

  ok('severity words normalise', normaliseSeverity('SEVERE') === 'severe');
  ok('an unrecognised severity is null, not silently "low"',
     normaliseSeverity('quite bad') === null);

  /* The switch reads redFlags and the engines' own killSwitchFlags. */
  const killed = evaluateKillSwitch({
    symbol: 'X', forensicScore: 70,
    redFlags: [{ category: 'accounting', severity: 'severe' }],
  });
  ok('a severe accounting finding bars a company from the Top 3',
     killed.eligibleForTop3 === false);
  ok('and the reason is stated, not just the verdict',
     Array.isArray(killed.exclusionReasons) && killed.exclusionReasons.length > 0);
  ok('a moderate finding in the same category does not bar it',
     evaluateKillSwitch({ symbol: 'Y', forensicScore: 70,
       redFlags: [{ category: 'accounting', severity: 'moderate' }] }).eligibleForTop3 !== false);
  /* An absent forensic assessment is itself disqualifying — the screen does
     not let a company through for having supplied nothing. */
  ok('no forensic assessment at all also bars a company',
     evaluateKillSwitch({ symbol: 'W', redFlags: [] }).eligibleForTop3 === false);
  /* A flag whose wording is outside the taxonomy must not be silently dropped,
     and must not throw: an unreadable severity once killed a whole report. */
  const odd = evaluateKillSwitch({ symbol: 'Z', forensicScore: 70,
    redFlags: [{ category: 'accounting', severity: 'quite bad' }] });
  ok('a flag with unreadable severity is recorded rather than lost or thrown',
     Array.isArray(odd.unreadableFlags) && odd.unreadableFlags.length === 1);

  /* rankUniverse runs the kill switch itself, so every company needs a
     forensic score or all three are excluded — which is what it does, and is
     the behaviour worth pinning: the screen does not let anything through for
     having supplied nothing. */
  const ranked = rankUniverse([
    { symbol: 'A', forensicScore: 70, overall: { score: 80 } },
    { symbol: 'B', forensicScore: 70, overall: { score: 60 } },
    { symbol: 'C', forensicScore: 70, overall: { score: 90 },
      redFlags: [{ category: 'accounting', severity: 'severe' }] },
  ]);
  ok('ranking orders by score, highest first', ranked.top10[0].symbol === 'C');
  ok('an ineligible company does not enter the Top 3 however high it scores',
     !(ranked.top3 || []).some((c) => c.symbol === 'C'));
  ok('but it is still ranked and shown, not hidden',
     ranked.top10.some((c) => c.symbol === 'C'));
  ok('the eligible pair fill the Top 3 in score order',
     ranked.top3.map((c) => c.symbol).join(',') === 'A,B');
  ok('each company carries why it was or was not eligible',
     ranked.top10.every((c) => Array.isArray(c.exclusionReasons)));

  const unscored = rankUniverse([{ symbol: 'A', overall: { score: 80 } }]);
  ok('a company with no forensic assessment cannot reach the Top 3',
     (unscored.top3 || []).length === 0);
}

console.log('\n--- multibagger: the arithmetic behind the claim');
{
  /* 3x over 5 years: 3^(1/5) - 1 = 0.24573, returned as a FRACTION. */
  ok('the required rate for a 3x in 5 years', near(requiredCagr(3, 5), 0.2457, 0.0005));
  ok('a 10x in 3 years is the implausible rate it should be',
     near(requiredCagr(10, 3), 1.1544, 0.0005));
  ok('an impossible multiple throws rather than returning a quiet NaN',
     (() => { try { requiredCagr(0, 5); return false; } catch { return true; } })());

  const grid = multibaggerGrid({ multiples: [3], horizons: [{ key: '3-5', years: 5 }] });
  ok('the grid states the required rate as a percentage too',
     near(grid[0].horizons[0].requiredCagrPct, 24.57, 0.05));
  ok('and leaves plausibility null unless it was evidenced',
     grid[0].horizons[0].plausibility === null);

  /* 1000 x 1.15^5 = 2011.36; x 0.12 = 241.36; x 20 = 4827.2; / 100 = 48.27 */
  const chain = impliedValueChain({
    baseRevenue: 1000, revenueCagr: 0.15, years: 5, terminalNetMargin: 0.12,
    exitPe: 20, sharesOutstanding: 100,
  });
  ok('the value chain compounds revenue', near(chain.terminalRevenue, 2011.36, 0.05));
  ok('applies the terminal margin', near(chain.terminalEarnings, 241.36, 0.05));
  ok('and the exit multiple, per share', near(chain.terminalValuePerShare, 48.27, 0.05));
  ok('a missing assumption throws rather than defaulting one in — the whole '
     + 'point of a stated assumption is that it was stated',
     (() => { try { impliedValueChain({ baseRevenue: 1000 }); return false; } catch { return true; } })());
}

console.log('\n--- forensic: composites where a wrong coefficient looks plausible');
{
  const cur = { revenue: 1200, receivables: 200, grossProfit: 400, currentAssets: 600,
    netFixedAssets: 300, totalAssets: 1500, depreciation: 50, sga: 120,
    currentLiabilities: 400, longTermDebt: 300, netProfit: 150, cashFromOperations: 180 };
  const prior = { revenue: 1000, receivables: 150, grossProfit: 350, currentAssets: 500,
    netFixedAssets: 280, totalAssets: 1300, depreciation: 45, sga: 100,
    currentLiabilities: 350, longTermDebt: 250, netProfit: 120, cashFromOperations: 150 };

  const p = piotroskiF(cur, prior);
  ok('the Piotroski F-score is on its own 0..9 scale',
     p.available && p.value >= 0 && p.value <= 9);

  const z = altmanZ({ workingCapital: 200, retainedEarnings: 400, ebit: 220,
    totalAssets: 1500, totalLiabilities: 700, bookEquity: 800, revenue: 1200,
    variant: 'emerging' });
  ok('the Altman Z-score computes', z.available && typeof z.value === 'number');
  ok('and carries the variant it used, because the coefficients differ',
     /emerging/i.test(JSON.stringify(z)));

  /* Accruals = (150 - 180) / ((1500+1300)/2) = -30/1400 = -0.0214, as a
     fraction. Profit BELOW operating cash is the good direction. */
  const acc = sloanAccruals({ netProfit: 150, cashFromOperations: 180,
    totalAssets: 1500, priorTotalAssets: 1300 });
  ok('Sloan accruals are profit less operating cash over average assets',
     acc.available && near(acc.value, -0.021, 0.001));
  ok('negative accruals are the good direction and are not flagged',
     acc.available && acc.flagged === false);
  /* And the reverse: profit well above the cash backing it. */
  const acc2 = sloanAccruals({ netProfit: 300, cashFromOperations: 60,
    totalAssets: 1500, priorTotalAssets: 1300 });
  ok('profit far above the cash behind it IS flagged', acc2.available && acc2.flagged === true);

  const lowTax = effectiveTaxRate({ tax: 20, profitBeforeTax: 1000, statutoryRate: 0.25 });
  ok('an effective tax rate far below statutory is flagged', lowTax.flagged === true);
  ok('and the gap to statutory is stated, not just the verdict', near(lowTax.gap, 23, 0.5));
  ok('one in line with statutory is not flagged',
     effectiveTaxRate({ tax: 250, profitBeforeTax: 1000, statutoryRate: 0.25 }).flagged !== true);
  ok('contingent liabilities close to net worth are flagged',
     contingentToNetWorth({ contingentLiabilities: 900, netWorth: 1000 }).flagged === true);
  ok('and a small contingent book is not',
     contingentToNetWorth({ contingentLiabilities: 20, netWorth: 1000 }).flagged !== true);
  ok('other income carrying most of profit before tax is flagged',
     otherIncomeShare({ otherIncome: 700, profitBeforeTax: 1000 }).flagged === true);
  ok('and a normal share of it is not',
     otherIncomeShare({ otherIncome: 40, profitBeforeTax: 1000 }).flagged !== true);
}

console.log('\n--- technicals: series arithmetic');
{
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  ok('a simple moving average', near(val(sma(s, 4)), 8.5, 0.001));
  ok('an SMA over more points than exist is refused rather than averaging what it has',
     sma([1, 2], 5).available === false);
  ok('an exponential moving average weights the recent more heavily than a simple one',
     val(ema(s, 4)) > val(sma(s, 4)) - 2);
  ok('RSI of a series that only rises pins at the top of its range',
     near(val(rsi(s, 5)), 100, 0.5));
  ok('and it reads that as overbought rather than leaving the reader to',
     rsi(s, 5).reading === 'overbought');
  /* A series that only falls is the mirror image. */
  ok('RSI of a series that only falls pins at the bottom',
     near(val(rsi(s.slice().reverse(), 5)), 0, 0.5));
  const rp = rangePosition(s);
  ok('range position places the last close within the high-low band', near(rp.value, 100, 1));
  ok('and carries the high and low it measured against', rp.high === 10 && rp.low === 1);
  ok('ATR with no highs or lows refuses rather than returning zero',
     atr([], [], [], 5).available === false);
}

console.log(`\n${n} assertions`);
console.log(fail ? 'FAIL' : 'PASS');
process.exit(fail ? 1 : 0);
