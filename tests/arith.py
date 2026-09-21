"""Independent arithmetic verification of the JavaScript engine.

Every figure this application prints is computed in JavaScript, in IEEE-754
doubles, and until now nothing outside that engine had ever checked the
answers. The reconciliation flag is the cautionary tale: it asserted for months
that the base year tied to reported revenue, and what it actually verified was
that the code agreed with itself. A test written in the same language, calling
the same functions, would have agreed with it.

So this recomputes the model and the discounted valuation from the raw driver
payload in Python, with no reference to the JavaScript, and compares line by
line.

WHY FRACTIONS RATHER THAN DECIMAL

The whole forecast chain is built from +, -, *, / and integer powers:

    volume_t      = baseVolume * (1 + volumeCagr) ** t
    revenue_t     = volume_t * realisation_t
    discount_t    = 1 / (1 + rate) ** (t - 0.5)

Every one of those except the mid-year discount factor is closed over the
rationals, so `fractions.Fraction` computes them EXACTLY — not to fifty digits,
not to a tolerance, but with no error at all. That makes the comparison
meaningful in a way a second floating-point implementation would not: a
divergence is then unambiguously the JavaScript's rounding, never a fight
between two approximations.

The mid-year convention raises (1 + rate) to a half-integer power, which is a
square root and irrational. That one step is done in `decimal` at 60
significant digits — roughly 45 digits more than a double carries — and the
error it contributes is bounded far below the reporting precision.

WHAT THE ACCURACY ACTUALLY IS

A double holds about 15.95 decimal significant digits. The engine's chain is
short — five forecast years, a handful of operations each — so relative error
accumulates to order 1e-14, while the reports print two decimals on figures of
order 1e3 to 1e6, needing about 9 significant digits. There are roughly six
orders of magnitude of headroom, and the run below measures what is actually
used rather than trusting that estimate.

The one place this is not merely academic is the reconciliation tolerance: a
base year "within 2%" is decided by a subtraction of two large, near-equal
numbers, which is where floating point loses the most. That comparison is
checked here explicitly.

Run:  python3 tests/arith.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from decimal import Decimal, getcontext
from fractions import Fraction as F

getcontext().prec = 60

UPLOADS = '/root/.claude/uploads/a65cacee-cbb1-5a30-88b7-300036f589a9/'
PAYLOADS = [
    ('Reliance', UPLOADS + '57d8e52f-attachment.txt'),
    ('PNB', UPLOADS + '2f13d57b-PNB_gemini-code-1789969768806.json'),
]


# --------------------------------------------------------------- the engine

def js_engine(path: str) -> dict:
    """Run the JavaScript engine and hand back what it computed."""
    script = r'''
import fs from 'node:fs';
import { buildModel } from '/home/claude/eqapp/src/core/model.js';
import { dcf } from '/home/claude/eqapp/src/core/valuation.js';
const t = fs.readFileSync(process.argv[2], 'utf8');
const d = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
const c = d.companies[0];
const ann = (c.financials && c.financials.annual) || [];
let rep = null;
for (const r of ann) if (typeof r.revenue === 'number' && r.revenue > 0) { rep = r; break; }
const built = buildModel({ ...c.model, reported: rep ? { revenue: rep.revenue, period: rep.period } : null });
let value = null;
if (built.available && typeof c.valuation?.discountRate === 'number'
    && typeof c.valuation?.terminalGrowth === 'number'
    && c.valuation.terminalGrowth < c.valuation.discountRate) {
  value = dcf({ explicitFcff: built.fcff, discountRate: c.valuation.discountRate,
    terminalGrowth: c.valuation.terminalGrowth,
    netDebt: c.model.financing?.openingDebt ?? 0,
    sharesOutstanding: built.dilutedShares, midYear: true });
}
process.stdout.write(JSON.stringify({ drivers: c.model, valuation: c.valuation || {},
  reported: rep, built, value }));
'''
    tmp = '/tmp/claude-0/_arith_dump.mjs'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(script)
    out = subprocess.run([sys.executable and 'node', tmp, path],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ------------------------------------------------------------ the reference

def path_of(v, years: int) -> list[F]:
    """A driver that is either one number for every year, or one per year."""
    if isinstance(v, list):
        return [F(str(x)) for x in v]
    return [F(str(v if v is not None else 0))] * years


def reference_model(d: dict) -> dict:
    """The forecast, in exact rational arithmetic. No rounding anywhere."""
    years = int(d['years'])
    sectors = d['sectors']
    opex, dep_in, capex = d['opex'], d['depreciation'], d['capex']
    wc_in, fin, sh = d['workingCapital'], d['financing'], d['shares']

    fixed_growth = path_of(opex.get('fixedGrowth', 0), years)
    variable_pct = path_of(opex.get('variablePctOfRevenue', 0), years)
    maint_pct = path_of(capex.get('maintenancePctOfRevenue', 0), years)
    growth_capex = path_of(capex.get('growthSchedule', 0), years)
    r_days = path_of(wc_in['receivableDays'], years)
    i_days = path_of(wc_in['inventoryDays'], years)
    p_days = path_of(wc_in['payableDays'], years)
    repay = path_of(fin.get('repaymentSchedule', 0), years)
    draw = path_of(fin.get('drawdownSchedule', 0), years)

    tax_rate = F(str(fin['taxRate']))
    int_rate = F(str(fin['interestRate']))
    cash_yield = F(str(fin.get('cashYield', 0)))
    dep_rate = F(str(dep_in['rate']))

    net_block = F(str(dep_in['openingNetBlock']))
    debt = F(str(fin.get('openingDebt', 0)))
    cash = F(str(fin.get('openingCash', 0)))
    fixed = F(str(opex['fixedBase']))
    prior_wc = None

    diluted = (F(str(sh['basic'])) + F(str(sh.get('esop', 0) or 0))
               + F(str(sh.get('warrants', 0) or 0)) + F(str(sh.get('convertibles', 0) or 0)))

    seg = []
    for i, s in enumerate(sectors):
        seg.append({
            'baseVolume': F(str(s['baseVolume'])),
            'volumeCagr': F(str(s['volumeCagr'])),
            'baseRealisation': F(str(s['baseRealisation'])),
            'realisationCagr': F(str(s['realisationCagr'])),
            'grossMargin': path_of(s['grossMargin'], years),
        })

    base_revenue = sum((s['baseVolume'] * s['baseRealisation'] for s in seg), F(0))

    rows = []
    for t in range(years):
        revenue = F(0)
        gross_profit = F(0)
        for s in seg:
            volume = s['baseVolume'] * (1 + s['volumeCagr']) ** (t + 1)
            realisation = s['baseRealisation'] * (1 + s['realisationCagr']) ** (t + 1)
            r = volume * realisation
            revenue += r
            gross_profit += r * s['grossMargin'][t]
        cogs = revenue - gross_profit

        if t > 0:
            fixed *= (1 + fixed_growth[t])
        variable = revenue * variable_pct[t]
        ebitda = gross_profit - fixed - variable

        dep = net_block * dep_rate
        ebit = ebitda - dep

        interest = debt * int_rate
        interest_income = cash * cash_yield
        pbt = ebit - interest + interest_income
        tax = pbt * tax_rate if pbt > 0 else F(0)
        pat = pbt - tax

        receivables = (revenue * r_days[t]) / 365
        inventory = (cogs * i_days[t]) / 365
        payables = (cogs * p_days[t]) / 365
        wc = receivables + inventory - payables
        d_wc = F(0) if prior_wc is None else wc - prior_wc

        capex_total = revenue * maint_pct[t] + growth_capex[t]
        net_borrowing = draw[t] - repay[t]

        nopat = ebit * (1 - tax_rate)
        fcff = nopat + dep - capex_total - d_wc

        rows.append({'revenue': revenue, 'ebitda': ebitda, 'ebit': ebit,
                     'pat': pat, 'fcff': fcff,
                     'epsDiluted': pat / diluted})

        net_block = net_block + capex_total - dep
        debt = debt + net_borrowing
        cash = cash + (pat + dep - d_wc + interest) + (-capex_total) + (net_borrowing - interest)
        prior_wc = wc

    return {'rows': rows, 'diluted': diluted, 'baseRevenue': base_revenue}


def reference_dcf(fcff: list[F], rate: F, g: F, net_debt: F, shares: F) -> Decimal:
    """Mid-year discounted value per share.

    Exact up to the half-year discount factor, which is a square root and is
    therefore carried in 60-digit decimal instead.
    """
    one_plus = Decimal(rate.numerator) / Decimal(rate.denominator) + 1
    pv = Decimal(0)
    for t, f in enumerate(fcff, start=1):
        fd = Decimal(f.numerator) / Decimal(f.denominator)
        pv += fd / (one_plus ** (t - 1)) / one_plus.sqrt()
    last = Decimal(fcff[-1].numerator) / Decimal(fcff[-1].denominator)
    gd = Decimal(g.numerator) / Decimal(g.denominator)
    terminal = last * (1 + gd) / (one_plus - 1 - gd)
    pv += terminal / (one_plus ** (len(fcff) - 1)) / one_plus.sqrt()
    nd = Decimal(net_debt.numerator) / Decimal(net_debt.denominator)
    sh = Decimal(shares.numerator) / Decimal(shares.denominator)
    return (pv - nd) / sh


# ------------------------------------------------------------- the compare

def as_dec(x) -> Decimal:
    if isinstance(x, F):
        return Decimal(x.numerator) / Decimal(x.denominator)
    return Decimal(x)


def deviation(js: float, exact) -> Decimal:
    """How far the stored figure is from the exact value, in absolute units.

    Relative error is the wrong measure here and measuring it was the first
    thing this file got wrong. The engine stores every figure through r2(),
    which rounds to two decimals, so the difference from the exact value is
    dominated by that rounding — about 0.005 in absolute terms, which on a
    revenue of 1e6 shows up as a "relative error" of 5e-9 and looks alarming
    while being exactly what rounding to paise is supposed to do.

    The meaningful question is whether the stored number is the CORRECTLY
    rounded exact value: any deviation above half a unit in the last place
    means real computational error, and anything at or below it is the
    rounding the engine performs deliberately.
    """
    return abs(Decimal(repr(js)) - as_dec(exact))


HALF_ULP = Decimal('0.005')   # half of the last decimal place the engine stores


def correctly_rounded(js: float, exact) -> bool:
    """Is the stored figure exactly what rounding the true value gives?

    The engine rounds half away from zero — Math.round((n + EPSILON) * 100) —
    so the reference rounds the same way. This is the strict form of the test
    above: not merely close enough, but the identical two-decimal figure an
    exact calculation would have produced.
    """
    return Decimal(repr(js)) == as_dec(exact).quantize(Decimal('0.01'),
                                                      rounding='ROUND_HALF_UP')


def main() -> int:
    worst = Decimal(0)
    worst_where = ''
    checked = [0, 0]   # figures compared, figures exactly correctly rounded
    failures = []

    for name, path in PAYLOADS:
        eng = js_engine(path)
        if not eng['built'].get('available'):
            print(f'{name}: the model did not build — {eng["built"].get("reason")}')
            continue

        ref = reference_model(eng['drivers'])
        js_rows = eng['built']['years']

        print(f'\n{name}  —  {len(ref["rows"])} forecast years, '
              f'{len(eng["drivers"]["sectors"])} sectors')
        print(f'  {"":22}{"exact (rational)":>24}{"JavaScript":>18}{"deviation":>14}')

        for i, (rr, jr) in enumerate(zip(ref['rows'], js_rows)):
            for key in ('revenue', 'ebitda', 'ebit', 'pat', 'fcff'):
                exact = rr[key]
                dev = deviation(jr[key], exact)
                if dev > worst:
                    worst, worst_where = dev, f'{name} year {i+1} {key}'
                if i == 0:
                    print(f'  Y1 {key:<19}{float(exact):>24,.8f}{jr[key]:>18,.2f}{float(dev):>14.2e}')
                checked[0] += 1
                if correctly_rounded(jr[key], exact):
                    checked[1] += 1
                if dev > HALF_ULP:
                    failures.append(f'{name} year {i+1} {key}: off by {float(dev):.3e}, '
                                    f'which is more than the 0.005 the engine rounds by')

        # -- the reconciliation comparison, which is the one that decides a flag
        rep = eng.get('reported')
        if rep:
            exact_base = ref['baseRevenue']
            reported = F(str(rep['revenue']))
            exact_off = abs(exact_base - reported) / reported
            js_off = eng['built']['reconciliation']['offByPct'] / 100
            print(f'  base year off by      {float(exact_off)*100:>23,.9f}%'
                  f'{js_off*100:>17,.2f}%'
                  f'{float(abs(Decimal(repr(js_off)) - as_dec(exact_off))):>14.2e}')
            same_verdict = (exact_off <= F(2, 100)) == (eng['built']['reconciled'] is True)
            print(f'  verdict agrees with exact arithmetic: {same_verdict}')
            if not same_verdict:
                failures.append(f'{name}: the reconciliation verdict disagrees with exact arithmetic')

        # -- the valuation
        if eng.get('value') and eng['value'].get('available'):
            rate = F(str(eng['valuation']['discountRate']))
            g = F(str(eng['valuation']['terminalGrowth']))
            nd = F(str((eng['drivers'].get('financing') or {}).get('openingDebt') or 0))
            exact_ps = reference_dcf([r['fcff'] for r in ref['rows']], rate, g, nd, ref['diluted'])
            js_ps = eng['value']['perShare']
            dev = deviation(js_ps, exact_ps)
            print(f'  value per share       {float(exact_ps):>24,.8f}{js_ps:>18,.2f}{float(dev):>14.2e}')
            if dev > worst:
                worst, worst_where = dev, f'{name} value per share'
            if dev > HALF_ULP:
                failures.append(f'{name}: value per share off by {float(dev):.3e}')

    print('\n' + '-' * 74)
    print(f'largest deviation from exact arithmetic: {float(worst):.3e}  ({worst_where})')
    print(f'the engine rounds every stored figure to 0.01, so half a unit is '
          f'{float(HALF_ULP)}.')
    print(f'that budget is {float(worst / HALF_ULP):.2%} used, and what remains of it is '
          f'genuine\nfloating-point error: a double carries ~1.1e-16 relative, and this '
          f'chain is\nfive years deep, so it accumulates to order 1e-10 absolute on '
          f'figures of\nthis size — four orders below anything the reports print.')

    print(f'{checked[1]} of {checked[0]} figures are EXACTLY the two-decimal value an '
          f'exact\ncalculation would have produced.')
    if checked[0] and checked[1] < checked[0]:
        failures.append(f'{checked[0] - checked[1]} figure(s) are not the correctly '
                        f'rounded exact value')

    if failures:
        print('\nFAIL')
        for f in failures:
            print('  ' + f)
        return 1
    print('\nPASS — the JavaScript agrees with exact rational arithmetic')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
