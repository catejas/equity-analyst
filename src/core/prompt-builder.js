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

function registerSection() {
  return registerChecklist({ listed: true })
    .map((r) => `  ${r.essential ? '[essential]' : '[if relevant]'} ${r.id} — ${r.name}. Find it via: ${r.howToFind}`)
    .join('\n');
}

export function buildResearchPrompt({ segment, subsegment = '', company = '', mode = null,
  horizon = '3-5', shortlistSize = 12 } = {}) {
  if (!segment || !segment.trim()) throw new Error('A segment is required to build the prompt.');
  const single = (mode === 'company') || Boolean(company && company.trim());
  const h = HORIZONS.find((x) => x.key === horizon) || HORIZONS[1];
  const scope = subsegment.trim()
    ? `${segment.trim()}, specifically the ${subsegment.trim()} subsegment`
    : segment.trim();

  const componentKeys = (k) => Object.keys(PILLARS[k].weights).map((c) => `"${c}"`).join(', ');

  return `You are producing an institutional-grade equity research payload on the Indian listed universe.

SCOPE
Segment: ${segment.trim()}
${subsegment.trim() ? `Subsegment: ${subsegment.trim()}` : 'Subsegment: not specified'}
Holding horizon: ${h.label}
${single
  ? `Company: ${company.trim()}
Research this one company in full. Do not screen a universe and do not rank
anything: there is nothing to rank. Still cover the segment, because a company
cannot be judged without its industry, its policy regime and its peers — but
cover it at the depth of a two-page backdrop rather than a sector study.`
  : `Work on ${scope}. Screen the Indian listed universe for this segment and
shortlist roughly ${shortlistSize} companies for full treatment.`}

WHAT YOU ARE PRODUCING
A single JSON object, returned as the last thing in your reply, inside one
fenced code block tagged json:

\`\`\`json
{ ... the whole payload ... }
\`\`\`

The fence matters: it is what gives the chat interface a copy button, so the
payload can be copied in one tap rather than selected by hand. Put nothing after
the closing fence.

If your interface cannot render a code block, wrap the object in marker lines
instead — a line reading <<<EQUITY-ANALYST-DATA before it and a line reading
>>>EQUITY-ANALYST-DATA after it. The application reads either form.

No commentary before the block beyond a sentence or two, no explanation after
it. The application parses what is inside the fence.

HOW MANY BLOCKS

A full run on three companies comes to roughly 150,000 characters, which is
past what most chat interfaces will emit in one reply. So plan the split rather
than being cut off mid-object:

  Block 1   the run, and everything about the segment
  Block 2   the first company
  Block 3   the second company
  Block 4   the third company

Every block repeats the same "run" object and carries a "companies" array with
only that block's company in it. The application merges them: paste the first
and save it, then paste each of the others and use Add To This Analysis. Nothing
is overwritten, so the order does not matter.

If the whole thing genuinely fits in one reply, send it in one. One company at
full depth fits comfortably; three does not.

Keep every evidence sentence to one line, about 160 characters. They are read
in a table on a phone, and a paragraph in that column helps nobody.

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

Every segment needs volume, realisation and a gross margin, each with evidence.
Share count must be fully diluted: state ESOPs outstanding, warrants and
convertibles, and state zero if there genuinely are none. Omitting the overhang
is the commonest error on Indian small caps and it moves per-share value.

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

${registerSection()}

Outcome is one of: "clear", "matters found", "register unreachable".
If the outcome is "matters found", list the matters with a severity and summary.
A company that has not had every essential register searched cannot enter the
Top 3, however well it scores.

═══════════════════════════════════════════════════════════════════
7. THE SEGMENT: WHAT MAKES THIS RESEARCH RATHER THAN SCORING
═══════════════════════════════════════════════════════════════════

The reference standard for this document is a sector thematic that spends fifty
pages establishing why an industry will compound before it names a company. The
segment is the argument; the companies are how it is expressed. Work in that
order.

**The world.** Global market size and its compound growth over fifteen, ten,
five and three years. The structural forces reshaping it. A table of global
peers with market capitalisation, five-year return, forward multiple, growth
history and forecast, and a plain sentence on what each one actually makes.
Then where India sits, and the trade flowing each way.

**India.** Growth, inflation, the policy rate, the currency, credit growth and
capacity utilisation, each with its period and source. An undated macro figure
is not usable.

**The Union Budget.** The allocations that touch this segment, over five years,
each with what was announced and what was actually spent. The gap between the
two is usually the story. Add the Economic Survey's own reading of the segment.

**Policy.** Each scheme to the same template: name, ministry, objective,
funding and scope, outcomes to date, challenges, and how it reaches this
segment. Then the evolution of the regime by era, with dates. A segment thesis
that never mentions policy is not an Indian equity thesis.

**Regulation.** The regulator, the rules, what is under review, and what a
change would cost.

**Geopolitics and supply chains.** Import dependence, export exposure, tariff
and sanction risk, and supply-chain concentration, with the trade data behind
each claim.

**The industry.** Structure, where it sits in its cycle, the demand drivers each
tagged positive or negative, where the profit pool sits and whether it is
moving, and the technology shift.

**The value chain.** Node by node, upstream to downstream, with the listed
companies at each node named — direct beneficiaries and second order both.

**TAM, SAM and SOM**, each with its basis, year and source.

**Programmes and contracts.** The major national programmes, tenders or order
pipelines driving demand. Each with scale, timeline, participants, and — this is
the part that matters — which listed companies supply what into it. A programme
that is not traced to a listed supplier is background, not research.

**Competition.** Share by player with the basis stated, because volume share and
value share are different numbers. Concentration, entry barriers, substitution
and pricing behaviour.

**Key monitorables.** What would confirm or break the segment thesis. This is
the sector-level equivalent of a thesis breaker.

**Glossary.** Every sector has its own vocabulary. A reader who does not know
what book-to-bill or indigenous content or persistency means cannot use the
report.

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
    "segment": "${segment.trim()}",
    "subsegment": ${subsegment.trim() ? `"${subsegment.trim()}"` : 'null'},
    "horizon": "${h.key}",
    "generatedAt": "ISO 8601 timestamp",
    "searchesRun": 0,
    "researchNotes": "what you could and could not establish, and why"
  },
  "industryMap": {
    "structure": "", "valueChain": "second and third order beneficiaries too",
    "tam": "size, basis and source, or a statement that it is not verifiable",
    "policy": "", "geopolitics": ""
  },
  "universe": { "identified": 0, "screened": 0, "exclusions": [ { "symbol": "", "reason": "" } ] },

  "global": { "marketSize": 0, "unit": "", "source": "",
    "cagr": { "y15": 0, "y10": 0, "y5": 0, "y3": 0 },
    "forces": ["what is reshaping the industry"],
    "indiaPosition": "",
    "peers": [ { "name": "", "country": "", "marketCap": 0, "return5y": 0,
      "forwardPe": 0, "growthPast": 0, "growthForecast": 0, "makes": "" } ] },

  "macro": {
    "gdpGrowth":          { "value": 0, "period": "", "source": "" },
    "inflation":          { "value": 0, "period": "", "source": "" },
    "policyRate":         { "value": 0, "period": "", "source": "" },
    "currency":           { "value": 0, "period": "", "source": "" },
    "creditGrowth":       { "value": 0, "period": "", "source": "" },
    "capacityUtilisation":{ "value": 0, "period": "", "source": "" } },

  "budget": { "economicSurvey": "the Survey's own reading of this segment",
    "allocations": [ { "head": "", "year": "FY26", "announced": 0, "spent": 0,
      "ministry": "", "reachesSegment": "" } ] },

  "policy": [ { "name": "", "ministry": "", "announced": "", "objective": "",
    "funding": "", "outcomes": "", "challenges": "", "reachesSegment": "" } ],
  "policyEvolution": [ { "era": "1991 to 2001", "what": "" } ],
  "regulation": { "regulator": "", "rules": "", "underReview": "", "costOfChange": "" },

  "geopolitics": { "importDependence": "", "exportExposure": "", "tariffRisk": "",
    "sanctionRisk": "", "concentration": "",
    "tradeData": [ { "flow": "import or export", "partner": "", "value": 0, "year": "", "source": "" } ] },

  "industry": { "structure": "", "cyclePosition": "", "profitPool": "",
    "technologyShift": "",
    "demandDrivers": [ { "driver": "", "direction": "positive or negative", "why": "" } ] },

  "valueChain": [ { "name": "node, upstream to downstream", "what": "",
    "beneficiaries": ["listed company names at this node"],
    "secondOrder": ["listed companies one step removed"] } ],

  "tam": { "tam": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" },
           "sam": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" },
           "som": { "value": 0, "unit": "", "basis": "", "year": "", "source": "" } },

  "programs": [ { "name": "", "scale": 0, "unit": "", "timeline": "",
    "participants": "", "challenges": "",
    "beneficiaries": [ { "symbol": "", "name": "", "supplies": "", "shareOfProgram": "" } ] } ],

  "competition": { "concentration": "", "entryBarriers": "", "substitution": "",
    "pricingBehaviour": "",
    "players": [ { "name": "", "listed": true, "share": 0, "basis": "volume or value",
      "asOf": "", "source": "" } ] },

  "sectorValuation": { "currentMultiple": 0, "metric": "", "tenYearMedian": 0,
    "tenYearHigh": 0, "tenYearLow": 0, "source": "" },

  "monitorables": ["what would confirm or break the segment thesis"],
  "glossary": [ { "term": "", "meaning": "" } ],
  "companies": [
    {
      "symbol": "", "name": "", "exchange": "NSE or BSE",
      "sector": "banking, nbfc, insurance, manufacturing, commodity, pharma, it, infrastructure or defence",
      "business": "what it does and how it earns",
      "thesis": ["three falsifiable lines"],

      "snapshot": { "marketCap": 0, "freeFloatPct": 0, "avgDailyValue": 0,
        "week52High": 0, "week52Low": 0,
        "performance": { "m3": 0, "m6": 0, "m12": 0,
                         "m3Relative": 0, "m6Relative": 0, "m12Relative": 0 } },
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
      "peers": [ { "name": "", "listed": true, "metric1": 0, "metric2": 0, "note": "" } ],
      "esg": { "environment": "", "social": "", "governance": "",
        "versusPeers": "", "score": null },
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

      "litigation": { "searched": [
        { "register": "sebi_orders", "subject": "company or promoter or subsidiary",
          "subjectName": "", "outcome": "clear", "detail": "",
          "matters": [ { "severity": "", "category": "", "summary": "", "status": "", "amount": null } ] }
      ] },

      "model": {
        "years": 5,
        "segments": [ { "name": "", "baseVolume": 0, "volumeCagr": 0.0, "baseRealisation": 0,
          "realisationCagr": 0.0, "grossMargin": 0.0, "evidence": "" } ],
        "opex": { "fixedBase": 0, "fixedGrowth": 0.0, "variablePctOfRevenue": 0.0 },
        "depreciation": { "openingNetBlock": 0, "rate": 0.0 },
        "capex": { "maintenancePctOfRevenue": 0.0, "growthSchedule": [0, 0, 0, 0, 0] },
        "workingCapital": { "receivableDays": 0, "inventoryDays": 0, "payableDays": 0 },
        "financing": { "openingDebt": 0, "repaymentSchedule": [0, 0, 0, 0, 0], "drawdownSchedule": 0,
          "interestRate": 0.0, "taxRate": 0.25, "openingCash": 0, "cashYield": 0.0 },
        "shares": { "basic": 0, "esop": 0, "warrants": 0, "convertibles": 0 }
      },

      "valuation": {
        "currentPrice": 0, "priceAsOf": "", "currency": "INR",
        "discountRate": 0.0, "terminalGrowth": 0.0,
        "method": "which methods and why they suit this sector",
        "bear": { "fairValue": 0, "assumptions": "", "probability": 0.25 },
        "base": { "fairValue": 0, "assumptions": "", "probability": 0.50 },
        "bull": { "fairValue": 0, "assumptions": "", "probability": 0.25 }
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

      "financials": { "annual": [ { "period": "FY25", "basis": "consolidated", "revenue": 0 } ],
        "quarterly": [ { "period": "Q1FY26", "basis": "consolidated" } ] },

      "priceHistory": { "asOf": "", "adjusted": true, "closes": [], "volumes": [], "benchmarkCloses": [] },

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

9. The segment blocks are not optional decoration. A report with scores and no
   macro, no Budget, no policy and no programmes is a scoring appendix, not
   research. Where something genuinely cannot be established, omit the block and
   say so in run.researchNotes — the application prints the gap.

10. Every figure carries its period and its source. An undated number is not
    evidence, and the application will print it as undated.

11. Return the payload as the last thing in your reply, in one fenced json code
    block, so it carries a copy button. Nothing after the closing fence.

12. If a block is still cut off by a length limit, stop at a complete object,
    end the block, and write CONTINUE on the line after it. Send the remainder in
    the next reply in the same fenced form.

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

11. Return the payload in one fenced json block, as the last thing in the reply.`;
}

export const PROMPT_USAGE = [
  'Copy the prompt and run it in a research assistant that can search the web.',
  'Save its reply as a .json file.',
  'Import that file here to build the report.',
];
