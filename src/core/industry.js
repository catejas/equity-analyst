/* The industry-focused financial intelligence engine.
 *
 * Tejas, on the sector report: "What I have asked you to build in the updated
 * framework v5 to have industry focused financial intelligence. Say for
 * Telecom - ARPU, Banks - NIM, Construction, Retail, IT and Tech Industry etc.
 * Include world class industry focused intelligence Engine which can
 * understand the financial information in a more meaningful way in our
 * analysis and make data more meaningful."
 *
 * The complaint underneath that is exact. Every report up to now read the same
 * eleven ratios off every company — EBITDA margin, ROCE, receivable days, net
 * debt to EBITDA — whatever the company did for a living. Those ratios are
 * correct and nearly useless: nobody underwrites a bank on its EBITDA margin
 * or a telco on its receivable days. An analyst covering a bank asks about net
 * interest margin, CASA, gross NPA, provision cover and credit cost; covering
 * a telco, about ARPU, subscribers and churn; covering an EPC contractor,
 * about the order book and how many years of revenue it represents; covering
 * IT services, about utilisation, attrition and revenue per employee. The
 * numbers that matter are a property of the industry, not of the spreadsheet.
 *
 * So this module does four things, in this order, for every metric:
 *
 *   1. CLASSIFY. Work out what kind of business this is, from the sector and
 *      sub-sector the run states, with the company's own description as a
 *      fallback. One family, named, or 'general' when nothing fits — never a
 *      guess dressed as a classification.
 *
 *   2. DERIVE. Compute whatever the reported accounts already contain. A
 *      bank's net interest margin, cost-to-income and credit cost all fall out
 *      of the lender lines the audit already derives; an EPC contractor's
 *      book-to-bill falls out of an order book and a revenue line. A derived
 *      figure is marked derived and carries its own arithmetic, so a reader can
 *      check it rather than trust it.
 *
 *   3. READ. Take what cannot be derived from `industryMetrics` in the
 *      payload, where the research is asked to put ARPU, churn, same-store
 *      sales growth, utilisation and the rest — each with its period and its
 *      source, like every other figure in this system.
 *
 *   4. NAME THE GAP. A metric that is neither derivable nor supplied is
 *      listed as missing, by name, with what it would have told the reader.
 *      This is the part that makes the engine worth having: it is what turns
 *      "the report did not mention ARPU" into "ARPU was not established, and
 *      without it the revenue line cannot be split into price and volume".
 *
 * Nothing here scores anything. The scoring engine is elsewhere and stays
 * there; this makes the financial information meaningful, which is what was
 * asked for.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const S = (v) => (v == null ? '' : String(v).trim());
const low = (v) => S(v).toLowerCase();

/* ── 1. Classification ──────────────────────────────────────────────────
 *
 * Matched on the sector first, then the sub-sector, then the company's own
 * business description — in that order, because the run's own sector field is
 * the one the whole report is built around and a description is prose. The
 * patterns are deliberately plain: this is a lookup, not a classifier, and a
 * clever one that silently mis-files a company would be worse than 'general'.
 */
const FAMILIES = [
  { key: 'lender', label: 'Banks and lenders',
    match: /\b(bank|banking|nbfc|non[- ]banking financ|housing financ|microfinanc|lending|lender|small financ)/ },
  { key: 'insurance', label: 'Insurance',
    match: /\b(insur|assurance|life insur|general insur|reinsur)/ },
  { key: 'telecom', label: 'Telecom',
    match: /\b(telecom|telco|wireless|mobile network|broadband|cellular)/ },
  { key: 'construction', label: 'Construction, EPC and infrastructure',
    match: /\b(construction|epc\b|infrastructur|engineering procurement|road|highway|railway|capital goods)/ },
  { key: 'realestate', label: 'Real estate',
    match: /\b(real estate|realty|property develop|housing develop)/ },
  { key: 'retail', label: 'Retail and consumer',
    match: /\b(retail|quick service|qsr\b|restaurant|apparel|footwear|e-?commerce|consumer durable)/ },
  { key: 'fmcg', label: 'FMCG',
    match: /\b(fmcg\b|consumer staple|packaged food|personal care|household product|beverage)/ },
  { key: 'it', label: 'IT and technology services',
    match: /\b(information technolog|it services|software|saas\b|technolog|bpo\b|bpm\b|ites\b|digital services)/ },
  { key: 'pharma', label: 'Pharmaceuticals and healthcare',
    match: /\b(pharma|drug|healthcare|health care|hospital|diagnostic|biotech|api\b|formulation)/ },
  { key: 'auto', label: 'Automobiles and components',
    match: /\b(auto\b|automobile|automotive|vehicle|two[- ]wheeler|passenger vehicle|auto component|tyre)/ },
  { key: 'cement', label: 'Cement and building materials',
    match: /\b(cement|building material|tile|ceramic)/ },
  { key: 'metals', label: 'Metals and mining',
    match: /\b(metal|steel|alumini|aluminum|copper|zinc|mining|ferrous)/ },
  { key: 'chemicals', label: 'Chemicals',
    match: /\b(chemical|specialty chem|agrochem|petrochem|fertilis|fertiliz)/ },
  { key: 'energy', label: 'Oil, gas and energy',
    match: /\b(oil\b|gas\b|petroleum|refin|upstream|downstream|city gas|lng\b)/ },
  { key: 'power', label: 'Power and utilities',
    match: /\b(power|utilit|electricity|generation|transmission|renewable|solar|wind\b)/ },
  { key: 'logistics', label: 'Logistics and transport',
    match: /\b(logistic|transport|shipping|port\b|airline|aviation|courier|freight|warehous)/ },
  { key: 'media', label: 'Media and entertainment',
    match: /\b(media\b|entertainment|broadcast|film\b|publishing|advertis|gaming)/ },
  { key: 'hotels', label: 'Hotels and travel',
    match: /\b(hotel|hospitality|resort|travel|tourism)/ },
];

