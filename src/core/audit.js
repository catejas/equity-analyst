/* audit.js — re-derive every figure the documents print, and refuse the ones
 * that do not survive it.
 *
 * WHY THIS EXISTS.
 *
 * The tear sheet printed "Pre-provision operating profit 1,22,190" against
 * "Interest income 1,28,206" for Punjab National Bank. An operating profit of
 * ₹1.22 lakh crore on ₹1.28 lakh crore of interest income is not a number a
 * bank can produce; PNB's real figure is about ₹29,000 crore. Tejas caught it
 * on sight — "this is not possible" — and he was right twice over, because the
 * same page had already been corrected once and the correction had only
 * changed the label.
 *
 * The figure came from the payload's `ebit`, which a research tool had filled
 * with a manufacturer's formula: revenue plus other income less operating
 * costs, with a bank's interest expense — its single largest cost, and the
 * cost of the product it sells — left below the line. The arithmetic was
 * internally consistent. Nothing in the application disagreed with it, because
 * nothing in the application was checking.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * Two kinds of check, and the difference between them matters:
 *
 *   1. IDENTITIES. A derived line must follow from its components. Gross
 *      profit is revenue less cost of goods sold. Profit after tax is profit
 *      before tax less tax. These are definitions, not opinions, so a
 *      disagreement is an error in the payload and is reported as one.
 *
 *   2. PLAUSIBILITY. Some figures are arithmetically possible and physically
 *      not. An operating margin of 95%, a tax rate of 300%, earnings per share
 *      that do not multiply back to net profit. These cannot prove an error,
 *      but each one has caught a real one, and a figure that fails is worth
 *      refusing to print rather than printing confidently.
 *
 * What this does NOT do is silently correct anything. A number the application
 * quietly rewrites is worse than a number it prints wrong, because the reader
 * has no way to know it happened. Every finding here is reported, named, and
 * carried into the document's gaps. Where a figure is unsafe the document is
 * told to withhold it rather than print it — and says that it did.
 *
 * Tolerances are relative, not absolute: 0.5% of the larger operand. These
 * payloads are rounded to the crore and a statement that ties to within a few
 * crore on a lakh-crore balance sheet has tied.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const sum = (...xs) => xs.reduce((a, b) => a + (isNum(b) ? b : 0), 0);

/** Relative tolerance. Everything here is reported in crore and rounded. */
const TOL = 0.005;
function ties(a, b) {
  if (!isNum(a) || !isNum(b)) return true;           /* nothing to compare */
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= scale * TOL;
}

function fmt(v) {
  return isNum(v) ? Math.round(v).toLocaleString('en-IN') : '—';
}

/* ------------------------------------------------------------------ lender
 * A bank's income statement is not a manufacturer's with different labels.
 * Interest expense is the cost of the product, so it sits ABOVE the operating
 * line, and the operating result is pre-provision operating profit:
 *
 *     net interest income   = interest income − interest expense
 *     net total income      = net interest income + other income
 *     operating expenses    = employee cost + other expenses + depreciation
 *     PPOP                  = net total income − operating expenses
 *     profit before tax     = PPOP − provisions
 *
 * Every one of those is derived here rather than read, because the field a
 * payload calls `ebit` has already been shown to hold something else.
 */
