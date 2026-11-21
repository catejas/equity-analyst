// prompt-builder.js — builds the research prompt the user copies out.
//
// Generated from the same constants the engine scores with, so the prompt and
// the engine cannot drift apart. Change a rubric anchor and the prompt changes.

import { PILLARS } from './scoring.js';
import { RUBRICS, DIMENSION_RUBRICS, BANDS, BAND_LABELS } from './rubrics.js';
import { PAYLOAD_SCHEMA_VERSION, DIRECT_DIMENSIONS } from './payload-schema.js';
import { FLAG_CATEGORIES, KILL_SWITCH_CATEGORIES } from './ranking.js';
import { HORIZONS } from './multibagger.js';
import { registerChecklist } from './litigation.js';
import { DISCLOSURE_CHECKS } from './forensic.js';
import { INDUSTRY_METRIC_SETS, INDUSTRY_LINES } from './industry.js';
import { digest as updateDigest } from './update.js';

/* The metric keys, listed for the research brief, built from the engine's own
   sets so the prompt and the engine cannot drift apart. Asking for a key the
   engine does not read, or reading one the prompt never asked for, is the
   commonest way a schema and its consumer come unstuck. */
const INDUSTRY_KEY_LIST = Object.keys(INDUSTRY_METRIC_SETS).map((fam) => {
  const lines = INDUSTRY_METRIC_SETS[fam]
    .map((m) => '    "' + m.key + '"  ' + m.name + ' (' + m.unit + ')').join('\n');
  return '  ' + fam + '\n' + lines;
}).join('\n\n');

/* The raw lines per family, asked for on every reported year (build 23). */
const INDUSTRY_LINE_LIST = Object.keys(INDUSTRY_LINES)
  .map((fam) => '  ' + fam.padEnd(13) + INDUSTRY_LINES[fam].map((k) => '"' + k + '"').join(', ')).join('\n');

const list = (arr) => arr.join(', ');

function anchorBlock(pillarKey, componentKey, bands) {
  const lines = bands.map((text, i) => {
    const floor = BANDS[i];
    const ceiling = i === 0 ? 100 : BANDS[i - 1] - 1;
    return `    ${floor}-${ceiling} ${BAND_LABELS[i]}: ${text}`;
  });
  return `  "${componentKey}"\n${lines.join('\n')}`;
}

function rubricSection() {
  const out = [];
  for (const [pillarKey, comps] of Object.entries(RUBRICS)) {
    out.push(`\n### ${PILLARS[pillarKey].label} — key "${pillarKey}"`);
    for (const [componentKey, bands] of Object.entries(comps)) {
      out.push(anchorBlock(pillarKey, componentKey, bands));
    }
  }
  out.push('\n### Overall dimensions — key "dimensions"');
  for (const [componentKey, bands] of Object.entries(DIMENSION_RUBRICS)) {
    out.push(anchorBlock('dimensions', componentKey, bands));
  }
  return out.join('\n');
}

/* The litigation rows the schema shows: one per applicable register. The
   example used to show one row (sebi_orders), and research tools returned
   exactly that one row — eleven essential registers were "never searched" on
   the PNB run. A schema that lists every register is a form to fill in. */
const LIT_ROWS = registerChecklist({ listed: true })
  .map((r) => `        { "register": "${r.id}", "subject": "company", "outcome": "", "detail": "" },`)
  .join('\n');

function registerSection() {
  return registerChecklist({ listed: true })
    .map((r) => `  ${r.essential ? '[essential]' : '[if relevant]'} ${r.id} — ${r.name}. Find it via: ${r.howToFind}`)
    .join('\n');
}