export function industryFamily(company, run) {
  const hay = [
    S(company?.subSector), S(company?.sector),
    S(run?.subSector), S(run?.sector),
    S(company?.business?.whatItDoes), S(company?.business?.model),
  ].filter(Boolean).map(low);
  for (const h of hay) {
    for (const f of FAMILIES) if (f.match.test(h)) return { key: f.key, label: f.label, from: h };
  }
  return { key: 'general', label: 'General', from: null };
}

/* ── The metric sets ────────────────────────────────────────────────────
 *
 * One entry per metric: what it is called, what unit it is in, why a reader
 * should care, and — where the accounts contain it — how to derive it. `derive`
 * is handed a context and returns either a number or null; returning null is
 * how a metric says "not from these accounts", which sends it to the payload
 * and then to the gap list.
 *
 * The `why` text is not decoration. It is what appears beside the figure in the
 * report and beside its absence in the gap list, and it is the difference
 * between a number and an intelligence engine.
 */
const pct = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? (a / b) * 100 : null);
const ratio = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);
const growth = (now, then) => (isNum(now) && isNum(then) && then !== 0
  ? ((now - then) / Math.abs(then)) * 100 : null);

const SETS = {
  lender: [
    { key: 'nim', name: 'Net interest margin', unit: '%',
      why: 'What the bank earns on its lending after what it pays for the money. '
        + 'It is the single number a lender lives or dies by, and a bank that grows '
        + 'its book while its margin falls is buying growth.',
      /* Net interest income over assets, and where the audit could not build
         the lender lines — a payload that gives interest expense but not the
         operating costs — straight off the reported row, because interest
         income less interest expense needs nothing else. */
      derive: (x) => {
        /* A bank with no interest expense does not exist. The PSU payload
           reported `interestExpense: 0`, and taking that at face value made
           net interest income equal interest income and printed a 7.5% "net
           interest margin" that was really the asset yield. A zero here is a
           line nobody filled in, not a bank that funds itself for nothing, so
           the metric is refused and named as missing instead. This is the
           same refusal the audit makes when it builds the lender lines. */
        const nii = isNum(x.ll?.netInterestIncome) ? x.ll.netInterestIncome
          : (isNum(x.row?.revenue) && isNum(x.row?.interestExpense)
            && x.row.interestExpense !== 0
            ? x.row.revenue - x.row.interestExpense : null);
        return pct(nii, x.row?.totalAssets) ?? pct(nii, x.row?.revenue);
      } },
    { key: 'costToIncome', name: 'Cost to income', unit: '%',
      why: 'Operating costs as a share of net total income. Where a bank has room '
        + 'to absorb a bad year, and where it does not.',
      derive: (x) => (isNum(x.ll?.costToIncomePct) ? x.ll.costToIncomePct : null) },
    { key: 'creditCost', name: 'Credit cost', unit: '% of advances',
      why: 'Provisions as a share of the loan book. The price of the risk the bank '
        + 'took two years ago, arriving now.',
      derive: (x) => pct(x.ll?.provisions, x.row?.advances) },
    { key: 'casa', name: 'CASA ratio', unit: '%',
      why: 'Current and savings deposits as a share of total deposits. Cheap money '
        + 'the bank does not have to compete for, and the reason two banks with the '
        + 'same loan book earn different margins.' },
    { key: 'gnpa', name: 'Gross NPA', unit: '%',
      why: 'The share of the loan book that has stopped paying. The headline asset '
        + 'quality number.' },
    { key: 'nnpa', name: 'Net NPA', unit: '%',
      why: 'Gross NPA after provisions — what is still exposed to the equity.' },
    { key: 'pcr', name: 'Provision coverage', unit: '%',
      why: 'How much of the bad book is already written down. A low cover means the '
        + 'losses are still ahead of the profit and loss account.' },
    { key: 'roa', name: 'Return on assets', unit: '%',
      why: 'Profit per rupee of balance sheet. The comparison that survives across '
        + 'banks of very different sizes.',
      derive: (x) => pct(x.row?.netProfit, x.row?.totalAssets) },
    { key: 'car', name: 'Capital adequacy', unit: '%',
      why: 'Regulatory capital against risk-weighted assets. How much the bank can '
        + 'grow before it has to come back to shareholders.' },
    { key: 'cdRatio', name: 'Credit to deposit', unit: '%',
      why: 'Advances against deposits. How hard the bank is working its funding.',
      derive: (x) => pct(x.row?.advances, x.row?.deposits) },
    { key: 'advancesGrowth', name: 'Advances growth', unit: '%',
      why: 'How fast the loan book is growing, which is the revenue line of a bank.',
      derive: (x) => growth(x.row?.advances, x.prev?.advances) },
    { key: 'depositGrowth', name: 'Deposit growth', unit: '%',
      why: 'Whether the funding is keeping up with the lending.',
      derive: (x) => growth(x.row?.deposits, x.prev?.deposits) },
    { key: 'slippage', name: 'Slippage ratio', unit: '%',
      why: 'Fresh bad loans as a share of opening standard advances. Asset quality '
        + 'as a flow rather than a stock — it turns before the GNPA does.' },
  ],
  insurance: [
    { key: 'ape', name: 'Annualised premium equivalent', unit: 'reported',
      why: 'New business written, on a basis that does not flatter single-premium '
        + 'policies. The top line of a life insurer.' },
    { key: 'vnbMargin', name: 'Value of new business margin', unit: '%',
      why: 'The profit written into each rupee of new premium. Growth without margin '
        + 'is an insurer buying market share.' },
    { key: 'persistency', name: 'Persistency, 13th month', unit: '%',
      why: 'How many policies are still being paid a year later. Mis-selling shows '
        + 'up here first.' },
    { key: 'combinedRatio', name: 'Combined ratio', unit: '%',
      why: 'Claims plus expenses against premium. Above 100 the underwriting loses '
        + 'money and only the float earns.' },
    { key: 'solvency', name: 'Solvency ratio', unit: 'x',
      why: 'Capital against the regulatory requirement. The constraint on growth.' },
  ],
  telecom: [
    { key: 'arpu', name: 'ARPU', unit: '₹ per subscriber per month',
      why: 'Average revenue per user — the price half of the revenue line. Revenue '
        + 'growth means nothing until it is split into more users and better price, '
        + 'and only ARPU does that.' },
    { key: 'subscribers', name: 'Subscribers', unit: 'million',
      why: 'The volume half. Read against ARPU, never on its own.' },
    { key: 'churn', name: 'Monthly churn', unit: '%',
      why: 'How fast the subscriber base leaks. It sets what the company must spend '
        + 'on acquisition just to stand still.' },
    { key: 'dataUsage', name: 'Data usage per subscriber', unit: 'GB per month',
      why: 'What the network is actually carrying, and the leading indicator of the '
        + 'next capex cycle.' },
    { key: 'capexIntensity', name: 'Capex to revenue', unit: '%',
      why: 'A telco is a capital machine. What share of revenue goes back into the '
        + 'network decides whether the EBITDA is ever free cash.',
      derive: (x) => pct(Math.abs(x.row?.capitalExpenditure ?? NaN), x.row?.revenue) },
    { key: 'ebitdaMargin', name: 'EBITDA margin', unit: '%',
      why: 'Operating leverage in a business whose costs are largely fixed.',
      derive: (x) => pct(x.row?.ebitda, x.row?.revenue) },
    { key: 'netDebtEbitda', name: 'Net debt to EBITDA', unit: 'x',
      why: 'Spectrum and network are bought with debt. This is the constraint on '
        + 'everything else.',
      derive: (x) => ratio((x.row?.totalDebt ?? 0) - (x.row?.cashAndEquivalents ?? 0), x.row?.ebitda) },
  ],
  construction: [
    { key: 'orderBook', name: 'Order book', unit: 'reported',
      why: 'Revenue already won but not yet recognised. For a contractor this is the '
        + 'forecast; the profit and loss account is history.' },
    { key: 'bookToBill', name: 'Book to bill', unit: 'x',
      why: 'Order book divided by trailing revenue — how many years of work is in '
        + 'hand. Below about two, the company is bidding from a standing start.',
      derive: (x) => ratio(x.im?.orderBook, x.row?.revenue) },
    { key: 'orderInflow', name: 'Order inflow', unit: 'reported',
      why: 'What was won this year. The order book can hold up for a year on a '
        + 'single large project while inflow collapses.' },
    { key: 'executionCycle', name: 'Execution cycle', unit: 'months',
      why: 'How long an order takes to become revenue. It converts the book into a '
        + 'schedule rather than a lump.' },
    { key: 'workingCapitalDays', name: 'Net working capital days', unit: 'days',
      why: 'An EPC contractor finances its client. This is where the cash goes and '
        + 'why profitable contractors run out of money.',
      derive: (x) => {
        const r = x.row; if (!r || !isNum(r.revenue) || r.revenue === 0) return null;
        const nwc = (r.receivables ?? 0) + (r.inventory ?? 0) - (r.payables ?? 0);
        return (nwc / r.revenue) * 365;
      } },
    { key: 'receivableDays', name: 'Receivable days', unit: 'days',
      why: 'How long the client takes to pay. With a government client this is a '
        + 'policy variable, not a credit one.',
      derive: (x) => ratio(x.row?.receivables, x.row?.revenue) == null ? null
        : ratio(x.row.receivables, x.row.revenue) * 365 },
    { key: 'cashConversion', name: 'Cash conversion', unit: '%',
      why: 'Operating cash flow against EBITDA. The test of whether the profit is '
        + 'real, and the one contractors most often fail.',
      derive: (x) => pct(x.row?.cashFromOperations, x.row?.ebitda) },
  ],
  realestate: [
    { key: 'preSales', name: 'Pre-sales', unit: 'reported',
      why: 'What was sold, not what accounting recognised. The real top line of a '
        + 'developer.' },
    { key: 'collections', name: 'Collections', unit: 'reported',
      why: 'What was actually received. Pre-sales without collections is a receivable '
        + 'with a marketing budget.' },
    { key: 'unsoldInventory', name: 'Unsold inventory', unit: 'months of sales',
      why: 'How long the completed stock would take to clear. It decides whether the '
        + 'developer prices or waits.' },
    { key: 'netDebtEquity', name: 'Net debt to equity', unit: 'x',
      why: 'The cycle kills developers through the balance sheet, not the income '
        + 'statement.',
      derive: (x) => ratio((x.row?.totalDebt ?? 0) - (x.row?.cashAndEquivalents ?? 0),
        x.row?.shareholdersEquity) },
  ],
  retail: [
    { key: 'sssg', name: 'Same-store sales growth', unit: '%',
      why: 'Growth from the stores that existed last year too. Total revenue growth '
        + 'in retail is mostly new floor space; this is the only part that tells you '
        + 'whether the format works.' },
    { key: 'stores', name: 'Store count', unit: 'stores',
      why: 'The other half of revenue growth, and the one that costs capital.' },
    { key: 'salesPerSqFt', name: 'Revenue per square foot', unit: '₹ per sq ft',
      why: 'Productivity of the space. It is how two retailers with the same revenue '
        + 'are told apart.' },
    { key: 'grossMargin', name: 'Gross margin', unit: '%',
      why: 'What survives the cost of the goods, before the cost of selling them.',
      derive: (x) => pct(x.row?.grossProfit, x.row?.revenue)
        ?? pct((x.row?.revenue ?? NaN) - (x.row?.costOfGoodsSold ?? NaN), x.row?.revenue) },
    { key: 'inventoryDays', name: 'Inventory days', unit: 'days',
      why: 'How long stock sits. In fashion it is the whole business; in staples it '
        + 'is working capital.',
      derive: (x) => {
        const d = ratio(x.row?.inventory, x.row?.costOfGoodsSold ?? x.row?.revenue);
        return d == null ? null : d * 365;
      } },
    { key: 'onlineShare', name: 'Online share of revenue', unit: '%',
      why: 'Where the channel mix is going, and what it does to the value of the '
        + 'store estate.' },
  ],
  fmcg: [
    { key: 'volumeGrowth', name: 'Volume growth', unit: '%',
      why: 'Growth in what was actually sold, stripped of price. An FMCG company '
        + 'growing on price alone is passing through inflation, not winning share.' },
    { key: 'grossMargin', name: 'Gross margin', unit: '%',
      why: 'Where input costs land before advertising is decided.',
      derive: (x) => pct(x.row?.grossProfit, x.row?.revenue) },
    { key: 'adSpend', name: 'Advertising to revenue', unit: '%',
      why: 'The brand is the asset and this is the maintenance charge. A margin beat '
        + 'delivered by cutting it is borrowed from next year.' },
    { key: 'reach', name: 'Distribution reach', unit: 'outlets',
      why: 'In India distribution is the moat. Reach is how it is measured.' },
  ],
  it: [
    { key: 'utilisation', name: 'Utilisation', unit: '%',
      why: 'The share of billable staff actually billing. The first lever pulled when '
        + 'demand softens, and the first sign it has.' },
    { key: 'attrition', name: 'Attrition', unit: '%',
      why: 'How fast people leave. It sets wage inflation, delivery risk and the '
        + 'training cost that runs through the margin.' },
    { key: 'revenuePerEmployee', name: 'Revenue per employee', unit: 'reported',
      why: 'The productivity measure that shows whether a services company is moving '
        + 'up the value chain or just hiring.',
      derive: (x) => ratio(x.row?.revenue, x.im?.employees) },
    { key: 'dealTcv', name: 'Deal wins, TCV', unit: 'reported',
      why: 'Total contract value signed. The order book of a services company, and '
        + 'the only forward-looking number it publishes.' },
    { key: 'ccGrowth', name: 'Constant-currency growth', unit: '%',
      why: 'Growth with the currency taken out. A dollar-reported beat that is entirely '
        + 'the rupee is not growth.' },
    { key: 'offshoreMix', name: 'Offshore mix', unit: '%',
      why: 'Work done from the lower-cost location. It is most of the margin story.' },
    { key: 'clientConcentration', name: 'Top client share', unit: '%',
      why: 'How much of revenue sits with one customer who can leave.' },
    { key: 'ebitMargin', name: 'EBIT margin', unit: '%',
      why: 'Where utilisation, wages, currency and mix all come out.',
      derive: (x) => pct(x.row?.ebit, x.row?.revenue) },
  ],
  pharma: [
    { key: 'rndIntensity', name: 'R&D to revenue', unit: '%',
      why: 'What is being spent to have a product in five years. Cutting it flatters '
        + 'this year and costs the next cycle.',
      derive: (x) => pct(x.im?.rndSpend, x.row?.revenue) },
    { key: 'usShare', name: 'US share of revenue', unit: '%',
      why: 'The highest-margin and highest-risk market. It concentrates both.' },
    { key: 'filings', name: 'ANDA or product filings', unit: 'filings',
      why: 'The pipeline in count form — what converts into revenue two to four years out.' },
    { key: 'observations', name: 'Regulatory observations', unit: 'count',
      why: 'FDA Form 483s and warning letters. One import alert can remove a plant '
        + 'and its revenue in a quarter.' },
    { key: 'grossMargin', name: 'Gross margin', unit: '%',
      why: 'Price erosion in generics shows up here before anywhere else.',
      derive: (x) => pct(x.row?.grossProfit, x.row?.revenue) },
  ],
  auto: [
    { key: 'volumes', name: 'Volumes', unit: 'units',
      why: 'Units sold. The cycle is a volume cycle, and revenue mixes it with price.' },
    { key: 'realisation', name: 'Realisation per unit', unit: '₹ per unit',
      why: 'Average price. Read with volumes it separates a mix improvement from a '
        + 'discount war.',
      derive: (x) => ratio(x.row?.revenue, x.im?.volumes) },
    { key: 'contentPerVehicle', name: 'Content per vehicle', unit: '₹',
      why: 'For a component maker, what it earns on each vehicle built. It grows even '
        + 'when the industry does not.' },
    { key: 'ebitdaMargin', name: 'EBITDA margin', unit: '%',
      why: 'Operating leverage against a largely fixed plant.',
      derive: (x) => pct(x.row?.ebitda, x.row?.revenue) },
    { key: 'capacityUtilisation', name: 'Capacity utilisation', unit: '%',
      why: 'How full the plants are, and therefore whether the next capex is coming.' },
  ],
  cement: [
    { key: 'volumes', name: 'Volumes', unit: 'million tonnes',
      why: 'Tonnes sold. Cement is a volume and realisation business and nothing else.' },
    { key: 'realisationPerTonne', name: 'Realisation per tonne', unit: '₹ per tonne',
      why: 'The price actually achieved, which moves with the region and the month.',
      derive: (x) => ratio(x.row?.revenue, x.im?.volumes) },
    { key: 'ebitdaPerTonne', name: 'EBITDA per tonne', unit: '₹ per tonne',
      why: 'The industry\'s own unit of profitability, and the only fair way to '
        + 'compare producers of different sizes.',
      derive: (x) => ratio(x.row?.ebitda, x.im?.volumes) },
    { key: 'capacity', name: 'Capacity', unit: 'million tonnes',
      why: 'Installed capacity, and what it implies about the region\'s pricing.' },
    { key: 'capacityUtilisation', name: 'Capacity utilisation', unit: '%',
      why: 'Utilisation across the industry is what decides whether price holds.' },
  ],
  metals: [
    { key: 'volumes', name: 'Volumes', unit: 'million tonnes',
      why: 'Tonnes shipped, before the commodity price moves the revenue line.' },
    { key: 'realisationPerTonne', name: 'Realisation per tonne', unit: '₹ per tonne',
      why: 'The price achieved, which is set by a global market rather than the company.',
      derive: (x) => ratio(x.row?.revenue, x.im?.volumes) },
    { key: 'ebitdaPerTonne', name: 'EBITDA per tonne', unit: '₹ per tonne',
      why: 'The spread between the commodity and the cost of making it — the whole '
        + 'business in one number.',
      derive: (x) => ratio(x.row?.ebitda, x.im?.volumes) },
    { key: 'costOfProduction', name: 'Cost of production per tonne', unit: '₹ per tonne',
      why: 'Where on the global cost curve the company sits, which decides who '
        + 'survives the bottom of the cycle.' },
    { key: 'netDebtEbitda', name: 'Net debt to EBITDA', unit: 'x',
      why: 'Measured at the top of the cycle it always looks fine. That is the point '
        + 'of measuring it.',
      derive: (x) => ratio((x.row?.totalDebt ?? 0) - (x.row?.cashAndEquivalents ?? 0), x.row?.ebitda) },
  ],
  chemicals: [
    { key: 'grossSpread', name: 'Gross spread', unit: '%',
      why: 'Realisation against raw material. In chemicals the spread is the business '
        + 'and revenue is mostly pass-through.',
      derive: (x) => pct(x.row?.grossProfit, x.row?.revenue) },
    { key: 'capacityUtilisation', name: 'Capacity utilisation', unit: '%',
      why: 'How full the plants are, and what the next expansion does to the spread.' },
    { key: 'exportShare', name: 'Export share of revenue', unit: '%',
      why: 'Exposure to global demand and to anti-dumping action.' },
    { key: 'rndIntensity', name: 'R&D to revenue', unit: '%',
      why: 'What separates a specialty chemicals company from a commodity one.',
      derive: (x) => pct(x.im?.rndSpend, x.row?.revenue) },
  ],
  energy: [
    { key: 'grm', name: 'Gross refining margin', unit: 'US$ per barrel',
      why: 'The spread between crude and product. For a refiner it is the entire '
        + 'earnings driver and it is set outside the company.' },
    { key: 'throughput', name: 'Throughput', unit: 'million tonnes',
      why: 'Volume run through the refinery or the pipeline.' },
    { key: 'production', name: 'Production', unit: 'reported',
      why: 'For an upstream producer, the volume half of a price-times-volume business.' },
    { key: 'marketingMargin', name: 'Marketing margin', unit: '₹ per litre',
      why: 'The retail spread, which in India is a policy variable as much as a '
        + 'commercial one.' },
  ],
  power: [
    { key: 'plf', name: 'Plant load factor', unit: '%',
      why: 'How much of the installed capacity actually ran. The utilisation measure '
        + 'of a generator.' },
    { key: 'capacity', name: 'Operating capacity', unit: 'MW',
      why: 'The asset base, in the unit the sector is regulated in.' },
    { key: 'tariff', name: 'Realised tariff', unit: '₹ per kWh',
      why: 'What the power actually sold for, against a largely fixed cost base.' },
    { key: 'receivableDays', name: 'Receivable days from discoms', unit: 'days',
      why: 'Generators are paid by state distribution companies. This is the credit '
        + 'risk of the whole sector in one line.',
      derive: (x) => {
        const d = ratio(x.row?.receivables, x.row?.revenue);
        return d == null ? null : d * 365;
      } },
  ],
  logistics: [
    { key: 'volumes', name: 'Volumes handled', unit: 'reported',
      why: 'Tonnes, TEUs, parcels or passengers — the unit the business actually '
        + 'moves, before price.' },
    { key: 'realisation', name: 'Realisation per unit', unit: 'reported',
      why: 'Yield. Read with volumes it separates share gains from price cuts.',
      derive: (x) => ratio(x.row?.revenue, x.im?.volumes) },
    { key: 'assetTurns', name: 'Asset turns', unit: 'x',
      why: 'Revenue per rupee of fleet or terminal. Logistics is a capital business '
        + 'pretending to be a service one.',
      derive: (x) => ratio(x.row?.revenue, x.row?.netFixedAssets) },
    { key: 'loadFactor', name: 'Load factor', unit: '%',
      why: 'How full the capacity went out. Empty capacity costs the same as full.' },
  ],
  media: [
    { key: 'subscribers', name: 'Subscribers', unit: 'million',
      why: 'The recurring half of the revenue line.' },
    { key: 'arpu', name: 'ARPU', unit: '₹ per subscriber per month',
      why: 'Price per subscriber. Subscriber growth at falling ARPU is a discount, '
        + 'not a franchise.' },
    { key: 'adRevenueShare', name: 'Advertising share of revenue', unit: '%',
      why: 'The cyclical half. It moves with the economy and the subscription half '
        + 'does not.' },
    { key: 'contentSpend', name: 'Content spend to revenue', unit: '%',
      why: 'The cost of staying relevant, and the thing that is cut to make a quarter.' },
  ],
  hotels: [
    { key: 'occupancy', name: 'Occupancy', unit: '%',
      why: 'How full the rooms were. The volume half of a fixed-cost business.' },
    { key: 'arr', name: 'Average room rate', unit: '₹ per room night',
      why: 'The price half. Occupancy bought with rate is not a recovery.' },
    { key: 'revpar', name: 'RevPAR', unit: '₹ per available room',
      why: 'Occupancy times rate — the industry\'s own single measure, and the one '
        + 'that shows operating leverage.',
      derive: (x) => (isNum(x.im?.occupancy) && isNum(x.im?.arr)
        ? (x.im.occupancy / 100) * x.im.arr : null) },
    { key: 'roomsAdded', name: 'Rooms added', unit: 'rooms',
      why: 'Where the next year\'s capacity comes from, owned or managed.' },
  ],
  general: [
    { key: 'ebitdaMargin', name: 'EBITDA margin', unit: '%',
      why: 'Operating profitability before the capital structure.',
      derive: (x) => pct(x.row?.ebitda, x.row?.revenue) },
    { key: 'revenueGrowth', name: 'Revenue growth', unit: '%',
      why: 'The top line, year on year.',
      derive: (x) => growth(x.row?.revenue, x.prev?.revenue) },
    { key: 'cashConversion', name: 'Cash conversion', unit: '%',
      why: 'Operating cash flow against EBITDA. Whether the profit is real.',
      derive: (x) => pct(x.row?.cashFromOperations, x.row?.ebitda) },
    { key: 'netDebtEbitda', name: 'Net debt to EBITDA', unit: 'x',
      why: 'What the balance sheet can carry.',
      derive: (x) => ratio((x.row?.totalDebt ?? 0) - (x.row?.cashAndEquivalents ?? 0), x.row?.ebitda) },
  ],
};