export function lenderLines(row) {
  if (!row) return null;
  const interestIncome = row.revenue;
  const interestExpense = row.interestExpense;
  if (!isNum(interestIncome)) return null;

  /* THE INPUTS HAVE TO BE THERE.
   *
   * A second PNB payload gave interest expense as 0 and left employee cost,
   * other expenses and other income null. Derived from that, net interest
   * income came out as the whole of interest income, cost-to-income as 0.8%,
   * and the credit cost as 85.8% — three impossible figures, produced by the
   * very code written to stop impossible figures. A reconstruction from
   * missing inputs is not a reconstruction.
   *
   * So the derivation refuses, names what is missing, and the documents print
   * the reported lines as filed with the gap stated. Refusing is the whole
   * point of this file; exempting its own arithmetic would be the same mistake
   * one level down. */
  const missing = [];
  if (!isNum(interestExpense) || interestExpense === 0) {
    missing.push('interest expense, which for a bank is the cost of its deposits and the '
      + 'largest line in its accounts');
  }
  const opexParts = ['employeeCost', 'otherExpenses'].filter((k) => isNum(row[k]));
  if (!opexParts.length) {
    missing.push('operating costs — neither employee cost nor other expenses is given, so '
      + 'cost-to-income cannot be computed');
  }
  if (missing.length) {
    return { period: row.period ?? null, available: false, missing,
      reason: 'A bank\'s operating lines cannot be derived from this year: the payload does not '
        + 'give ' + missing.join('; ') + '.' };
  }

  const nii = interestIncome - interestExpense;
  const otherIncome = isNum(row.otherIncome) ? row.otherIncome : 0;
  const netTotalIncome = nii + otherIncome;
  const opex = sum(row.employeeCost, row.otherExpenses, row.depreciation);
  const ppop = netTotalIncome - opex;
  /* The provisions line. A payload that fills `exceptionalItems` for a bank is
     almost always putting provisions there — it is the only line between PPOP
     and profit before tax — and where profit before tax is also stated, the
     two can be checked against each other rather than assumed. */
  const stated = row.profitBeforeTax;
  const provisions = isNum(row.provisions) ? row.provisions
    : isNum(row.exceptionalItems) ? row.exceptionalItems
      : (isNum(stated) ? ppop - stated : null);

  return {
    period: row.period ?? null,
    available: true,
    interestIncome,
    interestExpense,
    netInterestIncome: nii,
    otherIncome,
    netTotalIncome,
    operatingExpenses: opex,
    preProvisionOperatingProfit: ppop,
    provisions,
    profitBeforeTax: isNum(provisions) ? ppop - provisions : null,
    /* Cost-to-income, which is how a bank's operating efficiency is actually
       quoted, and which a margin on gross interest income is not. */
    costToIncomePct: netTotalIncome > 0 ? (opex / netTotalIncome) * 100 : null,
    netInterestMarginOnIncomePct: interestIncome > 0 ? (nii / interestIncome) * 100 : null,
  };
}

/* ------------------------------------------------------------- the findings
 * severity: 'error'   the figure contradicts its own components
 *           'warn'    the figure is possible but implausible
 * `withhold` names the fields a document must not print on that row.
 */
function finding(severity, period, field, message, withhold = []) {
  return { severity, period: period ?? null, field, message, withhold };
}