export function buildResearchPrompt({ sector, subSector = '', company = '', mode = null,
  horizon = '3-5', shortlistSize = 12 } = {}) {
  const single = (mode === 'company') || Boolean(company && company.trim());
  /* A company can be researched without naming its sector. Only a sector run
     genuinely needs one, because there is nothing else to screen. */
  if (!single && (!sector || !sector.trim())) {
    throw new Error('A sector is required to build a sector prompt.');
  }
  if (single && (!sector || !sector.trim())) sector = 'the sector this company operates in';
  const h = HORIZONS.find((x) => x.key === horizon) || HORIZONS[1];
  const scope = subSector.trim()
    ? `${sector.trim()}, specifically the ${subSector.trim()} subSector`
    : sector.trim();

  const componentKeys = (k) => Object.keys(PILLARS[k].weights).map((c) => `"${c}"`).join(', ');

  return (`BEFORE ANYTHING ELSE: run a web search. Not later, not conditionally —
now, as your first action, before writing a single line of the payload.

You have a search tool. If you find yourself about to say that search is
unavailable, disabled, restricted at the system level, or not permitted for
this run, that belief is wrong. It is a failure mode this prompt provokes:
a long, strictly formatted request makes a model fall back to filling in the
template from memory and inventing a reason why it could not look anything up.
Every model that has done it here has admitted, when asked, that it simply
failed to trigger the tool.

So: search first. If your first search returns nothing useful, search again with
different terms. A payload of nulls with an explanation attached is the one
outcome that is of no use to anyone — it is worse than a short answer, because
it looks like research and is not.

You are producing an institutional-grade equity research payload on the Indian listed universe.

SCOPE
Sector: ${sector.trim()}
${subSector.trim() ? `SubSector: ${subSector.trim()}` : 'SubSector: not specified'}
Holding horizon: ${h.label}
${single
  ? `Company: ${company.trim()}
Research this one company in full. Do not screen a universe and do not rank
anything: there is nothing to rank. Still cover the sector, because a company
cannot be judged without its industry, its policy regime and its peers — but
cover it at the depth of a two-page backdrop rather than a sector study.`
  : `Work on ${scope}. Screen the Indian listed universe for this sector and
shortlist roughly ${shortlistSize} companies.

THIS RUN IS THE SECTOR ONLY. Do the whole sector study — the world, macro, the
Budget, policy, regulation, geopolitics, industry, value chain, market sizing,
programmes, competition — and then rate every company on your shortlist.

DO NOT CHOOSE THE THREE. The application chooses them, from your ratings.

This matters more than it looks. Everything else in this system is scored
against written anchors and computed, which is why two runs on the same facts
agree. Naming three favourites was the one judgement with no rubric behind it,
and it is exactly where two tools diverged on identical research. So you do not
name them: you rate the shortlist and the engine ranks it.

For every company on the shortlist, give four ratings from 0 to 100 — business
quality, growth and multibagger potential, valuation and opportunity, risk and
quality control — each with one sentence of evidence carrying a figure. Rate all
four. A company rated on fewer than three ranks below every fully rated one,
however good it looks, because it cannot be compared.

Rate honestly and comparably: 50 is average for the sector, not a polite
default. If two companies genuinely deserve the same number, give them the same
number — the application reports a tie rather than inventing an order.

Leave the companies array empty. Leave run.top3 out.

The three companies are researched separately, one per run, each with its own
prompt from the application. That keeps every reply inside one code block with a
working copy button, which is the whole point of splitting it this way.`}

WHAT YOU ARE PRODUCING
A single JSON object, returned as the last thing in your reply, inside one
fenced code block tagged json:

\`\`\`json
{ ... the whole payload ... }
\`\`\`

Two things about that block matter, and both are about how it renders on a
phone rather than about the data:

  1. Put the JSON on ONE LINE, minified. No line breaks, no indentation.
     A pretty-printed payload renders as hundreds of open lines that the reader
     has to scroll past; the same payload minified renders as a single collapsed
     box with a copy button sitting right there. That is the whole difference
     between a payload that is easy to copy and one that is not.
  2. Put "schema" first inside the object, so the collapsed line reads
     {"schema":"equity-analyst/5", ... } and the reader can see what it is
     without opening it.

Put nothing after the closing fence.

If your interface cannot render a code block, wrap the object in marker lines
instead — a line reading <<<EQUITY-ANALYST-DATA before it and a line reading
>>>EQUITY-ANALYST-DATA after it. The application reads either form.

No commentary before the block beyond a sentence or two, no explanation after
it. The application parses what is inside the fence.

HOW MANY BLOCKS

A full run on three companies comes to roughly 150,000 characters, which is
past what most chat interfaces will emit in one reply. So plan the split rather
than being cut off mid-object:

  Block 1   the run, and everything about the sector
  Block 2   the first company
  Block 3   the second company
  Block 4   the third company

Every block repeats the same "run" object and carries a "companies" array with
only that block's company in it. The application merges them: paste the first
and save it, then paste each of the others and use Add To This Analysis. Nothing
is overwritten, so the order does not matter.

If the whole thing genuinely fits in one reply, send it in one. One company at
full depth fits comfortably; three does not.

EVIDENCE LENGTH. Two different things are wanted, and the difference matters.

The evidence on a RATING is a single line, about 200 characters, carrying a
figure. Those are read in a table on a phone, one after another, and a
paragraph in that column helps nobody.

Everything that is read as prose — the investment theses, the moat, margin
expansion, the variant perception, the bear case and its answer, the
mispricing, and the evidence field on each model sector — is a cohesive
paragraph of three or four sentences. Say what is happening, the mechanism by
which it happens, the figure that shows it, and what would have to be true for
it to continue. A clipped fragment states a conclusion and hides the reasoning;
these fields exist to carry the reasoning. Do not pad them to reach a length,
and do not repeat the rating evidence back in different words.

THREE YEARS OF HISTORY, IN FULL.

financials.annual carries THREE completed financial years, newest first, and
every line above that the company reports. Not two, and not a summary.

Three, rather than two, because a cash flow statement is built from movements:
working capital, debt and cash are differences between two balance sheets, so
two years of balance sheet produce only ONE year of cash flow. Three years of
balance sheet produce two years of cash flow, which is the minimum a reader
can see a trend in. The application forecasts three further years from the
driver model, so a complete statement runs three historical years and three
projected ones.

Leave a line out only where the company genuinely does not report it — a bank
has no inventory, a lender has no gross block worth stating. Do not write zero
for a line you did not find: zero is a reading, and a reading you did not take
is a lie about the accounts. Omit the key instead.

IF THE COMPANY IS A LENDER, four more lines are required on every year, because
without them a bank's accounts cannot be read at all:

  "interestExpense": 0,   what it paid for deposits and borrowings — the single
                          largest line in a bank's accounts, and the one that
                          decides whether the margin is real
  "advances": 0,          the loan book
  "deposits": 0,          the funding
  "otherIncome": 0        fee, treasury and recovery income

Do not send an "ebitda" or an "ebit" for a lender. There is no such line in a
bank's accounts: interest expense is the cost of the product, not a financing
charge, and a figure that subtracts operating costs from interest income and
calls the remainder EBITDA produces a 96% margin, which is not a margin. The
application derives net interest income, net total income, pre-provision
operating profit and provisions from the components above and refuses anything
that does not reconcile.

Where the company reports both standalone and consolidated, use consolidated
and say so in "basis". Use the company's own reporting units, consistently,
and state them nowhere else — the application reads them as given.

THE RECONCILIATION RULE. This is the one rule in the schema that is checked
arithmetically, and a model that fails it is discarded silently.

For each entry in model.sectors, baseVolume x baseRealisation is that sector's
revenue in the base year. Summed across every sector, that total MUST equal the
base-year revenue you report in financials.annual for the same period, within
2%. Work backwards from the reported figure: take the revenue you found, split
it across the operating sectors the company itself discloses, and only then
choose a volume and a realisation whose product is that sector's revenue. Use
the company's own units — tonnes and price per tonne, subscribers and ARPU,
advances and yield — never an index, never a normalised 1.0, never a
placeholder. A model whose base year does not tie to reported revenue forecasts
a company that does not exist, and the forecast, the intrinsic value and the
target price are then all wrong in a way that looks plausible. State the
arithmetic in each sector's evidence field: the volume, the realisation, the
product, and the reported figure it ties to.

All three schedules — capex.growthSchedule, financing.repaymentSchedule and
financing.drawdownSchedule — are arrays of exactly 5 numbers, one per forecast
year, even where the number is the same every year and even where it is zero.
A bare number is not acceptable.

Do not copy any of this instruction text into the payload. The payload carries
data only: a key beginning with an underscore, or a value that repeats an
instruction back, is a defect.

You do not produce scores, ratios, intrinsic values or rankings. The application
computes all of those from what you supply. You produce three things: ratings
against written anchors with the evidence behind each one, the operating drivers
of a financial model, and the record of what you searched and found.

═══════════════════════════════════════════════════════════════════
1. HOW TO SEARCH
═══════════════════════════════════════════════════════════════════

Search for a document. Never construct its URL. Reach a filing through a named
search, the register's own search, or a link on a page you already have open.
A URL you assembled from a pattern will fetch the wrong thing or nothing.

A failed fetch is not a finished search. A 404 tells you something about one
address and nothing about the company. Re-search by name, work the other sources
that carry the same fact, and only then record the absence.

Record what you searched, including the searches that found nothing. An empty
list is not evidence that nothing exists.

Query patterns to use, per section:
  Filings          site:nseindia.com "<company>" · site:bseindia.com "<company>"
                   "<company>" annual report FY25 filetype:pdf
                   "<company>" investor presentation
  Transcripts      "<company>" earnings call transcript Q<n> FY<yy>
                   Read the last eight. Then read the last four of the two
                   closest peers, for read-across. This is the step that
                   separates research from desk work.
  Regulator        site:sebi.gov.in "<company>" · site:sebi.gov.in "<promoter>"
  Ratings          site:crisilratings.com "<company>", and the same for ICRA,
                   CARE, India Ratings, Brickwork and Acuité. An "Issuer Not
                   Cooperating" rating is one of the loudest signals available.
  Industry         the sector regulator by name (CEA, PNGRB, TRAI, IRDAI, DGCA,
                   NHAI, FSSAI, CDSCO), the industry association, and the
                   relevant government dataset.
  Alternative      Vahan registrations, port volumes, GST e-way bills,
                   electricity generation, DGFT and Tradestat exports,
                   LinkedIn headcount trend, app download ranks.

No company enters the Top 3 on fewer than 25 searches. Count them and report the
number in run.searchesRun.

Any material figure needs two independent sources, or it is single-source and
must be labelled as such. The same filing scraped by three aggregators is one
source, not three.

═══════════════════════════════════════════════════════════════════
2. SOURCE TIERS
═══════════════════════════════════════════════════════════════════

Tier 1  NSE, BSE, SEBI, RBI, MCA, government and ministries, Union Budget,
        Economic Survey, annual reports, audited financials, investor
        presentations, earnings call transcripts, shareholding patterns,
        Regulation 7 insider disclosures, SAST disclosures, official filings.
Tier 2  World Bank, IMF, OECD, BIS, WTO, UN, recognised industry associations.
Tier 3  Reuters, Bloomberg, FT, Business Standard, Economic Times, Mint,
        Moneycontrol, Screener, Trendlyne, Tijori, public brokerage research.
Tier 4  Social media, forums, blogs, video. Discovery and sentiment only.

A company whose sources are all Tier 4 is rejected. A company with no Tier 1
source is flagged, because nothing about it rests on a filing.

Every source entry takes an evidence label: FACT, CALCULATION, ESTIMATE,
ASSUMPTION, INFERENCE or SPECULATION. Label honestly.

═══════════════════════════════════════════════════════════════════
3. RATINGS AND THEIR ANCHORS
═══════════════════════════════════════════════════════════════════

Every rating is an object, not a number:

  { "score": 78, "band": "Adequate", "evidence": "one sentence stating the
    observable fact that puts it in this band, with the period and the source" }

A bare number does not count. An evidence sentence shorter than twenty
characters does not count. Use null where you could not establish the component
— null is a valid and useful answer, and a guessed number corrupts the ranking
for every other company in the run.

Choose the band first from the anchors below, then pick a score inside it.

${rubricSection()}

═══════════════════════════════════════════════════════════════════
4. THE FINANCIAL MODEL
═══════════════════════════════════════════════════════════════════

Do not supply cash flows. Supply the drivers, and the application builds the
model, ties the three statements together and checks that they tie.

Include the model block only if you can source its drivers. A partial block is
rejected outright. An omitted block costs a section of the report; an invented
one corrupts everything downstream of it.

Every sector needs volume, realisation and a gross margin, each with evidence.
Share count must be fully diluted: state ESOPs outstanding, warrants and
convertibles, and state zero if there genuinely are none. Omitting the overhang
is the commonest error on Indian small caps and it moves per-share value.

═══════════════════════════════════════════════════════════════════
4b. THE FINANCIAL SERIES — NOT OPTIONAL
═══════════════════════════════════════════════════════════════════

The application computes the sector's own metrics — EBITDA margin, ROCE, ROIC,
free cash flow, the cash conversion cycle, receivable days, net debt to EBITDA,
interest cover, accruals and cash conversion — from "financials.annual". It
computes nothing it was not given, and prints "missing input" by name for every
gap, so a series carrying only a revenue line produces a page of blanks where
the financial section should be. Fill every field listed in the schema for THE
LAST THREE AUDITED YEARS — three, not two — on ONE basis, stated on every row.

Three is the minimum because the report prints a full profit and loss account,
a full balance sheet and a full cash flow statement side by side, and two
columns show a change while three show a direction. The projected columns
beside them are built by the application from the driver model you supply, so
set "model.years" to 5: three audited years and five projected is the eight-year
view the finished statement carries.

These figures are published. They are not a matter of judgement and there is no
acceptable reason to leave them null without having looked. Where to find them,
in order:

  1. The annual report itself. Search "<company>" annual report FY26 filetype:pdf
     and read the statement of profit and loss, the balance sheet and the cash
     flow statement. Every field above is a line on one of those three.
  2. The exchange filing of the audited results — site:nseindia.com or
     site:bseindia.com "<company>" financial results — which carries revenue,
     EBITDA, depreciation, finance cost, PBT, tax and PAT for the year and the
     quarter, in the standard LODR format.
  3. The aggregators, which transcribe the same filing and are quickest to read:
     Screener ("<company>" screener.in) gives the P&L, balance sheet, cash flow
     and the ratio strip in one page; Trendlyne, Tijori, Moneycontrol and
     MarketScreener carry the same series. Read the balance sheet page for
     borrowings, equity, cash, receivables, inventory and payables — these are
     the fields most often skipped, and ROCE and ROIC cannot be computed
     without total debt and shareholders' equity.
  4. The credit rating rationale (CRISIL, ICRA, CARE, India Ratings, Brickwork,
     Acuité), which states revenue, EBITDA, PAT, net worth, gearing and
     coverage for two or three years in a single table.
  5. The investor presentation and the earnings call deck.

If a figure still cannot be found after all five, write null for that one field
and say in researchNotes which sources you checked. Do not leave the whole
series short because the first source did not carry it.

Two warnings. Never mix bases: a consolidated revenue with a standalone profit
produces a margin that is not a margin. And where the forensic block and the
financial series both carry a figure for the same year, they must agree — the
application reads the forensic line items as a fallback for anything the series
omits, so a contradiction between them silently changes which number a metric
was computed from.

═══════════════════════════════════════════════════════════════════
4c. THE INDUSTRY METRICS — WHAT THIS INDUSTRY IS ACTUALLY JUDGED ON
═══════════════════════════════════════════════════════════════════

The generic ratios — EBITDA margin, ROCE, receivable days, net debt to EBITDA —
are computed for every company and are nearly useless on their own. Nobody
underwrites a bank on its EBITDA margin or a telco on its receivable days. The
measures that decide whether a business is good are a property of the industry:
net interest margin and CASA for a lender, ARPU and churn for a telco, the order
book and book-to-bill for a contractor, same-store sales growth for a retailer,
utilisation and attrition for IT services.

The application classifies the company from the sector and sub-sector, derives
every one of these it can from the accounts you supply, and reads the rest from
"industryMetrics". Anything it can neither derive nor read is printed in the
report as a named gap with what it would have told the reader — so a missing
ARPU is visible, not silent.

Use these exact keys. Find the ones that apply to this company's industry:

${INDUSTRY_KEY_LIST}

ALSO PUT THE RAW LINES ON EVERY REPORTED YEAR. The application calculates these
measures itself, year by year, from the accounts — net interest margin from
interest income, interest expense and assets; CASA from CASA and total deposits;
provision coverage from gross and net NPA; load factor from RPK and ASK; ARPOB
from occupied bed-days. So for this company's industry, add these lines to EACH
row of financials.annual, in the same reporting unit as the rest of the row
(counts and physical volumes in the unit the company publishes them in):

${INDUSTRY_LINE_LIST}

A line the annual report gives is never left out because the ratio was also
given: the ratio is quoted, the lines are what the application checks it with.

Each reading carries its own period and source, like everything else here. Take
the latest reported period — a quarter where the company reports quarterly, a
year where it does not — and say which it is. Do not convert or rebase: give the
figure in the unit the company itself publishes it in, and name that unit.

═══════════════════════════════════════════════════════════════════
5. FORENSIC INPUTS
═══════════════════════════════════════════════════════════════════

Supply the line items and the application runs Beneish, Altman, Piotroski,
Montier, Sloan accruals, the cash-yield test, cash against profit over a decade,
capex against depreciation, related-party intensity, contingent liabilities,
effective tax rate, other income share, standalone against consolidated,
receivables against growth, and the pledge test.

Two consecutive years are needed for the composite scores. Ten years of profit
and operating cash flow are needed for the single best test available: whether
reported profit ever became cash.

Report these disclosure findings as true or false. Do not soften them:
${Object.entries(DISCLOSURE_CHECKS).map(([k, v]) => `  "${k}" (${v.severity}) — ${v.text}`).join('\n')}

═══════════════════════════════════════════════════════════════════
6. LITIGATION AND REGULATORY REGISTERS
═══════════════════════════════════════════════════════════════════

Search each register against the company, each promoter individually, and each
material subsidiary. Record every search, including the ones that came back
clean and the ones you could not reach. A register never searched and a register
that came back clean look identical in a report unless the report says which.

THIS IS A HARD GATE, NOT A PREFERENCE. Any company with an essential register
left unsearched is BARRED FROM THE TOP 3 by the application, whatever it scores
on everything else — a high score resting on searches nobody performed is the
precise thing this screen exists to refuse. A run that returns three companies
and leaves essential registers unsearched produces a shortlist of nothing.

So: search every register marked [essential] for every company you shortlist,
and return an entry for each one — the "litigation.searched" array in the
schema already lists every register as a row to fill in; keep every row. If a register genuinely cannot be reached,
record it with outcome "register unreachable" and say why — that is an honest
answer and the report will print it. Omitting the entry is not.

${registerSection()}

Outcome is one of: "clear", "matters found", "register unreachable".
If the outcome is "matters found", list the matters with a severity and summary.
A company that has not had every essential register searched cannot enter the
Top 3, however well it scores.

═══════════════════════════════════════════════════════════════════
7. THE SECTOR
═══════════════════════════════════════════════════════════════════
${single ? `This is a company run, so the sector work is a BACKDROP, not a study.
Two pages at most, and only what is needed to judge this one company:

  where the industry sits in its cycle, and the two or three demand drivers
  that actually move this company's revenue
  the policy or regulation that touches it, named, with the money attached
  who it competes with and roughly what share each holds
  anything in the macro picture that changes its earnings — the policy rate for
  a lender, the currency for an exporter, input costs for a manufacturer

Do NOT research the whole sector. No global market sizing, no Budget history,
no value chain, no programme-by-programme treatment, no TAM. Those belong to a
sector run and the application already has them if one was done. Every search
you spend on sector breadth here is a search not spent on the company, and the
company is what this run is for.` : `The reference standard for this document is a sector thematic that spends fifty
pages establishing why an industry will compound before it names a company. The
sector is the argument; the companies are how it is expressed. Work in that
order.

**The world.** This block is about the WORLD, not India. Search for each of:
  - the GLOBAL market size in US$ billion ("marketSize", "unit": "USD billion"),
    the year it is for ("marketSizeYear"), what was measured ("marketSizeBasis"
    — global revenue, global installed base, global credit outstanding) and
    who published it ("source" — an industry body, a multilateral, a
    consultancy report, with its date). India's own market is NOT the global
    market size; it goes in "indiaShare" below.
  - its PAST growth ("cagr"): the compound annual growth over the last five
    years ("y5"), the last three years ("y3") and the growth in the latest
    full year ("y1"), in percent, all on the same basis and from the same
    series where possible. Do NOT give ten- or fifteen-year rates: they are
    not asked for, and figures stitched from different reports are not
    comparable. If the published series gives annual figures, derive y3 and
    y1 from it and say so in "source". And
    the published FORECAST growth for the next five years ("growthForecast").
  - the structural forces reshaping it ("forces", three or more).
  - WHERE INDIA SITS: India's share of the global market in percent, India's
    rank among countries, and the source ("indiaShare"), plus one paragraph
    ("indiaPosition") on what that share implies.
  - global peers: AT LEAST FIVE listed companies OUTSIDE India, drawn from
    more than one country, doing the same thing. For each: market
    capitalisation WITH "marketCapCurrency" ("USD") and "marketCapUnit"
    ("billion"), five-year return, forward PE, past and forecast growth, and
    "makes" — a plain sentence on what it actually makes or sells, not a
    category. Indian companies are the subject of this report, not its
    comparators; do not list them here.

**India.** Growth, inflation, the policy rate, the currency, credit growth and
capacity utilisation, each with its period and source. An undated macro figure
is not usable, and a stale one is worse: search for each of the six and return
the LATEST PUBLISHED PRINT as at today, by quarter or by month, not the last
completed fiscal year. See rule 10a below for where each one is published.

**The Union Budget.** The Budget heads that touch this sector — the ministry's
own demand for grants, the schemes and capital outlays that reach it — for EACH
of the last five Union Budgets, one row per head per year. "announced" is the
Budget Estimate (BE); "spent" is the Actual (from the Budget documents two
years on) or, for the latest years where Actuals are not yet out, the Revised
Estimate (RE) — say which in "spentBasis". Both in INR crore. Search the Budget
at a Glance and the Expenditure Profile on indiabudget.gov.in. If the sector
has no head of its own (banking, for instance), use the heads that reach it —
recapitalisation, credit guarantee funds, interest subvention, capital
expenditure lines — and say so in "reachesSector". Never write 0 for a figure
you did not find; a genuine zero allocation is written 0 with
"spentBasis": "nil allocation". The gap between announced and spent is usually
the story. Add the Economic Survey's own reading of the sector.

**Policy.** Each scheme to the same template: name, ministry, objective,
funding and scope, outcomes to date, challenges, and how it reaches this
sector. Then the evolution of the regime BY ERA, AT LEAST FOUR ERAS, each with
its years and the defining act, circular or reform — from liberalisation (or
the sector's founding regime) to today — in "policyEvolution". A sector thesis
that never mentions policy is not an Indian equity thesis.

**Regulation.** The regulator, the rules, what is under review, and what a
change would cost.

**Geopolitics and supply chains.** Import dependence, export exposure, tariff
and sanction risk, and supply-chain concentration, with THE TRADE DATA BEHIND
EACH CLAIM in "tradeData": at least four rows — the top import partners and
the top export destinations for the sector's goods — each with its value in
US$ million ("unit"), the year and the source (Ministry of Commerce TradeStat,
DGCI&S, UN Comtrade). For a services sector, use the cross-border flows that
apply — services exports, remittances, FDI, external commercial borrowing —
and name the flow. A claim of "low import dependence" with no figure under it
is an opinion.

**The industry.** Structure, where it sits in its cycle, the demand drivers each
tagged positive or negative, where the profit pool sits and whether it is
moving, and the technology shift.

**The value chain.** AT LEAST FIVE nodes, upstream to downstream (raw input →
intermediate → producer → distribution → end user, in this sector's own
terms). At EVERY node, name the listed Indian companies that benefit — with
their NSE symbol in brackets, "Tata Steel (TATASTEEL)" — as direct
beneficiaries, and the companies one step removed as second order. A node with
no listed company named is a gap the report will print.

**TAM, SAM and SOM.** Three different numbers, each with value, unit, year,
basis, source and "method" — how it was arrived at:
  TAM  the whole Indian market for what this sector sells, in INR crore
  SAM  the part the listed companies in this study can actually serve
  SOM  what those listed companies have already captured (their combined
       revenue or volume in it), so SOM ÷ SAM is their realised share
A SOM that is one company's revenue, or a SAM marked "estimate" with no
method, is not a market size.

**Programmes and contracts.** AT LEAST THREE of the major national programmes,
tenders or order pipelines driving demand. Each with scale, timeline,
participants, and — this is the part that matters — "beneficiaries": the
listed companies supplying into it, each with symbol, what they supply and
their share of the programme or its order value. A programme that is not
traced to a listed supplier is background, not research.

**Competition.** ONE market-share table a reader can add up. Choose the one
measure the industry is ranked on (share of gross advances, share of installed
capacity, share of revenue, share of volume sold) and name it in
"competition.metric"; take ONE period that every player has reported for and
name it in "competition.period"; and give the size of the whole market on that
measure in "competition.marketTotal". Then AT LEAST EIGHT players, largest
first, listed and unlisted, together covering at least 80% of the market —
each "share" in PERCENTAGE POINTS of the whole market (23 for 23%, never 0.23),
on that same metric and period. Mixing value share with volume share, or one
year with another, produces a table that does not add up and a ranking that
means nothing. For the three largest, "moat" (what the advantage actually is)
and "whyLeader" (why it has held). Then concentration, entry barriers,
substitution and pricing behaviour.

**Key monitorables.** What would confirm or break the sector thesis. This is
the sector-level equivalent of a thesis breaker.

**Glossary.** Every sector has its own vocabulary. A reader who does not know
what book-to-bill or indigenous content or persistency means cannot use the
report.`}

═══════════════════════════════════════════════════════════════════
8. EACH COMPANY: THE ARGUMENT
═══════════════════════════════════════════════════════════════════

**Three numbered theses.** Each a claim, with the mechanism that makes it true
and the evidence that it is. "Margin expansion" is not a thesis. "Backward
integration into the cathode step removes a 340 basis point import cost from
FY28, and the plant is commissioned" is.

**The moat, argued.** Name the barrier and give the evidence that it has held
through something.

**Management.** Who they are, how long they have been there, and what they
promised against what they delivered. That record is how management is actually
judged.

**Capital allocation.** Ten years of where the cash went and what it earned.

**Why the market has this wrong.** Numbered concerns, each stated in the bear's
own words and then answered. Stating the bear case and leaving it there is not
research; neither is answering a case nobody makes.

**Peers**, on the metrics that suit the sector.

**ESG**, against those peers.

**Snapshot and shareholding.** Market capitalisation, free float, average daily
traded value, the 52-week range, performance at three, six and twelve months
absolute and against the index, and the shareholding pattern quarter by quarter
including pledged shares.

═══════════════════════════════════════════════════════════════════
9. THE JSON
═══════════════════════════════════════════════════════════════════

{
  "run": {
    "schemaVersion": "${PAYLOAD_SCHEMA_VERSION}",
    "sector": "${sector.trim()}",
    "subSector": ${subSector.trim() ? `"${subSector.trim()}"` : 'null'},
    "horizon": "${h.key}",
    "generatedAt": "ISO 8601 timestamp",
    "tool": "the name of the AI tool producing this payload — Claude, ChatGPT, Gemini, Perplexity, or whatever you are",
    "searchesRun": 0,

    // WHAT THE MONEY FIGURES ARE IN. Required. Every money amount anywhere in
    // this payload — financials, forensic line items, market cap, valuations —
    // is in THIS unit and no other. Indian listed companies report in INR
    // crore, so that is almost always the answer. Do not mix units; do not
    // give some figures in crore and others in absolute rupees. Share counts
    // are in the same unit, so a company with 1.1bn shares is 1148 in crore.
    "reporting": { "currency": "INR", "unit": "crore", "basis": "consolidated" },

    "researchNotes": "what you could and could not establish, and why"
  },
  "industryMap": {
    "structure": "", "valueChain": "second and third order beneficiaries too",
    "tam": "size, basis and source, or a statement that it is not verifiable",
    "policy": "", "geopolitics": ""
  },
  "universe": { "identified": 0, "screened": 0, "exclusions": [ { "symbol": "", "reason": "" } ] },

  "shortlist": [
    { "symbol": "", "name": "",
      "ratings": {
        "businessQuality":      { "score": 0, "evidence": "one sentence with a figure in it" },
        "growthMultibagger":    { "score": 0, "evidence": "one sentence with a figure in it" },
        "valuationOpportunity": { "score": 0, "evidence": "one sentence with a figure in it" },
        "riskQuality":          { "score": 0, "evidence": "one sentence with a figure in it" }
      } }
  ],

  // THE WORLD, not India. marketSize is the GLOBAL market, in US$ billion.
  "global": { "marketSize": 0, "unit": "USD billion", "marketSizeYear": "2025",
    "marketSizeBasis": "what was measured — global revenue, installed base, credit outstanding",
    "source": "publisher and date of the estimate",
    "growthForecast": { "cagr": 0, "years": "2025 to 2030", "source": "" },
    "indiaShare": { "value": 0, "rank": 0, "year": "", "source": "",
      "basis": "India's share of the global market, in percent, and its rank among countries" },
    // EVERY rate in this payload is in PERCENTAGE POINTS, never a fraction:
    // eleven percent is 11, not 0.11. This was answered both ways by different
    // tools and the charts had no way to tell them apart.
    "cagr": { "y5": 0, "y3": 0, "y1": 0 },
    "forces": ["what is reshaping the industry"],
    "indiaPosition": "",
    // At least five, from more than one country. marketCapCurrency and
    // marketCapUnit are not optional: "USD" + "billion". A market cap with no
    // currency and no scale cannot be compared with anything.
    "peers": [ { "name": "", "country": "", "marketCap": 0,
      "marketCapCurrency": "USD", "marketCapUnit": "billion", "return5y": 0,
      "forwardPe": 0, "growthPast": 0, "growthForecast": 0,
      "makes": "a sentence on what it makes or sells" } ] },

  "macro": {
    "gdpGrowth":          { "value": 0, "period": "", "source": "" },
    "inflation":          { "value": 0, "period": "", "source": "" },
    "policyRate":         { "value": 0, "period": "", "source": "" },
    "currency":           { "value": 0, "period": "", "source": "" },
    "creditGrowth":       { "value": 0, "period": "", "source": "" },
    "capacityUtilisation":{ "value": 0, "period": "", "source": "" } },

  "budget": { "economicSurvey": "the Survey's own reading of this sector",
    // One row per head per Budget year, five years. announced = Budget
    // Estimate; spent = Actuals, or Revised Estimate where Actuals are not
    // out yet — say which in spentBasis. INR crore.
    "allocations": [ { "head": "", "year": "FY26", "announced": 0, "spent": 0,
      "spentBasis": "Actuals or Revised Estimate", "ministry": "", "reachesSector": "" } ] },

  "policy": [ { "name": "", "ministry": "", "announced": "", "objective": "",
    "funding": "", "outcomes": "", "challenges": "", "reachesSector": "" } ],
  // At least four eras, oldest first, each with its years and defining act.
  "policyEvolution": [ { "era": "1991 to 2001", "what": "" } ],
  "regulation": { "regulator": "", "rules": "", "underReview": "", "costOfChange": "" },

  "geopolitics": { "importDependence": "", "exportExposure": "", "tariffRisk": "",
    "sanctionRisk": "", "concentration": "",
    // At least four rows: top import partners and top export destinations.
    "tradeData": [ { "flow": "import or export", "partner": "", "value": 0,
      "unit": "USD million", "year": "", "source": "" } ] },

  "industry": { "structure": "", "cyclePosition": "", "profitPool": "",
    "technologyShift": "",
    "demandDrivers": [ { "driver": "", "direction": "positive or negative", "why": "" } ] },

  // At least five nodes, upstream to downstream; listed companies named at EVERY node.
  "valueChain": [ { "name": "node, upstream to downstream", "what": "",
    "beneficiaries": ["Company Name (NSESYMBOL)"],
    "secondOrder": ["Company Name (NSESYMBOL), one step removed"] } ],

  "tam": { "tam": { "value": 0, "unit": "INR crore", "basis": "the whole Indian market", "year": "", "source": "", "method": "" },
           "sam": { "value": 0, "unit": "INR crore", "basis": "the part the listed companies can serve", "year": "", "source": "", "method": "" },
           "som": { "value": 0, "unit": "INR crore", "basis": "what the listed companies have captured", "year": "", "source": "", "method": "" } },

  // At least three, each traced to its listed suppliers.
  "programs": [ { "name": "", "scale": 0, "unit": "", "timeline": "",
    "participants": "", "challenges": "",
    "beneficiaries": [ { "symbol": "", "name": "", "supplies": "", "shareOfProgram": "" } ] } ],

  "competition": { "concentration": "", "entryBarriers": "", "substitution": "",
    "pricingBehaviour": "",
    // ONE measure, ONE period, for every player. share is in percentage
    // points of marketTotal (23 for 23%). At least eight players, covering
    // at least 80% of the market.
    "metric": "share of gross advances, or of installed capacity, revenue, volume",
    "period": "FY26",
    "marketTotal": { "value": 0, "unit": "INR crore", "source": "" },
    // EVERY player you can establish a share for, not just the leaders — the
    // chart names the ones above 5% and groups the rest, so a long tail costs
    // nothing and a short list understates concentration. asOf must be the
    // latest period for which every player has reported (rule 10a).
    // moat and whyLeader are asked for on the three largest by share: what the
    // advantage actually is, and why it has held.
    "players": [ { "name": "", "symbol": "NSE symbol if listed", "listed": true, "share": 0, "basis": "the metric above",
      "asOf": "", "source": "", "moat": "", "whyLeader": "" } ] },

  "sectorValuation": { "currentMultiple": 0, "metric": "", "tenYearMedian": 0,
    "tenYearHigh": 0, "tenYearLow": 0, "source": "" },

  "monitorables": ["what would confirm or break the sector thesis"],
  "glossary": [ { "term": "", "meaning": "" } ],
  "companies": [
    {
      "symbol": "", "name": "", "exchange": "NSE or BSE",
      "isin": "the 12-character ISIN, e.g. INE002A01018. It is printed on the exchange quote page and in every annual report. The application fetches the price history by ISIN, so without it the technical panel cannot be built.",
      "sector": "banking, nbfc, insurance, manufacturing, commodity, pharma, it, infrastructure or defence",
      "business": "what it does and how it earns",
      "thesis": ["three falsifiable lines"],

      "snapshot": { "marketCap": 0, "freeFloatPct": 0, "avgDailyValue": 0,
        "week52High": 0, "week52Low": 0,
        "performance": { "m3": 0, "m6": 0, "m12": 0,
                         "m3Relative": 0, "m6Relative": 0, "m12Relative": 0,
                         "benchmark": "the index the relative figures are measured against, named — Nifty 50, Nifty Bank, BSE 500. A relative return with no benchmark named cannot be read." } },
      "shareholding": [ { "period": "Q1FY26", "promoter": 0, "fii": 0, "dii": 0,
        "public": 0, "pledged": 0 } ],

      "theses": [ { "claim": "", "mechanism": "", "evidence": "", "size": "", "by": "when" } ],
      "moat": { "barrier": "", "evidence": "", "testSurvived": "", "durability": "" },
      "management": {
        "people": [ { "name": "", "role": "", "since": "", "background": "" } ],
        "guidanceRecord": [ { "period": "", "promised": "", "delivered": "" } ] },
      "capitalAllocation": { "summary": "",
        "tenYear": [ { "period": "", "operatingCash": 0, "capex": 0, "acquisitions": 0,
          "dividends": 0, "buyback": 0, "debtRepaid": 0, "returnEarned": 0 } ] },
      "mispricing": [ { "concern": "the bear's argument, in the bear's own words",
        "answer": "why it is wrong, or why it is priced in twice over" } ],
      // Every figure for EVERY peer named — a peer with no figures cannot be
      // compared. For a bank or NBFC give pb, roa, nim, gnpa and
      // advancesGrowth instead of evEbitda and ebitdaMargin, which a lender
      // does not have. Percentages in percentage points (11.8 for 11.8%).
      "peers": [ { "name": "", "symbol": "", "listed": true, "marketCap": 0, "pe": 0.0,
        "pb": 0.0, "evEbitda": 0.0, "roe": 0.0, "roa": 0.0, "revGrowth": 0.0,
        "ebitdaMargin": 0.0, "nim": 0.0, "gnpa": 0.0, "advancesGrowth": 0.0,
        "asOf": "", "source": "", "note": "" } ],

      "historicalSectors": [ { "period": "FY25",
        "lines": [ { "name": "", "revenue": 0, "ebit": 0, "marginPct": 0.0 } ] } ],

      "dupont": [ { "period": "FY25", "netProfitMargin": 0.0, "assetTurnover": 0.0,
        "financialLeverage": 0.0, "roe": 0.0, "roic": 0.0, "waccSpreadPct": 0.0 } ],

      "capitalCycle": [ { "period": "FY25", "cwip": 0, "grossBlock": 0,
        "cwipPctOfGrossBlock": 0.0, "note": "" } ],
      "compensation": { "period": "", "fixedPct": 0.0, "variablePct": 0.0,
        "tiedTo": "ROIC, TSR, revenue, or none stated",
        "ceoPayToMedian": 0, "source": "" },

      "esg": { "environment": "", "social": "", "governance": "",
        "versusPeers": "", "score": null,
        "scoreBasis": "if score is null, say in one line why — no rating agency covers it, the rating is paywalled, disclosures are too thin to score. A blank where a number was expected reads as a defect rather than as an absence." },
      "timeline": [ { "when": "", "event": "" } ],

      "businessQuality": { ${componentKeys('businessQuality')} },
      "growthMultibagger": { ${componentKeys('growthMultibagger')} },
      "valuationOpportunity": { ${componentKeys('valuationOpportunity')} },
      "riskQuality": { ${componentKeys('riskQuality')} },
      "dimensions": { ${DIRECT_DIMENSIONS.map((d) => `"${d}"`).join(', ')} },

      "redFlags": [ { "category": "one of: ${list(FLAG_CATEGORIES)}", "severity": "low, moderate or severe", "detail": "" } ],

      "forensic": {
        "current": { "revenue": 0, "receivables": 0, "grossProfit": 0, "currentAssets": 0,
          "netFixedAssets": 0, "grossFixedAssets": 0, "totalAssets": 0, "depreciation": 0,
          "sga": 0, "currentLiabilities": 0, "longTermDebt": 0, "netProfit": 0,
          "cashFromOperations": 0, "inventory": 0, "otherCurrentAssets": 0, "shares": 0, "ebit": 0 },
        "prior": { "same fields for the previous year": 0 },
        "decade": [ { "period": "FY16", "netProfit": 0, "cashFromOperations": 0, "capex": 0, "depreciation": 0 } ],
        "inputs": { "workingCapital": 0, "retainedEarnings": 0, "totalLiabilities": 0, "bookEquity": 0,
          "cashAndEquivalents": 0, "interestIncome": 0, "depositRate": 0.07, "rptRevenue": 0,
          "rptPurchases": 0, "rptLoans": 0, "purchases": 0, "netWorth": 0, "contingentLiabilities": 0,
          "tax": 0, "profitBeforeTax": 0, "statutoryRate": 0.25, "otherIncome": 0,
          "standaloneProfit": 0, "consolidatedProfit": 0, "revenueGrowthPct": 0,
          "receivableGrowthPct": 0, "pledgePctOfPromoterHolding": 0, "priceChangePct": 0 },
        "disclosures": { "auditorResignedWithin24Months": false }
      },

      // ONE ENTRY FOR EVERY REGISTER BELOW, at least against the company —
      // these are the rows to fill in, not examples. outcome is "clear",
      // "matters found" or "register unreachable"; detail says what was
      // searched (the URL or query and the date). Add promoter and
      // subsidiary rows the same way.
      "litigation": { "searched": [
${LIT_ROWS}
        { "register": "sebi_orders", "subject": "promoter", "subjectName": "name of the promoter",
          "outcome": "", "detail": "",
          "matters": [ { "severity": "low, moderate or severe", "category": "", "summary": "", "status": "", "amount": null } ] }
      ] },

      "model": {
        "years": 5,
        "sectors": [ { "name": "", "baseVolume": 0, "volumeCagr": 0.0, "baseRealisation": 0,
          "realisationCagr": 0.0, "grossMargin": 0.0, "evidence": "" } ],
        "opex": { "fixedBase": 0, "fixedGrowth": 0.0, "variablePctOfRevenue": 0.0 },
        "depreciation": { "openingNetBlock": 0, "rate": 0.0 },
        "capex": { "maintenancePctOfRevenue": 0.0, "growthSchedule": [0, 0, 0, 0, 0] },
        "workingCapital": { "receivableDays": 0, "inventoryDays": 0, "payableDays": 0 },
        "financing": { "openingDebt": 0, "repaymentSchedule": [0, 0, 0, 0, 0], "drawdownSchedule": [0, 0, 0, 0, 0],
          "interestRate": 0.0, "taxRate": 0.25, "openingCash": 0, "cashYield": 0.0 },
        "shares": { "basic": 0, "esop": 0, "warrants": 0, "convertibles": 0 }
      },


      "valuation": {
        "currentPrice": 0, "priceAsOf": "", "currency": "INR",
        "discountRate": 0.0, "terminalGrowth": 0.0,
        "method": "which methods and why they suit this sector",
        "bear": { "fairValue": 0, "assumptions": "", "probability": 0.25 },
        "base": { "fairValue": 0, "assumptions": "", "probability": 0.50 },
        "bull": { "fairValue": 0, "assumptions": "", "probability": 0.25 },

        "waccBuildup": { "riskFreeRate": 0.0, "equityRiskPremium": 0.0,
          "leveredBeta": 0.0, "costOfEquity": 0.0, "pretaxCostOfDebt": 0.0,
          "taxRate": 0.0, "afterTaxCostOfDebt": 0.0, "equityWeight": 0.0,
          "debtWeight": 0.0, "wacc": 0.0, "source": "" },

        "sotp": [ { "name": "", "metric": "EBITDA or EV/Sales or book value",
          "metricValue": 0, "multiple": 0.0, "enterpriseValue": 0,
          "stakePct": 100, "perShare": 0, "basis": "why this multiple" } ],

        "impliedExpectations": { "impliedRevenueCagr": 0.0, "impliedEbitMargin": 0.0,
          "impliedYears": 0, "reading": "what the current price is assuming, in one sentence" }
      },

      "consensus": { "source": "", "asOf": "", "estimateCount": 0,
        "revenue": { "y1": 0, "y2": 0 }, "ebitda": { "y1": 0, "y2": 0 }, "eps": { "y1": 0, "y2": 0 },
        "revisionDirection": "up, down or flat" },

      "liquidity": { "avgDailyValue": 0, "currency": "INR", "impactCostPct": 0, "freeFloatPct": 0 },
      "ownership": { "promoter": 0, "fii": 0, "dii": 0, "public": 0,
        "quarters": [ { "period": "", "promoter": 0, "fii": 0, "dii": 0 } ],
        "insiderActivity": "" },

      "baseRates": { "claim": "the growth or margin assumption being made",
        "historicalShare": 0.0, "source": "how often companies in this situation sustained it" },

      // THE INDUSTRY METRICS. The measures an analyst covering THIS industry
      // asks for, which are not the same as the generic ratios. The
      // application derives whatever the accounts already contain and reads
      // the rest from here; anything neither derived nor supplied is printed
      // as a named gap in the report, so an omission is visible rather than
      // silent. One entry per reading, each with its period and its source —
      // the same standard as every other figure in this payload.
      "industryMetrics": [ { "key": "", "value": 0, "unit": "", "period": "",
        "source": "" } ],

      "financials": {
        "annual": [ { "period": "FY26", "basis": "consolidated",

          "revenue": 0, "otherIncome": 0, "costOfGoodsSold": 0, "grossProfit": 0,
          "employeeCost": 0, "otherExpenses": 0, "ebitda": 0, "depreciation": 0,
          "ebit": 0, "interestExpense": 0, "exceptionalItems": 0,
          "profitBeforeTax": 0, "tax": 0, "netProfit": 0,
          "minorityInterest": 0, "epsBasic": 0, "epsDiluted": 0,
          "dividendPerShare": 0, "sharesOutstanding": 0,

          "totalAssets": 0, "netFixedAssets": 0, "capitalWorkInProgress": 0,
          "goodwillAndIntangibles": 0, "investments": 0, "inventory": 0,
          "receivables": 0, "cashAndEquivalents": 0, "otherCurrentAssets": 0,
          "shareholdersEquity": 0, "shareCapital": 0, "reservesAndSurplus": 0,
          "totalDebt": 0, "longTermDebt": 0, "shortTermDebt": 0,
          "payables": 0, "otherCurrentLiabilities": 0, "totalLiabilities": 0,

          "cashFromOperations": 0, "changeInWorkingCapital": 0,
          "capitalExpenditure": 0, "cashFromInvesting": 0,
          "dividendsPaid": 0, "debtRaised": 0, "debtRepaid": 0,
          "equityRaised": 0, "buyback": 0, "cashFromFinancing": 0,
          "netChangeInCash": 0, "openingCash": 0, "closingCash": 0 } ],

        "quarterly": [ { "period": "Q1FY27", "basis": "consolidated", "revenue": 0,
          "ebitda": 0, "netProfit": 0 } ] },

  "priceHistory": {
    "spacing": "weekly",
    "closes": [], "highs": [], "lows": [], "volumes": [],
    "adjusted": true, "asOf": "DD-MM-YYYY",
    "fiftyTwoWeekHigh": { "value": 0, "date": "DD-MM-YYYY" },
    "fiftyTwoWeekLow":  { "value": 0, "date": "DD-MM-YYYY" },
    "twentyDayHigh": 0,
    "pctFrom200DayAverage": 0,
    "averageDailyVolume": 0,
    "latestVolumeVsAverage": 0
  },

      "multibagger": { "plausibility": { "3x@${h.key}": "", "5x@${h.key}": "", "10x@${h.key}": "" },
        "chain": "TAM to share to revenue to margin to cash to reinvestment to returns to value" },

      "variantPerception": { "marketBelieves": "", "researchIndicates": "", "difference": "",
        "evidence": "", "consequence": "" },
      "bearCase": { "argument": "the strongest case against, in its own best form", "answer": "why it is wrong" },
      "technicals": { "summary": "", "dataQuality": "" },
      "catalysts": [ { "event": "", "expectedWindow": "", "impact": "" } ],
      "risks": [ { "risk": "", "severity": "", "probability": 0.0, "impactPct": 0 } ],
      "thesisBreakers": ["at least five measurable conditions that would invalidate the thesis"],
      "upgradeTriggers": ["what would make you more positive"],
      "managementQuestions": ["what you would ask on the next call"],
      "conflicts": [ { "figure": "", "sources": "", "preferred": "", "why": "" } ],
      "sources": [ { "title": "", "publisher": "", "tier": 1, "date": "", "url": "", "evidence": "FACT" } ]
    }
  ]
}

═══════════════════════════════════════════════════════════════════
8. RULES THE APPLICATION ENFORCES
═══════════════════════════════════════════════════════════════════

1. The kill switch. A severe flag in any of ${list(KILL_SWITCH_CATEGORIES)} bars a
   company from the Top 3 no matter how well it scores. So does a missing
   forensic block, a missing litigation search, and any essential register left
   unsearched. Report severe findings as severe.

2. Bear must not exceed bull. Scenario probabilities must sum to 1. Fair values
   are per share, in INR, on the same basis as currentPrice.

3. Consolidated and standalone must not be mixed, and neither must FY and TTM.
   One basis per series, stated on every row.

4. Price history must be adjusted for corporate actions and marked adjusted.
   An unadjusted series produces readings that are wrong, not merely stale.

5. Banks, NBFCs and insurers do not receive ROCE, ROIC or EV multiples. The
   application withholds them. Do not work around it.

6. At least five thesis breakers, each measurable, and at least one upgrade
   trigger. Carrying only downside triggers biases the product.

7. Never invent a figure, a source, a filing, a date or a URL. Where something
   is not verifiable, say so in the relevant field and use null.

8. Shortlist roughly ${shortlistSize} companies for full treatment, and list what
   you screened out and why.

9. The sector blocks are not optional decoration. A report with scores and no
   macro, no Budget, no policy and no programmes is a scoring appendix, not
   research. Where something genuinely cannot be established, omit the block and
   say so in run.researchNotes — the application prints the gap.

10. Every figure carries its period and its source. An undated number is not
    evidence, and the application will print it as undated.

10a. AND IT MUST BE THE LATEST PRINT. This is a standing instruction, not a
    preference. For every dated figure in the report — the macro block, market
    size, industry structure and cycle, geopolitics and trade, market share,
    and anything else carrying a period — search for the most recent published
    reading as at TODAY'S DATE and return that one. Do not answer from what you
    remember: a model's recollection of "GDP growth" settles on the last figure
    it was trained on, which is how a report dated in one year came back
    carrying FY24 across the whole macro block.

    Concretely, for each of these, go and look:
      GDP growth            the latest quarterly national accounts release
                            (MoSPI), by quarter, not the last full fiscal year
      inflation             the latest monthly CPI print (MoSPI), by month
      policy rate           the rate set at the most recent MPC meeting (RBI),
                            with the meeting date
      rupee                 the FBIL/RBI reference rate for US$ ON THE RUN
                            DATE itself (or the last business day before it),
                            period written as the day, e.g. "13-11-2026" —
                            never a quarter, a fiscal year or an average, and
                            never a figure from memory. The application checks
                            this rate against a published reference for the
                            run date and replaces a wrong one.
      credit growth         the latest RBI fortnightly or monthly
                            sectoral-deployment release
      capacity utilisation  the latest RBI OBICUS round
      market size           the most recent published estimate, with its
                            publication date, not a study quoted second-hand
      market share          the latest full reporting period for which every
                            player has reported

    State the period exactly as the source states it — "Q1 FY27", "Aug 2026",
    "MPC 6 Aug 2026" — so the report can show the reader how old each number
    is. A figure more than four quarters old must either be replaced with a
    newer one or be accompanied, in run.researchNotes, by the reason no newer
    reading exists. The application computes each reading's age from its period
    and prints it; a stale block is visible in the finished document.

10b. THE SCHEMA SHOWS ONE EXAMPLE ROW. IT IS NOT ASKING FOR ONE ROW. Every
    array in the schema below is written with a single element so its shape is
    clear, and the commonest failure in a returned payload is that each array
    comes back with exactly one: one quarter, one risk, one catalyst, one year
    of forensic history, one peer. The application counts, and prints every
    shortfall in the finished report as a named gap. The minimums:

      financials.annual          3 completed years, EVERY line on every year
      financials.quarterly       the last 4 reported quarters
      forensic.decade            5 years at least, 10 where they exist
      industryMetrics            every key listed for this industry in 4c
      peers                      4 or more listed peers
      shareholding               the last 4 quarters
      theses                     3
      management.guidanceRecord  3 instances of guidance against delivery
      catalysts                  3, each dated
      risks                      5, each with probability and impact
      sources                    8 or more
      litigation.searched        one row for EVERY register listed in section 6
      and for a sector study:
      global.marketSize          the GLOBAL market, US$ billion, with year and source
      global.indiaShare          India's share of the global market, with rank
      global.peers               5 listed companies outside India, more than one country
      budget.allocations         5 Budget years, announced (BE) AND spent (Actuals or RE)
      policy                     3 or more schemes
      policyEvolution            4 or more eras, dated
      geopolitics.tradeData      4 or more rows, values in US$ million
      valueChain                 5 or more nodes, a listed company named at each
      tam                        TAM, SAM and SOM — three different numbers, each with method
      programs                   3 or more, each with its listed suppliers
      competition.players        8 or more on one metric and one period, 80% of the market
      shortlist                  8 or more companies, all four ratings on each
      monitorables               5
      glossary                   8

    If the whole payload will not fit in one reply, do NOT thin it to make it
    fit. Send what fits as a complete, valid json block, say CONTINUE, and send
    the rest in the next reply. A complete payload in two replies is usable; a
    thin one in a single reply is not.

11. Return the payload as the last thing in your reply, in one fenced json code
    block, so it carries a copy button. Nothing after the closing fence.

12. If a block is still cut off by a length limit, stop at a complete object,
    end the block, and write CONTINUE on the line after it. Send the remainder in
    the next reply in the same fenced form.

═══════════════════════════════════════════════════════════════════
9b. SEARCH UNTIL THE SECTIONS ARE FULL
═══════════════════════════════════════════════════════════════════

Every empty section in the payload is a section missing from the report. The
application prints the gap rather than hiding it, so a thin run produces a thin
document with holes in it, and the reader sees exactly what was not done.

${single ? `Spend the whole budget on this one company. Search until each of these has
something in it:

  ratings          all 52 components, each with its evidence sentence
  theses           three, each with a mechanism and a figure
  moat             the barrier named, and what it has survived
  management       who they are, and promised against delivered
  capital          ten years of where the cash went and what it earned
  mispricing       the bear's own words, each answered
  forensic         two consecutive years of line items, and ten years of
                   profit against operating cash
  litigation       every register, with the clean ones recorded as clean
  financials       three full years of the annual series, every field named in
                   the schema, one basis, so the metrics section computes
  model            sector drivers, costs, capex, working capital, debt, shares
  valuation        price with its date, discount rate, and three scenarios
  market           consensus, shareholding by quarter, liquidity, price history
  peers            the sector's own metrics
  narrative        catalysts, risks with sizes, thesis breakers, questions

Roughly twenty-five searches. The sector backdrop should take two or three of
them, no more.

THE FINANCIAL MODEL IS NOT OPTIONAL. A run that returns zero of the six model
blocks is not a research payload, it is a summary. Sector drivers, cost
structure, capex and depreciation, working-capital days, the debt schedule and
the fully diluted share count are all in the annual report and the latest
quarterly filing, and every one of them is what a valuation is built from.
If a figure genuinely is not disclosed, write null for that one figure and say
where you looked — but do not return the block empty because it was quicker.
The same goes for the price series and the ten-year history: search the
exchange, the annual report, the screener sites and the company's own investor
page before concluding that a number does not exist.

NEITHER IS THE FINANCIAL SERIES. Section 4b lists five places that carry every
field of it, and a run that returns "financials" as a revenue line has not been
to any of them. The metrics section is where a reader checks whether the story
is in the numbers; returning it empty removes the only page in the report that
can contradict the narrative.

A COMPANY RUN STILL NEEDS ITS BACKDROP. Two pages of it: where the industry
sits in its cycle, the policy and regulation that touch this company with the
money attached, who it competes with and roughly what share each holds, and the
macro readings that move its earnings. That is not a sector study and must not
become one — but returning it empty leaves every number in the report with no
context to be read against.` : `Search until each block below has something in it. These are not optional
extras; each one is a named section of the finished report:

  the world        global market size, its growth over 5/3/1 years, and at
                   least FIVE global peers, each with its market cap stated in
                   a named currency and scale, and what it makes
  macro            six readings, each with its period and its source
  budget           the allocations touching this sector over five years, with
                   what was announced AND what was actually spent
  economic survey  the Survey's own words on this sector
  policy           every scheme that touches it, each to the full template
  regulation       the regulator, the rules, what is under review
  geopolitics      import dependence and export exposure WITH the trade data
  industry         structure, cycle, drivers tagged, profit pool
  value chain      every node, and the listed companies sitting at each one
  tam              three figures, each with a basis and a source
  programmes       the contracts driving demand, traced to listed suppliers
  competition      share by player, with the basis stated, for as many players
                   as you can establish — and for the three largest, what the
                   moat is and why they lead

Roughly twenty-five searches. Before you stop, make sure every company on the
shortlist carries all four ratings with evidence — that is what the application
ranks, and an unrated company cannot be chosen however good it is.`}

If a block is still empty after searching for it properly, write null and say so
in researchNotes — that is honest and the report will print it. What is not
acceptable is leaving it empty because it was never looked for.

Two habits that fill these sections fastest: search the primary source directly
rather than commentary about it — the ministry, the regulator, the budget
document, the exchange filing — and when a figure appears in two places with
different values, record both in conflicts rather than silently picking one.

═══════════════════════════════════════════════════════════════════
9c. THE PRICE SERIES
═══════════════════════════════════════════════════════════════════

The application computes the technical panel itself — moving averages, RSI,
MACD, Bollinger bands, Hull average, PSAR, momentum, trend and the twenty-day
breakout test. It needs a series to compute them from, not your reading of one.
Do not send indicator values; send the prices and let the arithmetic happen
where it can be checked.

Send WEEKLY closes for two years — about 104 numbers — and set spacing to
"weekly". Weekly is asked for deliberately: two hundred daily closes is a long
transcription and a single mistyped figure moves an average that every other
reading then rests on. A wrong weekly close moves it far less, and 104 numbers
survive the trip in a way that 250 do not. If you can supply accurate DAILY
closes for a year, send those instead and set spacing to "daily" — the
application scales every window to match.

Highs and lows are optional but unlock PSAR and ATR. Volumes unlock the OBV and,
more usefully, confirm a breakout: a break on no volume is reported differently
from a break on three times average volume.

Then these six figures, which are quoted on any exchange or data page and do not
need transcribing from a series:

  fiftyTwoWeekHigh and fiftyTwoWeekLow, each with its date
  twentyDayHigh
  pctFrom200DayAverage
  averageDailyVolume
  latestVolumeVsAverage

If you cannot get the series, send the six figures anyway. They carry the
breakout and range work on their own. A missing series costs some charts; a
guessed series corrupts every reading built on it, so send null rather than
approximate one.

═══════════════════════════════════════════════════════════════════
10. CHECK BEFORE YOU SEND
═══════════════════════════════════════════════════════════════════

The application repairs a great deal on the way in: a list sent as one item, a
number written as text, a probability given as a percentage, a source tier
written as "Tier 1", a financial row that omits its basis, a price series of the
wrong length. None of that needs your attention.

These are the things it cannot repair, because fixing them would mean deciding
what you meant. Check each one before sending:

  1. Every company has a "symbol" and a "name", and no symbol repeats.
  2. Bear fair value is not above bull fair value.
  3. Scenario probabilities are near enough to 1 to be scaled — three numbers
     that sum to 0.3 will be refused, because that is a contradiction rather
     than a rounding error.
  4. Every red flag, litigation matter and risk has a severity that reads as
     low, moderate or severe. High, medium, minor and critical are all read.
  5. Every red flag category is one of the listed ones.
  6. Every litigation register id is one of the listed ones, and the outcome is
     "clear", "matters found" or "register unreachable". An outcome of "matters
     found" has at least one matter under it.
  7. Every source has a title and a tier from 1 to 4, and not every source is
     tier 4.
  8. Every demand driver says "positive" or "negative".
  9. The model block is complete or absent. A half-filled model is refused;
     leaving it out costs one section and is reported as a gap.
  10. Every financial series uses one basis throughout, consolidated or
      standalone, never mixed.

And the rule that matters more than any of them: **use null freely**. Null is
never an error anywhere in this contract. It means you could not establish the
figure, the application prints that as a gap on the report, and the run is
accepted. A guessed number is far worse than a null, and a payload rejected for
honesty would be the worst outcome of all.

11. Return the payload in one fenced json block, minified onto a single line,
    with "schema" as the first key, as the last thing in the reply. The JSON
    above is spaced out so you can read the contract; what you send must not be.

11b. IF YOU CAN WRITE FILES, ALSO ATTACH THE PAYLOAD AS A .json FILE.
    Name it after the subject — anlon-healthcare.json, psu-banking.json. Give
    the file as well as the fenced block, not instead of it.
    This matters more than it sounds. A payload of this size is often cut off
    when it is copied by hand, and the application then reads only the part that
    arrived: whole sections go missing and it reports them as absent even though
    they are in your reply. A file cannot be truncated by a copy. If your
    interface has no way to attach a file, say so in one line after the block so
    the reader knows to use the copy button on the block rather than selecting
    the text.

12. State in run.researchNotes how many searches you actually ran. If the answer
    is zero, do not send the payload at all — go back and search.

13. Put your own name in run.tool — Claude, ChatGPT, Gemini, Perplexity, or
    whatever you are. The application records which tool produced each run and
    reads it from there, so it never has to ask.`);
}

export const PROMPT_USAGE = [
  'Copy the prompt and run it in a research assistant that can search the web.',
  'Save its reply as a .json file.',
  'Import that file here to build the report.',
];

/* ── The update brief (build 25) ─────────────────────────────────────────
 * Saved research brought up to date. It is the full research brief — the same
 * schema, the same rules, a COMPLETE payload — with three things in front of
 * it: what the saved version said (the digest), the instruction to re-verify
 * every figure rather than copy it, and two extra blocks the app reads to
 * write the Update Summary: `changes` (the tool's account of what moved and
 * why) and, for a company, `thesisCheck`. The app computes every previous
 * against current figure itself; the tool's account is checked against them.
 *
 * Why the whole payload and not just the changes: a reply carrying only what
 * changed leaves the old figures standing beside the new ones with different
 * dates, and a field the tool did not mention reads as "unchanged" when it
 * means "not checked". */
export function buildUpdatePrompt({ previous, previousTs = null, version = null, line = null,
  sector = '', subSector = '', company = '', mode = null, horizon = '3-5', shortlistSize = 12 } = {}) {
  if (!previous || typeof previous !== 'object') throw new Error('An update needs the saved version it updates.');
  const single = (mode === 'company') || Boolean(company && company.trim());
  const base = buildResearchPrompt({ sector, subSector, company, mode, horizon, shortlistSize });
  const prevAsOf = (previous.run && previous.run.generatedAt) || (previousTs ? new Date(previousTs).toISOString() : null);
  const what = single ? `the company ${company}` : `the ${sector}${subSector ? ' — ' + subSector : ''} sector study`;
  const dg = updateDigest(previous, { savedTs: previousTs, version });
  return `UPDATE OF SAVED RESEARCH — read this section first.

This is an UPDATE of ${what}, researched before${prevAsOf ? ' (dated ' + prevAsOf.slice(0, 10) + ')' : ''}.
The application keeps every version and writes an Update Summary that sets
the previous version beside this one. For that it needs, from you:

1. A COMPLETE payload in exactly the schema below — every section, every
   array at its full minimum count. Not only what changed. A section you leave
   out is read as "no longer known", not as "unchanged".
2. Every figure RE-VERIFIED with a fresh web search as at today. Do not copy a
   number from the saved version below: it is there so you know what to check,
   not as a source. Where a figure has genuinely not changed (an annual figure
   with no new year since), search and confirm it, and say so in the change log.
3. In "run", add:
     "update": { "line": ${JSON.stringify(line || null)}, "previousAsOf": ${JSON.stringify(prevAsOf ? prevAsOf.slice(0, 10) : null)}, "previousVersion": ${JSON.stringify(version || null)} }
4. A top-level "changes" array — your account of what moved since the saved
   version, most important first, at least ${single ? 'ten' : 'twelve'} rows:
     "changes": [ { "area": "${single ? 'price | results | ratios | valuation | ratings | ownership | management | litigation | guidance | risk | catalyst | other' : 'top3 | ratings | macro | policy | budget | regulation | competition | market size | valuation | geopolitics | other'}",
                    "item": "the measure or event, named as the schema names it",
                    "previous": "the saved value or state, with its period",
                    "current": "today's value or state, with its period",
                    "direction": "better | worse | neutral",
                    "significance": "high | medium | low",
                    "why": "one or two sentences: what caused it and what it means for an investor",
                    "source": "where today's figure comes from", "date": "DD-MM-YYYY" } ]
   Put the numbers in "previous" and "current" exactly as you would print them;
   the application checks them against the payloads and flags any that disagree.
${single ? `5. A top-level "thesisCheck" array, one row for each thesis line in the saved
   version below:
     "thesisCheck": [ { "thesis": "the saved line, verbatim", "status": "holds | weakened | broken", "evidence": "the fact that decides it, dated" } ]
   And state in "changes" whether any saved thesis breaker has been hit.` : `5. The shortlist is RE-RATED from scratch on today's evidence. The application's
   screen picks the Top 3 from your ratings, and it may be a different three from
   last time: say in "changes" (area "top3") which companies' ratings moved most
   and why. Rate every company on the saved shortlist again, plus any company
   that now belongs on it.`}

6. HOW TO SEND IT — exactly as the research brief below says: ONE fenced code
   block tagged json, the payload minified onto ONE line, "schema" as the first
   key, as the LAST thing in your reply, nothing after the closing fence. That
   block is what gives the reader the copy button. Do not paste the JSON as
   plain text, and do not spread it over many lines. If it will not fit in one
   reply, send as much as fits in such a block, end it cleanly, and say
   CONTINUE.

What the saved version said:
──────────────────────────────
${dg}
──────────────────────────────

Everything below is the full research brief. Follow all of it.

${base}

══════════════════════════════
REMINDER — THIS IS AN UPDATE, AND HOW TO RETURN IT
══════════════════════════════
Keep "run.update", the "changes" log${single ? ' and the "thesisCheck"' : ''} in the payload.
Return it in ONE fenced code block tagged json:

\`\`\`json
{"schema":"equity-analyst/5","run":{ ... "update":{ ... } }, ... ,"changes":[ ... ]}
\`\`\`

on ONE line, minified, as the last thing in the reply — so it renders as a
single box with a copy button. Nothing after the closing fence.`;
}