/* Aliases a research tool is likely to use for the same thing. The payload is
   written by a language model reading annual reports, so "netInterestMargin",
   "nim" and "NIM" all arrive, and refusing the last two would put a supplied
   figure in the gap list. */
const ALIASES = {
  nim: ['netInterestMargin', 'nim'],
  casa: ['casaRatio', 'casa'],
  gnpa: ['grossNpa', 'gnpaRatio', 'gnpa', 'grossNpaRatio'],
  nnpa: ['netNpa', 'nnpaRatio', 'nnpa', 'netNpaRatio'],
  pcr: ['provisionCoverageRatio', 'provisionCoverage', 'pcr'],
  car: ['capitalAdequacy', 'crar', 'car', 'capitalAdequacyRatio'],
  cdRatio: ['creditDepositRatio', 'cdRatio'],
  costToIncome: ['costToIncome', 'costIncomeRatio'],
  creditCost: ['creditCost', 'creditCosts'],
  roa: ['returnOnAssets', 'roa'],
  slippage: ['slippageRatio', 'slippage'],
  arpu: ['arpu', 'averageRevenuePerUser'],
  subscribers: ['subscribers', 'subscriberBase', 'subs'],
  churn: ['churn', 'churnRate', 'monthlyChurn'],
  dataUsage: ['dataUsage', 'dataPerSubscriber'],
  orderBook: ['orderBook', 'orderBacklog', 'backlog'],
  orderInflow: ['orderInflow', 'orderIntake', 'newOrders'],
  bookToBill: ['bookToBill', 'orderBookToRevenue'],
  executionCycle: ['executionCycle', 'executionPeriod'],
  sssg: ['sssg', 'sameStoreSalesGrowth', 'lfl', 'likeForLikeGrowth'],
  stores: ['stores', 'storeCount', 'outlets'],
  salesPerSqFt: ['salesPerSqFt', 'revenuePerSquareFoot'],
  onlineShare: ['onlineShare', 'ecommerceShare', 'omniShare'],
  utilisation: ['utilisation', 'utilization', 'billedUtilisation'],
  attrition: ['attrition', 'attritionRate'],
  employees: ['employees', 'headcount', 'employeeCount'],
  revenuePerEmployee: ['revenuePerEmployee'],
  dealTcv: ['dealTcv', 'tcv', 'dealWins'],
  ccGrowth: ['ccGrowth', 'constantCurrencyGrowth'],
  offshoreMix: ['offshoreMix', 'offshoreRevenueShare'],
  clientConcentration: ['clientConcentration', 'topClientShare'],
  volumes: ['volumes', 'volume', 'unitsSold', 'tonnage'],
  realisation: ['realisation', 'realization', 'averageRealisation'],
  realisationPerTonne: ['realisationPerTonne', 'realizationPerTonne', 'npr'],
  ebitdaPerTonne: ['ebitdaPerTonne'],
  rndSpend: ['rndSpend', 'researchAndDevelopment', 'rdSpend'],
  rndIntensity: ['rndIntensity', 'rdToSales'],
  plf: ['plf', 'plantLoadFactor'],
  occupancy: ['occupancy', 'occupancyRate'],
  arr: ['arr', 'averageRoomRate'],
  revpar: ['revpar'],
};