/** One year of one company's income statement, balance sheet and cash flow. */
function auditRow(row, { lender }) {
  const out = [];
  const p = row.period ?? null;
  const say = (field, got, want, what, withhold) => {
    if (!isNum(got) || !isNum(want) || ties(got, want)) return;
    out.push(finding('error', p, field,
      `${what}: stated ${fmt(got)}, but its own components give ${fmt(want)} `
      + `(out by ${fmt(got - want)}).`, withhold));
  };

  if (lender) {
    const L = lenderLines(row);
    if (L && L.available === false) {
      out.push(finding('error', p, 'lenderLines', L.reason
        + ' The reported lines are printed as filed and nothing is derived from them.',
        ['derivedLenderLines']));
    } else if (L) {
      /* The check that would have caught the defect this file was written for.
         A bank whose operating profit is most of its interest income has had a
         manufacturer's formula applied to it. */
      if (isNum(row.ebit) && isNum(L.preProvisionOperatingProfit)
          && !ties(row.ebit, L.preProvisionOperatingProfit)) {
        out.push(finding('error', p, 'ebit',
          `The payload's operating profit of ${fmt(row.ebit)} does not deduct interest expense `
          + `of ${fmt(row.interestExpense)}, which for a lender is the cost of the product and `
          + `not a financing charge. Pre-provision operating profit on this year's own `
          + `components is ${fmt(L.preProvisionOperatingProfit)}. The stated figure is a `
          + 'manufacturer\'s EBIT and is not printed.',
          ['ebit', 'ebitda']));
      }
      if (isNum(row.ebitda)) out.push(finding('warn', p, 'ebitda',
        'EBITDA is not a measure for a lender: it excludes interest expense, which is the '
        + 'largest cost a bank has. It is not printed.', ['ebitda']));
      if (isNum(L.profitBeforeTax) && isNum(row.profitBeforeTax)) {
        say('profitBeforeTax', row.profitBeforeTax, L.profitBeforeTax,
          'Profit before tax does not follow from pre-provision operating profit less provisions');
      }
      if (isNum(L.costToIncomePct) && (L.costToIncomePct < 15 || L.costToIncomePct > 90)) {
        out.push(finding('warn', p, 'costToIncome',
          `Cost-to-income works out at ${L.costToIncomePct.toFixed(1)}%. Indian banks run between `
          + 'about 35% and 65%; outside that range the operating cost lines are worth checking '
          + 'against the filing.'));
      }
    }
  } else {
    /* A manufacturer's identities. */
    if (isNum(row.revenue) && isNum(row.costOfGoodsSold)) {
      say('grossProfit', row.grossProfit, row.revenue - row.costOfGoodsSold,
        'Gross profit is not revenue less cost of goods sold');
    }
    if (isNum(row.ebitda) && isNum(row.depreciation)) {
      say('ebit', row.ebit, row.ebitda - row.depreciation, 'EBIT is not EBITDA less depreciation');
    }
    if (isNum(row.ebitda) && isNum(row.revenue) && row.revenue > 0) {
      const m = (row.ebitda / row.revenue) * 100;
      if (m > 70) {
        out.push(finding('warn', p, 'ebitda',
          `EBITDA is ${m.toFixed(1)}% of revenue. Very few businesses outside software and `
          + 'exchanges earn that, so the cost lines are worth checking against the filing.'));
      }
    }
  }

  /* True for every company, lender or not. */
  if (isNum(row.profitBeforeTax) && isNum(row.tax)) {
    say('netProfit', row.netProfit, row.profitBeforeTax - row.tax,
      'Net profit is not profit before tax less tax');
    if (row.profitBeforeTax > 0) {
      const rate = (row.tax / row.profitBeforeTax) * 100;
      if (rate < 0 || rate > 60) {
        out.push(finding('warn', p, 'tax',
          `The effective tax rate works out at ${rate.toFixed(1)}%. India's statutory rate is `
          + '25-35%; a figure far outside that needs an explanation in the accounting section.'));
      }
    }
  }
  if (isNum(row.netProfit) && isNum(row.epsDiluted) && isNum(row.sharesOutstanding)
      && row.sharesOutstanding > 0 && row.epsDiluted !== 0) {
    /* EPS times share count must come back to net profit, in the same unit.
       This is the check that catches a share count in the wrong unit, which no
       identity on the income statement can see. */
    const implied = row.epsDiluted * row.sharesOutstanding;
    if (!ties(implied, row.netProfit)) {
      out.push(finding('warn', p, 'epsDiluted',
        `Diluted EPS of ${row.epsDiluted} on ${fmt(row.sharesOutstanding)} shares implies a net `
        + `profit of ${fmt(implied)}, against ${fmt(row.netProfit)} stated. Either the share `
        + 'count is in a different unit from the profit, or one of the three is wrong.'));
    }
  }
  if (isNum(row.totalAssets) && isNum(row.totalLiabilities)
      && !ties(row.totalAssets, row.totalLiabilities)) {
    out.push(finding('error', p, 'totalLiabilities',
      `The balance sheet does not balance: assets ${fmt(row.totalAssets)} against liabilities `
      + `and equity ${fmt(row.totalLiabilities)}.`));
  }
  if (isNum(row.shareholdersEquity) && isNum(row.shareCapital) && isNum(row.reservesAndSurplus)) {
    say('shareholdersEquity', row.shareholdersEquity,
      row.shareCapital + row.reservesAndSurplus,
      'Shareholders equity is not share capital plus reserves');
  }
  if (isNum(row.totalDebt) && isNum(row.longTermDebt) && isNum(row.shortTermDebt)) {
    say('totalDebt', row.totalDebt, row.longTermDebt + row.shortTermDebt,
      'Total debt is not long-term plus short-term debt');
  }
  if (isNum(row.openingCash) && isNum(row.netChangeInCash)) {
    say('closingCash', row.closingCash, row.openingCash + row.netChangeInCash,
      'Closing cash is not opening cash plus the net change');
  }
  if (isNum(row.cashFromOperations) && isNum(row.cashFromInvesting) && isNum(row.cashFromFinancing)) {
    say('netChangeInCash', row.netChangeInCash,
      row.cashFromOperations + row.cashFromInvesting + row.cashFromFinancing,
      'The net change in cash is not the three cash flows added up');
  }
  return out;
}

/* Figures that sit outside the statements but are printed beside them. */
function auditSnapshot(c) {
  const out = [];
  const sn = c.snapshot || {};
  const v = c.valuation || {};
  if (isNum(sn.week52High) && isNum(sn.week52Low) && sn.week52Low > sn.week52High) {
    out.push(finding('error', null, 'week52',
      `The 52-week low of ${sn.week52Low} is above the high of ${sn.week52High}.`));
  }
  if (isNum(v.currentPrice) && isNum(sn.week52High) && isNum(sn.week52Low)
      && (v.currentPrice > sn.week52High * 1.02 || v.currentPrice < sn.week52Low * 0.98)) {
    out.push(finding('warn', null, 'currentPrice',
      `The price of ${v.currentPrice} sits outside the 52-week range of ${sn.week52Low} to `
      + `${sn.week52High}. One of the three is stale.`));
  }
  for (const [k, label] of [['freeFloatPct', 'Free float'], ['promoter', 'Promoter holding']]) {
    const val = k === 'freeFloatPct' ? sn.freeFloatPct : (arr(c.shareholding)[0] || {}).promoter;
    if (isNum(val) && (val < 0 || val > 100)) {
      out.push(finding('error', null, k, `${label} of ${val}% is not a share of anything.`));
    }
  }
  const q = arr(c.shareholding)[0];
  if (q) {
    const parts = sum(q.promoter, q.fii, q.dii, q.public);
    if (parts > 0 && Math.abs(parts - 100) > 2) {
      out.push(finding('warn', null, 'shareholding',
        `The shareholding pattern adds to ${parts.toFixed(1)}%, not 100%. Some category is `
        + 'missing or double counted.'));
    }
  }
  return out;
}

/* The FORECAST, against the company it is a forecast of.
 *
 * The driver model projected a loss of ₹65,547 crore a year for Punjab
 * National Bank — a bank that earned ₹16,904 crore — because it charges
 * interest below the operating line, which is how a manufacturer is modelled
 * and not how a lender is. Those columns printed in the three statements for
 * weeks. The engine now marks a lender's projections unusable, and this is the
 * check that catches the same shape wherever else it appears: a forecast that
 * turns a profitable company into a permanently loss-making one has not
 * modelled the company, it has modelled something else.
 */
function auditModel(c) {
  const out = [];
  const years = arr(c.__modelYears);
  if (!years.length) return out;
  const reported = arr(c.financials?.annual)
    .map((r) => r.netProfit).filter(isNum);
  if (!reported.length) return out;
  /* The largest reported profit, not the last one: the payload's years arrive
     in no guaranteed order and this file does not sort them. Either way the
     question is the same — did every reported year make money and every
     projected year lose it. */
  const best = Math.max(...reported);
  const projected = years.map((y) => y.pat).filter(isNum);
  if (!projected.length) return out;
  if (reported.every((v) => v > 0) && projected.every((v) => v < 0)) {
    out.push(finding('error', null, 'forecast',
      `The forecast turns a company that has reported profits in every year on file — up to `
      + `${fmt(best)} — into a loss in every one of its ${projected.length} projected years `
      + `(${fmt(projected[0])} in the first). `
      + 'A model that reverses the sign of the business it is modelling has been given the wrong '
      + 'shape of business, not the wrong assumptions. The projections are not printed.',
      ['forecast']));
  }
  return out;
}

/**
 * Audit one company as the payload states it.
 *
 * Returns { findings, withheld, counts } where `withheld` maps a period to the
 * set of fields a document must not print for that year.
 */