/* The payload's own industry block, flattened so a metric can be looked up by
   any of its names. Two shapes are accepted because both turn up: a plain
   object of name to value, and a list of readings each with its own period and
   source. The list form is preferred — a figure with no period is half a
   figure — but refusing the object form would discard real data. */
function readSupplied(company) {
  const out = {};
  const put = (k, v, meta) => {
    const key = S(k); if (!key) return;
    if (isNum(v)) out[key] = { value: v, ...meta };
    else if (v && typeof v === 'object' && isNum(v.value)) {
      out[key] = { value: v.value, unit: S(v.unit) || meta?.unit,
        period: S(v.period) || meta?.period, source: S(v.source) || meta?.source };
    }
  };
  const block = company?.industryMetrics;
  if (Array.isArray(block)) {
    block.forEach((m) => put(m?.key ?? m?.name, m?.value ?? m,
      { unit: S(m?.unit), period: S(m?.period), source: S(m?.source) }));
  } else if (block && typeof block === 'object') {
    Object.keys(block).forEach((k) => put(k, block[k], {}));
  }
  /* A handful of these also arrive as ordinary fields on the reported year,
     because that is where an annual report puts them. */
  return out;
}

function pickSupplied(supplied, key) {
  const names = ALIASES[key] || [key];
  for (const n of names) {
    if (supplied[n]) return supplied[n];
    const hit = Object.keys(supplied).find((k) => k.toLowerCase() === n.toLowerCase());
    if (hit) return supplied[hit];
  }
  return null;
}