export function auditCompany(c, { lender = false, modelYears = null } = {}) {
  if (!c) return { findings: [], withheld: {}, counts: { error: 0, warn: 0 } };
  const findings = [];
  for (const row of arr(c.financials?.annual)) {
    findings.push(...auditRow(row, { lender }));
  }
  findings.push(...auditSnapshot(c));
  findings.push(...auditModel({ ...c, __modelYears: modelYears }));

  const withheld = {};
  for (const f of findings) {
    if (!f.withhold?.length) continue;
    const key = f.period ?? '*';
    withheld[key] = withheld[key] || new Set();
    for (const w of f.withhold) withheld[key].add(w);
  }
  return {
    findings,
    withheld: Object.fromEntries(Object.entries(withheld).map(([k, v]) => [k, [...v]])),
    counts: {
      error: findings.filter((f) => f.severity === 'error').length,
      warn: findings.filter((f) => f.severity === 'warn').length,
    },
  };
}

/** Is this field safe to print for this period? */
export function printable(audit, period, field) {
  if (!audit || !audit.withheld) return true;
  const here = audit.withheld[period] || [];
  const anywhere = audit.withheld['*'] || [];
  return !here.includes(field) && !anywhere.includes(field);
}

/* ==================== A LENDER'S FORECAST =============================
 *
 * The driver model charges interest below the operating line, which is how a
 * manufacturer is modelled. Run on a bank it subtracted the cost of deposits
 * from an operating profit that had never included the interest those deposits
 * earn, and projected a loss of ₹65,547 crore a year for Punjab National Bank
 * — a bank that earns ₹16,904 crore. Those columns printed in the report.
 *
 * Withholding them was the first fix and only half of one: Tejas had asked for
 * five years of statements, two reported and three projected, and a lender
 * getting none of them is a different defect rather than the absence of one.
 *
 * So a bank is forecast the way a bank is forecast. Every assumption below is
 * taken from the company's OWN reported history — not from a template and not
 * from a driver block written for a manufacturer — and every one of them is
 * returned alongside the projection so a reader can disagree with it:
 *
 *   interest income   grows at its own historical compound rate
 *   net interest margin   held at its recent average share of interest income
 *   other income      held at its recent average share of net interest income
 *   cost-to-income    held at its recent average
 *   credit cost       held at its recent average share of interest income
 *   tax rate          held at its recent effective rate
 *
 * Holding a ratio flat is an assumption, not a forecast, and saying so is the
 * point: a bank whose cost-to-income is assumed to improve is a bank whose
 * forecast is doing the work the analyst should be doing.
 */
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function lenderForecast(history, years = 5) {
  const all = arr(history).map(lenderLines).filter(Boolean);
  const rows = all.filter((r) => r.available !== false);
  if (rows.length < 2) {
    const blocked = all.find((r) => r.available === false);
    return { available: false,
      reason: blocked
        ? blocked.reason + ' Without them there is no ratio to hold flat, so no forecast is built.'
        : 'A bank is forecast from its own ratios, and that needs at least two reported years '
          + 'to take an average from. Only ' + rows.length + ' is on file.' };
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = rows.length - 1;

  if (!(first.interestIncome > 0) || !(last.interestIncome > 0)) {
    return { available: false, reason: 'Interest income is missing or not positive in the '
      + 'reported years, so there is nothing to grow.' };
  }
  const growth = Math.pow(last.interestIncome / first.interestIncome, 1 / span) - 1;

  const ratio = (fn) => mean(rows.map(fn).filter(isNum));
  const nimShare = ratio((r) => (r.interestIncome > 0 ? r.netInterestIncome / r.interestIncome : null));
  const feeShare = ratio((r) => (r.netInterestIncome > 0 ? r.otherIncome / r.netInterestIncome : null));
  const costToIncome = ratio((r) => (r.netTotalIncome > 0 ? r.operatingExpenses / r.netTotalIncome : null));
  const creditCost = ratio((r) => (r.interestIncome > 0 && isNum(r.provisions)
    ? r.provisions / r.interestIncome : null));

  const taxRates = arr(history).map((r) => (isNum(r.tax) && isNum(r.profitBeforeTax)
    && r.profitBeforeTax > 0 ? r.tax / r.profitBeforeTax : null)).filter(isNum);
  const taxRate = mean(taxRates);

  for (const [name, v] of [['net interest margin', nimShare], ['cost-to-income', costToIncome]]) {
    if (!isNum(v)) {
      return { available: false,
        reason: `The reported years do not give a ${name}, so a forecast built on one would be `
          + 'an invention rather than an extrapolation.' };
    }
  }
  /* And the ratios have to be believable before anything is built on them. A
     cost-to-income of 0.8% or a credit cost of 85.8% is not a bank; it is a
     payload missing its cost lines, and projecting three years off it would
     dress a gap up as a forecast. */
  const implausible = [];
  if (costToIncome < 0.15 || costToIncome > 0.90) {
    implausible.push(`a cost-to-income of ${(costToIncome * 100).toFixed(1)}% (banks run 35-65%)`);
  }
  if (isNum(creditCost) && (creditCost < 0 || creditCost > 0.25)) {
    implausible.push(`a credit cost of ${(creditCost * 100).toFixed(1)}% of interest income`);
  }
  if (nimShare <= 0 || nimShare > 0.85) {
    implausible.push(`a net interest margin of ${(nimShare * 100).toFixed(1)}% of interest income`);
  }
  if (implausible.length) {
    return { available: false,
      reason: 'The reported years give ' + implausible.join(' and ') + '. Those are not figures a '
        + 'bank produces, so they are a gap in the research rather than a basis for a forecast, '
        + 'and no forecast is built on them.' };
  }

  const sharesRow = arr(history).slice().reverse()
    .find((r) => isNum(r.sharesOutstanding) && r.sharesOutstanding > 0);
  const shares = sharesRow ? sharesRow.sharesOutstanding : null;

  const out = [];
  let income = last.interestIncome;
  for (let i = 1; i <= years; i += 1) {
    income *= (1 + growth);
    const nii = income * nimShare;
    const other = nii * (isNum(feeShare) ? feeShare : 0);
    const netTotal = nii + other;
    const opex = netTotal * costToIncome;
    const ppop = netTotal - opex;
    const provisions = income * (isNum(creditCost) ? creditCost : 0);
    const pbt = ppop - provisions;
    const tax = pbt > 0 ? pbt * (isNum(taxRate) ? taxRate : 0) : 0;
    const pat = pbt - tax;
    out.push({
      year: i,
      projected: true,
      interestIncome: income,
      netInterestIncome: nii,
      otherIncome: other,
      netTotalIncome: netTotal,
      operatingExpenses: opex,
      preProvisionOperatingProfit: ppop,
      provisions,
      profitBeforeTax: pbt,
      tax,
      netProfit: pat,
      epsDiluted: shares ? pat / shares : null,
    });
  }

  return {
    available: true,
    years: out,
    /* Stated, every one, because a ratio held flat is an assumption a reader
       is entitled to argue with. */
    assumptions: [
      { name: 'Interest income growth',
        value: growth * 100, unit: '%',
        basis: `its own compound rate over the ${span + 1} reported years` },
      { name: 'Net interest margin, on interest income',
        value: nimShare * 100, unit: '%',
        basis: 'held at the average of the reported years' },
      { name: 'Other income, against net interest income',
        value: (isNum(feeShare) ? feeShare : 0) * 100, unit: '%',
        basis: 'held at the average of the reported years' },
      { name: 'Cost-to-income',
        value: costToIncome * 100, unit: '%',
        basis: 'held at the average of the reported years' },
      { name: 'Credit cost, against interest income',
        value: (isNum(creditCost) ? creditCost : 0) * 100, unit: '%',
        basis: 'held at the average of the reported years' },
      { name: 'Effective tax rate',
        value: (isNum(taxRate) ? taxRate : 0) * 100, unit: '%',
        basis: taxRates.length ? 'held at the average of the reported years' : 'not stated; nil' },
    ],
    note: 'Every ratio above is held at what this bank has actually reported. Nothing improves '
      + 'because the forecast needs it to — which is the assumption most often smuggled into a '
      + 'bank model and the one most worth disagreeing with.',
  };
}