/* ── The panel ──────────────────────────────────────────────────────────
 *
 * One call per company. `lenderLines` is passed in rather than recomputed,
 * because the audit has already derived a bank's operating lines and two
 * derivations of the same thing is exactly how the tear sheet came to disagree
 * with the statements.
 */
/* A fiscal period as a sortable number: FY26 and Q1 FY27 both resolve to the
   fiscal year, which is enough to order a series of annual rows. */
function fyOf(period) {
  const m = /FY\s*'?(\d{2,4})/i.exec(S(period));
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return v < 100 ? 2000 + v : v;
}
function orderedAnnual(rows) {
  const list = arr(rows).filter(Boolean);
  const keyed = list.map((r, i) => ({ r, k: fyOf(r.period), i }));
  if (keyed.some((x) => x.k == null)) return list;   /* unparseable: leave as given */
  return keyed.sort((a, b) => (a.k - b.k) || (a.i - b.i)).map((x) => x.r);
}

export function industryPanel(company, run, opts = {}) {
  const fam = industryFamily(company, run);
  const set = SETS[fam.key] || SETS.general;
  /* Oldest first, so "the latest year" is the latest year.
   *
   * The payload's annual array arrives in whatever order the research wrote
   * it, and taking the last element read FY24 off a series whose newest row
   * was FY26 — which then dated every derived metric two years stale on a
   * report whose whole complaint was stale data. */
  const rows = orderedAnnual(company?.financials?.annual);
  const row = rows.length ? rows[rows.length - 1] : null;
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const lls = arr(opts.lenderLines).filter((x) => x && x.available !== false);
  const ll = lls.length ? lls[lls.length - 1] : null;
  const supplied = readSupplied(company);
  const im = {};
  Object.keys(supplied).forEach((k) => { im[k] = supplied[k].value; });
  /* The derived-from context. Kept small on purpose: a derive function that
     needs more than the latest year, the year before it, the lender lines and
     the supplied block is doing analysis, and analysis belongs in prose. */
  const ctx = { row, prev, ll, im, rows };

  /* Deriving from the latest year that actually carries the inputs.
   *
   * The newest reported year is the right one to quote, but a payload does not
   * always fill every line on it — a bank whose FY26 row omits interest
   * expense can still have an FY24 row that carries it. Quoting nothing in
   * that case throws away a real reading; quoting it as FY26 would be a lie.
   * So the derivation walks back through the reported years until one works,
   * and the period column says which year it came from. */
  const yearsDesc = rows.slice().reverse();
  const deriveFrom = (m) => {
    for (let k = 0; k < yearsDesc.length; k++) {
      const r = yearsDesc[k];
      const before = rows[rows.length - k - 2] || null;
      const llFor = lls.filter((x) => S(x.period) === S(r.period)).pop()
        || (k === 0 ? ll : null);
      let d = null;
      try { d = m.derive({ row: r, prev: before, ll: llFor, im, rows }); } catch { d = null; }
      if (isNum(d)) return { value: d, period: S(r.period) || null };
    }
    return null;
  };

  const metrics = [];
  const missing = [];
  for (const m of set) {
    let value = null;
    let basis = null;
    let period = S(row?.period) || null;
    let source = null;
    const sup = pickSupplied(supplied, m.key);
    if (sup && isNum(sup.value)) {
      value = sup.value;
      basis = 'stated';
      period = S(sup.period) || period;
      source = S(sup.source) || null;
    } else if (typeof m.derive === 'function') {
      const hit = deriveFrom(m);
      if (hit) { value = hit.value; basis = 'derived'; period = hit.period || period; }
    }
    if (isNum(value)) {
      metrics.push({ key: m.key, name: m.name, unit: sup?.unit || m.unit,
        value, basis, period, source, why: m.why });
    } else {
      missing.push({ key: m.key, name: m.name, unit: m.unit, why: m.why,
        derivable: typeof m.derive === 'function' });
    }
  }

  return {
    family: fam.key,
    label: fam.label,
    available: metrics.length > 0,
    metrics,
    missing,
    /* What the set is for, said once at the top of the panel. */
    intro: INTRO[fam.key] || INTRO.general,
    coverage: set.length ? metrics.length / set.length : 0,
  };
}

const INTRO = {
  lender: 'A bank is not read the way a manufacturer is. Interest expense is the cost '
    + 'of the product rather than a financing charge, so there is no EBITDA and no EBIT '
    + 'in these accounts; what there is instead is a margin, a cost ratio, an asset '
    + 'quality position and the capital to carry it.',
  insurance: 'An insurer earns twice — on the underwriting and on the float — and the '
    + 'accounts report the second long before the first is settled. These are the '
    + 'measures that separate the two.',
  telecom: 'A telecom revenue line is price times subscribers, over a network bought '
    + 'with debt. Nothing in it can be read without splitting it that way.',
  construction: 'A contractor\'s profit and loss account is history; the order book is '
    + 'the forecast, and the working capital is where the cash actually went.',
  realestate: 'A developer\'s accounting revenue and its actual sales are different '
    + 'years. Pre-sales and collections are the business; the income statement is the '
    + 'accounting.',
  retail: 'Retail revenue growth is new floor space plus like-for-like. Only the second '
    + 'says whether the format is working.',
  fmcg: 'An FMCG company grows on volume, price and distribution, and only one of those '
    + 'three is a franchise.',
  it: 'A services company sells hours. Utilisation, attrition and the rate are the '
    + 'income statement before it becomes one.',
  pharma: 'Today\'s margin is a function of yesterday\'s R&D and tomorrow\'s regulatory '
    + 'inspection. Neither is in the revenue line.',
  auto: 'Volumes and realisation, then operating leverage against a fixed plant. The '
    + 'cycle arrives in that order.',
  cement: 'Cement is tonnes and realisation. Everything else in the accounts follows '
    + 'from those two and the cost per tonne.',
  metals: 'A metals producer takes a price it does not set. Where it sits on the cost '
    + 'curve is the only thing it controls, and the only thing that matters at the '
    + 'bottom of the cycle.',
  chemicals: 'Revenue is mostly pass-through; the spread is the business. Read the '
    + 'margin, not the top line.',
  energy: 'Refining and marketing margins are set outside the company and, in India, '
    + 'partly by policy. Volume is what the company controls.',
  power: 'A generator\'s earnings are capacity times load factor times tariff, and its '
    + 'risk is who pays the bill.',
  logistics: 'Volume, yield and how hard the asset works. A logistics company is a '
    + 'capital business wearing a service business\'s margins.',
  media: 'Subscription revenue is recurring and advertising is cyclical. The mix '
    + 'decides how the business behaves in a downturn.',
  hotels: 'Occupancy and rate, combined into RevPAR, against a cost base that does not '
    + 'move. That is the whole operating leverage story.',
  general: 'No industry-specific metric set applies to this classification, so the '
    + 'general operating measures are shown. Naming the sub-sector in the research run '
    + 'is what selects a specialist set.',
};

export const INDUSTRY_FAMILIES = FAMILIES.map((f) => ({ key: f.key, label: f.label }))
  .concat([{ key: 'general', label: 'General' }]);
export const INDUSTRY_METRIC_SETS = SETS;
