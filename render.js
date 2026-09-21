/* ============================================================================
   Equity Analyst — document renderer  v3.1
     buildReport(p,lang)    10-page A4 research report
     buildExec(p,lang)       4-page executive summary
     buildScorecard(p,lang)  1-page score card
   Gujarati editions translate everything except the document title header.
   ========================================================================== */
(function (global) {
'use strict';

/* ---------- safe coercion: an AI may hand back an object where a string
     was asked for, which is what produced "[object Object]" on screen ---------- */
function S(v){
  if(v==null) return '';
  if(typeof v === 'string') return v;
  if(typeof v === 'number' || typeof v === 'boolean') return String(v);
  if(Array.isArray(v)) return v.map(S).filter(Boolean).join(', ');
  if(typeof v === 'object'){
    var keys = ['name','company','legal_name','full_name','value','text','title','label','en'];
    for(var i=0;i<keys.length;i++){ if(typeof v[keys[i]] === 'string' && v[keys[i]]) return v[keys[i]]; }
    for(var k in v){ if(typeof v[k] === 'string' && v[k]) return v[k]; }
  }
  return '';
}
/* Any non-Western digits back to Western Arabic, because financial readers
   scan numbers and the figure-parity check needs them in one form. */
var GU_DIGITS = /[\u0AE6-\u0AEF]/g;
function westernDigits(t){
  if(!t || !GU_DIGITS.test(t)) return t;
  return t.replace(GU_DIGITS, function(c){ return String(c.charCodeAt(0) - 0x0AE6); });
}
function e(s){ return westernDigits(S(s)).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function n(v, dp){ if(v==null||v===''||isNaN(v)) return '—';
  return Number(v).toLocaleString('en-IN',{minimumFractionDigits:dp||0,maximumFractionDigits:dp||0}); }
function cr(v){ return v==null||isNaN(v) ? '—' : '₹'+n(v, Math.abs(v)<100?2:0)+' cr'; }
function pct(v,dp){ return v==null||isNaN(v) ? '—' : Number(v).toFixed(dp==null?1:dp)+'%'; }
function arr(a){ return Array.isArray(a) ? a : []; }
/* Kept as a shim: with one language there is no alternate tree to look in,
   so the fallback the caller already computed is the answer. */
function pick(p, lang, path, fallback){ return fallback; }
/* Any label the payload supplies can be translated through gu.labels, so the
   Gujarati edition is complete rather than half-English. */

/* ---------------------------------------------------------------------------
   Fixed vocabulary, translated by the app itself.

   These words come from the APP, not from the payload — score bands, severity
   pills, evidence standards, recommendation verdicts, trend and assessment
   words. Asking the model to translate them through gu.labels was unreliable,
   and a miss left English scattered through a Gujarati document. The app owns
   them now, so they are right every time regardless of what the model sends.
   -------------------------------------------------------------------------- */
/* The Gujarati edition was removed. Four helpers from that layer are called
   throughout the builders, so they survive as identities rather than being
   chased out of every call site: EN() marked a run to be held back from
   translation, A() looked up an app-owned word, and tr() looked up a
   model-supplied one. With one language there is nothing to hold back and
   nothing to look up. */
function EN(t){ return t; }
function stripEnMarks(t){ return String(t); }
function A(lang, t){ return S(t); }
function tr(p, lang, v){ return S(v); }

function toneClass(t){ return t==='good'?'tn-good':t==='bad'?'tn-bad':t==='warn'?'tn-warn':''; }
/* Severity is a risk word, so it reads on the risk scale of the five-step
   ladder like every other judgement in the documents. */
function sevClass(v){ return ragClass(v, 'risk'); }
function bandOf(v){ v=Number(v)||0;
  return v>=85?'Exceptional':v>=75?'Strong':v>=65?'Attractive':v>=55?'Selective':v>=45?'Weak':'Avoid'; }
/* A pie beside its description rather than stacked above it. Used for the
   objects of the issue and for the issue-structure split, both of which read as
   a proportion first and a commentary second. */
var PIE_COLS = ['#1E4E8C','#0E7C66','#E08A1E','#7A5AA8','#2E9BC9','#C0552F','#5C8A2E','#B03060'];
function pieAside(slices, right, opts){
  opts = opts || {};
  var live = slices.filter(function(s){ return Number(s.value) > 0; });
  if(!live.length) return right || '';
  var tot = live.reduce(function(a,s){ return a + Number(s.value); }, 0) || 1;
  var data = live.map(function(s, i){
    return { value:Number(s.value), colour:s.colour || PIE_COLS[i % PIE_COLS.length] }; });
  var legend = '<div class="pie-lg">' + live.map(function(s, i){
      return '<div><i style="background:'+(s.colour || PIE_COLS[i % PIE_COLS.length])+'"></i>'
        + '<b>'+e(s.label)+'</b> <span class="en">'+pct(Number(s.value)/tot*100, 1)+'</span></div>'; }).join('')
    + '</div>';
  return '<div class="pie-row">'
    + '<div class="pie-l">' + chartDonut(data, { size:opts.size||96, hole:opts.hole,
        centre:opts.centre||'', centreSub:opts.centreSub||'' }) + legend + '</div>'
    + '<div class="pie-r">' + (right||'') + '</div></div>';
}
function bandColour(v){ v=Number(v)||0;
  return v>=75?'var(--good)':v>=65?'var(--teal)':v>=55?'var(--warn)':v>=45?'var(--amber)':'var(--bad)'; }

function ragClass(v, scale){ var r = rag5(v, scale); return 'rag'+(r+1); }

/* ---- the five-step scale ----
   Everything judged in these documents lands on the same ladder: 1 is the weak
   end, 5 the strong end. Percentages band at 35 / 50 / 65 / 80; words map by
   meaning, and the meaning depends on the column — HIGH is bad for a risk and
   good for a margin, so the caller names the scale. */
var PAL5     = ['var(--s5-1)','var(--s5-2)','var(--s5-3)','var(--s5-4)','var(--s5-5)'];
var PAL5_HEX = ['#C0392B','#E2703A','#D69A0E','#149C8B','#1F6FB2'];

function step5(pcv){ pcv = Number(pcv)||0;
  return pcv>=80 ? 4 : pcv>=65 ? 3 : pcv>=50 ? 2 : pcv>=35 ? 1 : 0; }
function ragBar(pcv){ return PAL5[step5(pcv)]; }
function ragBarHex(pcv){ return PAL5_HEX[step5(pcv)]; }

var W5 = {
  risk: [
    /^(critical)$/i,
    /^(high|serious|severe)$/i,
    /^(medium|moderate|low-med|watch|partial|partly)$/i,
    /^(low|minor)$/i,
    /^(none|nil|clean|clear)$/i
  ],
  quality: [
    /^(weak|poor|none|very low)$/i,
    /^(below average|low|limited)$/i,
    /^(average|moderate|medium|partial|partly|fair|stable|neutral)$/i,
    /^(above average|good|real|healthy|adequate|improving)$/i,
    /^(strong|exceptional|high|very strong|excellent)$/i
  ],
  status: [
    /^(unverified|not verified|adverse|resolved against|does not tie|red flag)$/i,
    /^(allegation|disputed|under appeal|pending|unquantified|estimated)$/i,
    /^(partially verified|reported|partial|partly|derived|could not test|settled|watch)$/i,
    /^(disclosed|clear|clean|no adverse)$/i,
    /* A completed search that turned up nothing is a finished check, not an
       unfinished one, and is coloured as such. */
    /^(verified|official|ties|resolved in favour|verified\s*[—-]\s*no reportable findings|no reportable findings)$/i
  ]
};
/* Words that carry a plain direction whichever column they sit in. */
var W5_ANY = [
  /^(avoid|very expensive|deteriorating|dependent on external capital|weak|critical|red flag|does not tie|unverified)$/i,
  /^(expensive|serious|high|below average|stretched|negative)$/i,
  /^(selective|fair|neutral|stable|moderate|average|medium|watch|partly|partial|could not test|reported|derived|estimated|partially self-funding)$/i,
  /^(attractive|good|positive|healthy|improving|low|adequate|above average|real|disclosed)$/i,
  /^(exceptional|strong|verified|official|ties|clean|clear|none|self-funding|undervalued|deeply undervalued|resolved in favour)$/i
];
function rag5(v, scale){
  var t = S(v).trim();
  if(!t) return 2;
  var table = W5[scale];
  var i;
  if(table){ for(i=0;i<5;i++) if(table[i].test(t)) return i; }
  for(i=0;i<5;i++) if(W5_ANY[i].test(t)) return i;
  return 2;
}
function rag(v, scale){
  var t = S(v).trim();
  if(!t) return '';
  var i = rag5(t, scale);
  return i<=1 ? 'bad' : i===2 ? 'warn' : 'good';
}
function ragHex(v, scale){ return PAL5[rag5(v, scale)]; }
/* A coloured pill, used wherever a judgement word appears in a table cell. */
function ragPill(v, lang, scale){
  var t = S(v); if(!t) return '';
  return '<span class="pill '+ragClass(t, scale)+'">'+e(A(lang, t))+'</span>';
}

/* ---------- every label the renderer emits, in both languages ---------- */
/* Every label the documents print. One language.
   A string, or an array of strings where a block of copy is wanted. */
var T = {
  verdict_h: 'Final recommendation',
  ipo_quality: 'IPO Quality',
  long_term: 'Long Term',
  listing_gain: 'Listing Gain',
  allocation: 'Allocation',
  of_portfolio: 'of portfolio',
  thesis: 'Investment thesis',
  snapshot: 'IPO snapshot',
  parameter: 'Parameter',
  detail: 'Detail',
  issue_period: 'Issue period',
  price_band: 'Price band / issue price',
  issue_size: 'Issue size',
  subscription: 'Subscription',
  gmp: 'Grey market premium',
  market_cap: 'Market capitalisation',
  promoter_hold: 'Promoter holding',
  listing: 'Listing',
  allotment: 'Allotment',
  key_dates: 'Key dates',
  key_dates_lot: 'Key dates and application size',
  prov_stamp: 'Sources',
  prov_filings: 'exchange filings',
  prov_aggr: 'aggregators',
  prov_media: 'media',
  prov_est: 'own estimate',
  prov_rhp_yes: 'RHP read',
  prov_rhp_no: 'RHP not read',
  prov_key: 'Source key',
  prov_table: 'Data provenance',
  prov_block: 'Data block',
  prov_source: 'Source',
  prov_kind: 'Kind',
  c_sources: 'Sources and confidence',
  mkt_size: 'Market size',
  mkt_growth: 'Market growth',
  mkt_share: 'Issuer share',
  mkt_study: 'Study',
  lockin_cal: 'Lock-in expiry',
  lockin_30: '50% at 30 days',
  lockin_90: 'balance at 90 days',
  base_rate: 'Recent comparable issues',
  br_sub: 'Subscription',
  br_gmp: 'GMP at close',
  br_listed: 'Listed at',
  gmp_drift: 'Premium since first quoted',
  fv_range: 'Fair value range',
  fv_method: 'Method',
  cat_dated: 'What happens next',
  movers_up: 'What carried the score',
  movers_dn: 'What held it back',
  company_h: 'Company',
  moved_score: 'What moved the score',
  ir_movers: 'What moved the score',
  opens: 'Opens',
  closes: 'Closes',
  fresh_vs_ofs: 'Fresh issue vs offer for sale',
  app_lot: 'Application Lot Size',
  min_app: 'Minimum application',
  application: 'Application',
  lots: 'Lots',
  shares: 'Shares',
  amount: 'Amount',
  cls_: 'Class',
  a_min: 'min',
  a_max: 'max',
  expected: 'expected',
  face_value: 'Face value',
  post_issue: 'post issue',
  issue_at: 'issue at',
  fresh: 'fresh',
  unofficial: 'unofficial',
  exchanges: 'Exchanges',
  ir_products: 'Products and services',
  ir_sectors: 'Revenue by sector',
  irg_recommendation: 'Final Recommendation',
  irg_ipo: 'The IPO',
  irg_valuation: 'Valuation',
  irg_company: 'Company and Business',
  irg_financials: 'Financials',
  irg_promoters: 'Promoters and Governance',
  irg_risks: 'Thesis Drivers and Risks',
  ir_litigation: 'Litigation and disputed demands',
  lit_searched: 'Registers searched',
  peer_fy: 'All columns for',
  peer_src: 'Source',
  lit_register: 'Register',
  lit_query: 'Searched for',
  lit_result: 'Result',
  lit_none_run: 'No register search was recorded for this company. The matters below are what the prospectus and the aggregators disclosed; they are not the result of a court register search, and an empty list is not evidence that none exists.',
  lit_gaps: 'Not searched',
  ir_credit: 'Credit profile and bank facilities',
  ir_group: 'Group structure',
  ir_issue_kpi: 'Issue structure and governance signals',
  ir_concentration: 'Concentration risk',
  ir_cashflow: 'Cash flow analysis',
  forum: 'Forum',
  against: 'Against',
  matter: 'Matter',
  disputed_total: 'Total disputed',
  pct_net_worth: 'Of net worth',
  pct_pat: 'Of PAT',
  rating_lbl: 'Rating',
  outlook_lbl: 'Outlook',
  facility: 'Facility',
  limit_lbl: 'Limit',
  wc_intensity: 'Working capital intensity',
  upgrade_trig: 'Upgrade trigger',
  downgrade_trig: 'Downgrade trigger',
  entity: 'Entity',
  stake: 'Stake',
  basis_lbl: 'Basis',
  activity: 'Activity',
  cashout: 'Promoter cash-out',
  fresh_of_mcap: 'Fresh issue of market cap',
  cost_of_acq: 'Promoter cost of acquisition',
  drhp_delta: 'DRHP to RHP change',
  input_lbl: 'Input',
  of_purchases: 'Of purchases',
  end_market: 'End market',
  of_revenue: 'Of revenue',
  earnings_yield: 'Earnings yield',
  gsec_10y: '10-year G-sec',
  peg_reported: 'PEG on reported growth',
  peg_organic: 'PEG on organic growth',
  reconciliation: 'Reconciliation checks',
  check_lbl: 'Check',
  result_lbl: 'Result',
  cfo_pat: 'Cash conversion (CFO / PAT)',
  divergence: 'Profit versus cash',
  funding_verdict: 'Funding verdict',
  trigger_lbl: 'Trigger',
  top10_customers: 'Top 10 customers as a share of revenue',
  region_lbl: 'Region',
  debt_repay: 'Debt repayment',
  accrual_ratio: 'Accrual ratio',
  capex_intensity: 'Capex intensity',
  wc_absorption: 'Working capital absorption',
  trend: 'Trend',
  ir_inflow: 'Where the money comes from',
  ir_outflow: 'Where the money goes',
  does_not_tie: 'These do not tie.',
  inflow_gap: 'The parts differ from the stated issue size by',
  to_sellers: 'Paid to selling shareholders',
  issue_expenses: 'Issue expenses and unallocated',
  balance_of_fresh: 'Balance of the fresh issue not assigned to a stated object',
  ofs_note: 'Leaves the transaction; does not reach the company',
  ties_to_issue: 'Ties to the issue size',
  pg_verdict: 'Verdict',
  pg_scorecard: 'Scorecard',
  pg_the_ipo: 'The IPO',
  pg_company: 'The Company',
  pg_industry: 'Industry & Moat',
  pg_numbers: 'The Numbers',
  pg_cash: 'Cash & Balance Sheet',
  pg_promoters: 'Promoters & Governance',
  pg_valuation: 'Valuation',
  pg_risk: 'The Risk',
  pg_decision: 'The Decision',
  pg_signals: 'Key Signals',
  pg_financials: 'Financials',
  doc_report: 'IPO Company Research Report',
  doc_inst: 'Sector Research Report',
  doc_exec: 'Executive Summary',
  doc_score: 'Score Card',
  net_worth: 'Net worth',
  total_borrowings: 'Total borrowings',
  as_at: 'as at',
  objects_split: 'Objects',
  mechanism: 'How it plays out',
  priority: 'Priority',
  scenario: 'Scenario',
  probability: 'Probability',
  warning_sign: 'Warning sign',
  ir_opmetrics: 'Operating metrics — CAC, cash conversion and customer concentration',
  ir_bsheet: 'Balance sheet — assets, borrowings and working capital',
  product: 'Product / service',
  what_it_is: 'What it is',
  customers: 'Customers',
  rev_share: 'Revenue share',
  margin_profile: 'Margin profile',
  assets_h: 'Assets',
  borrowings_h: 'Borrowings',
  debt_profile: 'Debt profile',
  cost_of_debt: 'Cost of debt',
  interest_cover: 'Interest cover',
  repaid_from_ipo: 'Repaid from IPO',
  value_lbl: 'Value',
  basis_tag: 'Basis',
  unoff_unver: 'Unofficial - Unverified',
  score_100: 'The 100-point score',
  how_to_read: 'How to read this',
  how_to_read_b: 'Market signals are capped at 5 of 100 on purpose, so grey market premium and subscription can never outweigh business quality, financial quality, valuation and governance. Bands: 85+ exceptional, 75-84 strong, 65-74 attractive, 55-64 selective, 45-54 weak, below 45 avoid.',
  listing_assess: 'Listing-gain assessment',
  component: 'Component',
  max: 'Max',
  score: 'Score',
  basis: 'Basis',
  lg_score: 'Listing-gain score',
  issue_struct: 'Issue structure',
  fresh_issue: 'Fresh issue',
  ofs: 'Offer for sale',
  total: 'Total',
  lot: 'lot',
  shares_min: 'shares, min',
  money_goes: 'Where the money goes',
  use_proceeds: 'Use of fresh proceeds',
  rs_crore: '₹ crore',
  assessment: 'Assessment',
  who_selling: 'Who is selling',
  seller: 'Selling shareholder',
  type: 'Type',
  anchors: 'Anchor investors',
  anchor: 'Anchor',
  not_disclosed: 'not disclosed',
  anchor_total: 'Total anchor book',
  lockin: 'lock-in',
  anchor_caveat: 'Anchor participation is a confidence signal, not proof of investment quality.',
  what_does: 'What the business actually does',
  how_earns: 'How it earns',
  why_stay: 'Why customers stay',
  rev_mix: 'Revenue mix',
  sector: 'Sector',
  share_pc: 'Share',
  growth: 'Growth',
  note: 'Note',
  op_metrics: 'Operating metrics',
  industry: 'Industry',
  classification: 'Classification',
  pricing_power: 'Pricing power',
  moat_rating: 'Moat rating',
  drivers: 'Demand drivers',
  comp_adv: 'Competitive advantage',
  source_adv: 'Source of advantage',
  verdict: 'Verdict',
  evidence: 'Evidence',
  three_yr: 'Three-year financials',
  key_ratios: 'Key ratios',
  profit_cash: 'Does profit turn into cash?',
  earn_quality: 'Earnings quality',
  cfo_marker: 'White marker is 1.0x — profit fully converting into cash.',
  bal_sheet: 'Balance sheet',
  rating: 'Rating',
  item: 'Item',
  position: 'Position',
  valuation_at: 'Valuation at the issue price',
  multiple: 'Multiple',
  value: 'Value',
  denom: 'Denominator and method',
  peers: 'Peer comparison',
  scenarios: 'Three-year scenarios',
  to_: 'to',
  case_: 'Case',
  val_share: 'Value / share',
  vs_issue: 'vs issue',
  vs_listing: 'vs listing',
  key_assum: 'Key assumption',
  scen_caveat: 'Scenario values are illustrative assumptions, not forecasts.',
  promoters: 'Promoters',
  no_promoter: 'No identifiable promoter',
  no_promoter_b: 'The company declares no promoter and no promoter group. There is no lock-in, no controlling shareholder to hold accountable, and no single party bearing reputational cost for a governance failure.',
  holding_pre: 'Promoter holding',
  before_issue: 'before the issue',
  after_: 'after',
  name_: 'Name',
  role_: 'Role',
  background: 'Background',
  bg_checks: 'Background checks',
  check_: 'Check',
  finding: 'Finding',
  standard: 'Standard',
  governance: 'Corporate governance',
  flag_: 'Flag',
  str_weak: 'SWOT Analysis',
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  opportunities: 'Opportunities',
  threats: 'Threats',
  red_flags: 'Red flags',
  red_flag: 'Red flag',
  severity: 'Severity',
  monitoring: 'Quarterly monitoring',
  metric: 'Metric',
  current: 'Current',
  desired: 'Desired trend',
  warning: 'Warning level',
  alloc_levels: 'Allocation and price levels',
  action: 'Action',
  price: 'Price',
  rationale: 'Rationale',
  sugg_alloc: 'Suggested allocation',
  watch_one: 'The one number to watch',
  sources: 'Sources',
  primary: 'Primary sources',
  secondary: 'Secondary sources',
  missing: 'Not reliably available from the sources reviewed',
  recommendation: 'Recommendation',
  ipo_basics: 'IPO at a glance',
  objective: 'Objective of the issue',
  swot: 'SWOT summary',
  scorecard: 'Score Card',
  block: 'Block',
  ipo_snapshot: 'IPO snapshot',
  revenue_lbl: 'Revenue (₹ cr)',
  pat_lbl: 'Profit after tax (₹ cr)',
  pe_compare: 'P/E against peers',
  score_shape: 'Where the score comes from',
  what_it_does: 'Business overview',
  as_of: 'As of',
  case: 'Case',
  catalyst: 'Catalyst',
  check: 'Check',
  company: 'Company',
  decision: 'Decision',
  direction: 'Direction',
  driver: 'Driver',
  fair_value: 'Fair value',
  flag: 'Flag',
  frequency: 'Frequency',
  implied_growth: 'Implied growth',
  margin: 'Margin',
  mcap: 'Market capitalisation',
  mode: 'Failure mode',
  name: 'Name',
  object: 'Object of the issue',
  peer_median: 'Peer median',
  point: 'Point',
  ratio: 'Ratio',
  result: 'Result',
  role: 'Role',
  threshold: 'Threshold',
  timing: 'Timing',
  trigger: 'Trigger',
  upside: 'Upside',
  dp_unit: 'Unit economics',
  dp_wc: 'Working capital cycle',
  dp_quarterly: 'Quarterly trend',
  dp_capalloc: 'Capital allocation history',
  dp_rpt: 'Related-party exposure',
  dp_contingent: 'Contingent liabilities',
  dp_regulatory: 'Regulatory landscape',
  dp_competition: 'Competitive positioning',
  dp_rdcf: 'Reverse DCF — what the price assumes',
  dp_sensitivity: 'Sensitivity grid',
  dp_mgmt: 'Management quality',
  dp_cases: 'The bull and bear cases in full',
  dp_bull: 'Bull case',
  dp_bear: 'Bear case',
  dp_change_mind: 'What would change our mind',
  dp_questions: 'Questions for management',
  dp_implied_margin: 'Implied margin',
  dp_horizon: 'Horizon (years)',
  unit: 'Unit',
  year: 'Year',
  outcome: 'Outcome',
  party: 'Party',
  nature: 'Nature',
  concern: 'Concern',
  status: 'Status',
  impact: 'Impact',
  promoter_holding: 'Promoter holding, pre to post',
  ir_shareholding_x: 'x',
  ir_title: 'Sector Research Report',
  ir_industry: 'Industry analysis',
  ir_moat: 'Competitive advantage',
  ir_pl: 'Three-year financial analysis',
  ir_fq: 'Financial quality',
  ir_cash: 'Cash flow and quality of earnings',
  ir_bs: 'Balance sheet analysis',
  ir_promoters: 'Promoter background and due diligence',
  ir_gov: 'Corporate governance',
  ir_anchors: 'Anchor investors',
  ir_objects: 'IPO objectives — where the money goes',
  ir_val: 'Valuation — the decisive section',
  ir_peers: 'Peer comparison',
  ir_gmp: 'Grey market premium analysis',
  ir_scen: 'Bull / base / bear scenarios',
  ir_lg: 'Listing-gain assessment',
  ir_lt: 'Long-term investment assessment',
  ir_alloc: 'Allocation view',
  ir_catalysts: 'Key catalysts',
  ir_fail: 'How this thesis fails',
  ir_monitor: 'Quarterly monitoring checklist',
  ir_score: 'The 100-point score',
  ir_verdict: 'Final investment verdict',
  ir_sources: 'Source audit, conflicts and limitations',
  ir_metrics: 'Operating metrics',
  ir_shareholding: 'Shareholding and selling shareholders',
  ir_conflict: 'Where sources disagree',
  ir_missing: 'What could not be verified',
  ir_contents: 'Contents',
  ir_none: 'Not disclosed in the sources reviewed',
  line_item: 'Line item',
  india: 'India',
  score_card: 'Score Card',
  total_score: 'Total Score By Section',
  section: 'Section',
  band: 'Share Of Maximum',
  fundamentals: 'Fundamentals',
  market_signals: 'Market signals',
  disclaimer: 'Independent research. Not investment advice, not a personal recommendation, and not an offer or solicitation. Figures are labelled Official, Derived or Estimated. Equity investment carries the risk of permanent capital loss.',
  research_only: 'Research only, not investment advice',
  footnote: 'Generated by an AI research tool developed by CA Tejas Desai, who is not a SEBI-registered investment adviser. Prepared solely for academic purposes and private circulation, it is not investment advice, not a recommendation, and not an offer to buy or sell. Verify every figure against the annual report and exchange filings before acting.',
};;
/* One language: the second argument is the key. The lang parameter is kept
   so the hundreds of existing call sites need not all change at once. */
function L(lang, k){ var r = T[k]; return r == null ? k : (Array.isArray(r) ? r[0] : r); }

/* ---------- shared stylesheet ---------- */
var CSS = (window.EQCharts && window.EQCharts.CSS ? window.EQCharts.CSS : '') + `
.focus2{display:grid;grid-template-columns:1fr 1fr;gap:3mm 4mm;}
.focus2 .fig{margin:0;}

@page{ size:A4; margin:0; }
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --navy:#0F2C52; --navy2:#1B4370; --teal:#00736C; --teal2:#E6F1F0;
  --ink:#12161C; --ink2:#3D4653; --ink3:#6B7480; --ink4:#9AA2AD;
  --rule:#DEDAD2; --rule2:#EDEAE4; --paper:#FFFFFF; --panel:#F7F5F1; --panel2:#FBFAF7;
  /* One five-step scale, worst to best, used for every judgement in every
     document: score bars, severity, priority, probability, impact, verdicts,
     statuses, assessments and the sensitivity grid. Warm for the weak end,
     cool for the strong end — chosen because red-versus-green alone is not
     legible to a colour-blind reader, and every band here also carries a word. */
  --s5-1:#C0392B; --s5-2:#E2703A; --s5-3:#D69A0E; --s5-4:#149C8B; --s5-5:#1F6FB2;
  --good:#149C8B; --warn:#D69A0E; --amber:#D69A0E; --bad:#C0392B; --crit:#8E2A20;
  --sans:"Helvetica Neue",Helvetica,Arial,sans-serif;
  /* One body size for every data block in every section, set to the size
     the verdict box uses. Sections used to each carry their own size. */
  --body:7.4pt; --bodyline:1.45;
}
html,body{ background:#E9E7E1; }
body{ font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; color:var(--ink);
      font-size:7.0pt; line-height:1.42; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body.gu{ font-family:"Noto Sans Gujarati","Shruti","Gujarati Sangam MN",Helvetica,Arial,sans-serif;
         font-size:6.2pt; line-height:1.7; }
body.gu .en{ font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; line-height:1.4; }
.page{ width:210mm; height:297mm; background:var(--paper); position:relative; overflow:hidden;
       page-break-after:always; display:flex; flex-direction:column; margin:0 auto 8mm; }
.page:last-child{ page-break-after:auto; margin-bottom:0; }
@media print{ html,body{background:#fff;} .page{ margin:0; } }
.body{ flex:1; display:flex; flex-direction:column; padding:0 15mm; overflow:hidden; }
.rh{ display:flex; justify-content:space-between; align-items:center;
     padding:7mm 15mm 3.5mm; border-bottom:.6pt solid var(--rule); }
.rh .l{ font-size:6.2pt; font-weight:700; letter-spacing:.13em; text-transform:uppercase; color:var(--navy); }
.rh .r{ font-size:6.2pt; color:var(--ink3); letter-spacing:.05em; }
.ch{ margin:3mm 0 2mm; }
.ch svg{ display:block; max-width:100%; }
.chbars{ margin:2.5mm 0; }
.chbar{ display:flex; align-items:center; gap:3mm; margin:1.8mm 0; font-size:6.2pt; }
.chbar .cl{ flex:0 0 34mm; color:var(--ink2); }
.chbar .ct{ flex:1; height:4.2mm; background:#EEF1F5; border-radius:2mm; overflow:hidden; }
.chbar .ct i{ display:block; height:100%; border-radius:0 2mm 2mm 0; }
.chbar .cv{ flex:0 0 16mm; text-align:right; font-weight:700; }
.chbar.me .cl{ font-weight:800; color:var(--ink); }
.chheat{ width:100%; border-collapse:collapse; margin:2.5mm 0; font-size:6.2pt; }
.chheat th{ padding:1.8mm 2mm; text-align:left; color:var(--ink3); font-weight:700; }
.chheat td{ padding:2.2mm 2mm; text-align:center; font-weight:700; }
.chleg{ display:flex; flex-wrap:wrap; gap:4mm; margin-top:1.5mm; font-size:6.2pt; color:var(--ink2); }
.chleg i{ display:inline-block; width:3mm; height:3mm; border-radius:1mm; margin-right:1.5mm; vertical-align:-0.3mm; }
.sc2col{ column-count:2; column-gap:7mm; margin-top:1mm; }
.sc2blk{ break-inside:avoid; -webkit-column-break-inside:avoid; margin-bottom:3mm; }
.sc2hd{ display:flex; justify-content:space-between; align-items:baseline; font-size:6.3pt;
        font-weight:800; color:var(--navy); text-transform:uppercase; letter-spacing:.05em;
        border-bottom:.7pt solid var(--navy); padding-bottom:.8mm; margin-bottom:1mm; }
.sc2row{ display:flex; align-items:center; gap:2mm; padding:.7mm 0; font-size:7.4pt; }
.sc2row .l{ flex:1; color:var(--ink2); line-height:1.25; }
.sc2row .t{ flex:0 0 14mm; height:2mm; background:#EEF1F5; border-radius:1mm; overflow:hidden; }
.sc2row .t i{ display:block; height:100%; border-radius:0 1mm 1mm 0; }
.sc2row .v{ flex:0 0 11mm; text-align:right; font-weight:700; }
.sc2row .v em{ font-style:normal; color:var(--ink4); font-weight:500; font-size:6.4pt; }
.rfw{ border-top:.6pt solid var(--rule); }
.rfn{ padding:1.4mm 15mm 0; font-size:6.6pt; line-height:1.36; color:var(--ink4);
      text-align:justify; }
body.gu .rfn{ font-size:6.2pt; line-height:1.55; }
.rfw .rf{ border-top:0; padding-top:1mm; }
.rf{ display:flex; justify-content:space-between; align-items:center;
     padding:1.6mm 15mm 2.6mm; border-top:.6pt solid var(--rule); font-size:7.4pt; color:var(--ink4); }
.rf b{ color:var(--ink2); font-weight:700; }
h1{ font-size:12.3pt; line-height:1.1; letter-spacing:-.025em; font-weight:700; }
.sec{ display:flex; align-items:baseline; gap:3mm; margin:5mm 0 2.5mm; }
.sec .no{ font-size:6.2pt; font-weight:800; color:var(--teal); letter-spacing:.1em; }
.sec .ti{ font-size:7.2pt; font-weight:700; letter-spacing:-.01em; color:var(--navy); }
.sec .ln{ flex:1; height:.6pt; background:var(--rule); }
.lead{ font-size:7.4pt; line-height:1.55; color:var(--ink2); }
body.gu .lead{ line-height:1.75; }
.mut{ font-size:6.2pt; color:var(--ink3); line-height:1.4; }
body.gu .mut{ line-height:1.65; }
.eyebrow{ font-size:6.6pt; font-weight:800; letter-spacing:.19em; text-transform:uppercase; color:var(--teal); }
body.gu .eyebrow{ letter-spacing:.06em; }
/* Contents. A rule under the heading, the section number in gold, leader dots,
   the page number right-aligned. Without these the rows rendered as bare blue
   links with the number running straight into the next title. */
.ir-toc{ margin:0; }
.toc-h{ font-size:9.0pt; font-weight:700; color:var(--navy); margin:0 0 1.5mm; letter-spacing:.01em; }
.toc-sub{ font-size:6.2pt; color:var(--ink3); margin:0 0 5mm; padding-bottom:2.5mm; border-bottom:1pt solid var(--navy); }
.toc-row{ display:flex; align-items:baseline; gap:2.5mm; padding:2.4mm 0; border-bottom:.4pt solid var(--rule); text-decoration:none; color:var(--ink); }
.toc-n{ font-size:6.2pt; font-weight:700; color:var(--ink4); min-width:8mm; font-variant-numeric:tabular-nums; }
.toc-t{ font-size:6.2pt; }
.toc-d{ flex:1; border-bottom:.4pt dotted var(--rule); transform:translateY(-1mm); }
.toc-p{ font-size:6.2pt; font-weight:600; color:var(--ink2); font-variant-numeric:tabular-nums; min-width:8mm; text-align:right; }
.srctab th:nth-child(1),.srctab td:nth-child(1){ width:auto; }
.srctab th:nth-child(2),.srctab td:nth-child(2){ width:32mm; }
.srctab th:nth-child(3),.srctab td:nth-child(3){ width:12mm; text-align:right; }
.srctab th:nth-child(4),.srctab td:nth-child(4){ width:22mm; }
.srctab th:nth-child(5),.srctab td:nth-child(5){ width:24mm; }
table{ width:100%; border-collapse:collapse; font-size:7.4pt; }
th{ text-align:left; font-size:6.2pt; font-weight:800; letter-spacing:.09em; text-transform:uppercase;
    color:var(--ink3); padding:2mm; border-bottom:.9pt solid var(--navy); white-space:nowrap; }
body.gu th{ font-size:6.2pt; letter-spacing:.02em; }
td{ padding:1.9mm 2mm; border-bottom:.5pt solid var(--rule2); vertical-align:top; }
td.n,th.n{ text-align:right; font-variant-numeric:tabular-nums;
           font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
tr.hi td{ background:var(--teal2); font-weight:600; }
tr.tot td{ border-top:.9pt solid var(--navy); font-weight:700; background:var(--panel); }
.vb{ border:1.4pt solid var(--navy); border-radius:2mm; overflow:hidden; }
.vb .h{ background:var(--navy); color:#fff; padding:2.4mm 4mm; font-size:6.6pt; font-weight:800;
        letter-spacing:.17em; text-transform:uppercase; }
body.gu .vb .h{ letter-spacing:.05em; font-size:7.4pt; }
.vb .c{ padding:4mm; }
.vb .v{ font-size:8.7pt; font-weight:700; letter-spacing:-.02em; line-height:1.2; color:var(--navy); }
.tiles{ display:flex; gap:2.5mm; }
.tile{ flex:1; border:.6pt solid var(--rule); border-top:2pt solid var(--navy); border-radius:1mm;
       padding:2.6mm 3mm; background:var(--panel2); }
.tile .k{ font-size:6.2pt; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:var(--ink3); }
body.gu .tile .k{ letter-spacing:.03em; font-size:6.6pt; }
.tile .v{ font-size:9.5pt; font-weight:700; letter-spacing:-.03em; line-height:1.05; margin-top:.6mm;
          font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.tile .v small{ font-size:6.2pt; color:var(--ink4); font-weight:600; }
.tile .s{ font-size:6.4pt; color:var(--ink2); margin-top:.4mm; }
.bar{ display:flex; align-items:center; gap:2.5mm; margin:1.5mm 0; font-size:6.2pt; }
.bar .bl{ flex:0 0 40mm; color:var(--ink2); }
.bar .bt{ flex:1; height:3.1mm; background:var(--rule2); border-radius:.8mm; overflow:hidden; position:relative; }
.bar .bf{ height:100%; background:var(--navy2); border-radius:0 .8mm .8mm 0; }
.bar .bv{ flex:0 0 16mm; text-align:right; font-weight:700; font-variant-numeric:tabular-nums;
          font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.bar .tick{ position:absolute; top:0; bottom:0; width:.5pt; background:#fff; opacity:.9; }
/* The total-score gauge is a bar row: same three columns, so its track starts
   and finishes on the same two lines as every category bar under it. It is
   taller, and it carries the five bands behind the fill. */
.gaugebar{ margin:0 0 2.5mm; }
.gaugebar .bt{ height:4.6mm; background:transparent; overflow:visible; }
.gaugebar .gb{ position:absolute; top:0; bottom:0; opacity:.30; }
.gaugebar .gb:first-child{ border-radius:.8mm 0 0 .8mm; }
.gaugebar .bf{ position:absolute; top:0; bottom:0; left:0; border-radius:.8mm 0 0 .8mm; }
.gaugebar .gmark{ position:absolute; top:-1.6mm; width:0; height:0; margin-left:-1.1mm;
                  border-left:1.1mm solid transparent; border-right:1.1mm solid transparent;
                  border-top:1.4mm solid var(--ink); }
.gaugebar .bv{ font-weight:800; }
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:5mm; }
/* SWOT is a 2x2: the second row needs a rule above it or the four quadrants
   read as one long double column instead of a matrix. */
.swotg{ row-gap:3.4mm; }
.swotg > div:nth-child(n+3){ border-top:.3mm solid var(--rule); padding-top:2.6mm; }
.grid3{ display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; }
.grid4{ display:grid; grid-template-columns:repeat(4,1fr); gap:2.5mm; }
.kv{ border:.6pt solid var(--rule); border-radius:1mm; padding:2.4mm 2.8mm; background:var(--panel2); }
.kv .k{ font-size:6.2pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase;
        color:var(--ink3); line-height:1.3; min-height:6mm; }
body.gu .kv .k{ letter-spacing:.02em; font-size:6.6pt; }
.kv .v{ font-size:8.5pt; font-weight:700; letter-spacing:-.02em; line-height:1.1; margin-top:.5mm;
        font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.kv .s{ font-size:6.2pt; color:var(--ink3); margin-top:.5mm; }
/* ---- IPO snapshot, redesigned ----------------------------------------
   A sub-heading, the fresh/OFS split as one two-colour bar, a date rail and a
   compact table. Everything here is print-safe: flat fills and borders only,
   nothing html2canvas cannot rasterise. */
.ssub{ font-size:6.2pt; font-weight:800; letter-spacing:.12em; text-transform:uppercase;
       color:var(--ink3); margin:0 0 1.4mm; }
body.gu .ssub{ letter-spacing:.02em; font-size:6.6pt; }
.fsplit{ display:flex; height:5mm; border-radius:1mm; overflow:hidden; border:.6pt solid var(--rule); }
.fsplit i{ display:block; font-style:normal; font-size:6.2pt; font-weight:800; color:#fff;
           line-height:5mm; text-align:center; white-space:nowrap; overflow:hidden;
           font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.fsplit i.a{ background:var(--navy2); }
.fsplit i.b{ background:var(--teal); }
.drail{ display:flex; margin:1mm 0 2mm; }
.drail .stp{ flex:1 1 0; text-align:center; position:relative; }
.drail .stp .dot{ width:2.2mm; height:2.2mm; border-radius:50%; background:var(--navy);
                  margin:0 auto 1.2mm; position:relative; z-index:1; }
.drail .stp.dim .dot{ background:var(--ink4); }
.drail .stp:before,.drail .stp:after{ content:""; position:absolute; top:.95mm; height:.4mm;
                  background:var(--rule); }
.drail .stp:before{ left:0; right:50%; }
.drail .stp:after{ left:50%; right:0; }
.drail .stp:first-child:before,.drail .stp:last-child:after{ display:none; }
.drail .stp .lb{ font-size:6.2pt; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
                 color:var(--ink3); }
body.gu .drail .stp .lb{ letter-spacing:.02em; font-size:6.2pt; }
.drail .stp .dt{ font-size:6.3pt; font-weight:700; color:var(--ink); margin-top:.4mm;
                 font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.drail .stp .dt small{ display:block; font-size:6.2pt; font-weight:600; color:var(--ink4);
                       letter-spacing:.04em; text-transform:uppercase; }
.mini{ width:100%; border-collapse:collapse; font-size:6.2pt; }
.mini th{ font-size:6.2pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase;
          color:var(--ink3); background:var(--panel); border-bottom:.6pt solid var(--rule);
          padding:1.2mm 1.6mm; text-align:left; }
body.gu .mini th{ letter-spacing:.02em; font-size:6.4pt; }
.mini td{ padding:1.2mm 1.6mm; border-bottom:.4pt solid var(--rule2); vertical-align:middle; }
.mini tr:last-child td{ border-bottom:0; }
.mini .k{ color:var(--ink2); }
.mini .n{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap;
          font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
/* ---- provenance and fair value ---------------------------------------- */
.srctag{ font-size:6.2pt; font-weight:800; color:var(--ink4); vertical-align:super;
         letter-spacing:.02em; margin-left:.3mm;
         font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.srckey{ font-size:6.4pt; color:var(--ink3); margin-top:2mm; }
.srckey b{ color:var(--ink2); }
.srckey i{ font-style:normal; font-weight:800; color:var(--ink2); }
.srcpill{ display:inline-block; font-size:6.2pt; font-weight:800; padding:.2mm 1.3mm;
          border-radius:1mm; background:var(--panel); border:.4pt solid var(--rule);
          font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.provline{ font-size:6.2pt; color:var(--ink3); margin-top:2mm; }
.provline b{ color:var(--ink2); font-weight:800; }
.provline i{ font-style:normal; font-weight:800; }
.provline .pv-yes{ color:var(--good); }
.provline .pv-no{ color:var(--ink3); }
.fvbox{ border:.6pt solid var(--rule); border-left:2pt solid var(--navy); border-radius:1mm;
        background:var(--panel2); padding:2mm 2.6mm; margin:2mm 0; }
.fvbox .k{ font-size:6.2pt; font-weight:800; letter-spacing:.11em; text-transform:uppercase;
           color:var(--ink3); }
body.gu .fvbox .k{ letter-spacing:.02em; font-size:6.6pt; }
.fvbox .v{ font-size:8.9pt; font-weight:700; letter-spacing:-.02em; margin-top:.5mm; color:var(--navy);
           font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.fvbox .g{ display:inline-block; font-size:7.4pt; font-weight:700; margin-left:2mm; }
.fvbox .g.up{ color:var(--good); } .fvbox .g.dn{ color:var(--bad); }
.fvbox .m{ font-size:6.6pt; color:var(--ink3); margin-top:.6mm; }
.mvrow{ display:block; border-bottom:.4pt solid var(--rule2); padding:1.4mm 0; }
.mvrow:last-child{ border-bottom:0; }
.mvrow .l{ font-size:6.3pt; font-weight:700; }
.mvrow .v{ float:right; font-size:6.3pt; font-weight:700;
           font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.mvrow .v em{ font-style:normal; color:var(--ink4); font-size:6.4pt; }
.mvrow .b{ display:block; clear:both; font-size:6.2pt; color:var(--ink3); line-height:1.4;
           margin-top:.3mm; }
/* A column of the snapshot, and a table inside it that takes up the slack, so
   the two columns finish level with each other. */
.snapgrid{ align-items:stretch; }
.snapcol{ display:flex; flex-direction:column; min-width:0; }
/* flex alone. An explicit full height here resolved against a container that
   was itself sizing to content, which inflated the block by a few millimetres
   — enough, in Gujarati, to push the whole section onto another page. */
.snapcol .mini.grow{ flex:1 1 auto; }
.snapcol .mini.grow td{ vertical-align:middle; }
.lotb{ display:inline-block; font-size:6.2pt; font-weight:800; letter-spacing:.06em;
       padding:.3mm 1.4mm; border-radius:2mm; margin-right:1.2mm;
       font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.lotb.r{ background:#E7F0FB; color:#1B4370; }
.lotb.s{ background:#FCF1DA; color:#8A6208; }
.lotb.b{ background:#EFEBFB; color:#453796; }
.tn-good{ color:var(--good); } .tn-bad{ color:var(--bad); } .tn-warn{ color:var(--amber); }
.pill{ display:inline-block; font-size:6.2pt; font-weight:800; letter-spacing:.07em;
       text-transform:uppercase; color:#fff; padding:.5mm 1.8mm; border-radius:2.5mm; white-space:nowrap;
       font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
/* kept as aliases so any stray reference still lands on the five-step scale */
.sv-crit{ background:var(--s5-1); } .sv-high{ background:var(--s5-2); }
.sv-med{ background:var(--s5-3); } .sv-low{ background:var(--s5-4); }
.rag1{ background:var(--s5-1); } .rag2{ background:var(--s5-2); }
.rag3{ background:var(--s5-3); } .rag4{ background:var(--s5-4); }
.rag5{ background:var(--s5-5); }
.gov-a{ display:inline-block; min-width:17mm; }
.pie-row{ display:flex; gap:6mm; align-items:flex-start; margin:1mm 0 2mm; }
.pie-l{ flex:0 0 52mm; }
.pie-r{ flex:1; min-width:0; }
.pie-r table{ margin-top:0; }
.pie-lg{ margin-top:2mm; font-size:7.4pt; line-height:1.5; }
.pie-lg div{ display:flex; align-items:baseline; gap:1.6mm; }
.pie-lg i{ width:2.4mm; height:2.4mm; border-radius:.6mm; flex:0 0 auto; display:inline-block; }
.pie-lg b{ flex:1; font-weight:600; color:var(--ink2); }
/* The concentration tables were set a step down from everything else. */
.ir-conc table{ font-size:7.4pt; }
.ir-conc td, .ir-conc th{ padding-top:2.1mm; padding-bottom:2.1mm; }
.note{ border-left:1.6pt solid var(--teal); background:var(--teal2); padding:2.4mm 3mm;
       border-radius:0 1mm 1mm 0; font-size:6.2pt; line-height:1.5; }
body.gu .note{ line-height:1.7; }
.note.bad{ border-left-color:var(--bad); background:#FBEEEC; }
.note.good{ border-left-color:var(--good); background:#EDF5F0; }
.note b{ display:block; margin-bottom:.5mm; }
ul{ margin-left:4mm; } li{ margin:.9mm 0; }
.blist li{ font-size:7.4pt; line-height:1.45; }
body.gu .blist li{ line-height:1.68; }
.blist b{ color:var(--navy); }
.donut{ width:32mm; height:32mm; border-radius:50%; flex:0 0 32mm; }
.dlegend{ font-size:6.2pt; line-height:1.7; }
.dlegend i{ display:inline-block; width:2.4mm; height:2.4mm; border-radius:.5mm; margin-right:1.6mm; }
.grow{ flex:1; }
`;

/* Grey-market premium headline tile. Shared by every document so the figure,
   the bracketed percentage and the caveat are worded identically in all five. */
/* Industry classification. Translated when the payload carries Gujarati for it,
   otherwise tagged .en so it reads as a deliberate English term rather than a
   translation that was missed. */
function sectorText(p, lang){
  var raw = S((p.meta||{}).sector||'');
  return raw ? tr(p, lang, raw) : '';
}
function sectorHtml(p, lang){
  var raw = S((p.meta||{}).sector||'');
  if(!raw) return '';
  var t = sectorText(p, lang);
  return e(t);
}
function gmpTile(ipo, lang){
  var g = (ipo||{}).gmp || {};
  var has = g.value != null && g.value !== '';
  return '<div class="tile"><div class="k">'+e(L(lang,'gmp'))+'</div>'
    + '<div class="v en" style="color:var(--teal)">'+(has? '₹'+n(g.value) : '—')
    + (has && g.pct != null ? '<small> ('+pct(g.pct,1)+')</small>' : '')+'</div>'
    + '<div class="s">'+e(L(lang,'unoff_unver'))+'</div></div>';
}
/* Dates in the Indian format the reader expects.
   The payload carries ISO dates (2026-08-21) because that is unambiguous for a
   machine, and analysis_datetime arrives as "2026-08-19 21:30 IST". Everything
   printed is converted to DD-MM-YYYY here, in one place, so no renderer has to
   remember to do it and no document can disagree with another. */
function dmy(v){
  var t = S(v);
  if(!t) return '';
  /* A full machine timestamp is printed the way a reader writes one: day first,
     minutes, no seconds and no Z. It used to reach the page as
     2026-09-09T01:28:46.740Z, which is a stamp for a log, not a report. */
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g,
    function(_, y, mo, d, hh, mm, tz){
      var suffix = (tz && tz !== 'Z') ? '' : '';
      return d + '-' + mo + '-' + y + ' ' + hh + ':' + mm + suffix;
    });
  /* A bare date anywhere else in the string. */
  return t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, function(_, y, mo, d){
    return d + '-' + mo + '-' + y; });
}
function shell(title, bodyCls, pages, extraCss){
  /* The Gujarati sweep runs on the page markup only — never on CSS or on the
     fitting script, which are Latin by necessity. */
  var ttl = e(title);
    /* One language now, so nothing is held back and nothing is swept. */
  return '<!DOCTYPE html><html lang="'+'en'+'"><head><meta charset="utf-8">'
    + '<title>'+ttl+'</title><style>'+CSS+(extraCss||'')+'</style></head><body class="'+bodyCls+'">'
    /* Order matters: fill the pages first, then let autofit shrink whatever
       still overflows. Shrinking before filling would scale down a page that
       was about to receive more content. */
    + pages + '<!--FIT-->' + FILL_AND_TOC + AUTOFIT + '</body></html>';
}

/* Universal last-resort guard. `.page` has overflow:hidden, so anything that
   runs past the bottom of `.body` is not merely ugly — it disappears from the
   PDF without a trace, which is how six scorecard line items went missing.
   This runs on every document after any document-specific packer and shrinks
   only the pages that actually overflow. transform:scale is used rather than
   zoom because html2canvas reproduces transform faithfully, while zoom
   corrupts Gujarati advance widths and makes the words overlap. */
var AUTOFIT = '<script>(function(){'
  + 'var MIN=0.60;'
  /* Documents marked data-spill grow a continuation page rather than being
     shrunk. Sections stay whole and a heading is never orphaned from the block
     it introduces. Fixed-length documents (score card, executive summary) are
     not marked and fall through to the scale guard below. */
  + 'if(document.body.hasAttribute("data-spill")){'
    + 'var guard=0;'
    + 'for(var q=0;q<document.querySelectorAll(".page").length && guard++<40;q++){'
      + 'var pgs=document.querySelectorAll(".page"), pg=pgs[q], bd=pg.querySelector(".body");'
      + 'if(!bd || bd.scrollHeight<=bd.clientHeight+1) continue;'
      + 'var np=pg.cloneNode(true), nbd=np.querySelector(".body");'
      + 'while(nbd.firstChild) nbd.removeChild(nbd.firstChild);'
      + 'pg.parentNode.insertBefore(np, pg.nextSibling);'
      + 'var g2=0;'
      + 'while(bd.scrollHeight>bd.clientHeight+1 && bd.children.length>1 && g2++<60){'
        + 'var last=bd.children[bd.children.length-1];'
        + 'nbd.insertBefore(last, nbd.firstChild);'
        + 'var prev=bd.children[bd.children.length-1];'
        + 'if(prev && prev.className && /(^| )sec( |$)/.test(prev.className))'
          + 'nbd.insertBefore(prev, nbd.firstChild);'
      + '}'
      + 'while(nbd.firstChild && nbd.firstChild.className==="grow") nbd.removeChild(nbd.firstChild);'
      + 'if(!nbd.children.length){ np.parentNode.removeChild(np); continue; }'
      + 'if(!bd.querySelector(".grow")){ var sp=document.createElement("div");'
        + 'sp.className="grow"; bd.appendChild(sp); }'
    + '}'
    + 'var live=document.querySelectorAll(".page");'
    + 'for(var r=0;r<live.length;r++){'
      + 'var t2=live[r].querySelector(".pgtot"); if(t2) t2.textContent=live.length;'
      + 'var nm=live[r].querySelector(".pgnum"); if(nm) nm.textContent=(r+1);'
    + '}'
  + '}'



  /* Box text that outgrows its box.
     Several tiles carry a sentence rather than a number — a verdict, a scenario
     comment, a group activity — and at the fixed tile size the words spilled or
     were clipped. Each box is measured and its type stepped down until the text
     fits, which keeps the box geometry identical across the row. */
  + 'var boxes=document.querySelectorAll(".tile .v, .tile .s, .vtile .v, .ir-toc-row b, .dlegend div, .kv .v");'
  + 'for(var q=0;q<boxes.length;q++){ var bx=boxes[q];'
    + 'if(!bx.textContent.trim()) continue;'
    + 'var lim=parseFloat(getComputedStyle(bx).fontSize), guard=0;'
    + 'while((bx.scrollHeight>bx.clientHeight+1 || bx.scrollWidth>bx.clientWidth+1)'
      + ' && lim>5.5 && guard++<24){ lim-=0.5; bx.style.fontSize=lim+"px";'
      + 'bx.style.lineHeight="1.25"; }'
  + '}'
  /* ONE scale for the whole document, not one per page.
     Scaling each page to its own needs made the type size differ from page to
     page — Strengths at full size, Weaknesses a step smaller, and nothing to
     explain why. The tightest page now sets the factor and every page adopts
     it, so the document reads at a single size throughout. */
  /* A document with its own packer has already grown pages and, if it truly had
     to, applied a single scale of its own. Running this pass over it as well
     produced a second, different factor — two type sizes in one document, which
     is the fault this pass exists to prevent. */
  + 'var bs=document.body.hasAttribute("data-fitted") ? []'
    + ' : [].slice.call(document.querySelectorAll(".page > .body"));'
  + 'var need=1;'
  + 'bs.forEach(function(bd){'
    + 'var t=bd.clientHeight; if(!t) return;'
    + 'if(bd.scrollHeight>t+1) need=Math.min(need, t/bd.scrollHeight);'
  + '});'
  + 'if(need<0.999){'
    + 'var Z=Math.max(MIN, Math.floor(need*1000)/1000);'
    + 'bs.forEach(function(bd){'
      + 'if(bd.getAttribute("data-fit")==="1") return;'
      + 'var t=bd.clientHeight; if(!t) return;'
      + 'var w=document.createElement("div");'
      + 'w.style.cssText="display:flex;flex-direction:column;flex:1 1 auto;min-height:0;width:100%";'
      + 'while(bd.firstChild) w.appendChild(bd.firstChild);'
      + 'var outer=document.createElement("div");'
      + 'outer.style.cssText="height:"+t+"px;overflow:hidden;flex:0 0 auto;width:100%";'
      + 'outer.appendChild(w); bd.appendChild(outer);'
      + 'w.style.width=(100/Z)+"%";'
      + 'w.style.transformOrigin="top left";'
      + 'w.style.transform="scale("+Z+")";'
      + 'bd.setAttribute("data-fit","1");'
    + '});'
  + '}'
+ '})();<\/script>';

/* Filling the pages, and the contents list.
   Written as its own script rather than appended to the concatenated one above:
   that string is built by hand out of hundreds of fragments, and every edit I
   made to it put a brace in the wrong place. This is plain source. */
/* Contents and audit only — the pagination belongs to the document's own
   packer, which works on .ir-box and knows how to divide a table across a page
   break. I wrote a second paginator over the top of it, moved the blocks out of
   the boxes it was holding, and added pages that had no box at all; it then
   read scrollHeight off a null and threw, which aborted everything after it.
   That is why reports that used to run to twenty-three and forty pages came
   back as four. One document, one packer. This script only reads the finished
   layout and writes the contents. */
var FILL_AND_TOC = '<script>(function(){\n'
+ 'var pages = [].slice.call(document.querySelectorAll(".page"));\n'
+ 'if(!pages.length) return;\n'

/* renumber, in case the packer added or dropped pages */
+ 'for(var r = 0; r < pages.length; r++){\n'
+ '  var t = pages[r].querySelector(".pgtot"); if(t) t.textContent = pages.length;\n'
+ '  var n = pages[r].querySelector(".pgnum"); if(n) n.textContent = (r + 1);\n'
+ '}\n'

/* the contents, with page numbers read off the finished layout */
+ 'var map = [];\n'
+ 'for(var p = 0; p < pages.length; p++){\n'
+ '  var secs = pages[p].querySelectorAll(".sec");\n'
+ '  for(var x = 0; x < secs.length; x++){\n'
+ '    var nEl = secs[x].querySelector(".no"), tEl = secs[x].querySelector(".ti");\n'
+ '    var title = tEl ? tEl.textContent.trim() : "";\n'
+ '    if(!title) continue;\n'
+ '    secs[x].id = "sec-" + (map.length + 1);\n'
+ '    map.push({ num: nEl ? nEl.textContent.trim() : "", title: title, page: p + 1, id: secs[x].id });\n'
+ '  }\n'
+ '}\n'
+ 'window.__EQ_TOC = map;\n'
+ 'var tocHost = document.querySelector("[data-toc]");\n'
+ 'if(tocHost && map.length){\n'
+ '  var out = "<div style=@font-size:9.0pt;font-weight:700;margin:0 0 1.5mm@>Contents</div>"\n'
+ '          + "<div style=@font-size:6.2pt;opacity:.6;margin:0 0 5mm;padding-bottom:2.5mm;border-bottom:1pt solid currentColor@>" + map.length + " sections</div>";\n'
+ '  for(var tm = 0; tm < map.length; tm++){\n'
+ '    out += "<a href=@#" + map[tm].id + "@ style=@display:flex;align-items:baseline;gap:2.5mm;padding:2.2mm 0;border-bottom:0.4pt solid rgba(0,0,0,.14);text-decoration:none;color:inherit@>"\n'
+ '         + "<span style=@font-size:6.2pt;font-weight:700;opacity:.55;min-width:8mm@>" + map[tm].num + "</span>"\n'
+ '         + "<span style=@font-size:6.2pt@>" + map[tm].title + "</span>"\n'
+ '         + "<span style=@flex:1 1 auto;border-bottom:0.4pt dotted rgba(0,0,0,.28);transform:translateY(-1mm);min-width:6mm@></span>"\n'
+ '         + "<span style=@font-size:6.2pt;font-weight:600;min-width:8mm;text-align:right@>" + map[tm].page + "</span></a>";\n'
+ '  }\n'
+ '  tocHost.innerHTML = out.split("@").join(String.fromCharCode(34));\n'
+ '}\n'

/* the audit: what the document's own packer produced */
+ 'window.__EQ_PAGINATION = { pages: pages.length, sections: map.length };\n'

+ '})();<\/script>';

/* The document title header stays English in every edition, by design. */
function head(p, label){
  /* The company name stays in Latin script — it is a proper noun. The page
     label does not: it is ours, and in the Gujarati edition it is Gujarati. */
  var m = (p && p.meta) || {};
  var name = S(m.short_name) || S(m.company) || S(m.sector)
    || (p && p.report && p.report.run && S(p.report.run.sector)) || '';
  return '<div class="rh"><div class="l en">'+EN(e(name))+'</div>'
       + '<div class="r">'+EN(e(label))+'</div></div>';
}
function foot(p, i, total, lang, docName){
  return '<div class="rfw">'
       + '<div class="rfn">'+e(L(lang,'footnote'))+'</div>'
       + '<div class="rf"><div><span>'+EN(e(docName||L('en','doc_report')))+'</span><span class="en"> &nbsp;·&nbsp; '
       + e(dmy((p && p.meta && p.meta.analysis_datetime) || (p && p.report && p.report.run && p.report.run.reportBuiltAt))) + ''
       + '</div><div class="en"><b class="pgnum">'+i+'</b> / <span class="pgtot">'+total+'</span></div></div>'
       + '</div>';
}
function page(p, i, total, label, inner, lang, docName){
  return '<section class="page">'+head(p,label)+'<div class="body">'+inner+'</div>'
       + foot(p,i,total,lang,docName)+'</section>';
}
/* Headings are Title Case throughout. They were written as sentences, so one
   read "Return on capital, deconstructed" while the score card beside it read
   "Margin Of Safety" — the same document in two voices. Small words stay
   lowercase, as they do in any set titles, and the first word is always
   capitalised. */
/* "is" is a verb and stays capitalised, which is why it is not in this list. */
var SEC_SMALL = { a:1, an:1, and:1, as:1, at:1, but:1, by:1, for:1, from:1, in:1,
  into:1, nor:1, of:1, on:1, or:1, per:1, the:1, to:1, up:1, vs:1, via:1, with:1 };
function secTitleCase(t){
  var words = String(t || '').split(/(\s+)/);
  var lastIdx = -1;
  words.forEach(function(w, i){ if(w.trim()) lastIdx = i; });
  var first = true;
  return words.map(function(w, i){
    if(!w.trim()) return w;
    var bare = w.replace(/[^A-Za-z]/g, '');
    /* An acronym the payload already capitalised stays as it is: ESG, PCR. */
    if(bare && bare === bare.toUpperCase() && bare.length > 1) { first = false; return w; }
    var lower = w.toLowerCase();
    var keySrc = lower.replace(/[^a-z]/g, '');
    /* The last word is capitalised even when it is a small one, so a title
       does not trail off in lowercase: "What the Answer Turns On". */
    if(!first && i !== lastIdx && SEC_SMALL[keySrc]) return lower;
    first = false;
    return lower.replace(/[a-z]/, function(ch){ return ch.toUpperCase(); });
  }).join('');
}
function sec(no, title){
  return '<div class="sec"><span class="no en">'+e(no)+'</span><span class="ti">'
       + e(secTitleCase(title))
       + '</span><span class="ln"></span></div>';
}
function tblCls(opts, kv){
  var cls = [];
  if(opts && opts.cls) cls.push(opts.cls);
  if(kv) cls.push('kv');
  return cls.length ? ' class="'+cls.join(' ')+'"' : '';
}
function tbl(cols, rows, opts){
  opts = opts || {};
  var num = opts.num || [];
  /* A two-column table whose first heading is blank is a label-and-reading
     table. Naming the shape lets the stylesheet give the label column a fixed
     width instead of letting a long value crush it. */
  var kv = opts.kv === true || (cols.length === 2 && String(cols[0]).trim() === '');
  var h = cols.map(function(c,i){ return '<th'+(num.indexOf(i)>=0?' class="n en"':'')+'>'+e(c)+'</th>'; }).join('');
  /* A row whose every cell is empty is a row the payload never filled. Printing
     it produced three ruled lines carrying nothing but a dash under the
     earnings-quality flags — dead space that reads as a rendering fault. Total
     rows are exempt: a zero total is a real answer. */
  var live = rows.filter(function(r){
    if(r && r.__cls) return true;
    var cells = (r && r.cells) || r || [];
    return cells.some(function(c){
      var t = String(c == null ? '' : c).replace(/<[^>]*>/g,'').replace(/&[#A-Za-z0-9]+;/g,' ');
      return t.replace(/[\s\u2014\u2013.\-]/g,'') !== '';
    });
  });
  if(!live.length) return '';
  var b = live.map(function(r){
    var cls = r.__cls ? ' class="'+r.__cls+'"' : '';
    var cells = (r.cells||r).map(function(c,i){
      return '<td'+(num.indexOf(i)>=0?' class="n en"':'')+'>'+(c==null?'—':c)+'</td>'; }).join('');
    return '<tr'+cls+'>'+cells+'</tr>';
  }).join('');
  /* A long table is emitted as several tables of at most CHUNK rows, each
     repeating the header. The packer places whole blocks, so a forty-row table
     that will not fit is moved entire and leaves most of a page blank; in
     chunks it flows, and the page below it fills. The rule that follows the
     first chunk carries "continued" so the split is visible rather than looking
     like two unrelated tables. */
  var CHUNK = (opts.chunk === false) ? Infinity : (opts.chunk || 12);
  if(live.length <= CHUNK){
    return '<table'+tblCls(opts, kv)+'><thead><tr>'+h+'</tr></thead><tbody>'
         + b+'</tbody></table>';
  }
  var out = '', part = 0;
  for(var i = 0; i < live.length; i += CHUNK){
    part += 1;
    var slice = live.slice(i, i + CHUNK).map(function(r){
      var cls = r.__cls ? ' class="'+r.__cls+'"' : '';
      var cells = (r.cells||r).map(function(c, j){
        return '<td'+(num.indexOf(j)>=0?' class="n en"':'')+'>'+(c==null?'—':c)+'</td>'; }).join('');
      return '<tr'+cls+'>'+cells+'</tr>';
    }).join('');
    var head = h;
    if(part > 1){
      head = cols.map(function(c, j){
        return '<th'+(num.indexOf(j)>=0?' class="n en"':'')+'>'+e(c)
+'</th>'; }).join('');
    }
    out += '<table'+tblCls(opts, kv)+'><thead><tr>'+head+'</tr></thead><tbody>'
         + slice+'</tbody></table>';
  }
  return out;
}
function barRow(label, pctW, value, colour, tick){
  return '<div class="bar"><div class="bl">'+e(label)+'</div><div class="bt">'
    + '<div class="bf" style="width:'+Math.max(0,Math.min(100,pctW))+'%;background:'+(colour||'var(--navy2)')+'"></div>'
    + (tick!=null?'<div class="tick" style="left:'+tick+'%"></div>':'')
    + '</div><div class="bv en">'+e(value)+'</div></div>';
}

/* The eight things that carry weight in the overall score. Shape is kept from
   the IPO build — [label, label, weight, keys, item labels, item labels, item
   weights] — because the radar and the score sheet read it positionally. The
   duplicated label column is a remnant of the two-language edition and is
   removed when those two are rebuilt. */
var BLOCKS = [
  ['Business quality','Business quality',20,
   ['moat','industryPosition','revenueQuality','pricingPower','customerQuality','productQuality','tamRunway','management','governance','capitalAllocation','resilience'],
   ['Moat','Industry position','Revenue quality','Pricing power','Customer quality','Product quality','TAM and runway','Management','Governance','Capital allocation','Resilience'],
   ['Moat','Industry position','Revenue quality','Pricing power','Customer quality','Product quality','TAM and runway','Management','Governance','Capital allocation','Resilience'],
   [15,10,8,7,5,5,10,10,10,10,10]],
  ['Growth and multibagger','Growth and multibagger',20,
   ['tam','revenueRunway','epsGrowth','marketShare','reinvestment','incrementalReturns','operatingLeverage','marginExpansion','newProductsMarkets','exports','capacity','execution','longevity'],
   ['TAM','Revenue runway','EPS growth','Market share','Reinvestment','Incremental returns','Operating leverage','Margin expansion','New products and markets','Exports','Capacity','Execution','Longevity'],
   ['TAM','Revenue runway','EPS growth','Market share','Reinvestment','Incremental returns','Operating leverage','Margin expansion','New products and markets','Exports','Capacity','Execution','Longevity'],
   [10,10,10,8,8,10,7,7,7,5,5,8,5]],
  ['Valuation and opportunity','Valuation and opportunity',20,
   ['dcf','relativeValuation','historicalValuation','peerValuation','growthAdjustedValuation','fcfYield','marginOfSafety','impliedExpectations','scenarioAsymmetry','catalystAdjusted'],
   ['DCF','Relative valuation','Historical valuation','Peer valuation','Growth-adjusted valuation','FCF yield','Margin of safety','Implied expectations','Scenario asymmetry','Catalyst-adjusted'],
   ['DCF','Relative valuation','Historical valuation','Peer valuation','Growth-adjusted valuation','FCF yield','Margin of safety','Implied expectations','Scenario asymmetry','Catalyst-adjusted'],
   [15,10,8,8,10,7,15,10,10,7]],
  ['Risk and quality control','Risk and quality control',10,
   ['balanceSheet','accounting','governance','promoter','customerConcentration','regulatory','cyclicality','competition','technology','execution','liquidity','geopolitics','valuationRisk','dilution'],
   ['Balance sheet','Accounting','Governance','Promoter','Customer concentration','Regulatory','Cyclicality','Competition','Technology','Execution','Liquidity','Geopolitics','Valuation risk','Dilution'],
   ['Balance sheet','Accounting','Governance','Promoter','Customer concentration','Regulatory','Cyclicality','Competition','Technology','Execution','Liquidity','Geopolitics','Valuation risk','Dilution'],
   [10,12,12,8,5,7,5,7,5,8,5,4,7,5]],
  ['Financial quality','Financial quality',10, ['financialQuality'], ['Financial quality'], ['Financial quality'], [10]],
  ['Management and governance','Management and governance',10, ['managementGovernance'], ['Management and governance'], ['Management and governance'], [10]],
  ['Technical entry','Technical entry',5, ['technicalEntry'], ['Technical entry'], ['Technical entry'], [5]],
  ['Catalysts','Catalysts',5, ['catalysts'], ['Catalysts'], ['Catalysts'], [5]]
];
function bName(b,lang){ return b[0]; }
function bItems(b,lang){ return b[4]; }
function blockScore(p,b){ var t=0; b[3].forEach(function(k){ t += Number((p.score_lines||{})[k])||0; }); return t; }

/* ============================ COVER ============================ */
/* ===================== PROVENANCE, X2 / X3 / I1 / C1 =====================

   A figure taken from an exchange filing and a figure scraped off an aggregator
   used to look identical on the page. They are not the same thing, and the
   reader is the one carrying the risk of the difference.

   `sources.tags` maps a payload path to one letter — F filing, A aggregator,
   M media, E estimate. `srcTag()` prints it as a superscript; `srcKey()` prints
   the four-line legend once per document; `provStamp()` is the cover line.

   Nothing here invents a tag. An untagged figure prints exactly as it does
   today, because a made-up provenance is worse than none. */
var SRC_KINDS = { F:'prov_filings', A:'prov_aggr', M:'prov_media', E:'prov_est' };
function srcTags(p){
  var t = (p.sources || {}).tags;
  return (t && typeof t === 'object') ? t : {};
}
/* The tag for a path, falling back to the nearest tagged ancestor: a tag on
   `deep.litigation` covers `deep.litigation.matters[0].amount_cr` without the
   model having to enumerate every leaf. */
function srcOf(p, path){
  var tags = srcTags(p), k = String(path || '');
  if(!k) return '';
  while(k){
    var v = tags[k];
    if(typeof v === 'string' && SRC_KINDS[v.toUpperCase()]) return v.toUpperCase();
    var cut = k.lastIndexOf('.');
    if(cut < 0) return '';
    k = k.slice(0, cut);
  }
  return '';
}
function srcTag(p, path){
  var k = srcOf(p, path);
  return k ? '<sup class="srctag">' + k + '</sup>' : '';
}
function srcKey(p, lang){
  var tags = srcTags(p);
  var used = {};
  Object.keys(tags).forEach(function(k){
    var v = String(tags[k] || '').toUpperCase();
    if(SRC_KINDS[v]) used[v] = 1;
  });
  var ks = Object.keys(used);
  if(!ks.length) return '';
  return '<div class="srckey"><b>' + e(L(lang, 'prov_key')) + '</b> '
    + ks.map(function(k){
        return '<span><i>' + k + '</i> ' + e(L(lang, SRC_KINDS[k])) + '</span>';
      }).join(' &nbsp;·&nbsp; ') + '</div>';
}
/* The cover line. Deliberately blunt about the prospectus: an analysis built on
   secondary sources is a perfectly good analysis, but the reader should not
   have to guess which one they are holding. */
/* The registers a litigation search is expected to have covered. The framework
   asks for one `deep.litigation.searched` entry per source, including the ones
   that found nothing, because "no matters" and "nobody looked" are different
   findings that used to print identically. */
var LIT_REGISTERS = ['Indian Kanoon','e-Courts','NCLT','NCLAT','IBBI','SEBI orders','MCA',
                     'CESTAT','ITAT','GST appellate','Media'];

/* Which of them the payload records as searched, matched loosely: the model
   writes "Indian Kanoon" or "indiankanoon.org" or "SEBI", and any of those
   should count for the register it names. */
function litRan(p){
  var rows = arr(((p.deep||{}).litigation||{}).searched);
  var hit = {};
  rows.forEach(function(x){
    var t = (S(x.source) + ' ' + S(x.note)).toLowerCase().replace(/[^a-z]+/g, '');
    LIT_REGISTERS.forEach(function(r){
      var k = r.toLowerCase().replace(/[^a-z]+/g, '');
      if(t.indexOf(k) >= 0) hit[r] = 1;
    });
  });
  return hit;
}
function litMissing(p){
  var hit = litRan(p);
  return LIT_REGISTERS.filter(function(r){ return !hit[r]; });
}

/* The registers-searched block: what was run, what it returned, and — printed
   just as plainly — what was never run at all. */
function litSearchBlock(p, lang){
  var rows = arr(((p.deep||{}).litigation||{}).searched);
  if(!rows.length)
    return '<div class="note bad">' + e(L(lang,'lit_none_run')) + '</div>';

  var miss = litMissing(p);
  return '<div class="ssub" style="margin-top:2.5mm">' + e(L(lang,'lit_searched')) + '</div>'
    + tbl([L(lang,'lit_register'), L(lang,'lit_query'), L(lang,'lit_result')],
        rows.slice(0, 14).map(function(x){
          var r = S(x.result), bad = /unreachable/i.test(r);
          return { cells:['<span class="en">' + e(S(x.source)) + '</span>',
                   '<span class="mut en">' + e(S(x.query)) + '</span>',
                   '<span class="' + (bad ? 'tn-bad' : 'mut') + '">' + e(A(lang, r))
                     + (S(x.note) ? ' — ' + e(tr(p,lang,x.note)) : '') + '</span>'] };
        }))
    + (miss.length
        ? '<div class="mut" style="margin-top:1.5mm"><b>' + e(L(lang,'lit_gaps')) + ':</b> '
          + '<span class="en">' + miss.map(e).join(' · ') + '</span></div>'
        : '');
}

/* The year every peer column is stated for, and where the figures came from.
   A peer table without a year is a set of numbers from different periods, and
   the reader has no way to know it. */
function peerBasis(p, lang){
  var pr = (p.financials||{}).peers || {};
  var bits = [];
  if(S(pr.fy)) bits.push(e(L(lang,'peer_fy')) + ' <span class="en">' + e(S(pr.fy)) + '</span>');
  if(S(pr.source)) bits.push(e(L(lang,'peer_src')) + ' <span class="en">' + e(S(pr.source)) + '</span>');
  return bits.length
    ? '<div class="mut" style="margin-top:1.2mm">' + bits.join(' &nbsp;·&nbsp; ') + '</div>' : '';
}

function provStamp(p, lang){
  var src = p.sources || {};
  var read = src.rhp_read === true;
  var bits = [];
  if(arr(src.primary).length) bits.push(L(lang, 'prov_filings'));
  if(arr(src.secondary).length || arr(src.blocks).length) bits.push(L(lang, 'prov_aggr'));
  if(!bits.length) bits.push(L(lang, 'prov_filings'));
  return '<div class="provline"><b>' + e(L(lang, 'prov_stamp')) + '</b> ' + e(bits.join(' + '))
    + ' &nbsp;·&nbsp; <i class="' + (read ? 'pv-yes' : 'pv-no') + '">'
    + e(L(lang, read ? 'prov_rhp_yes' : 'prov_rhp_no')) + '</i></div>';
}
/* The provenance table — one row per block the model actually sourced. */
function provTable(p, lang){
  var rows = arr((p.sources || {}).blocks);
  if(!rows.length) return '';
  return tbl([L(lang, 'prov_block'), L(lang, 'prov_source'), L(lang, 'prov_kind')],
    rows.map(function(r){
      var k = String(S(r.kind) || '').toUpperCase();
      return { cells:[ e(tr(p, lang, r.block)),
                       '<span class="en">' + e(S(r.source) || '—') + '</span>',
                       SRC_KINDS[k] ? '<span class="srcpill">' + k + '</span> '
                          + '<span class="mut">' + e(L(lang, SRC_KINDS[k])) + '</span>' : '—' ] };
    }));
}

/* ===================== FAIR VALUE, I6 / C6 / E2 / V3 =====================
   A range with its method, printed beside the scenarios rather than instead of
   them. Omitted entirely when the payload gives no range — an issue nobody can
   value honestly should say nothing here, not print a dash. */
function fairValue(p){
  var fv = ((p.financials || {}).valuation || {}).fair_value || {};
  var lo = Number(fv.low), hi = Number(fv.high);
  if(isNaN(lo) || isNaN(hi) || !(lo > 0) || !(hi > 0)) return null;
  if(hi < lo){ var t = lo; lo = hi; hi = t; }
  return { low: lo, high: hi, method: S(fv.method), note: S(fv.note) };
}
function fvLine(p, lang, cls){
  var fv = fairValue(p);
  if(!fv) return '';
  var ipo = p.ipo || {}, px = Number(ipo.issue_price);
  var gap = (!isNaN(px) && px > 0)
    ? ((fv.low + fv.high) / 2 - px) / px * 100 : NaN;
  return '<div class="fvbox' + (cls ? ' ' + cls : '') + '">'
    + '<div class="k">' + e(L(lang, 'fv_range')) + '</div>'
    + '<div class="v en">₹' + n(fv.low, 0) + ' – ₹' + n(fv.high, 0) + '</div>'
    + (isNaN(gap) ? '' : '<div class="g ' + (gap >= 0 ? 'up' : 'dn') + ' en">'
        + (gap >= 0 ? '+' : '−') + Math.abs(gap).toFixed(0) + '% '
        + e(L(lang, 'vs_issue')) + '</div>')
    + (fv.method ? '<div class="m">' + e(L(lang, 'fv_method')) + ': '
        + e(tr(p, lang, fv.method)) + '</div>' : '')
    + '</div>';
}

/* ===================== INDUSTRY MARKET SIZE, I2 / C2 =====================
   The commissioned study's headline figures. Every RHP carries one and the IPO
   write-ups quote it, so this is reachable even when the prospectus body is
   not. Prints nothing when the payload has no numbers — an invented market size
   is the most common failure in IPO research and the easiest to hide. */
function mktSize(p, lang, ind){
  ind = ind || (p.company || {}).industry || {};
  /* Number(null) is 0, not NaN, so a market size the research could not find
     printed as "Market growth 0.0%" — a figure, and a wrong one. A tile appears
     only when its value actually arrived. */
  var num = function(v){
    if(v == null || v === '') return null;
    var x = Number(v);
    return isNaN(x) ? null : x;
  };
  var sz = num(ind.market_size_cr), cg = num(ind.market_cagr_pct),
      sh = num(ind.issuer_share_pct), st = S(ind.market_study);
  var tiles = [];
  if(sz != null && sz > 0) tiles.push([L(lang,'mkt_size'), cr(sz), S(ind.market_size_year) || '']);
  if(cg != null)           tiles.push([L(lang,'mkt_growth'), pct(cg, 1), S(ind.market_cagr_window) || '']);
  if(sh != null)           tiles.push([L(lang,'mkt_share'), pct(sh, 1), '']);
  if(!tiles.length) return '';
  return '<div class="grid3" style="margin-bottom:2.5mm">'
    + tiles.map(function(t){
        return '<div class="kv"><div class="k">' + e(t[0]) + srcTag(p, 'company.industry')
          + '</div><div class="v en">' + t[1] + '</div>'
          + (t[2] ? '<div class="s en">' + e(t[2]) + '</div>' : '') + '</div>';
      }).join('') + '</div>'
    + (st ? '<div class="mut" style="margin:-1mm 0 2mm;font-size:6.2pt">'
        + e(L(lang,'mkt_study')) + ': <span class="en">' + e(st) + '</span></div>' : '');
}

/* ===================== LISTING BASE RATE, I4 =====================
   What comparable issues actually did, rather than what this one might do. */
function baseRate(p, lang){
  var br = (p.deep || {}).base_rate || {};
  var rows = arr(br.rows);
  if(!rows.length) return '';
  return '<div class="ssub" style="margin-top:2.5mm">' + e(L(lang,'base_rate'))
    + srcTag(p, 'deep.base_rate') + '</div>'
    + tbl([L(lang,'company_h'), L(lang,'br_sub'), L(lang,'br_gmp'), L(lang,'br_listed')],
        rows.map(function(r){
          var lp = Number(r.listed_pct);
          return { cells:['<span class="en">' + e(S(r.company)) + '</span>',
                          r.subscription == null ? '—' : n(r.subscription, 1) + '×',
                          r.gmp_pct == null ? '—' : pct(r.gmp_pct, 0),
                          isNaN(lp) ? '—' : '<b class="' + (lp >= 0 ? 'tn-good' : 'tn-bad')
                            + ' en">' + (lp >= 0 ? '+' : '−') + Math.abs(lp).toFixed(0) + '%</b>'] };
        }), { num:[1,2,3] })
    + (S(br.verdict) ? '<div class="note">' + e(pick(p, lang, 'deep.base_rate.verdict', br.verdict)) + '</div>' : '');
}

/* ===================== WHAT MOVED THE SCORE, I7 / C7 =====================
   The written basis for all 31 line items lives in the Score Card, which is the
   audit document and keeps them. What the long reports lacked is the opposite
   cut: which five lines carried the score and which five dragged it. That is
   the part a reader would actually argue with. */
function scoreMovers(p, lang, howMany){
  var sl = p.score_lines || {}, sb = p.score_basis || {};
  var gsb = {};
  var rows = [];
  BLOCKS.forEach(function(b){
    var items = bItems(b, lang);
    b[3].forEach(function(k, i){
      var mx = Number(b[6][i]) || 0, v = Number(sl[k]);
      if(!mx || isNaN(v)) return;
      rows.push({ label: items[i], v: v, mx: mx, pc: v / mx * 100,
                  basis: gsb[k] ? safeTr(S(sb[k]), S(gsb[k])) : (tr(p, lang, sb[k]) || '') });
    });
  });
  if(rows.length < 6) return '';
  rows.sort(function(a, b){ return b.pc - a.pc; });
  var take = Math.max(3, Math.min(howMany || 5, Math.floor(rows.length / 3)));
  var top = rows.slice(0, take), bot = rows.slice(-take).reverse();
  var side = function(title, list, good){
    return '<div><div class="ssub">' + e(title) + '</div>'
      + list.map(function(r){
          return '<div class="mvrow"><span class="v en ' + (good ? 'tn-good' : 'tn-bad') + '">'
            + r.v.toFixed(1) + '<em>/' + r.mx + '</em></span>'
            + '<span class="l">' + e(r.label) + '</span>'
            + (r.basis ? '<span class="b">' + e(r.basis) + '</span>' : '') + '</div>';
        }).join('') + '</div>';
  };
  return '<div class="grid2" style="margin-top:2mm">'
    + side(L(lang, 'movers_up'), top, 1) + side(L(lang, 'movers_dn'), bot, 0) + '</div>';
}

/* ============ THE INVESTMENT SUMMARY'S OWN PIECES, V1 / V2 / V3 ============
   This document is two pages in both languages and has to stay two pages, so
   each piece is built to cost nothing: the provenance rides in the masthead's
   existing third line, the fair value in the banner heading's white space, and
   the catalyst strip goes on page 2, which has the room. */
function vProv(p, lang){
  var read = (p.sources || {}).rhp_read === true;
  return '<span style="font-size:14px;color:#6B7480">'
    + e(L(lang, read ? 'prov_rhp_yes' : 'prov_rhp_no')) + '</span><br>';
}
function vHeroFv(p, lang){
  var fv = fairValue(p);
  if(!fv) return '';
  return '<span class="vherofv en">' + e(L(lang, 'fv_range')) + ' ₹'
    + n(fv.low, 0) + '–' + n(fv.high, 0) + '</span>';
}
/* What happens next.

   This printed three dates and nothing else — a heading called "What happens
   next" over a diary, with no answer to the question it asks. The catalysts
   were in the payload the whole time; the long reports printed them and this
   one did not. The dates stay, as the diary line beneath the catalysts they
   belong to. */
function vCatStrip(p, lang){
  var k = keyDates(p), lk = lockinDates(p);
  var cats = arr((p.decision||{}).catalysts).slice(0, 3);
  var chips = [];
  if(k.allot)   chips.push([L(lang, 'allotment'),  dmy(k.allot)]);
  if(k.listing) chips.push([L(lang, 'listing'),    dmy(k.listing)]);
  if(lk)        chips.push([L(lang, 'lockin_cal'), dmy(lk.d30)]);
  if(!cats.length && chips.length < 2) return '';

  return '<div class="vcat">'
    + '<div class="k">' + e(L(lang, 'cat_dated')) + '</div>'
    + (cats.length
        ? '<div class="rows">' + cats.map(function(x){
            return '<div class="r"><b>' + e(tr(p,lang,x.catalyst)) + '</b>'
              + (S(x.mechanism) ? '<span>' + e(tr(p,lang,x.mechanism)) + '</span>' : '')
              + (S(x.priority) ? '<i class="pill ' + sevClass(x.priority) + '">'
                  + e(A(lang, x.priority)) + '</i>' : '')
              + '</div>';
          }).join('') + '</div>'
        : '')
    + (chips.length
        ? '<div class="dates">' + chips.map(function(c){
            return '<span class="c"><i>' + e(c[0]) + '</i> <b class="en">' + e(c[1])
              + '</b></span>'; }).join('') + '</div>'
        : '')
    + '</div>';
}

/* ===================== ANCHOR LOCK-IN, I3 / C5 =====================
   SEBI releases half the anchor allocation 30 days after listing and the rest
   at 90. Both are known the moment the listing date is, and both are supply
   events worth having in the diary. Computed, never asked of the model. */
function lockinDates(p){
  var k = keyDates(p);
  if(!k.listing) return null;
  var d30 = addDays(k.listing, 30), d90 = addDays(k.listing, 90);
  if(!d30 || !d90) return null;
  return { d30: d30, d90: d90 };
}
function lockinLine(p, lang){
  var lk = lockinDates(p);
  if(!lk) return '';
  return '<div class="mut" style="margin-top:1.5mm"><b>' + e(L(lang, 'lockin_cal')) + '.</b> '
    + e(L(lang, 'lockin_30')) + ' <span class="en">' + e(dmy(lk.d30)) + '</span> &nbsp;·&nbsp; '
    + e(L(lang, 'lockin_90')) + ' <span class="en">' + e(dmy(lk.d90)) + '</span></div>';
}

/* ===================== GMP DRIFT, I5 =====================
   The level of a premium is a number; its direction is information. */
function gmpDrift(p, lang){
  var g = (p.ipo || {}).gmp || {};
  var now = Number(g.value), was = Number(g.first_seen_value);
  if(isNaN(now) || isNaN(was)) return '';
  var d = now - was;
  var cls = d > 0 ? 'tn-good' : d < 0 ? 'tn-bad' : 'mut';
  return '<div class="mut" style="margin-top:1.5mm"><b>' + e(L(lang, 'gmp_drift')) + '.</b> '
    + '<span class="en">₹' + n(was, 0) + (S(g.first_seen_date) ? ' (' + e(dmy(g.first_seen_date)) + ')' : '')
    + ' → ₹' + n(now, 0) + '</span> '
    + '<b class="' + cls + ' en">' + (d > 0 ? '+' : d < 0 ? '−' : '') + '₹' + n(Math.abs(d), 0) + '</b></div>';
}

/* ======================= IPO SNAPSHOT (redesigned) =======================

   One builder, three documents. The company, executive and institutional
   reports print the same section 02, and the Investment Summary prints a
   shorter form of it, because a reader who has seen one should not have to
   relearn the layout in the next.

   Two things are worked out here rather than demanded of the payload, so that
   analyses imported before this build still print a full section:

   - The application lot table. SEBI fixes the boundaries — Retail up to
     ₹2,00,000, sHNI from there to ₹10,00,000, bHNI above it — so given the lot
     and the price every row follows by arithmetic. A payload that supplies
     `ipo.applications` wins; otherwise it is derived.
   - The allotment date. Under the T+3 timetable allotment falls the day after
     the issue closes and listing two days after that. A derived date is
     labelled `expected` on its face; a date the payload states is not.
*/
function moneyIn(v){
  /* Indian grouping, whole rupees — 10,14,832 rather than 1,014,832. */
  if(v == null || isNaN(v)) return '—';
  var x = Math.round(Number(v)), sign = x < 0 ? '-' : '';
  x = String(Math.abs(x));
  var last3 = x.slice(-3), rest = x.slice(0, -3);
  if(rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',';
  return sign + '₹' + rest + last3;
}
function lotPrice(ipo){
  var px = Number(ipo.issue_price);
  if(!isNaN(px) && px > 0) return px;
  /* No cut-off yet: the upper end of the band is what an application is made
     at, so it is the honest number to size a lot with. */
  var m = String(S(ipo.price_band) || '').match(/(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d[\d,]*(?:\.\d+)?)/i);
  if(m) return parseFloat(m[2].replace(/,/g, ''));
  var one = String(S(ipo.price_band) || '').match(/(\d[\d,]*(?:\.\d+)?)/);
  return one ? parseFloat(one[1].replace(/,/g, '')) : NaN;
}
var RETAIL_CAP = 200000, SHNI_CAP = 1000000;
function lotRows(ipo){
  ipo = ipo || {};
  var given = arr(ipo.applications);
  if(given.length){
    return given.map(function(r){
      return { label: S(r.label) || S(r.application) || '', band: String(S(r.band) || S(r.label) || ''),
               lots: Number(r.lots), shares: Number(r.shares), amount: Number(r.amount) };
    }).filter(function(r){ return r.label; });
  }
  var lot = Number(ipo.lot_size), px = lotPrice(ipo);
  if(!(lot > 0) || !(px > 0)) return [];
  var per = lot * px;
  var rMax = Math.floor(RETAIL_CAP / per);
  if(rMax < 1) rMax = 1;                     /* one lot can exceed ₹2L on a big issue */
  var sMax = Math.floor(SHNI_CAP / per);
  var out = [];
  var row = function(label, band, lots){
    out.push({ label: label, band: band, lots: lots, shares: lots * lot, amount: lots * per });
  };
  row('Retail', 'r', 1);
  if(rMax > 1) row('Retail', 'r', rMax);
  if(sMax > rMax){
    row('sHNI', 's', rMax + 1);
    if(sMax > rMax + 1) row('sHNI', 's', sMax);
    row('bHNI', 'b', sMax + 1);
  }
  /* min then max within each class, which is the order the exchanges print. */
  return out;
}
function lotIsMax(rows, i){
  var r = rows[i], nx = rows[i + 1];
  return !!(nx && nx.band === r.band) ? false : (i > 0 && rows[i - 1].band === r.band);
}
function addDays(iso, d){
  var t = String(iso || '').slice(0, 10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(t)) return '';
  var dt = new Date(t + 'T12:00:00');
  if(isNaN(dt.getTime())) return '';
  dt.setDate(dt.getDate() + d);
  var p2 = function(v){ return (v < 10 ? '0' : '') + v; };
  return dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate());
}
function keyDates(p){
  var m = p.meta || {}, ipo = p.ipo || {};
  var close = S(m.close_date) || S(ipo.close_date);
  var allot = S(ipo.allotment_date) || S(m.allotment_date);
  var list  = S(m.listing_date) || S(ipo.listing_date);
  return {
    open:  S(m.open_date) || S(ipo.open_date),
    close: close,
    allot: allot || addDays(close, 1),
    allotDerived: !allot,
    listing: list || addDays(close, 3),
    listingDerived: !list
  };
}
function dateRail(p, lang){
  var k = keyDates(p);
  var steps = [
    ['opens', k.open, false],
    ['closes', k.close, false],
    ['allotment', k.allot, k.allotDerived],
    ['listing', k.listing, k.listingDerived]
  ].filter(function(x){ return x[1]; });
  if(steps.length < 2) return '';
  /* No "expected" marker under a derived date: it unbalanced the rail, putting
     one step a line lower than the other three. The derivation itself stays —
     allotment is the day after close and listing two days after that — and the
     payload's own dates always win when the model supplies them. */
  return '<div class="drail">' + steps.map(function(x, i){
    return '<div class="stp' + (i >= 2 ? ' dim' : '') + '"><div class="dot"></div>'
      + '<div class="lb">' + e(L(lang, x[0])) + '</div>'
      + '<div class="dt en">' + e(dmy(x[1])) + '</div></div>';
  }).join('') + '</div>';
}
function freshSplit(ipo, lang){
  var fresh = Number(ipo.fresh_cr), ofs = Number(ipo.ofs_cr);
  if(isNaN(fresh)) fresh = 0;
  if(isNaN(ofs)) ofs = 0;
  var tot = fresh + ofs;
  if(!(tot > 0)) return '';
  var fp = fresh / tot * 100, op = 100 - fp;
  /* Two colours whenever there are two parts, each sized to its own share —
     a single bar cannot show a split. A label is printed only where there is
     room for it, so a 3% sliver stays a sliver rather than overflowing. */
  var seg = function(cls, label, share){
    if(share <= 0) return '';
    return '<i class="' + cls + '" style="flex:0 0 ' + share.toFixed(2) + '%">'
      + (share >= 18 ? e(label) : '') + '</i>';
  };
  return '<div class="ssub">' + e(L(lang, 'fresh_vs_ofs')) + '</div>'
    + '<div class="fsplit">'
    + seg('a', L(lang, 'fresh') + ' ' + cr(fresh) + ' · ' + fp.toFixed(0) + '%', fp)
    + seg('b', 'OFS ' + cr(ofs) + ' · ' + op.toFixed(0) + '%', op)
    + '</div>';
}
function lotTable(p, lang, compact){
  var ipo = p.ipo || {}, rows = lotRows(ipo);
  if(!rows.length) return '';
  if(compact){
    /* One line per class — what a Retail, an sHNI and a bHNI applicant must
       each put in. The maxima belong in the long reports. */
    var seen = {}, mins = [];
    rows.forEach(function(r){ if(!seen[r.band]){ seen[r.band] = 1; mins.push(r); } });
    rows = mins;
  }
  var head = '<tr><th>' + e(L(lang, compact ? 'cls_' : 'application')) + '</th>'
    + '<th class="n">' + e(L(lang, 'lots')) + '</th>'
    + '<th class="n">' + e(L(lang, 'shares')) + '</th>'
    + '<th class="n">' + e(L(lang, 'amount')) + '</th></tr>';
  var body = rows.map(function(r, i){
    /* Retail, sHNI and bHNI are the subscription categories; they stay as
     abbreviations because that is how the exchanges print them. */
    var tag = '<span class="lotb ' + (r.band || 'r') + '">' + e(r.label) + '</span>';
    var qual = compact ? '' : ' <span class="mut">' + e(L(lang, lotIsMax(rows, i) ? 'a_max' : 'a_min')) + '</span>';
    return '<tr><td>' + tag + qual + '</td>'
      + '<td class="n">' + n(r.lots, 0) + '</td>'
      + '<td class="n">' + n(r.shares, 0) + '</td>'
      + '<td class="n">' + moneyIn(r.amount) + '</td></tr>';
  }).join('');
  return '<div class="ssub">' + e(L(lang, compact ? 'min_app' : 'app_lot')) + '</div>'
    + '<table class="mini grow"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
}
/* The rows that are facts rather than headlines, printed under the date rail.
   Exchange sits below face value, by request. */
function snapFacts(p, lang){
  var ipo = p.ipo || {}, m = p.meta || {}, pe = p.people || {};
  var rows = [
    [L(lang, 'market_cap'), cr(ipo.market_cap_cr)],
    [L(lang, 'promoter_hold'), pe.promoter_holding_pre != null
        ? pct(pe.promoter_holding_pre) + ' → ' + pct(pe.promoter_holding_post) : null],
    [L(lang, 'face_value'), ipo.face_value != null ? '₹' + n(ipo.face_value, 0) : null],
    [L(lang, 'exchanges'), S(m.exchanges) || S(m.exchange) || null]
  ].filter(function(r){ return r[1] && r[1] !== '—'; });
  if(!rows.length) return '';
  return '<table class="mini grow" style="margin-top:1.5mm">' + rows.map(function(r){
    return '<tr><td class="k">' + e(r[0]) + '</td><td class="n en">' + r[1] + '</td></tr>';
  }).join('') + '</table>';
}
function snapTiles(p, lang){
  var ipo = p.ipo || {}, m = p.meta || {}, sub = ipo.subscription || {}, g = ipo.gmp || {};
  var t = function(k, v, sml, cls){
    return '<div class="tile"' + (cls ? ' style="border-top-color:var(--teal)"' : '') + '>'
      + '<div class="k">' + e(k) + '</div>'
      + '<div class="v en"' + (cls ? ' style="color:var(--teal)"' : '') + '>' + v + '</div>'
      + '<div class="s en">' + sml + '</div></div>';
  };
  return '<div class="tiles">'
    + t(L(lang, 'price_band'), '₹' + e(S(ipo.price_band) || '—'),
        L(lang, 'issue_at') + ' ₹' + n(ipo.issue_price))
    + t(L(lang, 'issue_size'), cr(ipo.issue_size_cr),
        e(A(lang, S(m.ipo_type) || 'Mainboard')) + ' · ' + e(S(m.exchanges) || S(m.exchange) || '—'))
    + t(L(lang, 'subscription'), sub.overall != null ? n(sub.overall, 1) + '×' : '—',
        'QIB ' + n(sub.qib, 2) + '× · Retail ' + n(sub.retail, 2) + '×')
    + t(L(lang, 'gmp'), g.value != null ? (g.value > 0 ? '+' : '') + '₹' + n(g.value) : '—',
        pct(g.pct) + ' · ' + L(lang, 'unofficial'), 1)
    + '</div>';
}
/* The whole section. `compact` is the Investment Summary's shorter form. */
/* The Investment Summary's price-band tile used to repeat "issue at ₹X", which
   the band already implies. It carries the lot and what one lot costs instead —
   the first number a retail reader actually needs. */
function vLotSub(p, lang){
  var ipo = p.ipo || {}, rows = lotRows(ipo);
  var first = rows[0];
  if(!first) return L(lang, 'issue_at') + ' ₹' + n(ipo.issue_price);
  return L(lang, 'lot') + ' ' + n(first.shares, 0) + ' · ' + moneyIn(first.amount);
}
/* Market cap and promoter holding, under the date rail, by request. */
function vGlanceFacts(p, lang){
  var ipo = p.ipo || {}, pe = p.people || {};
  var rows = [
    [L(lang, 'market_cap'), cr(ipo.market_cap_cr)],
    [L(lang, 'promoter_hold'), pe.promoter_holding_pre != null
        ? pct(pe.promoter_holding_pre) + ' → ' + pct(pe.promoter_holding_post) : null]
  ].filter(function(r){ return r[1] && r[1] !== '—'; });
  if(!rows.length) return '';
  return '<table class="mini grow" style="margin-top:1mm">' + rows.map(function(r){
    return '<tr><td class="k">' + e(r[0]) + '</td><td class="n en">' + r[1] + '</td></tr>';
  }).join('') + '</table>';
}
/* `compact` is the Investment Summary's shorter form; `part` is 'head' (tiles
   and the split bar) or 'tail' (dates, facts and the lot ladder) for a document
   that may need to break the section across two pages. */
function snapshotV2(p, lang, compact, part){
  var ipo = p.ipo || {};
  var note = (S(ipo.structure_verdict) || S(ipo.structure_note))
    ? '<div class="note' + (/exit/i.test(S(ipo.structure_verdict)) ? ' bad' : '') + '" style="margin-top:2.5mm"><b>'
      + e(A(lang, tr(p, lang, ipo.structure_verdict))) + '</b> '
      + e(pick(p, lang, 'ipo.structure_note', ipo.structure_note)) + '</div>'
    : '';
  /* Both columns are flex boxes and both tables grow, so the fact table on the
     left and the lot table on the right finish on the same line however many
     rows each happens to have. Left to themselves they ended at different
     heights and the section read as two loose panels. */
  var left = '<div class="snapcol"><div class="ssub">' + e(L(lang, 'key_dates')) + '</div>'
    + dateRail(p, lang) + snapFacts(p, lang) + '</div>';
  var right = '<div class="snapcol">' + lotTable(p, lang, compact) + '</div>';
  var head = snapTiles(p, lang)
    + (compact ? '' : '<div style="margin-top:2.5mm">' + freshSplit(ipo, lang) + '</div>');
  var tail = '<div class="grid2 snapgrid"' + (part === 'tail' ? '' : ' style="margin-top:2.5mm"') + '>'
    + left + right + '</div>' + (compact ? '' : note);
  if(part === 'head') return head;
  if(part === 'tail') return tail;
  return head + tail;
}

function cover(p, lang, docTitle, pages){
  var v = p.verdict||{}, m = p.meta||{}, ipo = p.ipo||{};
  var sc = v.scores||{}, bands = v.score_bands||{};
  /* The old `snap` array is gone with the table it fed; snapshotV2 reads the
     payload directly. */
  var snapUnused = [
    [L(lang,'issue_period'), e(dmy(m.open_date)||'—')+' — '+e(dmy(m.close_date)||'—')],
    [L(lang,'price_band'), '₹'+e(ipo.price_band||'—')+' · '+L(lang,'issue_at')+' ₹'+n(ipo.issue_price)],
    [L(lang,'issue_size'), cr(ipo.issue_size_cr)+' · '+L(lang,'fresh')+' '+cr(ipo.fresh_cr)+' · OFS '+cr(ipo.ofs_cr)],
    [L(lang,'subscription'), (ipo.subscription&&ipo.subscription.overall!=null? n(ipo.subscription.overall,1)+'×':'—')
      + (ipo.subscription&&ipo.subscription.qib!=null?' · QIB '+n(ipo.subscription.qib,2)+'×':'')
      + (ipo.subscription&&ipo.subscription.retail!=null?' · Retail '+n(ipo.subscription.retail,2)+'×':'')],
    [L(lang,'gmp'), (ipo.gmp&&ipo.gmp.value!=null? '₹'+n(ipo.gmp.value)+' ('+pct(ipo.gmp.pct)+')':'—')+' — '+L(lang,'unofficial')],
    [L(lang,'market_cap'), cr(ipo.market_cap_cr)],
    [L(lang,'promoter_hold'), p.people&&p.people.promoter_holding_pre!=null
        ? pct(p.people.promoter_holding_pre)+' → '+pct(p.people.promoter_holding_post)+' '+L(lang,'post_issue') : '—'],
    [L(lang,'listing'), e(dmy(m.listing_date)||'—')+' · '+e(m.exchanges||'NSE, BSE')]
  ];
  var inner =
    '<div style="height:7mm"></div>'
    + '<div class="eyebrow en">'+EN(e(docTitle))+' &nbsp;·&nbsp; '+e(A(lang,m.ipo_type||'Mainboard'))+' &nbsp;·&nbsp; '+e(L(lang,'india'))+'</div>'
    + '<h1 class="en" style="margin-top:2mm">'+EN(e(m.company||''))+'</h1>'
    + '<div class="mut" style="margin-top:1mm;font-size:6.2pt">'+sectorHtml(p,lang)
      + (m.sector?' &nbsp;·&nbsp; ':'')+e(dmy(m.analysis_datetime))
      /* X3 / E1 — what this analysis was built on, before anything built on it.
         The Executive Summary is a fixed four pages, so there it rides on the
         line that already exists; the longer reports give it its own. */
      + (pages <= 4 ? ' &nbsp;·&nbsp; ' + e(L(lang,'prov_stamp')) + ' '
          + e(L(lang, (p.sources||{}).rhp_read === true ? 'prov_rhp_yes' : 'prov_rhp_no')) : '')
      + '</div>'
    + (pages <= 4 ? '' : provStamp(p, lang))
    + '<div style="height:2.5mm;background:var(--teal);width:26mm;border-radius:1mm;margin:4mm 0 5mm"></div>'
    + '<div class="vb"><div class="h">'+e(L(lang,'verdict_h'))+'</div><div class="c">'
      + '<div class="v">'+e(pick(p,lang,'verdict.headline', v.headline))+'</div>'
      + '<div class="lead" style="margin-top:2mm">'+e(pick(p,lang,'verdict.one_liner', v.one_liner))+'</div>'
      + '</div></div>'
    + '<div class="tiles" style="margin-top:5mm">'
      + [['ipo_quality','/100'],['long_term','/100'],['listing_gain','/100']].map(function(t){
          return '<div class="tile"><div class="k">'+e(L(lang,t[0]))+'</div><div class="v">'+n(sc[t[0]],1)
            +'<small>'+t[1]+'</small></div><div class="s">'+e(A(lang, bands[t[0]]||bandOf(sc[t[0]])))+'</div></div>';
        }).join('')
      /* 4th tile, by request: the grey-market quote, in rupees with the premium
         to the issue price beside it, and flagged on its face as a street
         number rather than an exchange one. */
      + gmpTile(ipo, lang)
      + '<div class="tile"><div class="k">'+e(L(lang,'allocation'))+'</div><div class="v">'
        + e(v.allocation_band||'—')+'</div><div class="s">'+e(L(lang,'of_portfolio'))+'</div></div>'
    + '</div>'
    + sec('01', L(lang,'thesis'))
    + '<div class="lead">'+arr(pick(p,lang,'verdict.thesis', arr(v.thesis))).map(function(t){
        return '<p style="margin-bottom:1.6mm">'+e(t)+'</p>'; }).join('')+'</div>'
    /* Section 02 used to be a two-column parameter/detail table, eight rows
       deep, which is the slowest way to read eight numbers. It is the tile
       band, the fresh/OFS split, the date rail and the application lot table
       now — the same section 02 the institutional report prints, so a reader
       moving between the documents meets one layout. */
    + sec('02', L(lang,'snapshot'))
    + snapshotV2(p, lang)
    + '<div class="grow"></div>';
  return page(p, 1, pages, L(lang,'pg_verdict'), inner, lang, docTitle);
}

/* ============================ REPORT ============================ */
/* A payload that lost sections to truncation must still render. Every renderer
   normalises first, so a missing block becomes an empty one rather than a
   thrown error that leaves the user with no documents at all. */
function safePayload(p){
  p = (p && typeof p === 'object') ? p : {};
  p.meta = p.meta || {};
  p.verdict = p.verdict || {};
  p.verdict.scores = p.verdict.scores || {};
  p.verdict.score_bands = p.verdict.score_bands || {};
  p.ipo = p.ipo || {};
  p.company = (p.company && typeof p.company === 'object') ? p.company : {};
  p.financials = p.financials || {};
  p.people = p.people || {};
  p.decision = p.decision || {};
  p.score_lines = p.score_lines || {};
  p.score_basis = p.score_basis || {};
  p.gu = p.gu || {};
  p.meta = p.meta || {};
  if(!S(p.meta.company)) p.meta.company = S(p.meta.short_name) || S(p.meta.sector) || 'Run';
  if(!S(p.meta.short_name)) p.meta.short_name = S(p.meta.company);
  escalateLitigation(p);
  linkSectorsAndProducts(p);
  return p;
}

/* Many issuers publish one revenue split, not two. When only the product list
   carries shares, the sector chart used to come out empty beside a populated
   products table — the same numbers, one of them thrown away. Either side now
   fills from the other. */
function linkSectorsAndProducts(p){
  var c = p.company || {};
  var segs = arr(c.sectors), prods = arr(c.products);
  function hasPct(list){ return list.some(function(x){ return x && x.revenue_pct != null; }); }
  if(!hasPct(segs) && hasPct(prods)){
    c.sectors = prods.filter(function(x){ return x.revenue_pct != null; })
      .map(function(x){ return { name:x.name, revenue_pct:x.revenue_pct,
                                 growth_pct:null, note:x.growth_note || x.margin_profile }; });
  } else if(!hasPct(prods) && hasPct(segs) && prods.length === 0){
    c.products = segs.filter(function(x){ return x.revenue_pct != null; })
      .map(function(x){ return { name:x.name, what_it_is:x.note, customers:'',
                                 revenue_pct:x.revenue_pct, growth_note:'',
                                 margin_profile:'Not disclosed' }; });
  }
}

/* A disputed demand worth more than a tenth of net worth is a red flag whether
   or not the model chose to call it one. The app adds it so it cannot be
   talked down, and it is marked as added by the app rather than by the tool. */
function escalateLitigation(p){
  var lit = (p.deep && p.deep.litigation) || {};
  var pctNW = Number(lit.pct_of_net_worth);
  if(!isFinite(pctNW) || pctNW < 10) return;
  p.decision = p.decision || {};
  var flags = p.decision.red_flags = arr(p.decision.red_flags);
  var already = flags.some(function(x){
    return /litigation|dispute|demand|tax|gst/i.test(S(x.flag) + ' ' + S(x.evidence)); });
  if(already) return;
  var total = lit.disputed_total_cr != null ? '₹' + n(lit.disputed_total_cr) + ' cr' : 'The disputed amount';
  flags.unshift({
    flag: 'Disputed demands are large against net worth',
    evidence: total + ' under dispute, ' + n(pctNW, 1) + '% of net worth'
            + (lit.pct_of_pat != null ? ' and ' + n(lit.pct_of_pat, 1) + '% of annual profit' : '')
            + '. Flagged automatically from the litigation record.',
    severity: pctNW >= 25 ? 'CRITICAL' : 'HIGH'
  });
}

/* The 100-point score, rendered once and used by both the company report and
   the institutional report. They had two implementations that drifted apart;
   sharing one means a change lands in both and they cannot disagree again.
   Gauge and block bars on the left, spider on the right, then the line items in
   a two-column grid with the basis carried inline. */
/* `compact` drops the 28-item grid and the how-to-read note, leaving the gauge,
   the radar and the seven block bars. The executive summary is six pages and
   the per-item breakdown is what the Score Card document exists for; printing
   it twice costs half a page here to say the same thing. */
function scoreSection(p, lang, compact){
  var sl = p.score_lines||{};
  var total = 0; BLOCKS.forEach(function(bk){ total += blockScore(p,bk); });
  return '<div style="display:flex;gap:5mm;align-items:center;margin:1mm 0 2.5mm">'
      + '<div style="flex:1;min-width:0">'
        + chartGauge(total, lang)
        + '<div style="margin-top:2mm">'+BLOCKS.map(function(bk){
            var g = blockScore(p,bk);
            return barRow(bName(bk,lang), bk[2]?g/bk[2]*100:0, g.toFixed(1)+' / '+bk[2],
                          ragBar(bk[2]?g/bk[2]*100:0)); }).join('')+'</div>'
      + '</div>'
      + '<div style="flex:0 0 62mm;display:flex;align-items:center">'+chartRadar(p, lang)+'</div></div>'
    + (compact ? '' : '<div class="sc2col">'+BLOCKS.map(function(bk){
        var items = bItems(bk,lang), g = blockScore(p,bk);
        return '<div class="sc2blk"><div class="sc2hd">'+e(bName(bk,lang))
          + '<span class="en">'+g.toFixed(1)+'/'+bk[2]+'</span></div>'
          + bk[3].map(function(k,i){
              var vv = Number(sl[k])||0, mx = bk[6][i];
              return '<div class="sc2row"><span class="l">'+e(items[i])+'</span>'
                + '<span class="t"><i style="width:'+(mx?vv/mx*100:0).toFixed(0)+'%;background:'
                + ragBarHex(mx?vv/mx*100:0)+'"></i></span>'
                + '<span class="v en">'+vv.toFixed(1)+'<em>/'+mx+'</em></span></div>';
            }).join('') + '</div>';
      }).join('')+'</div>'
    + '<div class="note" style="margin-top:3mm"><b>'+e(L(lang,'how_to_read'))+'</b>'
      + e(L(lang,'how_to_read_b'))+'</div>');
}
/* A group heading, the same one the institutional report uses, so the two
   documents announce their sections identically. */
function grpHead(lang, key){
  return '<div class="ir-grp" style="margin:0 0 3mm"><div class="ir-grph">'
       + e(L(lang, key)) + '</div></div>';
}

/* The five pillars the report is organised into. The sections themselves are
   unchanged — this names the argument they add up to, so a reader can see
   where they are in it rather than working through forty-odd numbered
   headings with no structure over them. blocksFromBody already reads an
   ir-grp as a group in the contents, so each pillar appears there too. */
function pillarHead(title){
  return '<div class="ir-grp" style="margin:0 0 3mm"><div class="ir-grph">'
       + e(String(title).toUpperCase()) + '</div></div>';
}

function buildCompany(p, lang){
  lang = lang || 'en';
  var rep = eqRep(p), run = rep.run || {};
  var c = eqCo(p, (p && p.companyIndex) || 0);
  var out = '';
  var no = 0;
  function S3(title){ no += 1; return sec(no < 10 ? '0' + no : String(no), title); }

  var leadIn = '<div style="height:3mm"></div>'
    + '<div class="eyebrow en">' + EN(e('Company Research Report')) + ' &nbsp;·&nbsp; '
      + e(eqTitle(p)) + '</div>'
    + '<h1 class="en" style="margin-top:1.5mm;font-size:11.2pt">' + EN(e(S(c.name) || S(c.symbol))) + '</h1>'
    + '<div class="mut" style="margin-top:1mm;font-size:6.2pt">' + e(S(c.symbol))
      + (c.exchange ? ' · ' + e(S(c.exchange)) : '') + (c.sector ? ' · ' + e(S(c.sector)) : '')
      + ' &nbsp;·&nbsp; ' + e(dmy(run.payloadGeneratedAt)) + '</div>'
    + '<div style="height:2.5mm;background:var(--gold);width:26mm;border-radius:1mm;margin:3mm 0 4mm"></div>'
    + '<div class="vb"><div class="h">Verdict</div><div class="c">'
      + '<div class="v">' + eqNum(c.overall && c.overall.score) + ' / 100'
        + (c.rank ? ' · rank ' + c.rank + (c.tied ? ' (tied)' : '') : '')
        + (c.eligibleForTop3 ? '' : ' · <span class="neg">barred from the Top 3</span>') + '</div>'
      + '<div class="lead" style="margin-top:2mm">'
        + (arr(c.thesis).length ? e(S(arr(c.thesis)[0])) : e(S(c.business))) + '</div></div></div>'
    + '<div class="tiles" style="margin-top:4mm">'
      + ['businessQuality','growthMultibagger','valuationOpportunity','riskQuality'].map(function(k){
          var pl = (window.EQ && window.EQ.scoring.PILLARS[k]) || { label:k };
          return '<div class="tile"><div class="k">' + e(pl.label) + '</div><div class="v">'
            + eqNum(c.pillars && c.pillars[k] && c.pillars[k].score) + '<small>/100</small></div></div>';
        }).join('')
    + '</div>';

  if(window.EQCharts) window.EQCharts.resetFigures();
  var focusC = focusPage(p, c);
  /* Focus charts drew the scoring bars, the valuation football field and the
     multibagger grid a second time — the same three SVGs already appear in
     Scoring, Valuation scenarios and Multibagger arithmetic, where the text
     that explains them is. Six of this report's eight figures were duplicates.
     The charts stay in their own sections; the gallery goes. */

  /* A two-page backdrop, not a sector study: a company cannot be judged
     without its industry, its policy regime and its peers, but the sector
     report is where that work belongs in full. */
  out += eqScenarioBanner(rep);
  out += eqNarrative(c, 'opening');
  out += pillarHead('Pillar 1 — The Company And The Case');
  out += eqNarrative(c, 'pillar', 1);
  out += S3('Sector backdrop')
    + tbl(['','Reading'], (function(){
        var rows=[], ind=rep.industry, tam=rep.tam, mac=rep.macro;
        if(ind && S(ind.structure)) rows.push({ cells:['Industry structure', e(S(ind.structure))] });
        if(ind && S(ind.cyclePosition)) rows.push({ cells:['Where the cycle sits', e(S(ind.cyclePosition))] });
        if(tam && tam.tam) rows.push({ cells:['Addressable market',
          n(tam.tam.value,0)+' '+e(S(tam.tam.unit))+' ('+e(S(tam.tam.year))+')'] });
        if(mac && mac.gdpGrowth) rows.push({ cells:['GDP growth',
          n(mac.gdpGrowth.value,2)+'% ('+e(S(mac.gdpGrowth.period))+')'] });
        if(arr(rep.policy).length) rows.push({ cells:['Policy',
          e(arr(rep.policy).map(function(x){ return S(x.name); }).join(', '))] });
        if(!rows.length) rows.push({ cells:['Sector research','<span class="mut">None was supplied with this run.</span>'] });
        return rows;
      })())
    + (arr(rep.programs).length
        ? tbl(['Programme this company supplies into','What they supply'],
            arr(rep.programs).filter(function(pr){
              return arr(pr.beneficiaries).some(function(b){
                return S(b.symbol)===S(c.symbol) || S(b.name)===S(c.name); }); })
            .map(function(pr){
              var b=arr(pr.beneficiaries).filter(function(x){
                return S(x.symbol)===S(c.symbol) || S(x.name)===S(c.name); })[0]||{};
              return { cells:[ '<b>'+e(S(pr.name))+'</b>', e(S(b.supplies)) ]}; }))
        : '');

  out += S3('Snapshot') + eqSnapshot(c, lang);

  if(arr(c.theses).length){
  var sv = (p.standalone ? eqStandaloneVerdict(c, lang) : '');
  if(sv) out += sv;
    out += S3('The case') + eqTheses(c, lang);
  } else if(arr(c.thesis).length > 1){
    out += S3('Thesis')
      + '<div class="lead">' + arr(c.thesis).map(function(t){
          return '<p style="margin-bottom:1.6mm">' + e(S(t)) + '</p>'; }).join('') + '</div>';
  }
  if(S(c.business)) out += S3('The business') + '<p>' + e(S(c.business)) + '</p>';

  out += pillarHead('Pillar 2 — Industry Context And Competitive Moat');
  out += eqNarrative(c, 'pillar', 2);
  out += S3('Moat') + eqMoat(c, lang);
  out += S3('Management, promoters and governance') + eqManagement(c, lang);
  var cmp = eqCompensation(c);
  if(cmp) out += S3('Pay and alignment') + cmp;
  out += pillarHead('Pillar 3 — Financial Analysis And Capital Allocation');
  out += eqNarrative(c, 'pillar', 3);
  out += S3('Capital allocation') + eqCapitalAllocation(c, lang);
  /* The accounts, next to the capital allocation they explain. These used to
     sit after Peers, which put the balance sheet three sections downstream of
     the valuation built on it. */
  var three = eqThreeStatement(c);
  if(three) out += S3('The three statements, as reported') + three;
  var dup = eqDupont(c);
  if(dup) out += S3('Return on capital, deconstructed') + dup + eqRoicChart(c);
  var ccy = eqCapitalCycle(c);
  if(ccy) out += S3('The capital cycle') + ccy;
  var hsec = eqHistoricalSectors(c);
  if(hsec) out += S3('Revenue by operating line') + hsec + eqSectorMixChart(c);


  out += eqComment(c, 'score');
  out += S3('Scoring') + figScoreBullets(c)
    + tbl(['Model','Score','Coverage'], ['businessQuality','growthMultibagger','valuationOpportunity','riskQuality']
        .map(function(k){
          var pl = (window.EQ && window.EQ.scoring.PILLARS[k]) || { label:k };
          var s2 = c.pillars && c.pillars[k];
          return { cells:[e(pl.label), '<b>' + eqNum(s2 && s2.score) + '</b>',
            s2 && s2.coverage != null ? Math.round(s2.coverage*100) + '%' : '&mdash;'] };
        }).concat([{ __cls:'tot', cells:['<b>Overall</b>',
            '<b>' + eqNum(c.overall && c.overall.score) + '</b>',
            c.overall && c.overall.coverage != null ? Math.round(c.overall.coverage*100) + '%' : '&mdash;'] }]),
        { num:[1,2] })
    + (c.ratingsRejected
        ? '<div class="note">' + c.ratingsRejected + ' ratings arrived without evidence and were not counted.</div>'
        : '');

  var mo = c.model;
  if(mo && mo.model && mo.model.available){
    var m = mo.model;
    out += S3('Forecast') + eqComment(c, 'model') + figForecast(c) + figCashflow(c)
      + tbl(['Year','Revenue','EBITDA','Margin','PAT','EPS diluted','FCFF'],
          (function(){
            var labels = fyLabels(c, arr(m.years).length);
            return arr(m.years).map(function(y, i){
            return { cells:['<span class="en">' + e(labels[i] || ('Y' + y.year)) + '</span>',
              n(y.revenue,0), n(y.ebitda,0),
              n(y.ebitdaMargin,1) + '%', n(y.pat,0), n(y.epsDiluted,2), n(y.fcff,0)] };
          }); })(), { num:[1,2,3,4,5,6] })
      + '<div class="mut" style="margin-top:1.5mm">Built from the supplied drivers. '
        + eqReconLine(m)
        + ' Diluted share count ' + n(m.dilutedShares,2)
        + (m.dilutionPct ? ', ' + n(m.dilutionPct,1) + '% above basic' : '') + '.</div>';

    if(mo.sensitivity && mo.sensitivity.available){
      out += S3('What the answer turns on') + figDrivers(c)
        + tbl(['Driver','Change','Cumulative FCFF','Terminal EPS'],
            arr(mo.sensitivity.results).filter(function(r){ return !r.error; }).map(function(r){
              return { cells:[e(S(r.driver)), e(S(r.change)),
                eqSignedPct(r.fcffDeltaPct), eqSignedPct(r.epsDeltaPct)] };
            }), { num:[2,3] })
        + '<div class="mut" style="margin-top:1.5mm">Most sensitive to '
        + e(S(mo.sensitivity.mostSensitiveTo)) + '. '
        + e(S(mo.sensitivity.note)) + '</div>';
    }
    if(mo.valuation && mo.valuation.available){
      out += S3('Intrinsic value') + figSensitivity(c)
        + tbl(['Measure','Value'], [
            { cells:['Value per share', '<b>' + n(mo.valuation.perShare,2) + '</b>'] },
            { cells:['Enterprise value', n(mo.valuation.enterpriseValue,0)] },
            { cells:['In the forecast period', n(mo.valuation.pvExplicit,0)] },
            { cells:['In the terminal', n(mo.valuation.pvTerminal,0) + ' ('
              + Math.round((mo.valuation.terminalShare||0)*100) + '%)'] },
            { cells:['Terminal method', e(S(mo.valuation.terminalMethod))] }
          ], { num:[1] })
        + arr(mo.valuation.warnings).map(function(w){
            return '<div class="note">' + e(S(w)) + '</div>'; }).join('');
    } else if(mo.valuation && mo.valuation.reason){
      /* A value withheld in silence reads as a value nobody computed. Where
         the engine declined to discount the forecast — a lender, or a base
         year that does not tie to reported revenue — the reason goes on the
         page in place of the number. */
      out += S3('Intrinsic value')
        + '<div class="note"><b>No intrinsic value is computed here.</b> '
        + e(S(mo.valuation.reason)) + '</div>';
    }
    if(mo.impliedGrowth && mo.impliedGrowth.available){
      out += '<div class="note"><b>What the price already assumes.</b> '
        + n(mo.impliedGrowth.valuePct,1) + '% growth through the forecast period. '
        + e(S(mo.impliedGrowth.note)) + '</div>';
    }
  } else if(mo && mo.model){
    out += S3('Forecast')
      + '<div class="note">The model did not build: ' + e(S(mo.model.reason)) + '</div>';
  }

  out += pillarHead('Pillar 4 — Valuation And Scenarios');
  out += eqNarrative(c, 'pillar', 4);
  out += S3('Valuation scenarios') + figFootball(c) + eqScenarios(c, lang);
  out += eqComment(c, 'valuation');
  /* How the discount rate was built, how the parts sum, and what the price
     already assumes — beside the scenarios they qualify. */
  var wac = eqWacc(c);
  if(wac) out += S3('How the discount rate is built') + wac;
  var sot = eqSotp(c);
  if(sot) out += S3('Sum of the parts') + sot;
  var imp = eqImplied(c);
  if(imp) out += S3('What the price already assumes') + imp;

  out += S3('What the market is missing') + figConsensus(c) + eqVariant(c, lang);
  var misC = eqMispricing(c, lang);
  if(misC) out += S3('Why the market has this wrong') + misC;
  var techC = eqTechPanel(c, lang);
  if(techC) out += S3('Technical panel') + techC;
  var mbC = eqMultibagger(c, lang);
  if(mbC) out += S3('Multibagger detection') + mbC + eqComment(c, 'multibagger');
  var peC = eqPeers(c, lang);
  if(peC) out += S3('Peers') + peC + eqPeerScatter(c);


  var esgC = eqEsg(c, lang);
  if(esgC) out += S3('ESG') + esgC;

  if(c.bearCase && (S(c.bearCase.argument) || S(c.bearCase.answer))){
    out += S3('The case against')
      + '<p><b>The argument.</b> ' + e(S(c.bearCase.argument)) + '</p>'
      + '<p><b>Why we think it is wrong.</b> ' + e(S(c.bearCase.answer)) + '</p>';
  }

  out += pillarHead('Pillar 5 — Risks, Governance And ESG');
  out += eqNarrative(c, 'pillar', 5);
  out += S3('Accounting quality') + eqForensic(c, lang) + eqTrafficLights(c);
  out += eqComment(c, 'forensic');
  out += S3('Litigation and regulatory registers') + eqLitigation(c, lang);

  var mt = c.metrics;
  if(mt && mt.values){
    var rows = Object.keys(mt.values).map(function(k){
      var v = mt.values[k];
      return { cells:[e(k.replace(/([A-Z])/g,' $1').replace(/^./,function(ch){ return ch.toUpperCase(); })),
        v && v.available ? '<b>' + n(v.value,2) + (v.unit === '%' ? '%' : (v.unit ? ' ' + v.unit : '')) + '</b>'
                         : '<span class="mut">' + e(S(v && v.reason)) + '</span>'] };
    });
    out += S3('Financial metrics') + tbl(['Metric','Value'], rows, { num:[1] })
      + '<div class="mut" style="margin-top:1.5mm">Sector model: ' + e(S(mt.sector))
      + (mt.basis ? ', ' + e(S(mt.basis)) : '') + (mt.period ? ', ' + e(S(mt.period)) : '') + '.</div>';
  }

  var tc = c.technicals;
  if(tc && tc.parts){
    var pt = tc.parts;
    function tv(x, fmt){ return (x && x.available) ? fmt(x) : '<span class="mut">' + e(S(x && x.reason)) + '</span>'; }
    out += S3('Entry context')
      + tbl(['Reading','Value'], [
          { cells:['Trend', e(S(tc.trend))] },
          { cells:['50 day average', tv(pt.sma50, function(x){ return n(x.value,2); })] },
          { cells:['200 day average', tv(pt.sma200, function(x){ return n(x.value,2); })] },
          { cells:['RSI 14', tv(pt.rsi14, function(x){ return n(x.value,1) + ' (' + e(S(x.reading)) + ')'; })] },
          { cells:['MACD', tv(pt.macd, function(x){ return n(x.value,2) + ' vs ' + n(x.signal,2); })] },
          { cells:['Position in range', tv(pt.range, function(x){ return n(x.value,1) + '%, ' + n(x.fromHigh,1) + '% from the high'; })] },
          { cells:['Volume trend', tv(pt.obv, function(x){ return e(S(x.trend)); })] },
          { cells:['Relative strength', tv(pt.relativeStrength, function(x){ return n(x.value,1) + ' points, ' + e(S(x.reading)); })] },
          { cells:['Adjusted for corporate actions', tc.adjusted ? 'Yes' : '<span class="neg">not stated</span>'] }
        ], { num:[1] })
      + '<div class="mut" style="margin-top:1.5mm">' + e(S(tc.caveat)) + '</div>';
  }

  out += S3('Multibagger arithmetic') + figMultibagger(c) + eqMultibagger(c, lang);
  out += S3('Liquidity and position sizing') + eqLiquidity(c, lang);

  if(c.ownership && typeof c.ownership === 'object'){
    var ow = c.ownership;
    var orows = ['promoter','fii','dii','public'].filter(function(k){ return ow[k] != null; })
      .map(function(k){ return { cells:[k.toUpperCase(), n(ow[k],2) + '%'] }; });
    if(orows.length) out += S3('Ownership') + figOwnership(c) + tbl(['Holder','Share'], orows, { num:[1] })
      + (S(ow.insiderActivity) ? '<div class="note">' + e(S(ow.insiderActivity)) + '</div>' : '');
  }

  if(arr(c.catalysts).length){
    out += S3('Catalysts') + figCatalysts(c)
      + tbl(['Event','Window','Effect'], arr(c.catalysts).map(function(x){
          return { cells:[e(S(x.event)), e(S(x.expectedWindow)), e(S(x.impact))] }; }));
  }
  if(arr(c.risks).length){
    out += S3('Risks') + eqRiskMatrix(c) + figRisks(c)
      + tbl(['Risk','Severity','Probability','Impact'], arr(c.risks).map(function(r){
          return { cells:[e(S(r.risk)),
            '<span class="' + (r.severity==='severe'?'neg':'') + '">' + e(S(r.severity)) + '</span>',
            r.probability == null ? '&mdash;' : Math.round(r.probability*100) + '%',
            r.impactPct == null ? '<span class="mut">not quantified</span>' : eqSignedPct(r.impactPct)] };
        }), { num:[2,3] });
  }
  out += eqNarrative(c, 'closing');
  if(arr(c.thesisBreakers).length) out += S3('Thesis breakers') + eqList(c.thesisBreakers);
  if(arr(c.upgradeTriggers).length) out += S3('What would make us more positive') + eqList(c.upgradeTriggers);
  if(arr(c.managementQuestions).length) out += S3('Questions for management') + eqList(c.managementQuestions);

  if(c.baseRates && S(c.baseRates.claim)){
    /* The outside view, with the forecast held against it. The old version
       printed the claim and the share as two sentences; a reader had to do the
       comparison themselves, which is the one thing a base rate exists to save
       them from. */
    out += S3('Base rates — the outside view') + eqBaseRate(c);
  }

  if(arr(c.conflicts).length){
    out += S3('Where the sources disagreed')
      + tbl(['Figure','Sources','Preferred','Why'], arr(c.conflicts).map(function(x){
          return { cells:[e(S(x.figure)), e(S(x.sources)), e(S(x.preferred)), e(S(x.why))] }; }));
  }

  if(arr(c.sources).length){
    out += S3('Sources')
      + tbl(['Source','Publisher','Tier','Date','Label'], arr(c.sources).map(function(x){
          return { cells:[e(S(x.title)), e(S(x.publisher)), '<span class="en">' + e(S(x.tier)) + '</span>',
            e(S(x.date)), e(S(x.evidence))] }; }), { num:[2] , cls:'srctab' })
      + '<div class="mut" style="margin-top:1.5mm">Confidence: ' + e(S(c.confidence && c.confidence.label))
      + '.</div>';
  }

  if(!c.eligibleForTop3 && arr(c.exclusionReasons).length){
    out += S3('Why this company is barred from the Top 3')
      + eqComment(c, 'eligibility') + eqList(c.exclusionReasons);
  }

  var built = blocksFromBody(out);
  return packDoc(p, lang, {
    B: built.B, TITLES: built.TITLES, leadIn: leadIn,
    runHead: 'Company Research Report', docName: 'Company Research Report',
    shellTitle: (S(c.name) || S(c.symbol)) + ' — Company Research Report',
    toc: true, seedPages: 40
  });
}


/* ============ EXECUTIVE SUMMARY — one company ============================
   The company research report runs to forty pages. This is the read for
   someone who will not read forty: the verdict first, then only what supports
   or threatens it. Twelve pages is the ceiling, and it is enforced rather than
   hoped for — the section list is fixed, each section is bounded, and the last
   thing the builder does is check the count.

   Every figure and table here is the same builder the full report uses. A
   summary that recomputed anything would be a second opinion, not a summary. */
function buildCompanyExec(p, lang){
  lang = lang || 'en';
  var rep = eqRep(p), run = rep.run || {};
  var c = eqCo(p, (p && p.companyIndex) || 0);
  var out = '', no = 0;
  function S3(t){ no += 1; return sec(no < 10 ? '0' + no : String(no), t); }

  var verdictWord = (c.overall && isNum_(c.overall.score))
    ? (c.overall.score >= 70 ? 'Strong' : c.overall.score >= 55 ? 'Adequate'
       : c.overall.score >= 40 ? 'Weak' : 'Poor')
    : 'Not scored';

  var leadIn = '<div style="height:3mm"></div>'
    + '<div class="eyebrow en">' + EN(e('Executive Summary')) + ' &nbsp;·&nbsp; '
      + e(eqTitle(p)) + '</div>'
    + '<h1 class="en" style="margin-top:1.5mm;font-size:11.2pt">'
      + EN(e(S(c.name) || S(c.symbol))) + '</h1>'
    + '<div class="mut" style="margin-top:1mm;font-size:6.2pt">' + e(S(c.symbol))
      + (c.exchange ? ' · ' + e(S(c.exchange)) : '')
      + (c.sector ? ' · ' + e(S(c.sector)) : '')
      + ' &nbsp;·&nbsp; ' + e(dmy(run.payloadGeneratedAt)) + '</div>'
    + '<div style="height:2.5mm;background:var(--gold);width:26mm;border-radius:1mm;margin:3mm 0 4mm"></div>'
    + '<div class="vb"><div class="h">Verdict</div><div class="c">'
      + '<div class="v">' + eqNum(c.overall && c.overall.score) + ' / 100 &nbsp;·&nbsp; '
        + e(verdictWord)
        + (c.rank ? ' · rank ' + c.rank : '')
        + (c.eligibleForTop3 ? '' : ' · <span class="neg">does not clear the safety screen</span>')
      + '</div>'
      + '<div class="lead" style="margin-top:2mm">'
        + (arr(c.thesis).length ? e(S(arr(c.thesis)[0])) : e(S(c.business))) + '</div>'
      + '</div></div>'
    + '<div class="tiles" style="margin-top:4mm">'
      + ['businessQuality','growthMultibagger','valuationOpportunity','riskQuality'].map(function(k){
          var pil = (window.EQ && window.EQ.scoring && window.EQ.scoring.PILLARS) || {};
          var v = c.pillars && c.pillars[k];
          return '<div class="tile"><div class="k">' + e((pil[k] && pil[k].label) || k) + '</div>'
            + '<div class="v">' + eqNum(v && v.score) + '</div>'
            + '<div class="s">of 100</div></div>';
        }).join('')
    + '</div>';

  if(window.EQCharts) window.EQCharts.resetFigures();

  /* 01 — the safety verdict, when there is one. It goes first because nothing
     below it matters if the company does not clear the screen. */
  var sv = eqStandaloneVerdict(c, lang);
  if(sv) out += S3('The safety screen') + sv;

  /* 02 — the case, in the author's own three lines */
  if(arr(c.thesis).length){
    out += S3('The case in three lines') + eqList(arr(c.thesis).slice(0, 3));
  }

  /* 03 — what the business is, one paragraph */
  if(S(c.business)) out += S3('The business') + '<div class="lead"><p>' + e(S(c.business)) + '</p></div>';

  /* 04 — the scoring, with the chart that explains itself */
  out += S3('Scoring') + figScoreBullets(c);

  /* 05 — valuation, the range and where the price sits in it */
  if(c.valuation){
    out += S3('Valuation') + figFootball(c) + eqScenarios(c, lang);
  }

  /* 06 — the technical panel, the headline readings only */
  var tp = c.technicalPanel;
  if(tp && tp.available){
    var want = ['trend','rsi','macd','momentum','breakout','range'];
    var rows = want.map(function(k){
      var x = tp.indicators[k]; if(!x || !x.available) return null;
      var v = x.value;
      if(typeof v === 'boolean') v = v ? 'Yes' : 'No';
      else if(v && typeof v === 'object') v = '';
      return { cells:[ e(S(x.indicator)), e(String(v)) + (x.unit ? ' ' + e(S(x.unit)) : '') ] };
    }).filter(Boolean);
    if(rows.length){
      out += S3('Where the price sits')
        + '<p class="mut">Computed from the price series: ' + tp.points + ' ' + tp.spacing
          + ' points' + (tp.asOf ? ', as at ' + e(dmy(tp.asOf)) : '') + '.</p>'
        + (tp.shortNote ? '<p class="mut">' + e(S(tp.shortNote)) + '</p>' : '')
        + tbl(['Reading','Value'], rows, { chunk: 8 });
    }
  }

  /* 07 — the multibagger model's verdict, not its full working */
  var mb = c.multibaggerModel;
  if(mb && mb.available){
    out += S3('Multibagger test')
      + '<p><b>' + e(S(mb.verdict)) + '.</b></p>'
      + tbl(['Test','Verdict'], (mb.tests || []).map(function(t){
          return { cells:[ e(S(MB_LABEL[t.key] || t.key)),
            !t.ran ? '<span class="mut">not run</span>' : (t.passed ? 'Pass' : 'Fail') ] };
        }), { chunk: 6 });
  }

  /* 08 — what would break it */
  var sev = arr(c.redFlags).filter(function(f){ return f.severity === 'severe'; });
  if(sev.length){
    out += S3('Severe findings')
      + tbl(['Category','Finding'], sev.map(function(f){
          return { cells:[ e(S(f.category)), e(S(f.detail)) ] };
        }), { chunk: 6 });
  }

  /* 09 — dated things that will move it */
  if(arr(c.catalysts).length){
    out += S3('What to watch')
      + tbl(['Event','When','Why it matters'], arr(c.catalysts).slice(0, 6).map(function(x){
          return { cells:[ e(S(x.event)), e(dmy(S(x.expectedWindow))),
            '<span class="mut">' + e(S(x.impact)) + '</span>' ] };
        }), { chunk: 6 });
  }

  /* 10 — the conditions that would end the thesis */
  if(arr(c.thesisBreakers).length){
    out += S3('What would break the thesis') + eqList(arr(c.thesisBreakers).slice(0, 6));
  }

  out += S3('How to read this')
    + '<div class="lead"><p>This is a summary of the Company Research Report and '
    + 'carries no figure that document does not. Every score here is computed by '
    + 'the application from rated evidence; nothing on this page is a recommendation, '
    + 'and none of it is advice. Check each figure against the annual report and the '
    + 'exchange filings before acting on any of it.</p></div>';

  var built = blocksFromBody(out);
  return packDoc(p, lang, {
    B: built.B, TITLES: built.TITLES, leadIn: leadIn,
    runHead: 'Executive Summary', docName: 'Executive Summary',
    shellTitle: (S(c.name) || S(c.symbol)) + ' — Executive Summary',
    /* Twelve pages is the ceiling. Seeding to it means the packer can never
       grow a thirteenth: anything that will not fit is dropped by the shell
       rather than silently extending a document sold as a short read. */
    toc: true, seedPages: 12, maxPages: 12
  });
}
function isNum_(v){ return typeof v === 'number' && isFinite(v); }

/* ======================= EXECUTIVE SUMMARY ======================= */
/* ===================== equity run helpers ==========================
   Shared by every document. The report model these read is produced by the
   engine: nothing here computes a score, a ratio or a valuation, it only
   decides what goes on the page and in what order. */
function eqRep(p){ return (p && p.report) || {}; }
function eqMeta(p){ return (p && p.meta) || {}; }
function eqCo(p, i){ var l = eqRep(p).full || []; return l[Math.max(0, Math.min(l.length-1, i||0))] || {}; }
function eqNum(x, dp){ return (x == null) ? '&mdash;' : n(x, dp == null ? 1 : dp); }
function eqPct(x, dp){ return (x == null) ? '&mdash;' : n(x, dp == null ? 1 : dp) + '%'; }
function eqSignedPct(x){
  if(x == null) return '&mdash;';
  return '<span class="' + (x >= 0 ? 'pos' : 'neg') + '">' + (x >= 0 ? '+' : '') + n(x,1) + '%</span>';
}
function eqTitle(p){
  var m = eqMeta(p), r = eqRep(p).run || {};
  return S(r.sector || m.sector || 'Sector') + (r.subSector ? ' — ' + S(r.subSector) : '');
}

/* The masthead. A run has no single company, so the headline is the sector and
   the tiles carry the shape of the run rather than one company's scores. */
function eqCover(p, lang, docLabel, titleFontPt){
  var rep = eqRep(p), run = rep.run || {}, c = rep.counts || {};
  var t3 = rep.top3 || [];
  function tile(k, v, s){
    return '<div class="tile"><div class="k">' + e(k) + '</div><div class="v">' + v + '</div>'
      + '<div class="s">' + e(s || '') + '</div></div>';
  }
  return '<div style="height:3mm"></div>'
    + '<div class="eyebrow en">' + EN(e(docLabel)) + ' &nbsp;·&nbsp; India &nbsp;·&nbsp; listed equity</div>'
    + '<h1 class="en" style="margin-top:1.5mm;font-size:' + (titleFontPt || 19) + 'pt">'
      + EN(e(eqTitle(p))) + '</h1>'
    + '<div class="mut" style="margin-top:1mm;font-size:6.2pt">'
      + e(S(run.horizon) || '') + ' &nbsp;·&nbsp; ' + e(dmy(run.payloadGeneratedAt))
      + (run.searchesRun ? ' &nbsp;·&nbsp; ' + run.searchesRun + ' searches' : '') + '</div>'
    + '<div style="height:2.5mm;background:var(--gold);width:26mm;border-radius:1mm;margin:3mm 0 4mm"></div>'
    + '<div class="vb"><div class="h">Top 3</div><div class="c">'
      + (t3.length
          ? '<div class="v">' + t3.map(function(x){ return e(S(x.name) || S(x.symbol)); }).join(' · ') + '</div>'
            + '<div class="lead" style="margin-top:2mm">'
            + t3.map(function(x){ return e(S(x.symbol)) + ' ' + eqNum(x.overall && x.overall.score); }).join(' &nbsp;|&nbsp; ')
            + '</div>'
          : '<div class="v">No company cleared the kill switch</div>'
            + '<div class="lead" style="margin-top:2mm">Every candidate was barred. The reasons are listed against each company.</div>')
      + '</div></div>'
    + '<div class="tiles" style="margin-top:4mm">'
      + tile('Analysed', (c.universe || 0), 'companies in the run')
      + tile('Scored', (c.scored || 0), 'cleared the coverage floor')
      + tile('Top 3 eligible', (c.top3Eligible || 0), 'cleared the kill switch')
      + tile('Barred', (rep.excludedFromTop3 || []).length, 'kill switch or thin work')
    + '</div>';
}

/* The funnel. An exclusion with no reason beside it is the thing this table
   exists to prevent. */
function eqFunnel(p, lang){
  var rep = eqRep(p), u = rep.universe || {}, c = rep.counts || {};
  var rows = [
    { cells:['Identified in the sector', u.identified == null ? '&mdash;' : n(u.identified,0)] },
    { cells:['Shortlisted for analysis', n(c.universe || 0, 0)] },
    { cells:['Scored', n(c.scored || 0, 0)] },
    { cells:['Eligible for the Top 3', n(c.top3Eligible || 0, 0)] },
    { cells:['Barred by the kill switch', n((rep.excludedFromTop3 || []).length, 0)] }
  ];
  var out = tbl(['Stage','Companies'], rows, { num:[1] });
  var ex = arr(u.exclusions);
  if(ex.length){
    out += '<div style="height:2mm"></div>'
      + tbl(['Screened out','Why'], ex.slice(0,30).map(function(x){
          return { cells:['<span class="en">' + e(S(x.symbol)) + '</span>', e(S(x.reason))] }; }));
  }
  return out;
}

/* The four lenses. They are expected to disagree; a table that always named the
   same company would mean the lenses were not doing anything. */
function eqLenses(p, lang){
  var L4 = eqRep(p).lenses || {};
  function nameOf(a){ return (a && a.length) ? (S(a[0].name) || S(a[0].symbol)) : '—'; }
  function scoreOf(a, k){
    if(!a || !a.length) return '&mdash;';
    var c = a[0];
    var v = k === 'overall' ? (c.overall && c.overall.score)
          : (c.pillars && c.pillars[k] && c.pillars[k].score);
    return eqNum(v);
  }
  return tbl(['Lens','Leads','Score'], [
    { cells:['Best business', e(nameOf(L4.bestBusiness)), scoreOf(L4.bestBusiness,'businessQuality')] },
    { cells:['Best investment today', e(nameOf(L4.bestInvestmentToday)), scoreOf(L4.bestInvestmentToday,'overall')] },
    { cells:['Highest multibagger potential', e(nameOf(L4.highestMultibagger)), scoreOf(L4.highestMultibagger,'growthMultibagger')] },
    { cells:['Best value or GARP', e(nameOf(L4.bestValueGarp)), scoreOf(L4.bestValueGarp,'valuationOpportunity')] }
  ], { num:[2] })
  + '<div class="mut" style="margin-top:1.5mm">These need not be the same company, and usually are not.</div>';
}

/* The ranking table. A tie inside the noise band is printed as a tie, because
   ranking to one decimal claims a precision the ratings do not have. */
function eqRankTable(p, list, lang){
  var rep = eqRep(p);
  return tbl(['#','Company','Overall','Business','Growth','Value','Risk','Forensic'],
    (list || []).map(function(c){
      return { cells:[
        '<span class="en">' + (c.rank == null ? '—' : c.rank + (c.tied ? '=' : '')) + '</span>',
        '<span class="en">' + e(S(c.name) || S(c.symbol)) + '</span>'
          + (c.eligibleForTop3 ? '' : ' <span class="neg">barred</span>'),
        '<b>' + eqNum(c.overall && c.overall.score) + '</b>',
        eqNum(c.pillars && c.pillars.businessQuality && c.pillars.businessQuality.score),
        eqNum(c.pillars && c.pillars.growthMultibagger && c.pillars.growthMultibagger.score),
        eqNum(c.pillars && c.pillars.valuationOpportunity && c.pillars.valuationOpportunity.score),
        eqNum(c.pillars && c.pillars.riskQuality && c.pillars.riskQuality.score),
        c.forensicScore == null ? '&mdash;' : n(c.forensicScore, 0)
      ]};
    }), { num:[2,3,4,5,6,7] })
  + (arr(rep.ties).length
      ? '<div class="note">' + arr(rep.ties).map(function(t){ return e(S(t)); }).join(' ') + '</div>'
      : '');
}

/* Valuation scenarios for one company. */
function eqScenarios(c, lang){
  var v = c.valuation || {};
  var rows = arr(v.scenarios).map(function(s){
    return { cells:[
      e(S(s.scenario)),
      s.fairValue == null ? '&mdash;' : n(s.fairValue,2),
      s.upside && s.upside.available ? eqSignedPct(s.upside.value) : '&mdash;',
      s.probability == null ? '&mdash;' : Math.round(s.probability*100) + '%',
      '<span class="mut">' + e(S(s.assumptions)) + '</span>'
    ]};
  });
  var out = tbl(['Scenario','Fair value','Against price','Probability','Assumptions'], rows, { num:[1,2,3] });
  var kv = [];
  if(v.currentPrice != null) kv.push(['Price', n(v.currentPrice,2) + ' ' + e(S(v.currency) || 'INR')
    + (v.priceAsOf ? ' as at ' + e(S(v.priceAsOf)) : ' <span class="neg">undated</span>')]);
  if(v.marginOfSafety && v.marginOfSafety.available) kv.push(['Margin of safety to base', eqSignedPct(v.marginOfSafety.value)]);
  if(v.asymmetry && v.asymmetry.available && v.asymmetry.ratio != null)
    kv.push(['Upside to downside', n(v.asymmetry.ratio,2) + 'x']);
  if(kv.length) out += '<div style="height:2mm"></div>' + tbl(['Measure','Value'],
    kv.map(function(x){ return { cells:[x[0], x[1]] }; }), { num:[1] });
  return out;
}

/* What the market is missing, with the consensus arithmetic beside it. */
function eqVariant(c, lang){
  var vp = c.variantPerception, cs = c.consensus || {};
  var out = '';
  if(vp){
    out += tbl(['','Position'], [
      { cells:['Market believes', e(S(vp.marketBelieves))] },
      { cells:['Research indicates', e(S(vp.researchIndicates))] },
      { cells:['Where they differ', e(S(vp.difference))] },
      { cells:['Evidence', e(S(vp.evidence))] },
      { cells:['Consequence', e(S(vp.consequence))] }
    ]);
  }
  if(cs.available && arr(cs.lines).length){
    out += '<div style="height:2mm"></div>'
      + tbl(['Line','Year','Consensus','Our model','Difference'],
          arr(cs.lines).map(function(l){
            var cl = fyLabels(c, 2);
            return { cells:[e(S(l.line)),
              '<span class="en">' + e(cl[Number(l.year) - 1] || ('Y' + l.year)) + '</span>',
              n(l.consensus,2), '<b>' + n(l.ours,2) + '</b>', eqSignedPct(l.deltaPct)] };
          }), { num:[1,2,3,4] })
      + '<div class="mut" style="margin-top:1.5mm">Consensus from ' + e(S(cs.source))
        + (cs.estimateCount ? ', ' + cs.estimateCount + ' estimates' : '')
        + (cs.asOf ? ', as at ' + e(S(cs.asOf)) : '') + '.</div>';
  } else if(cs.reason){
    out += '<div class="note">' + e(S(cs.reason)) + '</div>';
  }
  return out;
}

/* Required compound return for each multiple. Arithmetic, not a forecast. */
function eqMultibagger(c, lang){
  var mb = c.multibagger || {}, grid = arr(mb.required);
  if(!grid.length) return '';
  var hs = arr(grid[0].horizons);
  return tbl(['Multiple'].concat(hs.map(function(h){ return h.horizon; })),
      grid.map(function(m){
        return { cells:[m.multiple + 'x'].concat(arr(m.horizons).map(function(h){
          return n(h.requiredCagrPct,1) + '%'; })) };
      }), { num:hs.map(function(_,i){ return i+1; }) })
    + '<div class="mut" style="margin-top:1.5mm">Compound annual return the share price must '
    + 'sustain. Arithmetic, not a forecast.</div>'
    + (S(mb.chain) ? '<div class="note">' + e(S(mb.chain)) + '</div>' : '');
}

/* Accounting quality. The components are the insight, not the total. */
function eqForensic(c, lang){
  var f = c.forensic;
  if(!f) return '<div class="note">No forensic work was supplied, so this company cannot enter the Top 3.</div>';
  if(!f.available) return '<div class="note">' + e(S(f.reason)) + '</div>';
  var out = tbl(['Measure','Value'], [
    { cells:['Forensic score', '<b>' + n(f.score,0) + '</b> / 100 · ' + e(S(c.forensicBand))] },
    { cells:['Tests computed', n(f.tested,0) + ' of ' + n(f.testsAttempted,0) + ' attempted'] },
    { cells:['Findings raised', n(arr(f.flags).length,0)] }
  ], { num:[1] });
  if(arr(f.flags).length){
    out += '<div style="height:2mm"></div>'
      + tbl(['Severity','Test','Finding'], arr(f.flags).map(function(x){
          return { cells:[
            '<span class="' + (x.severity === 'severe' ? 'neg' : '') + '">' + e(S(x.severity)) + '</span>',
            e(S(x.source)), e(S(x.detail))] };
        }));
  }
  if(arr(f.notComputed).length){
    out += '<div class="mut" style="margin-top:1.5mm">Not computed: '
      + arr(f.notComputed).map(function(x){ return e(S(x.name)); }).join(', ')
      + '. An untested measure is unknown, not clean.</div>';
  }
  return out;
}

/* Registers. A register never searched and one that came back clean look
   identical unless the report says which is which. */
function eqLitigation(c, lang){
  var l = c.litigation;
  if(!l || !l.available) return '<div class="note">No litigation search was recorded. '
    + 'An empty list is not evidence that nothing exists.</div>';
  var out = tbl(['Measure','Value'], [
    { cells:['Registers searched', n(l.registersSearched,0) + ' of ' + n(l.registersApplicable,0)] },
    { cells:['Essential coverage', Math.round((l.essentialCoverage||0)*100) + '%'] },
    { cells:['Came back clear', n(l.clear,0)] },
    { cells:['Unreachable', n(arr(l.unreachable).length,0)] },
    { cells:['Matters found', n(arr(l.matters).length,0)] }
  ], { num:[1] });
  if(arr(l.matters).length){
    out += '<div style="height:2mm"></div>'
      + tbl(['Register','Subject','Severity','Matter'], arr(l.matters).map(function(m){
          return { cells:[e(S(m.register)), e(S(m.subjectName) || S(m.subject)),
            '<span class="' + (m.severity === 'severe' ? 'neg' : '') + '">' + e(S(m.severity)) + '</span>',
            e(S(m.summary))] };
        }));
  }
  if(arr(l.neverSearched).length){
    out += '<div class="mut" style="margin-top:1.5mm">Never searched: '
      + arr(l.neverSearched).map(function(x){ return e(S(x.name)); }).join(', ') + '.</div>';
  }
  if(S(l.caveat)) out += '<div class="note">' + e(S(l.caveat)) + '</div>';
  return out;
}

/* Liquidity, expressed as the thing that actually binds: how long a position
   takes to build. */
function eqLiquidity(c, lang){
  var l = c.liquidity;
  if(!l || !l.available) return '<div class="note">' + e(S(l && l.reason) || 'No liquidity data supplied.') + '</div>';
  var out = tbl(['Measure','Value'], [
    { cells:['Average daily value', n(l.avgDailyValue,0) + ' ' + e(S(l.currency))] },
    { cells:['Impact cost', l.impactCostPct == null ? '&mdash;' : n(l.impactCostPct,2) + '%'] },
    { cells:['Free float', l.freeFloatPct == null ? '&mdash;' : n(l.freeFloatPct,1) + '%'] }
  ], { num:[1] })
  + '<div style="height:2mm"></div>'
  + tbl(['Position size','Days to build'], arr(l.sizes).map(function(s){
      return { cells:[n(s.positionSize,0), n(s.daysToBuild,1)] }; }), { num:[1,2] })
  + '<div class="mut" style="margin-top:1.5mm">At ' + e(S(l.participationAssumed)) + '.</div>';
  if(S(l.caution)) out += '<div class="note">' + e(S(l.caution)) + '</div>';
  return out;
}

function eqList(items, cls){
  items = arr(items).filter(Boolean);
  if(!items.length) return '';
  return '<ul class="ir-ul' + (cls ? ' ' + cls : '') + '">'
    + items.map(function(x){ return '<li>' + e(S(typeof x === 'string' ? x : (x.risk || x.event || x))) + '</li>'; }).join('')
    + '</ul>';
}

/* ===================== figures =====================================
   Every chart the documents draw from the engine's own report model. Each one
   refuses when the data is not there, so a thin payload loses a figure and
   gains a stated absence rather than a chart of nothing. */
function CH_(){ return window.EQCharts || null; }

function figFunnel(p){
  var K=CH_(); if(!K) return '';
  var rep=eqRep(p), u=rep.universe||{}, c=rep.counts||{};
  return K.funnel({ title:'Screening funnel', source:'This run',
    steps:[
      { label:'Identified in the sector', value:u.identified },
      { label:'Taken to analysis', value:c.universe },
      { label:'Scored', value:c.scored },
      { label:'Cleared the kill switch', value:c.top3Eligible }
    ].filter(function(s){ return typeof s.value==='number'; }) });
}

function figScoreBullets(c){
  var K=CH_(); if(!K||!c) return '';
  var PIL=(window.EQ&&window.EQ.scoring.PILLARS)||{};
  return K.bullets({ title:'Scoring models — '+(S(c.name)||S(c.symbol)),
    source:'Computed by the application from the component ratings',
    note:'Each bar is a score out of 100, shown above it. The four models are '
       + 'weighted together into the Overall figure at the foot: business quality, '
       + 'growth, valuation and risk. Longer and greener is better; a score under '
       + 'about 45 means the evidence gathered did not support that model.',
    rows:Object.keys(PIL).map(function(k){
      return { label:PIL[k].label, max:100,
               value:(c.pillars&&c.pillars[k]&&c.pillars[k].score) };
    }).concat([{ label:'Overall', max:100, value:(c.overall&&c.overall.score) }]) });
}

function figTop3(rep){
  var K=CH_(); if(!K) return '';
  var t=arr(rep.top3); if(!t.length) return '';
  return K.columns({ title:'The Top 3 across the four scoring models',
    source:'Computed by the application',
    categories:t.map(function(c){ return S(c.symbol); }),
    series:['businessQuality','growthMultibagger','valuationOpportunity','riskQuality']
      .map(function(k){
        var PIL=(window.EQ&&window.EQ.scoring.PILLARS)||{};
        return { name:(PIL[k]||{}).label||k,
                 values:t.map(function(c){ return c.pillars&&c.pillars[k]?c.pillars[k].score:null; }) };
      }) });
}

/* The valuation range across every method that produced one, against the price.
   The single most informative figure in a research report. */
function figFootball(c){
  var K=CH_(); if(!K||!c) return '';
  var v=c.valuation||{}, rows=[];
  var sc=arr(v.scenarios), by={};
  sc.forEach(function(s){ by[s.scenario]=s.fairValue; });
  if(typeof by.bear==='number' && typeof by.bull==='number'){
    rows.push({ label:'Scenarios, bear to bull', low:by.bear, high:by.bull, mid:by.base });
  }
  var mv=c.model&&c.model.valuation;
  if(mv&&mv.available&&typeof mv.perShare==='number'){
    var g=c.model.rateGrid, lo=g&&g.available?g.low:null, hi=g&&g.available?g.high:null;
    rows.push({ label:'Driver model, across the grid',
      low:(typeof lo==='number'?lo:mv.perShare*0.85),
      high:(typeof hi==='number'?hi:mv.perShare*1.15), mid:mv.perShare, color:K.palette.navy });
  }
  var tc=c.technicals;
  if(tc&&tc.parts&&tc.parts.range&&tc.parts.range.available){
    rows.push({ label:'52-week range', low:tc.parts.range.low, high:tc.parts.range.high,
      color:K.palette.s3 });
  }
  if(!rows.length) return K.unavailable('Valuation range','No method produced a range.');
  /* Say what the picture shows. A band that sits entirely above the price is
     the whole argument; one that straddles it is a different conclusion. */
  var note2 = '';
  if(typeof v.currentPrice === 'number'){
    var spans = rows.filter(function(r){ return typeof r.low === 'number' && typeof r.high === 'number'; });
    var allAbove = spans.length && spans.every(function(r){ return r.low > v.currentPrice; });
    var allBelow = spans.length && spans.every(function(r){ return r.high < v.currentPrice; });
    note2 = 'Each bar is the range one method produces; the dashed line is the price paid today, '
      + n(v.currentPrice,2) + '. '
      + (allAbove ? 'Every method puts the business above the price, so the methods agree and the '
          + 'question is the size of the gap rather than its direction.'
        : allBelow ? 'Every method puts the business below the price. The thesis has to rest on '
            + 'something none of these methods captures.'
          : 'The methods straddle the price, so the conclusion depends on which one you weight.');
  }
  return K.footballField({ title:'Valuation range against the price',
    source:'Computed by the application', note:note2, price:v.currentPrice, rows:rows });
}

function figForecast(c){
  var K=CH_(); if(!K) return '';
  var m=c.model&&c.model.model;
  if(!m||!m.available) return '';
  var ys=arr(m.years);
  return K.columnLine({ title:'Forecast revenue (INR Crore) and EBITDA margin (%)',
    source:'Driver model, built by the application',
    categories:fyLabels(c, ys.length),
    bars:{ name:'Revenue', values:ys.map(function(y){ return y.revenue; }) },
    line:{ name:'EBITDA margin', values:ys.map(function(y){ return y.ebitdaMargin; }) } });
}

/* A report built on the reader's own assumptions says so, at the top, before
   anything else. Every number below the banner — the forecast, the intrinsic
   value, the upside, the commentary reading it — has been recomputed on the
   drivers named here, and a reader who picks the document up a month later has
   no other way of knowing that. The research's own figures are printed
   alongside, so the two are never confused. */
function eqScenarioBanner(rep){
  var sc = rep && rep.run && rep.run.scenario;
  if(!sc || !arr(sc.changed).length) return '';
  var one = function(v, scale){
    return (typeof v === 'number')
      ? (v * (scale || 1)).toFixed(2).replace(/\.00$/,'') : '—'; };
  return '<div class="scnban">'
    + '<b>This report is a scenario, not the research’s own case.</b> '
    + 'The assumptions below were changed by the reader, and every figure in this document '
    + 'has been rebuilt on them through the same engine that produced the base case.'
    + '<table class="kv"><tbody>'
    + arr(sc.changed).map(function(d){
        return '<tr><td>' + e(S(d.label)) + '</td>'
          + '<td class="num">' + one(d.from, d.scale) + e(S(d.unit || '')) + '</td>'
          + '<td class="num"><b>' + one(d.to, d.scale) + e(S(d.unit || '')) + '</b></td></tr>';
      }).join('')
    + '</tbody></table>'
    + '<div class="mut">Left column: what the research assumed. Right: what this report was '
    + 'built on. Everything not listed here is unchanged.</div></div>';
}

/* The reconciliation line, in the three states it can honestly be in.

   It used to read "All N reconciliation checks pass" whenever an internal
   arithmetic flag was true — and those checks compare the model to itself, so
   the line printed under a base year out by a factor of eleven. It now reports
   the tie to reported revenue, which is the only check that can fail for a
   reason the reader cares about, and says plainly when there was nothing to
   tie to. */
function eqReconLine(m){
  if(!m) return '';
  var rec = m.reconciliation || {};
  if(m.reconciled === true){
    return 'The base year ties to reported revenue of ' + n(rec.expected,0)
      + (rec.period ? ' for ' + e(S(rec.period)) : '')
      + ', within ' + n(rec.offByPct,1) + '%, and the three statements tie to each other '
      + 'in every forecast year.';
  }
  if(m.reconciled === false){
    return '<span class="neg">The base year does NOT tie to reported revenue: the drivers produce '
      + n(rec.actual,0) + ' against ' + n(rec.expected,0)
      + (rec.period ? ' reported for ' + e(S(rec.period)) : ' reported')
      + ', out by ' + n(rec.offByPct,1) + '%. The forecast below is shown as supplied, but no '
      + 'intrinsic value is computed from it.</span>';
  }
  return 'No reported revenue was supplied for the base year, so the forecast could not be tied '
    + 'to anything the company has published. The three statements tie to each other, which is a '
    + 'weaker claim than it sounds.';
}

/* Forecast years, named. The driver model counts 1..5 and the chart printed
   "Y1".."Y5", which tells the reader nothing about when. The base year comes
   from the latest reported period, and each forecast year is marked with an E
   so a projection is never mistaken for a reported figure. */
function fyLabels(c, count){
  var out = [];
  var base = null;
  try{
    var ann = arr(c.financials && c.financials.annual);
    /* metrics.period is the same reported period seen from the other side of
       the engine, and it survives even when the raw financials do not. */
    var per = ann.length ? String(ann[0].period || '')
      : String((c.metrics && c.metrics.period) || '');
    var m = /FY\s*'?(\d{2,4})/i.exec(per);
    if(m){
      var v = parseInt(m[1], 10);
      base = v < 100 ? 2000 + v : v;
    }
  }catch(err){}
  for(var i = 1; i <= count; i++){
    out.push(base == null ? ('Y' + i)
      : ('FY' + String((base + i) % 100).padStart(2, '0') + 'E'));
  }
  return out;
}

function figCashflow(c){
  var K=CH_(); if(!K) return '';
  var m=c.model&&c.model.model;
  if(!m||!m.available) return '';
  var ys=arr(m.years);
  return K.lines({ title:'Free cash flow (INR Crore) and earnings per share (INR)',
    source:'Driver model, built by the application',
    categories:fyLabels(c, ys.length),
    series:[{ name:'FCFF', values:ys.map(function(y){ return y.fcff; }) },
            { name:'EPS diluted', values:ys.map(function(y){ return y.epsDiluted; }) }] });
}

function figSensitivity(c){
  var K=CH_(); if(!K) return '';
  var g=c.model&&c.model.rateGrid;
  if(!g||!g.available) return '';
  /* A grid of numbers with no reading is a table the reader has to interpret
     unaided. Name the axes and say what the spread across them means. */
  var cells = [];
  arr(g.rows).forEach(function(r){ arr(r.cells).forEach(function(x){
    if(typeof x.value === 'number') cells.push(x.value); }); });
  var note = '';
  if(cells.length > 1){
    var lo = Math.min.apply(null, cells), hi = Math.max.apply(null, cells);
    var price = c.valuation && c.valuation.currentPrice;
    var above = (typeof price === 'number') ? cells.filter(function(v){ return v > price; }).length : null;
    note = 'Each cell is the value per share at that discount rate and that terminal growth rate — '
      + 'the two assumptions the answer is most sensitive to. Across the grid the value runs from '
      + n(lo,0) + ' to ' + n(hi,0) + '.'
      + (above == null ? ''
         : ' ' + above + ' of the ' + cells.length + ' combinations sit above the current price of '
           + n(price,2) + (above === 0
              ? ', so no combination on this grid justifies the price.'
              : above === cells.length
                ? ', so every combination on this grid does.'
                : '; the thesis depends on which half of the grid you believe.'));
  }
  return K.heatgrid({ title:'Value per share across discount rate and terminal growth',
    source:'Computed by the application',
    note:note,
    columns:arr(g.discountRates).map(function(r){ return (r*100).toFixed(1)+'% discount rate'; }),
    rows:arr(g.rows).map(function(r){
      return { label:(r.terminalGrowth*100).toFixed(1)+'% terminal growth',
               cells:arr(r.cells).map(function(x){ return { value:x.value }; }) };
    }) });
}

function figDrivers(c){
  var K=CH_(); if(!K) return '';
  var s=c.model&&c.model.sensitivity;
  if(!s||!s.available) return '';
  var rows=arr(s.results).filter(function(r){ return !r.error && typeof r.epsDeltaPct==='number'; });
  if(!rows.length) return '';
  return K.columns({ title:'What the answer turns on — % change in terminal EPS',
    source:'Each driver flexed on its own, effect on terminal earnings per share',
    yFmt:function(v){ return v + '%'; },
    categories:rows.map(function(r){ return S(r.driver)+' '+S(r.change); }),
    series:[{ name:'Effect on terminal EPS', values:rows.map(function(r){ return r.epsDeltaPct; }) }] });
}

function figConsensus(c){
  var K=CH_(); if(!K) return '';
  var cs=c.consensus;
  if(!cs||!cs.available||!arr(cs.lines).length) return '';
  return K.slope({ title:'Our numbers against consensus',
    source:S(cs.source)+(cs.asOf?', as at '+S(cs.asOf):''),
    leftLabel:'Consensus', rightLabel:'Our model',
    rows:arr(cs.lines).map(function(l){
      var cl = fyLabels(c, 2);
      return { label:S(l.line)+' '+(cl[Number(l.year)-1] || ('Y'+l.year)),
               left:l.consensus, right:l.ours }; }) });
}

function figOwnership(c){
  var K=CH_(); if(!K) return '';
  var o=c.ownership;
  if(!o||typeof o!=='object') return '';
  var sl=['promoter','fii','dii','public'].filter(function(k){ return typeof o[k]==='number'; })
    .map(function(k){ return { label:k.toUpperCase(), value:o[k] }; });
  if(!sl.length) return '';
  return K.donut({ title:'Shareholding', source:'Latest disclosed pattern', slices:sl });
}

function figRisks(c){
  var K=CH_(); if(!K) return '';
  var rs=arr(c.risks).filter(function(r){ return typeof r.probability==='number'; });
  if(!rs.length) return '';
  var sev={ low:25, moderate:55, severe:85 };
  return K.scatter({ title:'Risk matrix', source:'As assessed in this research',
    xLabel:'Likelihood', yLabel:'Impact',
    points:rs.map(function(r,i){
      return { x:r.probability*100,
               y:(typeof r.impactPct==='number'?Math.min(100,Math.abs(r.impactPct)*3):(sev[r.severity]||50)),
               label:'R'+(i+1),
               color:r.severity==='severe'?K.palette.s1:K.palette.navy2 };
    }) })
    + '<table class="ledger"><tbody>' + rs.map(function(r,i){
        return '<tr><th scope="row">R'+(i+1)+'</th><td>'+e(S(r.risk))+'</td></tr>'; }).join('')
    + '</tbody></table>';
}

function figCatalysts(c){
  var K=CH_(); if(!K) return '';
  var cs=arr(c.catalysts).filter(function(x){ return x && S(x.event); });
  if(!cs.length) return '';
  return K.timeline({ title:'Catalysts', source:'As identified in this research',
    items:cs.map(function(x){ return { when:S(x.expectedWindow), label:S(x.event) }; }) });
}

function figMultibagger(c){
  var K=CH_(); if(!K) return '';
  var grid=arr(c.multibagger&&c.multibagger.required);
  if(!grid.length) return '';
  var hs=arr(grid[0].horizons);
  return K.columns({ title:'Compound return required for each multiple',
    source:'Arithmetic, not a forecast',
    categories:hs.map(function(h){ return h.horizon; }),
    series:grid.map(function(m){
      return { name:m.multiple+'x', values:arr(m.horizons).map(function(h){ return h.requiredCagrPct; }) };
    }) });
}

/* The focus page: the whole argument in pictures, before any prose. */
function focusPage(p, forCompany){
  var rep=eqRep(p);
  var out=[];
  if(forCompany){
    out.push(figScoreBullets(forCompany), figForecast(forCompany), figFootball(forCompany),
             figConsensus(forCompany), figOwnership(forCompany), figMultibagger(forCompany));
  } else {
    out.push(figFunnel(p), figTop3(rep));
    arr(rep.top3).slice(0,2).forEach(function(c){ out.push(figFootball(c), figForecast(c)); });
  }
  out = out.filter(function(x){ return x && x.indexOf('fig-na') === -1; });
  if(!out.length) return '';
  return '<div class="focus2">' + out.slice(0,6).join('') + '</div>';
}

/* ============ version 3: the research sections =====================
   The sector is the argument and the companies express it, so these come
   first in the document and the rankings come after. Each one refuses when its
   block is absent, returning a stated gap rather than an empty heading. */

function gapNote(what){
  return '<div class="note"><b>Not researched.</b> ' + e(what) + '</div>';
}

/* ---------- the world ---------- */
function figGlobalGrowth(rep){
  var K=CH_(); var g=rep.global; if(!K||!g||!g.cagr) return '';
  var ks=['y15','y10','y5','y3'], labs=['15 years','10 years','5 years','3 years'];
  var vals=ks.map(function(k){ return typeof g.cagr[k]==='number'?g.cagr[k]:null; });
  if(!vals.filter(function(v){return v!=null;}).length) return '';
  return K.columns({ title:'Global market growth, by lookback', source:S(g.source),
    categories:labs, series:[{ name:'Compound annual growth', values:vals }] });
}
function eqWorld(p, lang){
  var rep=eqRep(p), g=rep.global;
  if(!g) return gapNote('No global context was supplied, so this sector is presented without the market it sits inside.');
  var out='';
  if(S(g.indiaPosition)) out += '<div class="lead"><p>' + e(S(g.indiaPosition)) + '</p></div>';
  out += tbl(['Measure','Value'], [
    { cells:['Global market size', g.marketSize==null?'&mdash;':n(g.marketSize,0)+' '+e(S(g.unit))] },
    { cells:['Source', e(S(g.source)) || '<span class="neg">not stated</span>'] }
  ], { num:[1] });
  out += figGlobalGrowth(rep);
  if(arr(g.forces).length) out += '<h4>What is reshaping it</h4>' + eqList(g.forces);
  if(arr(g.peers).length){
    out += '<h4>Global peers</h4>' + tbl(['Company','Country','Market cap','5-year return','Forward PE','Growth, past','Growth, forecast','What they make'],
      arr(g.peers).map(function(x){
        return { cells:[ '<span class="en">'+e(S(x.name))+'</span>', e(S(x.country)),
          eqNum(x.marketCap,0), eqPct(x.return5y), eqNum(x.forwardPe), eqPct(x.growthPast),
          eqPct(x.growthForecast), '<span class="mut">'+e(S(x.makes))+'</span>' ]};
      }), { num:[2,3,4,5,6] });
  }
  return out;
}

/* ---------- macro ---------- */
function eqMacro(p, lang){
  var m=eqRep(p).macro;
  if(!m) return gapNote('No macro frame was supplied. Doc 01 makes Indian and global macroeconomics mandatory coverage.');
  var labels={ gdpGrowth:'GDP growth', inflation:'Inflation', policyRate:'Policy rate',
    currency:'Rupee against the dollar', creditGrowth:'Credit growth',
    capacityUtilisation:'Capacity utilisation' };
  var rows=Object.keys(labels).filter(function(k){ return m[k]; }).map(function(k){
    var x=m[k];
    return { cells:[ labels[k],
      x.value==null?'&mdash;':'<b>'+n(x.value,2)+'</b>',
      e(S(x.period)) || '<span class="neg">undated</span>',
      '<span class="mut">'+e(S(x.source))+'</span>' ]};
  });
  if(!rows.length) return gapNote('The macro block carried no readings.');
  return tbl(['Measure','Reading','Period','Source'], rows, { num:[1] });
}

/* ---------- budget ---------- */
function figBudget(rep){
  var K=CH_(); var b=rep.budget; if(!K||!b||!arr(b.allocations).length) return '';
  var al=arr(b.allocations).slice().reverse();
  return K.columns({ title:'Budget allocations, announced against spent',
    source:'Union Budget documents',
    categories:al.map(function(x){ return S(x.year); }),
    series:[{ name:'Announced', values:al.map(function(x){ return x.announced; }) },
            { name:'Actually spent', values:al.map(function(x){ return typeof x.spent==='number'?x.spent:null; }) }] });
}
function eqBudget(p, lang){
  var b=eqRep(p).budget;
  if(!b) return gapNote('No Union Budget work was supplied. Doc 01 makes the Budget mandatory coverage.');
  var out=figBudget(eqRep(p));
  if(arr(b.allocations).length){
    out += tbl(['Head','Year','Announced','Spent','Shortfall','How it reaches the sector'],
      arr(b.allocations).map(function(x){
        var gap=(typeof x.spent==='number'&&typeof x.announced==='number')
          ? ((x.spent-x.announced)/Math.abs(x.announced))*100 : null;
        return { cells:[ e(S(x.head)), '<span class="en">'+e(S(x.year))+'</span>',
          eqNum(x.announced,0),
          typeof x.spent==='number'?n(x.spent,0):'<span class="mut">not stated</span>',
          gap==null?'&mdash;':eqSignedPct(gap),
          '<span class="mut">'+e(S(x.reachesSector))+'</span>' ]};
      }), { num:[2,3,4] })
      + '<div class="mut" style="margin-top:1.5mm">The gap between announced and spent is usually '
      + 'the story. An allocation that is never drawn does not reach an order book.</div>';
  }
  if(S(b.economicSurvey)) out += '<h4>The Economic Survey</h4><p>' + e(S(b.economicSurvey)) + '</p>';
  return out;
}

/* ---------- policy ---------- */
function eqPolicy(p, lang){
  var rep=eqRep(p), pol=arr(rep.policy);
  if(!pol.length) return gapNote('No policy schemes were supplied. A sector thesis that never mentions policy is not an Indian equity thesis.');
  var out=pol.map(function(s){
    return '<div class="ir-box"><h4>' + e(S(s.name))
      + (S(s.ministry)?' <span class="mut">' + e(S(s.ministry)) + '</span>':'') + '</h4>'
      + tbl(['','Reading'], [
          { cells:['Objective', e(S(s.objective))] },
          { cells:['Funding and scope', e(S(s.funding))] },
          { cells:['Outcomes to date', e(S(s.outcomes))] },
          { cells:['Challenges', e(S(s.challenges))] },
          { cells:['How it reaches this sector', e(S(s.reachesSector))] }
        ]) + '</div>';
  }).join('');
  var ev=arr(rep.policyEvolution);
  if(ev.length){
    var K=CH_();
    if(K) out += K.timeline({ title:'How the regime evolved', source:'Policy record',
      items:ev.map(function(x){ return { when:S(x.era), label:S(x.what) }; }) });
  }
  return out;
}

function eqRegulation(p, lang){
  var r=eqRep(p).regulation;
  if(!r) return gapNote('No regulation block was supplied.');
  return tbl(['','Reading'], [
    { cells:['Regulator', e(S(r.regulator))] },
    { cells:['The rules', e(S(r.rules))] },
    { cells:['Under review', e(S(r.underReview))] },
    { cells:['What a change would cost', e(S(r.costOfChange))] }
  ]);
}

function eqGeopolitics(p, lang){
  var g=eqRep(p).geopolitics;
  if(!g) return gapNote('No geopolitics or supply chain work was supplied. Doc 01 makes it mandatory coverage.');
  var out=tbl(['','Reading'], [
    { cells:['Import dependence', e(S(g.importDependence))] },
    { cells:['Export exposure', e(S(g.exportExposure))] },
    { cells:['Tariff risk', e(S(g.tariffRisk))] },
    { cells:['Sanction risk', e(S(g.sanctionRisk))] },
    { cells:['Supply chain concentration', e(S(g.concentration))] }
  ]);
  if(arr(g.tradeData).length){
    out += tbl(['Flow','Partner','Value','Year','Source'], arr(g.tradeData).map(function(x){
      return { cells:[e(S(x.flow)), e(S(x.partner)), eqNum(x.value,0), e(S(x.year)),
        '<span class="mut">'+e(S(x.source))+'</span>'] }; }), { num:[2] });
  }
  return out;
}

/* ---------- industry ---------- */
function eqIndustry(p, lang){
  var i=eqRep(p).industry;
  if(!i) return gapNote('No industry block was supplied.');
  var out=tbl(['','Reading'], [
    { cells:['Structure', e(S(i.structure))] },
    { cells:['Where it sits in the cycle', e(S(i.cyclePosition))] },
    { cells:['Where the profit pool sits', e(S(i.profitPool))] },
    { cells:['Technology shift', e(S(i.technologyShift))] }
  ]);
  if(arr(i.demandDrivers).length){
    out += '<h4>Demand drivers</h4>'
      + tbl(['Driver','Direction','Why'], arr(i.demandDrivers).map(function(d){
          return { cells:[ e(S(d.driver)),
            '<span class="'+(d.direction==='positive'?'pos':'neg')+'">'+e(S(d.direction))+'</span>',
            '<span class="mut">'+e(S(d.why))+'</span>' ]}; }));
  }
  return out;
}

function figValueChain(rep){
  var K=CH_(); var vc=arr(rep.valueChain); if(!K||!vc.length) return '';
  return K.valueChain({ title:'Value chain, with the listed companies at each node',
    source:'This research',
    nodes:vc.map(function(n){ return { name:S(n.name), beneficiaries:arr(n.beneficiaries).map(S) }; }) });
}
function eqValueChain(p, lang){
  var vc=arr(eqRep(p).valueChain);
  if(!vc.length) return gapNote('No value chain was supplied, so the second and third order beneficiaries doc 02 asks for have nowhere to appear.');
  return figValueChain(eqRep(p))
    + tbl(['Node','What happens here','Direct beneficiaries','Second order'],
        vc.map(function(n){
          return { cells:[ '<b>'+e(S(n.name))+'</b>', '<span class="mut">'+e(S(n.what))+'</span>',
            e(arr(n.beneficiaries).map(S).join(', ')),
            e(arr(n.secondOrder).map(S).join(', ')) ]}; }));
}

function eqTam(p, lang){
  var t=eqRep(p).tam;
  if(!t) return gapNote('No market sizing was supplied.');
  var rows=[['tam','Total addressable'],['sam','Serviceable addressable'],['som','Serviceable obtainable']]
    .filter(function(k){ return t[k[0]]; })
    .map(function(k){
      var x=t[k[0]];
      return { cells:[ k[1], eqNum(x.value,0)+' '+e(S(x.unit)), e(S(x.year)),
        '<span class="mut">'+e(S(x.basis))+'</span>', '<span class="mut">'+e(S(x.source))+'</span>' ]};
    });
  if(!rows.length) return gapNote('The market sizing block carried no figures.');
  return tbl(['Market','Size','Year','Basis','Source'], rows, { num:[1] });
}

/* ---------- programmes: how a sector thesis becomes a forecast ---------- */
function eqPrograms(p, lang){
  var pr=arr(eqRep(p).programs);
  if(!pr.length) return gapNote('No programmes or contracts were supplied. This is the section that turns a sector view into a company forecast.');
  return pr.map(function(x){
    return '<div class="ir-box"><h4>' + e(S(x.name)) + '</h4>'
      + tbl(['','Reading'], [
          { cells:['Scale', x.scale==null?'&mdash;':n(x.scale,0)+' '+e(S(x.unit))] },
          { cells:['Timeline', e(S(x.timeline))] },
          { cells:['Participants', e(S(x.participants))] },
          { cells:['Challenges', e(S(x.challenges))] }
        ])
      + (arr(x.beneficiaries).length
          ? tbl(['Listed beneficiary','What they supply','Share of the programme'],
              arr(x.beneficiaries).map(function(b){
                return { cells:[ '<span class="en">'+e(S(b.symbol)||S(b.name))+'</span>',
                  e(S(b.supplies)), e(S(b.shareOfProgram)) ]}; }))
          : '<div class="note">No listed beneficiary was named against this programme, so it is background rather than research.</div>')
      + '</div>';
  }).join('');
}

/* ---------- competition ---------- */
function figCompetition(rep){
  var K=CH_(); var c=rep.competition; if(!K||!c||!arr(c.players).length) return '';
  var pl=arr(c.players).filter(function(x){ return typeof x.share==='number'; });
  if(!pl.length) return '';
  var known=pl.reduce(function(a,x){ return a+x.share; },0);
  var slices=pl.map(function(x){ return { label:S(x.name), value:x.share }; });
  if(known<99) slices.push({ label:'Everyone else', value:Math.max(0,100-known), color:K.palette.s3 });
  return K.donut({ title:'Market share', source:S(pl[0].source)+', '+S(pl[0].basis)+' basis', slices:slices });
}
function eqCompetition(p, lang){
  var c=eqRep(p).competition;
  if(!c) return gapNote('No competition block was supplied, so market share has nowhere to appear.');
  var out=figCompetition(eqRep(p));
  if(arr(c.players).length){
    out += tbl(['Player','Listed','Share','Basis','As at','Source'], arr(c.players).map(function(x){
      return { cells:[ e(S(x.name)), x.listed?'Yes':'No', eqPct(x.share),
        e(S(x.basis))||'<span class="neg">not stated</span>', e(S(x.asOf)),
        '<span class="mut">'+e(S(x.source))+'</span>' ]}; }), { num:[2] });
  }
  out += tbl(['','Reading'], [
    { cells:['Concentration', e(S(c.concentration))] },
    { cells:['Entry barriers', e(S(c.entryBarriers))] },
    { cells:['Substitution', e(S(c.substitution))] },
    { cells:['Pricing behaviour', e(S(c.pricingBehaviour))] }
  ]);
  return out;
}

function eqSectorValuation(p, lang){
  var v=eqRep(p).sectorValuation;
  if(!v) return '';
  var K=CH_(), out='';
  if(K && typeof v.tenYearLow==='number' && typeof v.tenYearHigh==='number'){
    out += K.footballField({ title:'Where the sector trades against its own ten-year band',
      source:S(v.source), price:v.currentMultiple,
      rows:[{ label:'Ten-year range', low:v.tenYearLow, high:v.tenYearHigh, mid:v.tenYearMedian }] });
  }
  return out + tbl(['Measure','Value'], [
    { cells:['Metric', e(S(v.metric))] },
    { cells:['Now', eqNum(v.currentMultiple)] },
    { cells:['Ten-year median', eqNum(v.tenYearMedian)] },
    { cells:['Ten-year range', eqNum(v.tenYearLow)+' to '+eqNum(v.tenYearHigh)] }
  ], { num:[1] });
}

function eqMonitorables(p, lang){
  var m=arr(eqRep(p).monitorables);
  if(!m.length) return gapNote('No key monitorables were supplied, so there is no sector-level equivalent of a thesis breaker.');
  return eqList(m) + '<div class="mut">These are what would confirm or break the sector view.</div>';
}

function eqGlossary(p, lang){
  var g=arr(eqRep(p).glossary);
  if(!g.length) return '';
  return tbl(['Term','What it means'], g.map(function(x){
    return { cells:['<b>'+e(S(x.term))+'</b>', e(S(x.meaning))] }; }));
}

/* ============ the company argument ============ */

function figShareholding(c){
  var K=CH_(); var q=arr(c.shareholding); if(!K||q.length<2) return '';
  var qs=q.slice().reverse();
  return K.columns({ title:'Shareholding, quarter by quarter', source:'Exchange filings',
    stacked:true, categories:qs.map(function(x){ return S(x.period); }),
    series:[['promoter','Promoter'],['fii','FII'],['dii','DII'],['public','Public']].map(function(k){
      return { name:k[1], values:qs.map(function(x){ return typeof x[k[0]]==='number'?x[k[0]]:null; }) };
    }) });
}
function figPerformance(c){
  var K=CH_(); var s=c.snapshot; if(!K||!s||!s.performance) return '';
  var pf=s.performance;
  var have=['m3','m6','m12'].filter(function(k){ return typeof pf[k]==='number'; });
  if(!have.length) return '';
  /* "Absolute" and "Relative" named two unlabelled colours against an unlabelled
     axis — relative to what was never stated, and the axis never said the
     numbers were percentages. The benchmark is named when the payload gives
     one, and called the market index when it does not. */
  var bench = S(pf.benchmark) || S(s.benchmark) || '';
  return K.columns({ title:'Share price return, % — against ' + (bench || 'the market index'),
    source:'Exchange data', categories:['3 months','6 months','12 months'],
    yFmt:function(v){ return v + '%'; },
    series:[
      { name:'Share price return %', values:['m3','m6','m12'].map(function(k){ return pf[k]; }) },
      { name:'Versus ' + (bench || 'the index') + ', percentage points',
        values:['m3Relative','m6Relative','m12Relative'].map(function(k){
          return typeof pf[k]==='number'?pf[k]:null; }) }] });
}

/* The technical panel, as computed by the engine from the price series. Every
   row says where its number came from; a row the series could not support says
   what it needed instead of printing a figure that was never calculated. */

/* The multibagger detection model. Five tests, scored on the ones that could
   run — an unrun test is printed as unrun, never as a failure, because a
   company is not worse for a gap it was honest about. */
function eqMultibagger(c, lang){
  var m = c && c.multibaggerModel;
  if(!m || !m.available) return '';
  var rows = (m.tests || []).map(function(t){
    var verdict = !t.ran ? '<span class="mut">not run</span>'
      : (t.passed ? 'Pass' : 'Fail');
    var val = (t.value == null) ? '\u2014'
      : (typeof t.value === 'number' ? t.value + (t.unit ? ' ' + t.unit : '') : String(t.value));
    return { cells:[ e(S(MB_LABEL[t.key] || t.key)), e(String(val)), verdict,
                     '<span class="mut">' + e(S(t.evidence)) + '</span>' ] };
  });
  return '<p><b>' + e(S(m.verdict)) + '.</b> '
    + (m.score != null ? 'Scored ' + m.score + ' of 100 on the tests that ran. '
       : (m.scoreWithheld ? 'No score is given: fewer than three tests could run, and a score from '
            + 'two is not comparable with one from five. ' : ''))
    + 'A test with no input is reported as unrun rather than failed.</p>'
    + tbl(['Test','Reading','Verdict','Evidence'], rows, { chunk: 8 });
}
var MB_LABEL = { revenueGrowth:'Revenue growth', profitGrowth:'Profit growth',
  returnOnEquity:'Return on equity', debt:'Debt', priceTrend:'Price trend' };

/* Sector rotation, with its caveat printed as part of the reading rather than
   as a footnote. */
function eqRotation(p, lang){
  /* The rotation reading is attached to the report, not to the document
     payload — the app computes it across saved runs and hands it over there. */
  var rep = eqRep(p) || {};
  var r = rep.rotation || (p && p.rotation);
  if(!r) return '';
  if(!r.available) return '<p class="mut">' + e(S(r.caveat)) + '</p>';
  var rows = (r.ranked || []).map(function(x, i){
    return { cells:[ String(i + 1), e(S(x.sector + (x.subSector ? ' \u2014 ' + x.subSector : ''))),
      (x.medianMomentum == null ? '\u2014' : x.medianMomentum + ' %'),
      '<span class="mut">' + x.withMomentum + ' of ' + x.companies + ' companies priced</span>' ] };
  });
  return '<p>' + (r.reliable
      ? 'These sectors were researched within a week of each other, so the order is a fair comparison.'
      : '<b>Read this with care.</b> ' + e(S(r.caveat))) + '</p>'
    + tbl(['#','Sector','Median momentum','Basis'], rows, { chunk: 10 });
}


/* The safety verdict, for a company researched on its own.
   The kill switch computes identically for every run, but its only effect is to
   bar a company from a Top 3 — and an independent run has no Top 3, so the
   finding had nowhere to go. On the Anlon report that meant seven severe
   findings, including a High Risk forensic score, appeared nowhere in forty
   pages. On a standalone run it is stated at the top, where a reader cannot
   miss it. Nothing about the switch itself changes. */
function eqStandaloneVerdict(c, lang){
  if(!c) return '';
  var reasons = c.exclusionReasons || [];
  var unread = c.unreadableFlags || [];
  var band = c.forensicScore == null ? null : c.forensicScore;
  if(!reasons.length && !unread.length) return '';

  var rows = reasons.map(function(r){ return { cells:[ e(S(r)) ] }; });
  unread.forEach(function(u){ rows.push({ cells:[ '<span class="mut">' + e(S(u)) + '</span>' ] }); });

  return '<div class="verdictbox">'
    + '<div class="vh">This company does not clear the safety screen</div>'
    + '<p>' + reasons.length + ' severe finding' + (reasons.length === 1 ? '' : 's')
      + (band != null ? ', and a forensic score of ' + band + ' out of 100' : '')
      + '. The same screen decides which companies may enter a Top 3; this company '
      + 'would not have. Every finding below carries its evidence in the sections that follow.</p>'
    + tbl(['Finding'], rows, { chunk: 12 })
    + '<p class="mut">This is research, not a recommendation, and not advice. '
    + 'Verify every figure against the annual report and the exchange filings before acting.</p>'
    + '</div>';
}

function eqTechPanel(c, lang){
  var p = c && c.technicalPanel;
  if(!p) return '';
  if(!p.available){
    return '<p class="mut">' + e(S(p.reason || 'No price series was supplied, so nothing could be computed.')) + '</p>';
  }

  var order = ['trend','sma20','sma50','sma100','sma200','rsi','macd','bollinger','hull',
               'psar','momentum','breakout','supportResistance','range','obv','atr'];
  var rows = [];
  order.forEach(function(k){
    var x = p.indicators[k]; if(!x) return;
    if(!x.available){
      rows.push({ cells:[ e(S(x.indicator || k)),
        '<span class="mut">' + e(S(x.reason || 'not available')) + '</span>', '\u2014' ] });
      return;
    }
    /* Some readings are a band or a set of levels rather than one number, and
       have no .value at all. Printing the missing field gave "undefined" in the
       report, which reads as a fault rather than as a band. */
    var val = x.value;
    if(k === 'bollinger' && x.upper != null){
      val = x.lower + ' \u2013 ' + x.upper;
    } else if(k === 'supportResistance'){
      var sup = (x.support || []).slice(0,2).join(', ');
      var res = (x.resistance || []).slice(0,2).join(', ');
      val = (sup ? 'support ' + sup : '') + (sup && res ? ' \u00b7 ' : '') + (res ? 'resistance ' + res : '');
    } else if(typeof val === 'boolean') val = val ? 'Yes' : 'No';
    else if(val && typeof val === 'object') val = '';
    if(val == null || val === '') val = '\u2014';
    var note = '';
    if(k === 'breakout'){
      note = x.confirmed ? ('confirmed on ' + x.volumeSpike + '\u00d7 average volume')
           : (x.note || ('prior high ' + x.priorHigh));
    } else if(k === 'psar' && x.trend) note = x.trend;
    else if(k === 'hull' && x.turning) note = 'turning ' + x.turning;
    else if(k === 'trend') note = 'above ' + x.aboveCount + ' of ' + x.of + ' averages';
    else if(k === 'range' && x.high != null) note = 'high ' + x.high + ', low ' + x.low;
    else if(k === 'bollinger' && x.middle != null) note = 'middle ' + x.middle;
    rows.push({ cells:[ e(S(x.indicator || k)),
      e(String(val)) + (x.unit ? ' ' + e(S(x.unit)) : ''),
      '<span class="mut">' + e(S(note)) + '</span>' ] });
  });
  if(!rows.length) return '';

  var prov = p.points + ' ' + p.spacing + ' points'
    + (p.asOf ? ', as at ' + e(dmy(p.asOf)) : '')
    + ' \u00b7 ' + p.computed + ' of ' + p.of + ' readings computed';
  return '<p class="mut">Computed by the application from the price series, not supplied as '
    + 'readings. ' + prov + '.</p>'
    + tbl(['Reading','Value','Note'], rows, { chunk: 10 });
}

function eqSnapshot(c, lang){
  var s=c.snapshot;
  if(!s) return '';
  var v=c.valuation||{};
  var q=arr(c.shareholding)[0]||{};
  return tbl(['Measure','Value'], [
    { cells:['Price', v.currentPrice==null?'&mdash;':n(v.currentPrice,2)+' '+e(S(v.currency)||'INR')] },
    { cells:['Market capitalisation', eqNum(s.marketCap,0)] },
    { cells:['Free float', eqPct(s.freeFloatPct)] },
    { cells:['Average daily value', eqNum(s.avgDailyValue,0)] },
    { cells:['52-week range', eqNum(s.week52Low,2)+' to '+eqNum(s.week52High,2)] },
    { cells:['Promoter holding', eqPct(q.promoter)] },
    { cells:['Pledged', q.pledged==null?'<span class="mut">not stated</span>'
        : (q.pledged>0?'<span class="neg">'+n(q.pledged,2)+'%</span>':'0%')] }
  ], { num:[1] }) + figPerformance(c) + figShareholding(c);
}

function eqTheses(c, lang){
  var t=arr(c.theses);
  if(!t.length) return gapNote('No numbered theses were supplied, so this company has scores but no argument.');
  return t.map(function(x,i){
    return '<div class="ir-box"><h4>Thesis ' + (i+1) + '. ' + e(S(x.claim)) + '</h4>'
      + (S(x.mechanism)?'<p><b>The mechanism.</b> ' + e(S(x.mechanism)) + '</p>':'')
      + (S(x.evidence)?'<p><b>The evidence.</b> ' + e(S(x.evidence)) + '</p>':'')
      + ((S(x.size)||S(x.by))
          ? '<div class="mut">Size: ' + (e(S(x.size))||'not quantified')
            + '. Expected by: ' + (e(S(x.by))||'not dated') + '.</div>' : '')
      + '</div>';
  }).join('');
}

function eqMoat(c, lang){
  var m=c.moat;
  if(!m) return gapNote('The moat is rated but never argued.');
  return tbl(['','Reading'], [
    { cells:['The barrier', e(S(m.barrier))] },
    { cells:['Evidence it exists', e(S(m.evidence))] },
    { cells:['What it has survived', e(S(m.testSurvived))] },
    { cells:['Durability', e(S(m.durability))] }
  ]);
}

function eqManagement(c, lang){
  var m=c.management;
  if(!m) return gapNote('No management block was supplied.');
  var out='';
  if(arr(m.people).length){
    out += tbl(['Name','Role','Since','Background'], arr(m.people).map(function(x){
      return { cells:[ '<b>'+e(S(x.name))+'</b>', e(S(x.role)), e(S(x.since)),
        '<span class="mut">'+e(S(x.background))+'</span>' ]}; }));
  }
  if(arr(m.guidanceRecord).length){
    out += '<h4>Guidance against delivery</h4>'
      + tbl(['Period','What was promised','What was delivered'], arr(m.guidanceRecord).map(function(g){
          return { cells:[ '<span class="en">'+e(S(g.period))+'</span>',
            e(S(g.promised)), e(S(g.delivered)) ]}; }))
      + '<div class="mut" style="margin-top:1.5mm">This record, rather than the current plan, '
      + 'is how management is judged.</div>';
  } else {
    out += gapNote('No record of guidance against delivery was supplied.');
  }
  return out;
}

function figCapitalAllocation(c){
  var K=CH_(); var ca=c.capitalAllocation; if(!K||!ca||!arr(ca.tenYear).length) return '';
  var t=arr(ca.tenYear)[0];
  var items=[{ label:'Operating cash', value:t.operatingCash, total:true }];
  var spent = 0;
  [['capex','Capex'],['acquisitions','Acquisitions'],['dividends','Dividends'],
   ['buyback','Buyback'],['debtRepaid','Debt repaid']].forEach(function(k){
    if(typeof t[k[0]]==='number' && t[k[0]]!==0){
      var v = Math.abs(t[k[0]]);
      spent += v;
      items.push({ label:k[1], value:-v });
    }
  });
  if(items.length<2) return '';
  /* The bars did not add up to the opening figure, so a reader could not tell
     whether the rest had been spent on something unnamed or simply kept. What
     was not spent is retained in the business, and stating it closes the
     arithmetic. */
  if(typeof t.operatingCash === 'number'){
    var retained = t.operatingCash - spent;
    if(Math.abs(retained) > 0.5) items.push({ label:'Retained in business', value:-retained });
  }
  return K.waterfall({
    title:'Where the operating cash went — INR Crore',
    source:S(t.period) + ' · cash from operations, after tax and before capital spending',
    items:items });
}
function eqCapitalAllocation(c, lang){
  var ca=c.capitalAllocation;
  if(!ca) return gapNote('No capital allocation record was supplied.');
  var out=(S(ca.summary)?'<p>'+e(S(ca.summary))+'</p>':'') + figCapitalAllocation(c);
  if(arr(ca.tenYear).length){
    out += tbl(['Period','Operating cash','Capex','Acquisitions','Dividends','Buyback','Debt repaid','Return earned'],
      arr(ca.tenYear).map(function(t){
        return { cells:[ e(S(t.period)), eqNum(t.operatingCash,0), eqNum(t.capex,0),
          eqNum(t.acquisitions,0), eqNum(t.dividends,0), eqNum(t.buyback,0),
          eqNum(t.debtRepaid,0), eqPct(t.returnEarned) ]};
      }), { num:[1,2,3,4,5,6,7] });
  }
  return out;
}

function eqMispricing(c, lang){
  var m=arr(c.mispricing);
  if(!m.length) return '';
  return m.map(function(x,i){
    return '<div class="ir-box"><h4>Concern ' + (i+1) + '. ' + e(S(x.concern)) + '</h4>'
      + '<p><b>Our answer.</b> ' + e(S(x.answer)) + '</p></div>';
  }).join('')
  + '<div class="mut">Each concern is stated in the bear\u2019s own words before it is answered. '
  + 'A case nobody makes is not worth answering, and a case left unanswered is not research.</div>';
}

/* The peer table used to print "Metric 1" and "Metric 2" — two unnamed
   numbers, which tell a reader nothing they can act on. The six columns a
   comparison is actually made on are named now, and the company itself is
   shown in the same table so the comparison is visible rather than implied.
   Payloads written against the older schema still carry metric1/metric2, so
   those are printed under a Note rather than dropped. */
function eqPeers(c, lang){
  var pr=arr(c.peers);
  if(!pr.length) return gapNote('No peer comparison was supplied.');
  var rich = pr.some(function(x){
    return x && (x.pe!=null || x.evEbitda!=null || x.roe!=null
      || x.revGrowth!=null || x.ebitdaMargin!=null || x.marketCap!=null); });
  if(!rich){
    return tbl(['Peer','Listed','Metric 1','Metric 2','Note'], pr.map(function(x){
      return { cells:[ '<b>'+e(S(x.name))+'</b>', x.listed?'Yes':'No',
        eqNum(x.metric1), eqNum(x.metric2), '<span class="mut">'+e(S(x.note))+'</span>' ]};
    }), { num:[2,3] })
    + gapNote('This run predates the fuller peer matrix, so only the two unnamed metrics were supplied.');
  }
  var rows = pr.map(function(x){
    return { cells:[ '<b>'+e(S(x.name))+'</b>',
      x.marketCap == null ? '—' : n(x.marketCap, 1), ratioCell(x.pe),
      ratioCell(x.evEbitda), ratioCell(x.roe),
      x.revGrowth == null ? '—' : n(x.revGrowth, 1), ratioCell(x.ebitdaMargin) ]};
  });
  /* The subject company on the same axes, computed from the financials the
     payload already carries. The first version printed the name and five
     dashes, which is worse than omitting the row: it says the comparison was
     attempted and failed. Nothing here is guessed — each figure is arithmetic
     on stated numbers, and anything whose inputs are missing stays a dash. */
  var self = eqSelfPeerRow(c);
  if(self) rows.unshift(self);
  return tbl(['Company','Market cap','P/E','EV/EBITDA','ROE %','Rev growth %','EBITDA margin %'],
    rows, { num:[1,2,3,4,5,6] });
}

/* A ratio of exactly zero is almost never a real reading — it is how a model
   says "not applicable" in a numeric field. EV/EBITDA and EBITDA margin are
   meaningless for a bank, and printing 0.0 asserts something false about it. */
function ratioCell(v){
  if(v == null) return '—';
  var x = Number(v);
  if(!isFinite(x) || x === 0) return '—';
  return n(x, 1);
}

function eqSelfPeerRow(c){
  var num = function(v){ return (typeof v === 'number' && isFinite(v)) ? v : null; };
  var snap = c.snapshot || {};
  var ann = arr(c.financials && c.financials.annual);
  var cur = ann[0] || null, prv = ann[1] || null;
  var f = (c.forensic && c.forensic.current) || {};

  var mcap = num(snap.marketCap);
  var netProfit = num(cur && cur.netProfit) != null ? cur.netProfit : num(f.netProfit);
  var revenue = num(cur && cur.revenue) != null ? cur.revenue : num(f.revenue);
  var prevRev = num(prv && prv.revenue);
  var equity = num(cur && cur.shareholdersEquity);
  var ebitda = num(cur && cur.ebitda);
  var debt = num(cur && cur.totalDebt);
  var cash = num(cur && cur.cashAndEquivalents);

  var pe = (mcap != null && netProfit) ? mcap / netProfit : null;
  var roe = (netProfit != null && equity) ? (netProfit / equity) * 100 : null;
  var growth = (revenue != null && prevRev) ? ((revenue - prevRev) / prevRev) * 100 : null;
  var margin = (ebitda != null && revenue) ? (ebitda / revenue) * 100 : null;
  var evEbitda = (mcap != null && ebitda && debt != null && cash != null)
    ? (mcap + debt - cash) / ebitda : null;

  if(mcap == null && pe == null && roe == null) return null;
  return { __cls:'tot', cells:[
    '<b>' + e(S(c.name) || S(c.symbol)) + '</b>',
    mcap == null ? '—' : n(mcap, 1),
    ratioCell(pe), ratioCell(evEbitda), ratioCell(roe),
    growth == null ? '—' : n(growth, 1), ratioCell(margin) ] };
}

/* The three statements, reported years and forecast years in one table.

   The report used to print eight summary ratios from financials.annual and
   nothing else, so a reader could see the ratios and not the accounts that
   produced them. Three reported years and three forecast years is the minimum
   that shows a trend: a cash flow statement is built from movements between
   balance sheets, so three balance sheets produce two years of cash flow.

   Forecast columns are marked E and come from the driver model, which is the
   same model the intrinsic value is built on — so the statement and the
   valuation cannot disagree. */
/* The engine's own reasoning, printed beside the result it explains.

   The application screens, scores, runs fifteen forensic tests, applies a kill
   switch, reconciles a driver model and runs five multibagger tests — and used
   to print a number for each. This renders the argument behind the number.
   Every sentence names a figure the engine computed; where it could not
   compute one, nothing is printed rather than something generic. */
/* The narrative through-line. The commentary blocks explain each computed
   result where it sits; this is the argument that runs between them, so the
   report arrives somewhere rather than being forty sections that each happen
   to be true. */
/* How long a passage has to be before it is set in two columns.

   MEASURED, not chosen by eye. On the current documents the prose runs at a
   median of 116 characters per line and reaches 149 — against the 55 to 75
   that typography has settled on for continuous text, and the ~90 beyond which
   the eye starts losing its place returning to the left margin. A 173mm
   measure at 7.4pt is simply too wide to read a paragraph across.

   Setting the whole page in two columns is the wrong answer, and the
   measurement says why: only 10% of these documents is prose by height. The
   other 90% is tables and figures, which need the full 173mm and would be
   crushed to 83mm. So the columns go on the PROSE ALONE. Exhibits keep the
   full measure, the commentary reads at about 56 characters a line, and the
   page stays as full as it was — this reflows text that is already there
   rather than reclaiming space, because at 99% fill there is no space to
   reclaim.

   The threshold exists because a short passage in two columns looks broken:
   three lines split into two stacks of one and a half is worse than one wide
   line. Below it, a passage stays single-column. */
/* Prose is emitted at the full measure. Setting it in columns was tried and
   reverted — see the note above pairPass for what the measurement showed. */

function eqStory(block, cls){
  if(!block) return '';
  var ps = arr(block.paragraphs);
  if(!ps.length && S(block.text)) ps = [S(block.text)];
  if(!ps.length) return '';
  return '<div class="' + (cls || 'storybox') + '">'
    + (S(block.title) ? '<div class="storyh">' + e(S(block.title)) + '</div>' : '')
    + ps.map(function(t){ return '<p class="storyp">' + e(S(t)) + '</p>'; }).join('')
    + '</div>';
}
function eqNarrative(c, which, pillar){
  try{
    if(!window.EQ || !EQ.commentary) return '';
    var C = EQ.commentary;
    if(which === 'opening' && typeof C.openingNarrative === 'function') return eqStory(C.openingNarrative(c));
    if(which === 'closing' && typeof C.closingNarrative === 'function') return eqStory(C.closingNarrative(c));
    if(which === 'pillar' && typeof C.pillarNarrative === 'function'){
      return eqStory(C.pillarNarrative(c, pillar), 'bridgebox');
    }
  }catch(err){}
  return '';
}

function eqSay(block){
  if(!block || !S(block.text)) return '';
  return '<div class="saybox"><div class="sayh">' + e(S(block.title)) + '</div>'
       + '<div class="sayt">' + e(S(block.text)) + '</div></div>';
}
function eqComment(c, key){
  try{
    if(!window.EQ || !EQ.commentary) return '';
    var fn = { score:'scoreCommentary', forensic:'forensicCommentary',
      eligibility:'eligibilityCommentary', model:'modelCommentary',
      valuation:'valuationCommentary', multibagger:'multibaggerCommentary' }[key];
    if(!fn || typeof EQ.commentary[fn] !== 'function') return '';
    return eqSay(EQ.commentary[fn](c));
  }catch(err){ return ''; }
}

function eqThreeStatement(c){
  var ann = arr(c.financials && c.financials.annual);
  if(ann.length < 1) return '';
  var fyNum = function(x){
    var m = /FY\s*'?(\d{2,4})/i.exec(S(x));
    if(!m) return null;
    var v = parseInt(m[1],10);
    return v < 100 ? 2000 + v : v;
  };
  /* Oldest first: a statement is read left to right through time. */
  var hist = ann.slice().sort(function(a,b){
    var ka = fyNum(a.period), kb = fyNum(b.period);
    return (ka == null || kb == null) ? 0 : ka - kb;
  });

  /* The forecast, mapped onto the same line names. */
  var proj = [];
  try{
    var my = arr(c.model && c.model.model && c.model.model.years);
    var labels = fyLabels(c, my.length);
    proj = my.map(function(y, i){
      return { period: labels[i], projected: true,
        revenue:y.revenue, costOfGoodsSold:y.cogs, ebitda:y.ebitda,
        depreciation:y.depreciation, ebit:y.ebit, interestExpense:y.interest,
        profitBeforeTax:y.pbt, tax:y.tax, netProfit:y.pat,
        epsDiluted:y.epsDiluted, netFixedAssets:y.netBlock, totalDebt:y.debt,
        cashAndEquivalents:y.closingCash, receivables:y.receivables,
        inventory:y.inventory, payables:y.payables,
        cashFromOperations:y.cfo, capitalExpenditure:y.capex,
        cashFromInvesting:y.cfi, cashFromFinancing:y.cff,
        changeInWorkingCapital:y.changeInWorkingCapital };
    });
  }catch(err){ proj = []; }

  var rows = hist.concat(proj);
  if(!rows.length) return '';
  var periods = rows.map(function(r){ return S(r.period); });
  var num = periods.map(function(_,i){ return i+1; });

  function band(label){
    return { __cls:'tot', cells:[('<b>'+label+'</b>')].concat(periods.map(function(){ return ''; })) };
  }
  function line(label, key, bold){
    var any = rows.some(function(r){ return typeof r[key] === 'number'; });
    if(!any) return null;
    return { cells:[(bold ? '<b>'+label+'</b>' : label)].concat(rows.map(function(r){
      if(typeof r[key] !== 'number') return '—';
      var v = n(r[key], key === 'epsDiluted' || key === 'epsBasic' ? 2 : 0);
      return bold ? '<b>'+v+'</b>' : v;
    })) };
  }
  var L = function(defs){ return defs.map(function(d){ return line(d[0], d[1], d[2]); }).filter(Boolean); };

  var income = L([['Revenue','revenue',true],['Other income','otherIncome'],
    ['Cost of goods sold','costOfGoodsSold'],['Gross profit','grossProfit'],
    ['Employee cost','employeeCost'],['Other expenses','otherExpenses'],
    ['EBITDA','ebitda',true],['Depreciation','depreciation'],['EBIT','ebit',true],
    ['Interest expense','interestExpense'],['Exceptional items','exceptionalItems'],
    ['Profit before tax','profitBeforeTax'],['Tax','tax'],['Net profit','netProfit',true],
    ['EPS diluted','epsDiluted']]);
  var balance = L([['Total assets','totalAssets',true],['Net fixed assets','netFixedAssets'],
    ['Capital work in progress','capitalWorkInProgress'],
    ['Goodwill and intangibles','goodwillAndIntangibles'],['Investments','investments'],
    ['Inventory','inventory'],['Receivables','receivables'],
    ['Cash and equivalents','cashAndEquivalents'],
    ['Shareholders equity','shareholdersEquity',true],['Share capital','shareCapital'],
    ['Reserves and surplus','reservesAndSurplus'],['Total debt','totalDebt',true],
    ['Long-term debt','longTermDebt'],['Short-term debt','shortTermDebt'],
    ['Payables','payables'],['Total liabilities','totalLiabilities']]);
  var cash = L([['Cash from operations','cashFromOperations',true],
    ['Change in working capital','changeInWorkingCapital'],
    ['Capital expenditure','capitalExpenditure'],['Cash from investing','cashFromInvesting'],
    ['Dividends paid','dividendsPaid'],['Debt raised','debtRaised'],['Debt repaid','debtRepaid'],
    ['Buyback','buyback'],['Cash from financing','cashFromFinancing',true],
    ['Net change in cash','netChangeInCash'],['Closing cash','closingCash']]);

  var body = [];
  if(income.length){ body.push(band('Income statement')); body = body.concat(income); }
  if(balance.length){ body.push(band('Balance sheet')); body = body.concat(balance); }
  if(cash.length){ body.push(band('Cash flow')); body = body.concat(cash); }
  if(!body.length) return '';

  var nHist = hist.length, nProj = proj.length;
  var note = nHist + ' reported ' + (nHist === 1 ? 'year' : 'years')
    + (nProj ? ' and ' + nProj + ' forecast years, marked E' : '')
    + '. Reported figures are as filed, in the company\'s own units; forecast figures come from '
    + 'the same driver model the intrinsic value is built on. A line is blank where the company '
    + 'does not report it — a bank has no inventory — rather than being filled with a zero.'
    + (nHist < 3 ? ' <b>Only ' + nHist + ' reported ' + (nHist === 1 ? 'year was' : 'years were')
        + ' supplied; three are needed before the cash flow shows a trend.</b>' : '');

  return tbl([''].concat(periods), body, { num:num }) + '<p class="note">' + note + '</p>';
}

/* Risks placed on the two axes that decide what to do about one: how likely it
   is, and how much it would cost. A list of risks ranks nothing; the top right
   is where the attention belongs. */
function eqRiskMatrix(c){
  var K = CH_(); if(!K) return '';
  var rk = arr(c.risks).filter(function(r){
    return r && typeof r.probability === 'number' && typeof r.impactPct === 'number'; });
  if(rk.length < 2) return '';
  var pts = rk.map(function(r){
    return { x: r.probability * 100, y: r.impactPct, title: S(r.risk) };
  });
  return K.figure('Risks — likelihood against what it would cost',
    'Stated in the research, one point per risk',
    K.scatter({ points: pts, xRange:[0,100],
      yRange:[0, Math.max.apply(null, pts.map(function(p){ return p.y; })) * 1.25 || 10],
      cap: 96, xLabel:'Likelihood %', yLabel:'Impact on value %' }),
    { note:'Upper right is what the thesis turns on: likely and expensive. Lower left can be '
      + 'monitored rather than hedged.' });
}

/* The forecast against what companies have historically achieved. A plan is
   not evidence; the base rate is the outside view, and the gap between them is
   the question a reader should be asking. */
function eqBaseRate(c){
  var b = c.baseRates;
  if(!b || (!S(b.claim) && b.historicalShare == null)) return '';
  var share = typeof b.historicalShare === 'number' ? b.historicalShare * 100 : null;
  var flag = '';
  if(share != null){
    flag = share < 25
      ? '<b class="neg">Fewer than one company in four has managed this.</b> The forecast needs the '
        + 'reason this company is the exception, not merely the reason it is good.'
      : share < 50
        ? '<b>Roughly one company in three has managed this.</b> The claim is achievable but not the '
          + 'default outcome.'
        : '<b class="pos">Most companies attempting this have managed it.</b> The base rate supports '
          + 'the forecast rather than arguing with it.';
  }
  return tbl(['','Reading'], [
    { cells:['The claim', e(S(b.claim))] },
    { cells:['How often it has happened', share == null ? '—' : n(share,0) + '% of comparable cases'] },
    { cells:['Basis', '<span class="mut">' + e(S(b.source)) + '</span>'] }
  ]) + (flag ? '<p class="note">' + flag + '</p>' : '');
}

/* Accounting checks as a traffic light. The forensic score says how many
   passed; this says which ones, so a reader can see whether the failures are
   the ones that matter to them. */
function eqTrafficLights(c){
  var f = c.forensic;
  if(!f || !f.available) return '';
  var flags = arr(f.flags);
  var severe = arr(f.severeFlags);
  if(!flags.length && !severe.length) return '';
  var dot = function(kind){
    var col = kind === 'severe' ? 'var(--red)' : kind === 'flag' ? 'var(--gold)' : 'var(--green)';
    return '<span style="display:inline-block;width:2.4mm;height:2.4mm;border-radius:50%;'
      + 'background:' + col + ';margin-right:1.6mm;vertical-align:middle"></span>';
  };
  var seen = {};
  var rows = [];
  severe.forEach(function(x){
    var t = S(x.label || x.name || x.check || x);
    if(!t || seen[t]) return; seen[t] = 1;
    rows.push({ cells:[ dot('severe') + '<b>' + e(t) + '</b>',
      '<span class="neg">Severe</span>', '<span class="mut">' + e(S(x.detail || x.evidence)) + '</span>' ] });
  });
  flags.forEach(function(x){
    var t = S(x.label || x.name || x.check || x);
    if(!t || seen[t]) return; seen[t] = 1;
    rows.push({ cells:[ dot('flag') + e(t), 'Flagged',
      '<span class="mut">' + e(S(x.detail || x.evidence)) + '</span>' ] });
  });
  if(!rows.length) return '';
  return tbl(['Check','Reading','What was found'], rows)
    + '<p class="note">Red is a finding severe enough to bar the company from the Top 3 on its own. '
    + 'Amber is a finding to read before relying on the accounts. Every check not listed passed.</p>';
}

/* ROIC against the hurdle rate, year by year. The gap between the two lines is
   the whole question: above it, growth creates value; below it, growth is an
   expensive way to stand still. A table of the same numbers makes the reader
   do the subtraction. */
function eqRoicChart(c){
  var K = CH_(); if(!K) return '';
  var d = arr(c.dupont).filter(function(x){ return x && x.roic != null; });
  if(d.length < 2) return '';
  var wacc = null;
  try{
    var w = c.valuation && c.valuation.waccBuildup;
    if(w && w.wacc != null) wacc = w.wacc * 100;
    else if(c.valuation && c.valuation.discountRate != null) wacc = c.valuation.discountRate * 100;
  }catch(err){}
  var series = [{ name:'ROIC', values: d.map(function(x){ return x.roic; }) }];
  if(wacc != null){
    series.push({ name:'Cost of capital', values: d.map(function(){ return wacc; }), dashed:true });
  }
  return K.figure('Return on invested capital against its cost',
    'Company filings; cost of capital per the buildup',
    K.lines({ categories: d.map(function(x){ return S(x.period); }), series: series }),
    { note: wacc == null ? 'No cost of capital was stated, so only the return is shown.'
        : 'Where the solid line sits below the dashed one, the business is earning less on new '
          + 'capital than that capital costs.' });
}

/* How the revenue mix has shifted. In a conglomerate the mix IS the thesis,
   and a shift is invisible in any single-year chart. */
function eqSectorMixChart(c){
  var K = CH_(); if(!K) return '';
  var d = arr(c.historicalSectors);
  if(d.length < 2) return '';
  var names = [];
  d.forEach(function(p0){ arr(p0.lines).forEach(function(l){
    if(names.indexOf(S(l.name)) < 0) names.push(S(l.name)); }); });
  if(names.length < 2) return '';
  var series = names.map(function(nm){
    return { name: nm, values: d.map(function(p0){
      var hit = arr(p0.lines).filter(function(l){ return S(l.name)===nm; })[0];
      return hit && hit.revenue != null ? hit.revenue : 0; }) };
  });
  return K.figure('Revenue by operating line',
    'Company filings',
    K.columns({ categories: d.map(function(p0){ return S(p0.period); }),
      series: series, stacked: true }),
    { note:'Each band is one operating line. What matters is how the proportions move, '
      + 'not the total height.' });
}

/* Peers on the two axes a rating is argued on: what you pay, against what the
   business earns. The subject company is marked, because the comparison is the
   point and a chart that omits it makes the reader estimate. */
function eqPeerScatter(c){
  var K = CH_(); if(!K) return '';
  var pr = arr(c.peers).filter(function(x){ return x && x.pe != null && x.roe != null; });
  if(pr.length < 2) return '';
  var pts = pr.map(function(x){
    return { x: x.roe, y: x.pe, label:'', title: S(x.name) };
  });
  var xs = pts.map(function(p){ return p.x; }), ys = pts.map(function(p){ return p.y; });
  var pad = function(a){ var lo=Math.min.apply(null,a), hi=Math.max.apply(null,a);
    var g=(hi-lo)||1; return [Math.max(0, lo-g*0.2), hi+g*0.2]; };
  return K.figure('Peers — what you pay against what the business earns',
    'Company filings and exchange data',
    K.scatter({ points: pts, xRange: pad(xs), yRange: pad(ys),
      /* Half the usual height: two axes and a handful of points do not need a
         page to say what they say. */
      cap: 96,
      xLabel:'Return on equity %', yLabel:'P/E' }),
    { note:'Upper left is expensive for the return earned; lower right is the opposite.' });
}

/* Return on capital, taken apart. Three numbers that multiply to ROE, and the
   spread over the hurdle rate, which is the one figure that says whether
   growth creates value or consumes it. */
function eqDupont(c){
  var d = arr(c.dupont);
  if(!d.length) return '';
  var rows = d.map(function(x){
    var sp = x.waccSpreadPct;
    /* A spread of exactly zero is how a model fills a field it cannot answer —
       ROIC is not a meaningful measure for a bank, whose "invested capital" is
       its deposits. Printing 0.0 and then asserting that growth adds value is
       a false statement about the business, which is worse than a gap. */
    var known = sp != null && Number(sp) !== 0;
    var spCell = !known ? '—'
      : '<span class="' + (sp >= 0 ? 'pos' : 'neg') + '">' + n(sp,1) + '</span>';
    return { cells:[ e(S(x.period)), ratioCell(x.netProfitMargin), ratioCell(x.assetTurnover),
      ratioCell(x.financialLeverage), ratioCell(x.roe), ratioCell(x.roic), spCell ]};
  });
  var last = d[d.length-1];
  var note = '';
  var lastSp = last && last.waccSpreadPct;
  if(lastSp != null && Number(lastSp) !== 0){
    note = lastSp >= 0
      ? '<p class="note">Return on invested capital sits ' + n(lastSp,1)
        + ' points above the cost of that capital, so growth adds value.</p>'
      : '<p class="note">Return on invested capital sits ' + n(Math.abs(lastSp),1)
        + ' points below the cost of that capital. Until that reverses, growth consumes value '
        + 'rather than creating it.</p>';
  } else if(last && (last.roic == null || Number(last.roic) === 0)){
    note = '<p class="note">Return on invested capital was not stated. For a lender it is not a '
      + 'meaningful measure — the capital a bank deploys is its depositors\' — so return on '
      + 'equity and return on assets carry the argument instead.</p>';
  }
  return tbl(['Period','Net margin %','Asset turnover','Leverage','ROE %','ROIC %','ROIC − WACC'],
    rows, { num:[1,2,3,4,5,6] }) + note;
}

/* Capital work in progress against gross block. A rising share means money is
   buried in assets that earn nothing yet; the turn is where free cash flow
   inflects. */
function eqCapitalCycle(c){
  var d = arr(c.capitalCycle);
  if(!d.length) return '';
  /* Capital work in progress is a manufacturer's measure. A bank returns zeros
     for it, and a table of zeros under a heading reads as a rendering fault
     rather than as a measure that does not apply. */
  var informative = d.some(function(x){
    return (x.cwip != null && Number(x.cwip) !== 0)
        || (x.cwipPctOfGrossBlock != null && Number(x.cwipPctOfGrossBlock) !== 0); });
  if(!informative) return '';
  return tbl(['Period','CWIP','Gross block','CWIP % of gross block','Reading'], d.map(function(x){
    return { cells:[ e(S(x.period)), eqNum(x.cwip), eqNum(x.grossBlock),
      eqNum(x.cwipPctOfGrossBlock), '<span class="mut">'+e(S(x.note))+'</span>' ]};
  }), { num:[1,2,3] });
}

/* How the discount rate was arrived at. A WACC stated without its buildup is a
   number the reader has to take on trust, and it is the single assumption the
   whole valuation is most sensitive to. */
function eqWacc(c){
  var w = c.valuation && c.valuation.waccBuildup;
  if(!w) return '';
  var pct = function(v){ return v==null ? '—' : n(v*100,2); };
  return tbl(['','%'], [
    { cells:['Risk-free rate', pct(w.riskFreeRate)] },
    { cells:['Equity risk premium', pct(w.equityRiskPremium)] },
    { cells:['Levered beta', w.leveredBeta==null?'—':n(w.leveredBeta,2)] },
    { cells:['<b>Cost of equity</b>', '<b>'+pct(w.costOfEquity)+'</b>'] },
    { cells:['Pre-tax cost of debt', pct(w.pretaxCostOfDebt)] },
    { cells:['Tax rate', pct(w.taxRate)] },
    { cells:['<b>After-tax cost of debt</b>', '<b>'+pct(w.afterTaxCostOfDebt)+'</b>'] },
    { cells:['Weight — equity', pct(w.equityWeight)] },
    { cells:['Weight — debt', pct(w.debtWeight)] },
    { __cls:'tot', cells:['<b>WACC</b>', '<b>'+pct(w.wacc)+'</b>'] }
  ], { num:[1] })
  + (S(w.source) ? '<p class="note">Source: '+e(S(w.source))+'</p>' : '');
}

/* Sum of the parts. A conglomerate valued on one multiple is valued wrongly:
   the point of this table is that each business is worth what its own kind of
   business is worth. */
function eqSotp(c){
  var d = arr(c.valuation && c.valuation.sotp);
  if(!d.length) return '';
  var totalEv = 0, totalPs = 0, anyEv = false, anyPs = false;
  d.forEach(function(x){
    if(x.enterpriseValue != null){ totalEv += Number(x.enterpriseValue)||0; anyEv = true; }
    if(x.perShare != null){ totalPs += Number(x.perShare)||0; anyPs = true; }
  });
  var rows = d.map(function(x){
    return { cells:[ '<b>'+e(S(x.name))+'</b>', e(S(x.metric)), eqNum(x.metricValue),
      x.multiple==null?'—':n(x.multiple,1)+'x', eqNum(x.enterpriseValue),
      x.stakePct==null?'—':n(x.stakePct,0)+'%', eqNum(x.perShare) ]};
  });
  if(anyEv || anyPs){
    rows.push({ __cls:'tot', cells:['<b>Total</b>','','','',
      anyEv?'<b>'+n(totalEv,0)+'</b>':'—','', anyPs?'<b>'+n(totalPs,0)+'</b>':'—'] });
  }
  return tbl(['Business','Metric','Value','Multiple','Enterprise value','Stake','Per share'],
    rows, { num:[2,3,4,6] });
}

/* What the current price already assumes. Read backwards out of the market
   capitalisation: if the market is paying for this much growth, the question
   is no longer whether the company grows, but whether it grows by more. */
function eqImplied(c){
  var x = c.valuation && c.valuation.impliedExpectations;
  if(!x) return '';
  var pct = function(v){ return v==null ? '—' : n(v*100,1); };
  return tbl(['','Baked into the price'], [
    { cells:['Revenue growth, compounded', pct(x.impliedRevenueCagr)+'%'] },
    { cells:['Operating margin', pct(x.impliedEbitMargin)+'%'] },
    { cells:['Over', x.impliedYears==null?'—':n(x.impliedYears,0)+' years'] }
  ])
  + (S(x.reading) ? '<p class="note">'+e(S(x.reading))+'</p>' : '');
}

/* Where the revenue actually comes from, year by year. A shifting mix is the
   thesis in most conglomerates, and a single-year pie cannot show a shift. */
function eqHistoricalSectors(c){
  var d = arr(c.historicalSectors);
  if(!d.length) return '';
  var names = [];
  d.forEach(function(p0){ arr(p0.lines).forEach(function(l){
    if(names.indexOf(S(l.name)) < 0) names.push(S(l.name)); }); });
  if(!names.length) return '';
  var rows = names.map(function(nm){
    var cells = ['<b>'+e(nm)+'</b>'];
    d.forEach(function(p0){
      var hit = arr(p0.lines).filter(function(l){ return S(l.name)===nm; })[0];
      cells.push(hit ? eqNum(hit.revenue) : '—');
    });
    return { cells:cells };
  });
  return tbl(['Operating line'].concat(d.map(function(p0){ return S(p0.period); })),
    rows, { num: d.map(function(_,i){ return i+1; }) });
}

/* Pay, and what it is tied to. A variable component tied to ROIC or total
   shareholder return aligns management with the reader; one tied to revenue
   rewards growth whatever it costs. */
function eqCompensation(c){
  var k = c.compensation;
  if(!k) return '';
  return tbl(['','Reading'], [
    { cells:['Period', e(S(k.period))] },
    { cells:['Fixed', k.fixedPct==null?'—':n(k.fixedPct,0)+'%'] },
    { cells:['Variable', k.variablePct==null?'—':n(k.variablePct,0)+'%'] },
    { cells:['Variable pay tied to', e(S(k.tiedTo))] },
    { cells:['CEO pay to median employee', k.ceoPayToMedian?n(k.ceoPayToMedian,0)+'x':'—'] }
  ])
  + (S(k.source) ? '<p class="note">Source: '+e(S(k.source))+'</p>' : '');
}

function eqEsg(c, lang){
  var g=c.esg;
  if(!g) return '';
  return tbl(['','Reading'], [
    { cells:['Environment', e(S(g.environment))] },
    { cells:['Social', e(S(g.social))] },
    { cells:['Governance', e(S(g.governance))] },
    { cells:['Against peers', e(S(g.versusPeers))] },
    /* "not scored" on its own invites the question this line now answers. */
    { cells:['Score', g.score==null
        ? '<span class="mut">not scored' + (S(g.scoreBasis) ? ' — ' + e(S(g.scoreBasis)) : '') + '</span>'
        : n(g.score,0)] }
  ]);
}


/* Which companies get a full write-up. The kill switch decides whether a
   company may be *recommended*, not whether it may be *discussed*. When every
   candidate is barred — which is the normal outcome of an honest first run,
   because the register work is the last thing done — the leading companies are
   still covered in full, each carrying the reason it cannot be recommended.
   The alternative is a report that ranks twelve banks and then analyses none. */
function eqCovered(rep){
  var t = arr(rep.top3);
  if(t.length) return { list: t, allBarred: false };
  var scored = arr(rep.full).filter(function(c){
    return c.overall && c.overall.score != null && c.overall.sufficient !== false;
  });
  if(!scored.length) scored = arr(rep.full).filter(function(c){
    return c.overall && c.overall.score != null;
  });
  return { list: scored.slice(0, 3), allBarred: true };
}
function eqBarredBanner(cov){
  if(!cov.allBarred || !cov.list.length) return '';
  return '<div class="note"><b>No company cleared the kill switch, so there is no Top 3.</b> '
    + 'The ' + cov.list.length + ' highest-ranked companies are covered in full below because '
    + 'the research exists and is worth reading, but none of them may be recommended on this '
    + 'run. The reason is stated against each.</div>';
}

function buildExec(p, lang){
  lang = lang || 'en';
  var rep = eqRep(p), run = rep.run || {}, out = '';
  var leadIn = eqCover(p, lang, 'Executive Summary', 21);

  if(window.EQCharts) window.EQCharts.resetFigures();
  var focusE = focusPage(p, null);
  if(focusE) out += sec('00', 'Focus charts') + focusE;

  out += sec('01', 'The run')
    + '<div class="lead"><p>' + e(eqTitle(p)) + ' over a horizon of ' + e(S(run.horizon))
      + '. ' + (rep.counts ? rep.counts.universe : 0) + ' companies analysed, '
      + (rep.counts ? rep.counts.top3Eligible : 0) + ' cleared the kill switch.</p></div>'
    + (S(run.researchNotes) ? '<div class="note">' + e(S(run.researchNotes)) + '</div>' : '')
    + eqFunnel(p, lang);

  /* The macro and policy frame, compressed. The sector report carries it in
     full; this document exists to be read in one sitting. */
  out += sec('02', 'The backdrop') + eqMacro(p, lang);
  var polE = arr(rep.policy);
  if(polE.length){
    out += tbl(['Scheme','Ministry','How it reaches the sector'], polE.map(function(x){
      return { cells:[ '<b>'+e(S(x.name))+'</b>', e(S(x.ministry)),
        '<span class="mut">'+e(S(x.reachesSector))+'</span>' ]}; }));
  }
  if(arr(rep.programs).length){
    out += tbl(['Programme','Scale','Listed beneficiaries'], arr(rep.programs).map(function(x){
      return { cells:[ '<b>'+e(S(x.name))+'</b>',
        x.scale==null?'&mdash;':n(x.scale,0)+' '+e(S(x.unit)),
        e(arr(x.beneficiaries).map(function(b){ return S(b.symbol)||S(b.name); }).join(', ')) ]};
    }), { num:[1] });
  }

  out += sec('03', 'Research lenses') + eqLenses(p, lang);

  out += sec('04', 'Ranking') + figTop3(rep) + eqRankTable(p, rep.top10, lang);

  /* The leading companies at summary depth. If none cleared the kill switch the
     highest-ranked are still summarised, each carrying its bar. */
  var covE = eqCovered(rep);
  if(covE.allBarred) out += eqBarredBanner(covE);
  covE.list.forEach(function(c, i){
    var no = String(5 + i);
    out += sec(no, (S(c.name) || S(c.symbol)) + ' — '
      + (c.overall && c.overall.score != null ? c.overall.score.toFixed(1) : '—') + '/100');
    if(arr(c.theses).length){
      out += '<div class="lead">' + arr(c.theses).map(function(t,j){
        return '<p style="margin-bottom:1.6mm"><b>' + (j+1) + '.</b> ' + e(S(t.claim)) + '</p>'; }).join('')
        + '</div>';
    } else if(arr(c.thesis).length){
      out += '<div class="lead">'
        + arr(c.thesis).map(function(t){ return '<p style="margin-bottom:1.6mm">' + e(S(t)) + '</p>'; }).join('')
        + '</div>';
    } else if(S(c.business)) out += '<div class="lead"><p>' + e(S(c.business)) + '</p></div>';
    if(arr(c.mispricing).length){
      out += tbl(['What the bear says','Our answer'], arr(c.mispricing).map(function(m){
        return { cells:[ e(S(m.concern)), e(S(m.answer)) ]}; }));
    }
    out += figFootball(c) + eqScenarios(c, lang);
    out += eqVariant(c, lang);
    if(arr(c.risks).length) out += '<div style="height:2mm"></div>'
      + tbl(['Risk','Severity','Impact'], arr(c.risks).map(function(r){
          return { cells:[e(S(r.risk)),
            '<span class="' + (r.severity==='severe'?'neg':'') + '">' + e(S(r.severity)) + '</span>',
            r.impactPct == null ? '<span class="mut">not quantified</span>' : eqSignedPct(r.impactPct)] };
        }), { num:[2] });
    if(arr(c.thesisBreakers).length)
      out += '<div class="mut" style="margin-top:2mm"><b>Thesis breakers.</b></div>' + eqList(c.thesisBreakers);
  });

  var excl = arr(rep.excludedFromTop3);
  if(excl.length){
    out += sec(String(5 + covE.list.length), 'Barred from the Top 3')
      + tbl(['Company','Score','Why'], excl.map(function(c){
          return { cells:['<span class="en">' + e(S(c.name) || S(c.symbol)) + '</span>',
            eqNum(c.overall && c.overall.score),
            e(arr(c.exclusionReasons).join(' '))] };
        }), { num:[1] })
      + '<div class="mut" style="margin-top:1.5mm">A high score does not override a severe finding, '
      + 'and neither does it override work that was never done.</div>';
  }

  var warn = arr(p && p.warnings);
  if(warn.length){
    out += sec(String(6 + covE.list.length), 'Gaps in this research')
      + eqList(warn)
      + '<div class="mut">These are printed rather than hidden. A gap you can see is a gap you can close.</div>';
  }

  var built = blocksFromBody(out);
  return packDoc(p, lang, {
    B: built.B, TITLES: built.TITLES, leadIn: leadIn,
    runHead: 'Executive Summary', docName: 'Executive Summary',
    shellTitle: eqTitle(p) + ' — Executive Summary',
    seedPages: 16
  });
}

/* SWOT: use the payload's own block if present, otherwise derive it. */

/* Some arrays carry prose that must be translated but has no natural label to
   look up — price levels are the clearest case. The Gujarati block may supply a
   parallel array; overlay it positionally and fall back per field. */
function levelsOf(p, lang, d){
  var base = arr(d.levels);
  return base;
  var g = (p.gu && p.gu.decision && Array.isArray(p.gu.decision.levels)) ? p.gu.decision.levels : [];
  return base.map(function(x, i){
    var o = g[i] || {};
    return { action: o.action || x.action, price: x.price, rationale: o.rationale || x.rationale };
  });
}
/* Full four-quadrant SWOT for the two long reports. Strengths and weaknesses
   keep their rich title/evidence pairs; opportunities and threats use
   decision.swot when the model supplied it and otherwise fall back to
   catalysts and failure modes, which carry the same meaning. */
function swotRich(p, lang, cap){
  cap = cap || 4;
  var d = p.decision||{}, sw = d.swot||{};
  var gsw = ((p.gu||{}).decision||{}).swot||{};
  function pair(enList, keyA, keyB, path){
    var g = arr(pick(p, lang, path, arr(enList)));
    return arr(enList).slice(0, cap).map(function(en, i){
      var x = g[i] || {};
      return { t: safeTr(S(en[keyA]), S(x[keyA])||S(tr(p,lang,en[keyA]))),
               e: safeTr(S(en[keyB]), S(x[keyB])||S(tr(p,lang,en[keyB]))) };
    });
  }
  function plain(en, gu){
    var src = arr(en);
    if(!src.length) return null;
    var g = [];
    return src.slice(0, cap).map(function(s, i){
      var t = S(s);
      return { t: t, e: '' };
    });
  }
  return {
    s: pair(arr(d.strengths),  'title', 'evidence', 'decision.strengths'),
    w: pair(arr(d.weaknesses), 'title', 'evidence', 'decision.weaknesses'),
    o: plain(sw.opportunities, gsw.opportunities)
       || pair(arr(d.catalysts), 'catalyst', 'mechanism', 'decision.catalysts'),
    t: plain(sw.threats, gsw.threats)
       || pair(arr(d.failure_modes), 'scenario', 'warning_sign', 'decision.failure_modes')
  };
}
function swotGrid(p, lang, cap){
  var q = swotRich(p, lang, cap);
  function panel(title, items, col){
    return '<div><div class="eyebrow" style="color:'+col+'">'+e(title)+'</div>'
      + '<ul class="blist" style="margin-top:1mm">'
      + arr(items).map(function(x){
          return '<li>'+(x.t?'<b>'+e(x.t)+'</b>':'')+(x.t&&x.e?' — ':'')+(x.e?e(x.e):'')+'</li>';
        }).join('')
      + '</ul></div>';
  }
  return '<div class="grid2 swotg">'
    + panel(L(lang,'strengths'),     q.s, 'var(--s5-5)')
    + panel(L(lang,'weaknesses'),    q.w, 'var(--s5-1)')
    + panel(L(lang,'opportunities'), q.o, 'var(--s5-4)')
    + panel(L(lang,'threats'),       q.t, 'var(--s5-2)')
    + '</div>';
}
function swotOf(p, lang){
  var d = p.decision||{}, sw = d.swot||{};
  var gsw = (p.gu||{}).decision ? ((p.gu.decision||{}).swot||{}) : {};
  function take(list, keyA, keyB){
    return arr(list).slice(0,3).map(function(x){ return S(x[keyA]) || S(x[keyB]) || S(x); });
  }
  var g = {};
  return {
    s: arr(g.strengths).length ? arr(g.strengths).slice(0,3)
       : (arr(sw.strengths).length ? arr(sw.strengths).slice(0,3)
          : take(pick(p,lang,'decision.strengths', arr(d.strengths)),'title','flag')),
    w: arr(g.weaknesses).length ? arr(g.weaknesses).slice(0,3)
       : (arr(sw.weaknesses).length ? arr(sw.weaknesses).slice(0,3)
          : take(pick(p,lang,'decision.weaknesses', arr(d.weaknesses)),'title','flag')),
    o: arr(g.opportunities).length ? arr(g.opportunities).slice(0,3)
       : (arr(sw.opportunities).length ? arr(sw.opportunities).slice(0,3)
          : take(arr(d.catalysts),'catalyst','mechanism')),
    t: arr(g.threats).length ? arr(g.threats).slice(0,3)
       : (arr(sw.threats).length ? arr(sw.threats).slice(0,3)
          : take(arr(d.failure_modes),'scenario','warning_sign'))
  };
}

/* ========================= VISUAL SUMMARY =========================
   Type is deliberately large: messaging apps downscale images hard, so
   a 15px caption becomes unreadable after WhatsApp recompresses it. */
var VCSS = `
/* The glance block borrows the report's snapshot parts, and those are sized in
   millimetres for A4 at 8.5pt. This page is 1240px wide at 19px, roughly twice
   the scale, so every borrowed piece is restated here in px. Without this the
   dates and the lot table come out as a footnote beside tiles twice their
   size. */
/* The banner is navy; dark ink at 72% on it was all but invisible in print.
   The line is white, held back from the heading beside it by weight rather
   than by opacity. */
/* ---- the Investment Summary's type scale ----
   The other three documents inherit one scale from the shared stylesheet. This
   page is drawn at roughly twice their scale, so every role was restated here
   by hand — and the sizes drifted: a box label was 14px in the tiles, 13px in
   the date rail and 13px in the lot table, and a section heading was 17px in
   English and 19px in Gujarati. Four sizes, one job. They are named once here
   and referenced everywhere, so the same kind of thing is the same size across
   the whole document, and the Gujarati edition differs by one deliberate step
   rather than by an accident per rule. */
.vpage{ --vt-sec:17px;   /* section heading, and the verdict banner's own */
        --vt-key:14px;   /* the small caps label above or beside a figure */
        --vt-val:17px;   /* body text and every figure in a table          */
        --vt-sub:15px;   /* the muted line under a figure                  */
        --vt-lead:19px; /* the two lead paragraphs, and nothing else      */
        --vt-big:24px; } /* the four headline tiles                        */
body.gu .vpage{ --vt-key:15px; }

.vherofv{ float:right; font-size:var(--vt-sub); font-weight:700; letter-spacing:.02em;
          text-transform:none; color:#FFFFFF; opacity:.92; }
.vcat{ margin-top:14px; border:1px solid #E1E8F2; border-radius:8px;
       padding:12px 16px 10px; background:#FAFCFF; }
.vcat .k{ font-size:var(--vt-key); font-weight:800; letter-spacing:.1em; text-transform:uppercase;
          color:#6B7480; }
body.gu .vcat .k{ letter-spacing:.02em; }
/* One catalyst per line: what happens, how it works, how much it matters. The
   grid keeps the three columns aligned down the block rather than letting a
   long mechanism push the pill out of line. */
.vcat .rows{ margin-top:8px; }
.vcat .r{ display:grid; grid-template-columns:230px 1fr 92px; gap:12px;
          align-items:baseline; padding:5px 0; border-top:1px solid #EDF1F7; }
.vcat .rows .r:first-child{ border-top:0; padding-top:2px; }
.vcat .r b{ font-size:var(--vt-val); color:#12161C; }
.vcat .r span{ font-size:var(--vt-val); color:#4A5462; line-height:1.45; }
/* The severity pill is the reports' own pill, restated at this page's scale —
   the shared rule is pt-sized for A4 and comes out as a speck here. */
.vcat .r i{ font-style:normal; font-size:12px; padding:4px 9px; justify-self:end; }
body.gu .vcat .r{ grid-template-columns:218px 1fr 104px; }
.vcat .dates{ display:flex; align-items:center; flex-wrap:wrap; gap:18px;
              margin-top:9px; padding-top:8px; border-top:1px solid #E1E8F2; }
.vcat .c{ display:flex; align-items:baseline; gap:7px; }
.vcat .c i{ font-style:normal; font-size:var(--vt-key); color:#6B7480; }
.vcat .c b{ font-size:var(--vt-val); color:#12161C; }
.vglance{ display:grid; grid-template-columns:1fr 1fr; gap:26px; margin-top:11px;
          align-items:stretch; }
.vglance .ssub{ font-size:var(--vt-key); letter-spacing:.1em; margin:0 0 8px; }
body.gu .vglance .ssub{ font-size:var(--vt-key); letter-spacing:.02em; }
.vglance .drail{ margin:6px 0 12px; }
.vglance .drail .stp .dot{ width:12px; height:12px; margin:0 auto 7px; }
.vglance .drail .stp:before,.vglance .drail .stp:after{ top:5px; height:2px; }
.vglance .drail .stp .lb{ font-size:var(--vt-key); letter-spacing:.06em; }
.vglance .drail .stp .dt{ font-size:17px; margin-top:3px; }
.vglance .drail .stp .dt small{ font-size:12px; }
.vglance .mini{ font-size:var(--vt-val); }
.vglance .mini th{ font-size:var(--vt-key); letter-spacing:.08em; padding:7px 9px; }
.vglance .mini td{ padding:7px 9px; }
.vglance .lotb{ font-size:var(--vt-key); padding:2px 8px; border-radius:9px; margin-right:7px; }
/* The report stylesheet sizes these in points for A4, and its Gujarati
   overrides — body.gu .ssub, body.gu .mini th, body.gu .drail .stp .lb — carry
   an element selector, so they outrank the .vglance rules above and were
   rendering this block at 8.3px on a page whose English twin reads at 13px.
   Restated here at the same specificity, one notch larger, because Gujarati
   needs the extra room at any given size. */
body.gu .vglance .ssub{ font-size:15px; letter-spacing:.02em; }
body.gu .vglance .drail .stp .lb{ font-size:var(--vt-key); letter-spacing:.02em; }
body.gu .vglance .drail .stp .dt{ font-size:17px; }
body.gu .vglance .drail .stp .dt small{ font-size:12px; }
body.gu .vglance .mini{ font-size:var(--vt-val); }
body.gu .vglance .mini th{ font-size:var(--vt-key); letter-spacing:.02em; }
body.gu .vglance .lotb{ font-size:13px; }

.vpage{ width:1240px; height:1754px; background:#fff; padding:50px 54px 56px; position:relative;
        display:flex; flex-direction:column; page-break-after:always; font-size:19px; line-height:1.5; }
/* The page is a flex column of fixed height, and the fit routine wraps its
   contents in another one — so a full page squeezed its own children rather
   than running long, and the verdict banner, which clips its overflow to keep
   its rounded corner, silently ate the last line of the one-liner. Worse, the
   squeeze happened before the fit routine measured, so the scale that exists
   precisely for an over-full page never ran. Nothing here shrinks: the page
   runs long, the fit routine sees it, and the content is scaled as designed. */
.vpage > *, .vfit > *{ flex:0 0 auto; }
.vpage:last-child{ page-break-after:auto; }
.vpage > *{ flex:0 0 auto; }
.vpage .vfoot{ flex:0 0 auto; }
.vpage .vfootw{ flex:0 0 auto; }
body.gu .vpage{ font-size:19px; line-height:1.72; }
/* Business overview and the two side-by-side score cards. */
.vlead{ font-size:var(--vt-lead); line-height:1.5; color:var(--ink); margin-top:10px; }
.vnote{ font-size:var(--vt-val); line-height:1.5; color:var(--ink2); margin-top:8px;
        border-left:4px solid var(--teal); background:#EEF5F3; padding:10px 14px; border-radius:0 6px 6px 0; }
.vscores{ display:grid; grid-template-columns:1fr 1fr; gap:26px; margin-top:12px; align-items:start; }
.vsc{ min-width:0; }
.vsch{ display:flex; justify-content:space-between; align-items:baseline; gap:10px;
       font-size:15px; font-weight:800; letter-spacing:.05em; text-transform:uppercase;
       color:var(--ink3); border-bottom:3px solid var(--navy); padding-bottom:7px; margin-bottom:10px; }
.vsch b{ font-size:19px; color:var(--navy); letter-spacing:0; text-transform:none; white-space:nowrap; }
/* The two cards share one geometry so their rows line up across the gutter:
   a fixed label column, a fixed bar column, a fixed figure column. Without it
   the bars start at a different x in each card and the pair reads as two
   unrelated tables sitting next to each other. */
.vbar.sm{ margin:7px 0; gap:10px; min-height:26px; }
/* "Management & Governance" needed 213px in 172 and was cut by the ellipsis —
   a truncated label is missing information, not a tidy one. The column is wider
   and the type a notch smaller, which fits the longest block name in both
   languages with room to spare. */
.vbar.sm .l{ flex:0 0 202px; font-size:15px; line-height:1.25;
             overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
body.gu .vbar.sm .l{ font-size:14px; }
.vbar.sm .t{ flex:1 1 auto; height:15px; }
.vbar.sm .v{ flex:0 0 76px; font-size:18px; min-width:0; text-align:right; }
.vbar.sm .v .of{ color:var(--ink4); font-size:14px; }
body.gu .vbar.sm .l{ font-size:16px; }
.vmast{ display:flex; justify-content:space-between; align-items:flex-end;
        border-bottom:5px solid var(--navy); padding-bottom:14px; }
.vmast h1{ font-size:40px; letter-spacing:-.02em; color:var(--navy); line-height:1.08; }
.vmast .s{ font-size:var(--vt-val); color:var(--ink3); margin-top:6px; }
.vmast .r{ text-align:right; font-size:16px; color:var(--ink3); line-height:1.6; }
.vsec{ font-size:var(--vt-sec); font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--navy);
       margin:22px 0 11px; display:flex; align-items:center; gap:12px; }
body.gu .vsec{ letter-spacing:.04em; }
.vsec::after{ content:""; flex:1; height:2px; background:var(--rule); }
.vhero{ border:3px solid var(--navy); border-radius:14px; overflow:hidden; margin-top:16px; }
.vhero .h{ background:var(--navy); color:#fff; padding:11px 20px; font-size:var(--vt-sec); font-weight:800;
           letter-spacing:.12em; text-transform:uppercase; }
body.gu .vhero .h{ letter-spacing:.04em; }
.vhero .c{ padding:14px 20px 15px; }
.vhero .v{ font-size:37px; font-weight:800; letter-spacing:-.02em; color:var(--navy); line-height:1.2; }
.vhero p{ font-size:var(--vt-lead); color:var(--ink2); margin-top:8px; line-height:1.45; }
.vtiles{ display:grid; grid-template-columns:repeat(4,1fr); gap:13px; margin-top:18px; }
.vtile{ border:2px solid var(--rule); border-top:7px solid var(--navy); border-radius:10px; padding:14px 16px;
        background:var(--panel2); }
.vtile .k{ font-size:15px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink3); }
body.gu .vtile .k{ letter-spacing:.02em; font-size:16px; }
.vtile .v{ font-size:44px; font-weight:800; letter-spacing:-.03em; line-height:1.05; margin-top:5px; }
.vtile .v small{ font-size:19px; color:var(--ink4); }
.vtile .s{ font-size:16px; color:var(--ink2); margin-top:3px; }
.vinfo{ display:grid; grid-template-columns:repeat(4,1fr); gap:13px; margin-top:11px; }
.vinfo .c{ border:2px solid var(--rule); border-radius:10px; padding:12px 15px; }
.vinfo .k{ font-size:14px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:var(--ink3); }
body.gu .vinfo .k{ letter-spacing:.02em; font-size:15px; }
.vinfo .v{ font-size:24px; font-weight:800; letter-spacing:-.02em; margin-top:4px; line-height:1.2; }
.vinfo .s{ font-size:15px; color:var(--ink3); margin-top:2px; }
.vobj{ border:2px solid var(--rule); border-left:8px solid var(--teal); border-radius:0 10px 10px 0;
       padding:13px 17px; margin-top:13px; background:var(--teal2); }
.vobj .k{ font-size:var(--vt-key); font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:var(--ink3); }
.vobj .b{ font-size:var(--vt-val); margin-top:5px; line-height:1.5; color:var(--ink); }
.vbar{ display:flex; align-items:center; gap:14px; margin:9px 0; font-size:19px; }
.vbar .l{ flex:0 0 250px; color:var(--ink2); }
.vbar .t{ flex:1; height:22px; background:var(--rule2); border-radius:6px; overflow:hidden; }
.vbar .f{ height:100%; border-radius:0 6px 6px 0; }
.vbar .v{ flex:0 0 104px; text-align:right; font-weight:800; font-variant-numeric:tabular-nums; }
.vtab{ width:100%; border-collapse:collapse; font-size:var(--vt-val); }
.vtab th{ font-size:var(--vt-key); text-transform:uppercase; letter-spacing:.07em; color:var(--ink3);
          border-bottom:3px solid var(--navy); padding:9px 10px; text-align:left; font-weight:800; }
/* The shared print stylesheet carries body.gu th rules sized in points for A4.
   They have the same specificity as .vtab th and come later in the sheet, so
   they win — the peer headings came out at 9px until this rule put them back
   on the scale. */
body.gu .vtab th{ letter-spacing:.02em; font-size:var(--vt-key); }
.vtab td{ border-bottom:1.5px solid var(--rule2); padding:10px; vertical-align:top; }
.vtab td.n, .vtab th.n{ text-align:right; font-variant-numeric:tabular-nums;
                        font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
.vtab tr.hi td{ background:var(--teal2); font-weight:700; }
.vpill{ display:inline-block; font-size:14px; font-weight:800; padding:3px 12px; border-radius:13px;
        color:#fff; letter-spacing:.04em; }
.vswot{ display:grid; grid-template-columns:1fr 1fr; gap:15px; }
.vswot .q{ border:2px solid var(--rule); border-radius:12px; overflow:hidden; }
.vswot .q h4{ font-size:16px; font-weight:800; letter-spacing:.1em; text-transform:uppercase;
              padding:9px 15px; color:#fff; }
body.gu .vswot .q h4{ letter-spacing:.03em; font-size:17px; }
.vswot .q ul{ margin:0; padding:11px 15px 13px 32px; }
.vswot .q li{ font-size:18px; line-height:1.45; margin:6px 0; }
body.gu .vswot .q li{ line-height:1.65; }
.vfootw{ margin-top:auto; border-top:2px solid var(--rule); padding-top:12px; }
.vfootn{ font-size:13px; line-height:1.4; color:var(--ink4); text-align:justify;
         margin-bottom:8px; }
body.gu .vfootn{ font-size:13px; line-height:1.55; }
.vfoot{ border-top:0; padding-top:0; font-size:14px;
        color:var(--ink4); display:flex; justify-content:space-between; gap:20px; }
`;



/* ========================= SCORE CARD ========================= */
function scBlock(p, b, lang){
  var sl = p.score_lines||{}, sb = p.score_basis||{};
  var gsb = {};
  var got = blockScore(p,b), items = bItems(b,lang);
  /* A bar before the mark, on the five-step scale, so the shape of the score is
     readable before the number is. Column widths are fixed in CSS rather than
     sized to content, because every block was otherwise auto-sizing its own and
     the SCORE column landed in a different place in each one. */
  return sec('', bName(b,lang)+' — '+got.toFixed(1)+' / '+b[2])
    + tbl([L(lang,'line_item'),'',L(lang,'score'),L(lang,'max'),L(lang,'basis')], b[3].map(function(k,i){
        var val = Number(sl[k])||0, mx = b[6][i], pcv = mx ? val/mx*100 : 0;
        return { cells:[e(items[i]),
                        '<span class="scbar"><i style="width:'+pcv.toFixed(0)+'%;background:'
                          + ragBarHex(pcv)+'"></i></span>',
                        '<b class="en">'+val.toFixed(1)+'</b>',
                        '<span class="en">'+mx+'</span>',
                        '<span class="mut">'+e(gsb[k] ? safeTr(S(sb[k]), S(gsb[k])) : (tr(p,lang,sb[k]) || ''))+'</span>'] }; }),
        { num:[2,3], cls:'sctab' });
}

/* The card is deliberately paginated. Every one of the 31 line items that make
   up the 100 marks has to appear, so the blocks are split across two A4 pages
   and each page is then auto-fitted — clipping is what used to lose half the
   marks. */
function buildScorecard(p, lang){
  lang = lang || 'en';
  /* p is the saved run: { meta, report, companyIndex }. The Score Card is a
     per-company document, so it needs to be told which company in the run. */
  var rep = (p && p.report) || {};
  var list = (rep.full || []);
  var idx  = Math.max(0, Math.min(list.length - 1, (p && p.companyIndex) || 0));
  var co   = list[idx] || {};
  var m    = (p && p.meta) || {};

  /* Reach the engine through window explicitly. A bare EQ works in a browser
     only because window properties become globals; inside this module wrapper
     it is a reference error, and that difference should not decide whether a
     document renders. */
  var ENG = window.EQ || {};
  var PIL = (ENG.scoring && ENG.scoring.PILLARS) || {};
  var OW  = (ENG.scoring && ENG.scoring.OVERALL_WEIGHTS) || {};
  var overall = (co.overall && co.overall.score);
  var cover   = (co.overall && co.overall.coverage);

  /* The eight dimensions in the order the card presents them, and the name
     each goes by. The engine's keys are internal — `risk`, and
     `valuationExpectedReturn` for what the pillars still call valuation and
     opportunity — and a reader should not have to map one to the other
     halfway down the page. */
  var DIM_ORDER = ['businessQuality','growthMultibagger','valuationExpectedReturn','risk',
                   'financialQuality','managementGovernance','technicalEntry','catalysts'];
  var DIM_LABEL = { businessQuality:'Business Quality',
                    growthMultibagger:'Growth And Multibagger',
                    valuationExpectedReturn:'Valuation Expected Return',
                    valuationOpportunity:'Valuation Expected Return',
                    risk:'Risk And Quality Control',
                    riskQuality:'Risk And Quality Control',
                    financialQuality:'Financial Quality',
                    managementGovernance:'Management Governance',
                    technicalEntry:'Technical Entry',
                    catalysts:'Catalysts' };
  /* Dimension scores arrive as plain numbers. Reading `.score` off a number
     returns undefined, which is why every row of the build table printed a
     dash where its score belonged and the points never summed to the total. */
  function dimScore(v){
    if(typeof v === 'number') return isFinite(v) ? v : null;
    if(v && typeof v === 'object' && typeof v.score === 'number') return v.score;
    return null;
  }

  function pct(x){ return (x == null) ? 0 : Math.max(0, Math.min(100, x)); }
  function tile(k, v, sub){
    return '<div class="tile"><div class="k">' + e(k) + '</div><div class="v">' + v
         + '</div>' + (sub ? '<div class="s">' + e(sub) + '</div>' : '') + '</div>';
  }

  var head = '<div class="sc-top"><div style="height:4mm"></div>'
    + '<div class="eyebrow">' + e(L(lang,'score_card')) + ' &nbsp;·&nbsp; '
      + EN(e(S(m.sector) || '')) + '</div>'
    + '<h1 class="en" style="margin-top:1.5mm;font-size:10.1pt">' + EN(e(S(co.name) || S(co.symbol) || '')) + '</h1>'
    + '<div class="mut en" style="margin-top:1mm">' + e(S(co.symbol) || '')
      + (co.exchange ? ' · ' + e(S(co.exchange)) : '')
      + ' &nbsp;·&nbsp; ' + e(dmy(m.analysis_datetime)) + '</div>'
    + '<div style="height:2.5mm;background:var(--teal);width:26mm;border-radius:1mm;margin:2.5mm 0 3.5mm"></div>'
    + '<div class="tiles">'
      + tile('Overall', (overall == null ? '&mdash;' : n(overall,1)) + '<small>/100</small>',
             co.rank ? ('rank ' + co.rank + (co.tied ? ', tied' : '')) : 'unranked')
      + tile('Forensic', (co.forensicScore == null ? '&mdash;' : n(co.forensicScore,0)) + '<small>/100</small>',
             S(co.forensicBand))
      + tile('Coverage', (cover == null ? '&mdash;' : Math.round(cover*100) + '<small>%</small>'),
             (co.ratingsRejected ? co.ratingsRejected + ' ratings not counted' : 'all ratings evidenced'))
      + tile('Registers', (co.litigation && co.litigation.available)
              ? Math.round((co.litigation.essentialCoverage||0)*100) + '<small>%</small>' : '&mdash;',
             (co.litigation && co.litigation.available)
              ? (co.litigation.sufficient ? 'essential registers searched' : 'essential registers missing')
              : 'no search recorded')
      + tile('Top 3', co.eligibleForTop3 ? 'Eligible' : 'Barred',
             co.eligibleForTop3 ? '' : ((co.exclusionReasons||[]).length + ' reason(s)'))
    + '</div></div>';

  /* One block per pillar. Every line carries its score, the weight it carries,
     the anchor band it was placed in and the evidence sentence behind it. A
     score with no anchor beside it is the thing this whole card exists to
     prevent. */
  /* The forensic score, shown the way the four pillars are shown: each test
     that ran, what it found, and what it cost. A single number in a tile tells
     a reader that something is wrong but not what, and the forensic score is
     the one figure on this card that can bar a company outright. */
  function forensicBlock(){
    var f = co.forensic || {};
    if(!f || f.score == null) return '';
    var flags = arr(f.flags);
    var rows = flags.map(function(fl){
      var sev = S(fl.severity) || 'noted';
      var mark = sev === 'severe' ? '<b class="neg">Severe</b>'
               : sev === 'moderate' ? '<b>Moderate</b>'
               : '<span class="mut">' + e(titleCase(sev)) + '</span>';
      return { cells:[
        '<span class="ti">' + e(titleCase(S(fl.source))) + '</span>',
        mark,
        (fl.value == null ? '<span class="mut">&mdash;</span>'
          : '<span class="en">' + e(String(fl.value)) + '</span>'),
        e(S(fl.detail))
      ]};
    });
    if(arr(f.notComputed).length){
      rows.push({ cells:[
        '<span class="mut">Not Computed</span>', '<span class="mut">&mdash;</span>',
        '<span class="mut">&mdash;</span>',
        '<span class="mut">' + e(arr(f.notComputed).join('; ')) + '</span>' ]});
    }
    if(!rows.length) return '';
    var band = f.score >= 85 ? 'Excellent' : f.score >= 70 ? 'Good'
             : f.score >= 55 ? 'Acceptable' : f.score >= 40 ? 'Concerning' : 'High Risk';
    return '<div class="sc-blk">'
      + sec('', 'Forensic Quality — ' + f.score + ' (' + band + ')')
      + '<p class="mut">Every test the accounts could support was run; '
      + (f.testsAttempted || rows.length) + ' were attempted and '
      + (f.tested != null ? f.tested : rows.length) + ' returned a finding. '
      + 'The score starts at 100 and each finding takes points from it, so a low '
      + 'score means findings were made, not that data was missing.</p>'
      + tbl(['Test','Severity','Reading','What It Means'], rows,
            { num:[2], cls:'sctab fortab', chunk:false })
      + '</div>';
  }

  /* How the overall score was arrived at. Eight weighted dimensions, each with
     the points it contributed. A reader who cannot reproduce the total from
     the parts has been given a verdict, not a calculation. */
  function overallBlock(){
    var ov = co.overall || {};
    if(ov.score == null || !ov.weights) return '';
    var dims = co.dimensions || {};
    var PILL = (window.EQ && window.EQ.scoring && window.EQ.scoring.PILLARS) || {};
    var total = 0;
    var keys = DIM_ORDER.filter(function(k){ return ov.weights[k] != null; })
      .concat(Object.keys(ov.weights).filter(function(k){ return DIM_ORDER.indexOf(k) < 0; }));
    var rows = keys.map(function(k){
      var wt = ov.weights[k] * 100;
      var sc = dimScore(dims[k]);
      if(sc == null) sc = dimScore(co.pillars && co.pillars[k]);
      var earned = (sc == null) ? null : (sc / 100) * wt;
      if(earned != null) total += earned;
      var label = DIM_LABEL[k] || (PILL[k] && PILL[k].label) ||
        titleCase(k.replace(/([A-Z])/g,' $1'));
      return { cells:[
        '<span class="ti">' + e(label) + '</span>',
        sc == null ? '<span class="mut">&mdash;</span>' : '<span class="en">' + sc.toFixed(1) + '</span>',
        '<span class="en">' + wt.toFixed(0) + '%</span>',
        earned == null ? '<span class="mut">&mdash;</span>'
          : '<b class="en">' + earned.toFixed(2) + '</b>'
      ]};
    });
    rows.push({ __cls:'tot', cells:[
      '<b>Overall</b>', '', '<b class="en">100%</b>',
      '<b class="en">' + total.toFixed(2) + '</b>' ]});
    return '<div class="sc-blk">'
      + sec('', 'How The Overall Score Is Built — ' + ov.score.toFixed(1))
      + '<p class="mut">Each dimension is scored out of 100, multiplied by the '
      + 'weight it carries, and the results are added. The weights are the '
      + 'methodology\u2019s, not this company\u2019s'
      + (ov.weightsOverridden ? ', and have been adjusted for this sector' : '')
      + '. Anything not scored is left out and the remaining weights carry the '
      + 'total, which is why the parts can sum slightly below the figure shown.</p>'
      + tbl(['Dimension','Score','Weight','Points'], rows,
            { num:[1,2,3], cls:'sctab buildtab', chunk:false })
      + ((co.exclusionReasons && co.exclusionReasons.length)
          ? '<div class="note"><b>Barred from the Top 3.</b> '
            + e(co.exclusionReasons.join(' ')) + '</div>'
          : '')
      + '</div>';
  }

  function titleCase(t){
    return String(t || '').replace(/([a-z])([A-Z])/g,'$1 $2')
      .replace(/\s+/g,' ').trim()
      .replace(/\b\w/g, function(ch){ return ch.toUpperCase(); });
  }

  function pillarBlock(key){
    var def = PIL[key] || { label:key, weights:{} };
    var got = (co.ratings && co.ratings[key]) || {};
    var rows = Object.keys(def.weights).map(function(ck){
      var r = got[ck] || {};
      var sc = (r.score == null) ? null : r.score;
      /* Title Case, so "marginOfSafety" reads as "Margin Of Safety" rather
         than "Margin of safety" halfway between two conventions. */
      var label = ck.replace(/([A-Z])/g,' $1').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
      /* The points this component actually contributed, out of the points it
         could contribute. A component rated 65 carrying a weight of 15 earned
         9.75 of those 15 — which is the number that adds up to the pillar
         score. Printing "65 / 15" put a percentage next to a point total and
         invited the reader to compare two different things. */
      var wt = def.weights[ck];
      var earned = (sc == null) ? null : (sc / 100) * wt;
      return { cells:[
        '<span class="ti">' + e(label) + '</span>',
        '<span class="scbar"><i style="width:' + pct(sc).toFixed(0) + '%;background:'
          + ragBarHex(pct(sc)) + '"></i></span>',
        earned == null ? '<span class="mut">&mdash;</span>'
          : '<b class="en">' + earned.toFixed(2) + '</b>',
        '<span class="en">' + wt + '</span>',
        sc == null
          ? '<span class="mut">' + e(S(r.reason) || 'Not assessed.') + '</span>'
          : '<b>' + e(S(r.band) || '') + '.</b> ' + e(S(r.evidence) || '')
      ]};
    });
    var sco = (co.pillars && co.pillars[key] && co.pillars[key].score);
    return '<div class="sc-blk">'
      + sec('', (DIM_LABEL[key] || titleCase(def.label)) + (sco == null ? '' : ' \u2014 ' + sco.toFixed(1)))
      /* One header for the table, not one every eight rows. Chunking split a
         single dimension into two tables and printed BASIS / POINTS / OF /
         ANCHOR AND EVIDENCE again in the middle of it, which reads as a new
         section starting under the old heading. The packer divides long
         tables by the row where it has to. */
      + tbl(['Basis','','Points','Of','Anchor And Evidence'], rows,
             { num:[2,3], cls:'sctab', chunk:false })
      + '</div>';
  }

  /* The four pillars, then the forensic tests shown the same way, then the
     arithmetic that turns all of it into the overall figure on the front. */
  var body = Object.keys(PIL).map(pillarBlock).join('');

  /* The four dimensions that have no pillar of their own. They belong with the
     four that do — above the forensic tests, not below them — because the
     build table underneath adds all eight together. */
  var dimRows = ['financialQuality','managementGovernance','technicalEntry','catalysts'].map(function(k){
    var r = (co.ratings && co.ratings.dimensions && co.ratings.dimensions[k]) || {};
    var sc = (r.score == null) ? null : r.score;
    var label = DIM_LABEL[k] || k.replace(/([A-Z])/g,' $1').replace(/^./,function(c){ return c.toUpperCase(); });
    return { cells:[
      '<span class="ti">' + e(label) + '</span>',
      '<span class="scbar"><i style="width:' + pct(sc).toFixed(0) + '%;background:' + ragBarHex(pct(sc)) + '"></i></span>',
      sc == null ? '<span class="mut">&mdash;</span>' : '<b class="en">' + sc.toFixed(0) + '</b>',
      '<span class="en">' + Math.round((OW[k]||0)*100) + '%</span>',
      sc == null ? '<span class="mut">' + e(S(r.reason) || 'Not assessed.') + '</span>'
                 : '<b>' + e(S(r.band) || '') + '.</b> ' + e(S(r.evidence) || '')
    ]};
  });
  body += '<div class="sc-blk">' + sec('', 'Overall Dimensions')
        + tbl(['Dimension','','Score','Wt','Anchor And Evidence'], dimRows,
              { num:[2,3], cls:'sctab', chunk:false })
        + '</div>'
        + forensicBlock()
        + overallBlock();

  /* The Total block used to repeat, line for line, what the build table above
     already shows — the same eight dimensions, the same scores, the same
     weights — and then restate the overall figure printed on the front tile.
     Three statements of one number is not corroboration. The one thing it
     carried that nothing else did, the reason a company is barred, now sits
     under the arithmetic that bars it. */

  var tail = '<div class="grow"></div>';

  /* Four shells are emitted; the script packs the blocks into as many as they
     actually need and removes the rest. Packing beats scaling: html2canvas
     renders a CSS-zoomed box with the wrong advance widths, which made Gujavati
     words on a scaled page overlap into each other. */
  /* Six shells, not two. The card grew a forensic breakdown and the overall
     score arithmetic, and with one spill page the packer had nowhere to put
     them: seven blocks sat in a box over three times the height of the page and
     four sections printed below the paper edge. Unused shells are removed at
     the end, so seeding generously costs a reader nothing and seeding short
     costs them four sections. */
  var SC_SHELLS = 10;
  var pages = page(p,1,SC_SHELLS,L('en','doc_score'),
    '<div class="sc-main">'+head+body+'</div>'+tail,lang,L('en','doc_score'));
  for(var sp = 2; sp <= SC_SHELLS; sp++){
    pages += page(p,sp,SC_SHELLS,L('en','doc_score'),
      '<div class="sc-spill"></div>'+tail,lang,L('en','doc_score'));
  }

  /* Fixed geometry for every scoring table, so LINE ITEM, the bar, SCORE, MAX
     and BASIS sit at identical positions in every block and on both pages. */
  var CSS2 = '\n.sctab{ table-layout:fixed; width:100%; }\n'
           /* The evidence column is the only one carrying sentences, so it
              takes what the four figure columns do not need. Every
              millimetre given back to it is a line of wrapping saved on
              sixty-six rows. */
           + '.sctab th:nth-child(1),.sctab td:nth-child(1){ width:32mm; }\n'
           + '.sctab th:nth-child(2),.sctab td:nth-child(2){ width:15mm; }\n'
           /* "Points" sets wider than 12mm at this size and pushed 5px out of its own
   cell on every scoring table. The label column carries prose and can give up
   the two millimetres without wrapping. */
            + '.sctab th:nth-child(3),.sctab td:nth-child(3){ width:14mm; text-align:right; }\n'
           + '.sctab th:nth-child(4),.sctab td:nth-child(4){ width:10mm; text-align:right; }\n'
           + '.sctab td:nth-child(5){ width:auto; }\n'
           /* The one deliberate exception to the single body size. The
              evidence column is the only thing on the card that carries
              sentences rather than figures, and at the body size it wraps
              to five lines on sixty-six rows — nine pages of paper for
              one column's line breaks. Labels, scores, weights and every
              other document stay at var(--body); this column alone steps
              down one notch. */
           + '.sctab td:nth-child(5){ font-size:6.2pt; line-height:1.4; }\n'
           + '.fortab td:nth-child(4){ font-size:6.2pt; line-height:1.4; }\n'
           /* The forensic table has four columns, not five, and its last one
              carries a sentence rather than a figure. Left on the five-column
              geometry it inherited a 42mm first column and an 11mm fourth,
              so the explanation — the only part a reader needs — was squeezed
              into the narrowest column on the card. */
           + '.fortab th:nth-child(1),.fortab td:nth-child(1){ width:34mm; }\n'
           + '.fortab th:nth-child(2),.fortab td:nth-child(2){ width:18mm; text-align:left; }\n'
           + '.fortab th:nth-child(3),.fortab td:nth-child(3){ width:16mm; text-align:right; }\n'
           + '.fortab th:nth-child(4),.fortab td:nth-child(4){ width:auto; text-align:left; }\n'
           + '.fortab td:nth-child(5),.fortab th:nth-child(5){ display:none; }\n'
           /* Four numeric columns. On the pillar geometry the points column
              inherited 11mm and wrapped every figure onto two lines, which is
              how nine rows of arithmetic came to fill a page. */
           + '.buildtab th:nth-child(1),.buildtab td:nth-child(1){ width:auto; }\n'
           + '.buildtab th:nth-child(2),.buildtab td:nth-child(2){ width:26mm; text-align:right; }\n'
           + '.buildtab th:nth-child(3),.buildtab td:nth-child(3){ width:26mm; text-align:right; }\n'
           + '.buildtab th:nth-child(4),.buildtab td:nth-child(4){ width:26mm; text-align:right; }\n'
           + '.buildtab td:nth-child(5),.buildtab th:nth-child(5){ display:none; }\n'
           + '.scbar{ display:block; height:2.6mm; background:#EEF1F5; border-radius:1.3mm;'
           + ' overflow:hidden; margin-top:.6mm; }\n'
           + '.scbar i{ display:block; height:100%; border-radius:0 1.3mm 1.3mm 0; }\n'
           + '\n.sc-blk{break-inside:avoid}\n.sc-blk table{margin-bottom:0}\n'
           /* Same one body size as every other document. The density steps
              below still step down from here when a card will not otherwise
              fit, so nothing that used to fit stops fitting. */
           + '.sc-blk, .sc-blk td, .sc-blk th, .sc-blk .note, .sc-blk p, .sc-blk li'
           + '{font-size:var(--body);line-height:var(--bodyline)}\n'
           /* Sixty-six rows of table carry the card. Two millimetres of
              padding on each is four pages of paper, so the row rhythm is
              set once, here, tight enough that eight dimensions fit in six
              pages at the one body size the rest of the set uses. */
           + '.sc-blk .sec{margin:3.6mm 0 2mm}\n.sc-blk .bar{margin:0}\n'
           + '.sc-blk td,.sc-blk th{padding-top:1.5mm;padding-bottom:1.5mm}\n'
           + '.sc-blk p.mut{margin:0 0 1.5mm}\n'
           + '.sc-blk .ti{font-size:7.2pt}\n'
           + 'body.gu .sc-blk td,body.gu .sc-blk th{padding-top:1.9mm;padding-bottom:1.9mm}\n'
           /* The card is contractually two pages. Rather than spilling onto a
              third, the type is stepped down one notch at a time until all
              seven blocks plus the totals table fit. Four notches is enough
              for every payload tested, English and Gujarati. */
           + '[data-dense="1"] .sc-blk td,[data-dense="1"] .sc-blk th,'
           + 'body.gu[data-dense="1"] .sc-blk td,body.gu[data-dense="1"] .sc-blk th{padding-top:1.6mm;padding-bottom:1.6mm}\n'
           + '[data-dense="1"] .sc-blk .sec{margin:4mm 0 2mm}\n'
           + '[data-dense="2"] .sc-blk td,[data-dense="2"] .sc-blk th,'
           + 'body.gu[data-dense="2"] .sc-blk td,body.gu[data-dense="2"] .sc-blk th{padding-top:1.15mm;padding-bottom:1.15mm}\n'
           + '[data-dense="2"] .sc-blk .sec{margin:3mm 0 1.6mm}\n'
           + '[data-dense="2"] .sc-blk .ti{font-size:6.6pt}\n'
           + '[data-dense="2"] .sc-blk td,[data-dense="2"] .sc-blk th{font-size:6.2pt}\n'
           + '[data-dense="3"] .sc-blk td,[data-dense="3"] .sc-blk th,'
           + 'body.gu[data-dense="3"] .sc-blk td,body.gu[data-dense="3"] .sc-blk th{padding-top:.85mm;padding-bottom:.85mm;font-size:6.2pt}\n'
           + '[data-dense="3"] .sc-blk .sec{margin:2.2mm 0 1.2mm}\n'
           + '[data-dense="3"] .sc-blk .ti{font-size:6.2pt}\n'
           + '[data-dense="3"] .sc-top .tile .v{font-size:8.4pt}\n'
           + '[data-dense="3"] .sc-top h1{font-size:9.0pt}\n';

  var FIT = '<script>(function(){'
    /* This document packs itself; the generic guard must not scale it again. */
    + 'document.body.setAttribute("data-fitted","1");'
    + 'var ps=[].slice.call(document.querySelectorAll(".page"));'
    + 'var boxes=ps.map(function(el){ return el.querySelector(".sc-main")||el.querySelector(".sc-spill"); });'
    + 'function avail(el){ var bd=el.querySelector(".body"), d=bd.querySelector(".sc-disc");'
      + 'return bd.clientHeight - (d? d.offsetHeight+14 : 0); }'
    /* Blocks are remembered in document order so each density attempt starts
       from the same layout instead of compounding the previous one. */
    + 'var ORDER=[].slice.call(boxes[0].querySelectorAll(".sc-blk"));'
    /* A density retry starts from the whole card. A continuation holds real
       rows, so it has to be poured back into the block it came from before it
       is thrown away — dropping it took thirty rows of scoring off the card
       and left four dimensions showing a handful of components each. */
    + 'function reset(){'
      /* Reverse document order: a continuation can itself have been
         divided, and pouring the first one home before the second
         destroys the block the second was waiting to pour into. */
      + '[].slice.call(document.querySelectorAll(".sc-blk[data-cont]")).reverse().forEach(function(c){'
        + 'var src=document.querySelector(".sc-blk[data-cutid=\\""+c.getAttribute("data-cont")+"\\"]");'
        + 'var home=src && src.querySelector("tbody");'
        + 'var away=c.querySelector("tbody");'
        + 'if(home && away){ while(away.rows.length) home.appendChild(away.rows[0]); }'
        + 'if(src) src.removeAttribute("data-cutid");'
        + 'if(c.parentNode) c.parentNode.removeChild(c); });'
      + 'ORDER.forEach(function(el){'
        + 'var t=el.querySelector("table");'
        + 'if(t){ var og=t.querySelector("colgroup");'
          + 'if(og && og.parentNode===t) t.removeChild(og); t.style.tableLayout=""; }'
        + 'boxes[0].appendChild(el); });'
    + '}'
    /* Continue a dimension across a page break instead of pushing the whole
       block forward. A block is one heading and one long table, so a card of
       eight of them packed whole leaves a third of every page empty and runs
       to seven pages. The heading stays with at least two of its rows — a
       heading standing alone over a page break is the one thing worth wasting
       paper to avoid — and the rest continues at the top of the next page
       under the same geometry. */
    + 'var SPLIT=0;'
    + 'function colPin(tbl){'
      + 'var hr=tbl.rows && tbl.rows[0]; if(!hr) return null;'
      + 'var tw=tbl.getBoundingClientRect().width || 1, ws=[], ci=0;'
      + 'for(ci=0;ci<hr.cells.length;ci++)'
        + 'ws.push(hr.cells[ci].getBoundingClientRect().width / tw * 100);'
      + 'return ws;'
    + '}'
    + 'function applyPin(tbl, ws){'
      + 'if(!tbl || !ws || !ws.length) return;'
      + 'var og=tbl.querySelector("colgroup");'
      + 'if(og && og.parentNode===tbl) tbl.removeChild(og);'
      + 'var cg=document.createElement("colgroup");'
      + 'ws.forEach(function(w){ var c=document.createElement("col");'
        + 'c.style.width=w.toFixed(3)+"%"; cg.appendChild(c); });'
      + 'tbl.insertBefore(cg, tbl.firstChild); tbl.style.tableLayout="fixed";'
    + '}'
    + 'function scSplit(blk, i, A){'
      + 'if(!blk || !boxes[i] || !boxes[i+1]) return false;'
      /* A block short enough to sit on a page of its own is moved, never
         divided. The overall-score table is ten rows and 370px on a 1012px
         page; splitting it put two dimensions above the page-foot note and the
         rest overleaf, so the arithmetic a reader is meant to follow was
         interrupted by a disclaimer. Dividing is for blocks that cannot fit
         anywhere whole. */
      + 'if(blk.getBoundingClientRect().height <= A) return false;'
      + 'var tbl=blk.querySelector("table"); if(!tbl) return false;'
      + 'var bodies=tbl.tBodies; if(!bodies || !bodies.length) return false;'
      + 'var body=bodies[bodies.length-1];'
      /* The first half carries the heading and must keep two rows under
         it; a continuation carries no heading, so one row is a whole
         thing to read and insisting on two leaves pages a quarter
         full. */
      + 'var minLeft = blk.querySelector(".sec") ? 2 : 1;'
      + 'if(body.rows.length <= minLeft + 1) return false;'
      
      + 'var carry=blk.cloneNode(false); carry.removeAttribute("id");'
      + 'var sid="sc"+(SPLIT++);'
      + 'blk.setAttribute("data-cutid", sid); carry.setAttribute("data-cont", sid);'
      + 'var t2=tbl.cloneNode(false);'
      + 'var th=tbl.tHead; if(th) t2.appendChild(th.cloneNode(true));'
      + 'var b2=document.createElement("tbody");'
      + 't2.appendChild(b2); carry.appendChild(t2);'
      + 'var g=0;'
      + 'boxes[i+1].insertBefore(carry, boxes[i+1].firstChild);'
      + 'while(boxes[i].scrollHeight>A && body.rows.length>minLeft && g++<200){'
        + 'b2.insertBefore(body.rows[body.rows.length-1], b2.firstChild);'
      + '}'
      + 'if(!b2.rows.length || boxes[i].scrollHeight>A){'
        + 'while(b2.rows.length) body.appendChild(b2.rows[0]);'
        + 'carry.parentNode.removeChild(carry);'
        + 'return false;'
      + '}'
      /* No column pinning here: .sctab already fixes every column in
         millimetres, so both halves inherit identical geometry. Pinning
         measured percentages over the top of that squeezed the evidence
         column and doubled the height of every row it touched. */
      + 'return true;'
    + '}'
    /* Two passes. The first pushes whatever overflows onto the next page, which
       is all this used to do — and it is why pages ended up mostly blank: once
       a block moved forward, the page it left kept the hole, and so did every
       page after it. The second pass pulls blocks back while they still fit, so
       each page fills to the bottom before the next one starts. */
    /* Grow a page when the last one is still overflowing. The card was seeded
       with two and had nowhere to put the rest: seven blocks ended up in a box
       3219px tall inside a 961px page, so the forensic breakdown and the
       overall-score arithmetic sat below the page edge, present in the markup
       and invisible on paper. */
    + 'function addPage(){'
      + 'var lastPg=ps[ps.length-1], clone=lastPg.cloneNode(true);'
      + 'var cb=clone.querySelector(".sc-main")||clone.querySelector(".sc-spill");'
      + 'if(!cb) return false;'
      + 'while(cb.firstChild) cb.removeChild(cb.firstChild);'
      + 'var dsc=clone.querySelector(".sc-disc"); if(dsc) dsc.parentNode.removeChild(dsc);'
      + 'lastPg.parentNode.insertBefore(clone, lastPg.nextSibling);'
      + 'ps.push(clone); boxes.push(cb);'
      + 'return true;'
    + '}'
    + 'function pack(){'
      + 'var grow=0;'
      + 'while(boxes[boxes.length-1].scrollHeight > avail(ps[ps.length-1]) && grow++<30){'
        + 'if(!addPage()) break;'
        + 'for(var gi=0;gi<ps.length-1;gi++){'
          + 'var gA=avail(ps[gi]), gg=0;'
          + 'while(boxes[gi].scrollHeight>gA && gg++<60){'
            + 'var gk=boxes[gi].querySelectorAll(".sc-blk");'
            + 'if(gk.length<2) break;'
            + 'boxes[gi+1].insertBefore(gk[gk.length-1], boxes[gi+1].firstChild);'
          + '}'
        + '}'
      + '}'
      + 'for(var round=0;round<3;round++){'
      + 'for(var i=0;i<ps.length-1;i++){'
        + 'var A=avail(ps[i]), guard=0;'
        + 'while(boxes[i].scrollHeight>A && guard++<40){'
          + 'var kids=boxes[i].querySelectorAll(".sc-blk");'
          /* Divide the last block only when moving it away whole would leave
             a real hole. Splitting whenever anything overflowed fragmented
             every dimension in the card and took it from seven pages to ten. */
          + 'if(kids.length){'
            + 'var lastK=kids[kids.length-1];'
            + 'var freeK=A-(boxes[i].scrollHeight-lastK.offsetHeight);'
            + 'if(freeK>=240 && scSplit(lastK, i, A)) continue;'
          + '}'
          /* Never push the last block off a page. The guard only protected
             page one, so every other page emptied itself into the next and the
             whole card cascaded onto the final shell — one block stranded at
             the front, seven stacked at the back, eight pages blank between. */
          + 'if(kids.length<2) break;'
          + 'boxes[i+1].insertBefore(kids[kids.length-1], boxes[i+1].firstChild);'
        + '}'
      + '}'
      + 'for(var p=0;p<ps.length-1;p++){'
        + 'var Ap=avail(ps[p]), pull=0;'
        + 'while(pull++<60){'
          + 'var nxt=boxes[p+1].querySelector(".sc-blk");'
          + 'if(!nxt) break;'
          + 'boxes[p].appendChild(nxt);'
          + 'if(boxes[p].scrollHeight>Ap){'
            /* It did not fit whole. Leave its heading and as many rows as the
               page can carry, and continue the rest overleaf; only if it will
               not divide does it go back. */
            + 'if(scSplit(nxt, p, Ap)) break;'
            + 'boxes[p+1].insertBefore(nxt, boxes[p+1].firstChild); break;'
          + '}'
        + '}'
      + '}'
      + '}'
      + 'var last=boxes[boxes.length-1];'
      + 'return last.scrollHeight<=avail(ps[ps.length-1]);'
    + '}'
    + 'var fits=pack();'
    + 'window.__SC=[].slice.call(document.querySelectorAll(".page")).map(function(el,ix){'
      + 'var bx=el.querySelector(".sc-main")||el.querySelector(".sc-spill");'
      + 'return { i:ix, has:!!bx, blocks:bx?bx.querySelectorAll(".sc-blk").length:-1,'
        + ' scroll:bx?bx.scrollHeight:-1, avail:Math.round(avail(el)) }; });'
    /* The card used to be contractually two pages, and when it would not fit
       the type was stepped down until it did. It is now six or seven, it packs
       by dividing a dimension across a break rather than by shrinking, and the
       whole document set reads at one size — so stepping the type down here
       would make this the only document in the set that does not. Pages are
       cheaper than a second type size. */
    + 'if(!fits){ var gz=0;'
      + 'while(boxes[boxes.length-1].scrollHeight>avail(ps[ps.length-1]) && gz++<12){'
        + 'if(!addPage()) break; pack();'
      + '}'
    + '}'
    /* drop the shells nothing landed on */
    + 'for(var j=ps.length-1;j>=1;j--){'
      + 'if(!boxes[j].children.length) ps[j].parentNode.removeChild(ps[j]);'
    + '}'
    + 'var live=[].slice.call(document.querySelectorAll(".page"));'
    + 'for(var k=0;k<live.length-1;k++){ var dd=live[k].querySelector(".sc-disc");'
      + 'if(dd) dd.parentNode.removeChild(dd); }'
    + 'for(var n=0;n<live.length;n++){ var el=live[n];'
      + 'var t=el.querySelector(".pgtot"); if(t) t.textContent=live.length;'
      + 'var nm=el.querySelector(".pgnum"); if(nm) nm.textContent=(n+1);'
      + 'var bd=el.querySelector(".body");'
      + 'var box=bd.querySelector(".sc-main")||bd.querySelector(".sc-spill");'
      + 'var A2=avail(el);'
      /* last resort only: one block taller than a whole page. transform:scale is
         used rather than zoom because html2canvas reproduces it faithfully. */
      + 'if(box && box.scrollHeight>A2){'
        + 'var z=Math.max(0.60, Math.floor((A2/box.scrollHeight)*1000)/1000);'
        + 'var wrap=document.createElement("div");'
        + 'wrap.style.cssText="height:"+A2+"px;overflow:hidden";'
        + 'box.parentNode.insertBefore(wrap, box); wrap.appendChild(box);'
        + 'box.style.width=(100/z)+"%";'
        + 'box.style.transformOrigin="top left";'
        + 'box.style.transform="scale("+z+")";'
      + '}'
    + '}'
    + '})();<\/script>';

  return shell((S(co.name)||S(co.symbol)||S(m.sector))+' — Score Card', '', pages, CSS2)
         .replace('<!--FIT-->', FIT);
}



/* ============================ CHARTS ============================
   Everything here is inline SVG or plain divs, because that is what the
   rasteriser behind the PDF and PNG can actually draw. CSS conic-gradient
   silently renders as nothing through html2canvas — the donut in earlier
   builds was blank in every exported file — so nothing here relies on it.
   ============================================================== */
/* Chart colours draw from the same five-step scale, so a bar in a chart and a
   pill in a table beside it never disagree about what amber means. */
var CH = { teal:'#149C8B', navy:'#1F6FB2', navy2:'#2E6BB8', amber:'#D69A0E',
           gold:'#E2703A', red:'#C0392B', green:'#149C8B', grey:'#C9CFD8', ink:'#1B2430' };

function chNum(v){ return (v==null || isNaN(v)) ? null : Number(v); }
function chMax(a){ var m = 0; a.forEach(function(x){ if(chNum(x)!=null) m = Math.max(m, Math.abs(Number(x))); }); return m || 1; }
/* A chart with nothing plottable must draw nothing at all. Returning an empty
   SVG instead left a full-height blank rectangle holding space in the middle of
   the page — which is what put a chart-shaped hole above the cash-flow table
   when a payload carried no FY24 figures and no investing or financing lines. */
function chHasData(){
  for(var i = 0; i < arguments.length; i++){
    var a = arguments[i];
    if(!Array.isArray(a)) continue;
    for(var j = 0; j < a.length; j++){ if(chNum(a[j]) != null) return true; }
  }
  return false;
}

/* Column chart with a value label on each bar. Negative values drop below the axis. */
function chartColumns(labels, values, opts){
  opts = opts || {};
  if(!chHasData(values)) return '';
  var W = opts.w || 520, H = opts.h || 150, pad = 22;
  var vals = values.map(chNum);
  var hasNeg = vals.some(function(v){ return v != null && v < 0; });
  var mx = chMax(vals);
  var n = vals.length || 1;
  var slot = (W - pad*2) / n, bw = Math.min(slot*0.58, 46);
  var zeroY = hasNeg ? H*0.62 : H - 26;
  var avail = hasNeg ? Math.min(zeroY - 16, H - zeroY - 16) : zeroY - 16;
  var bars = '', labs = '';
  vals.forEach(function(v, i){
    var x = pad + slot*i + slot/2;
    if(v == null){
      labs += '<text x="'+x.toFixed(1)+'" y="'+(H-8)+'" font-size="10" fill="'+CH.grey+'" text-anchor="middle">—</text>';
      return;
    }
    var h = Math.abs(v)/mx*avail;
    var y = v >= 0 ? zeroY - h : zeroY;
    var col = opts.colour || (v < 0 ? CH.red : CH.teal);
    bars += '<rect x="'+(x-bw/2).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)
         +'" height="'+Math.max(h,1.5).toFixed(1)+'" rx="2" fill="'+col+'"/>';
    bars += '<text x="'+x.toFixed(1)+'" y="'+(v>=0 ? y-5 : y+h+13).toFixed(1)
         +'" font-size="11" font-weight="700" fill="'+CH.ink+'" text-anchor="middle">'
         + e(opts.fmt ? opts.fmt(v) : n2(v)) + '</text>';
  });
  labels.forEach(function(t, i){
    var x = pad + slot*i + slot/2;
    labs += '<text x="'+x.toFixed(1)+'" y="'+(H-6)+'" font-size="10.5" fill="'+CH.ink+'" text-anchor="middle">'+e(S(t))+'</text>';
  });
  return '<div class="ch"><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="xMidYMid meet">'
    + '<line x1="'+pad+'" y1="'+zeroY+'" x2="'+(W-pad)+'" y2="'+zeroY+'" stroke="'+CH.grey+'" stroke-width="1"/>'
    + bars + labs + '</svg></div>';
}

/* Columns plus a line on a second scale — revenue bars with a margin line. */
function chartColumnsLine(labels, bars, line, opts){
  opts = opts || {};
  if(!chHasData(bars, line)) return '';
  var W = opts.w || 520, H = opts.h || 165, pad = 24;
  var bv = bars.map(chNum), lv = line.map(chNum);
  var bmx = chMax(bv), lmx = chMax(lv);
  var n = bv.length || 1, slot = (W - pad*2)/n, bw = Math.min(slot*0.5, 40);
  var base = H - 28, top = 24, avail = base - top;
  var out = '', pts = [];
  bv.forEach(function(v,i){
    var x = pad + slot*i + slot/2;
    if(v == null) return;
    var h = Math.abs(v)/bmx*avail*0.92;
    out += '<rect x="'+(x-bw/2).toFixed(1)+'" y="'+(base-h).toFixed(1)+'" width="'+bw.toFixed(1)
        +'" height="'+Math.max(h,1.5).toFixed(1)+'" rx="2" fill="'+(opts.barColour||CH.navy2)+'"/>';
    out += '<text x="'+x.toFixed(1)+'" y="'+(base-h-5).toFixed(1)+'" font-size="10.5" font-weight="700" fill="'
        + CH.ink+'" text-anchor="middle">'+e(opts.barFmt?opts.barFmt(v):n2(v))+'</text>';
  });
  lv.forEach(function(v,i){
    if(v == null) return;
    var x = pad + slot*i + slot/2;
    var y = base - (v/lmx)*avail*0.68 - 6;
    pts.push([x,y]);
  });
  if(pts.length > 1){
    out += '<polyline points="'+pts.map(function(q){ return q[0].toFixed(1)+','+q[1].toFixed(1); }).join(' ')
        + '" fill="none" stroke="'+(opts.lineColour||CH.gold)+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function(q,i){
      out += '<circle cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="4" fill="'+(opts.lineColour||CH.gold)+'"/>';
      out += '<text x="'+q[0].toFixed(1)+'" y="'+(q[1]-9).toFixed(1)+'" font-size="9.5" fill="'+(opts.lineColour||CH.gold)
          + '" text-anchor="middle">'+e(opts.lineFmt?opts.lineFmt(lv[i]):n2(lv[i]))+'</text>';
    });
  }
  labels.forEach(function(t,i){
    var x = pad + slot*i + slot/2;
    out += '<text x="'+x.toFixed(1)+'" y="'+(H-8)+'" font-size="10.5" fill="'+CH.ink+'" text-anchor="middle">'+e(S(t))+'</text>';
  });
  return '<div class="ch"><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="xMidYMid meet">'
    + '<line x1="'+pad+'" y1="'+base+'" x2="'+(W-pad)+'" y2="'+base+'" stroke="'+CH.grey+'" stroke-width="1"/>'
    + out + '</svg></div>';
}

/* Donut, drawn as a stroked circle because conic-gradient does not rasterise. */
function chartDonut(parts, opts){
  opts = opts || {};
  var size = opts.size || 132, R = size*0.38, C = 2*Math.PI*R, cx = size/2, cy = size/2;
  var total = parts.reduce(function(a,x){ return a + (Number(x.value)||0); }, 0) || 1;
  var acc = 0, rings = '';
  parts.forEach(function(x){
    var frac = (Number(x.value)||0)/total;
    rings += '<circle cx="'+cx+'" cy="'+cy+'" r="'+R.toFixed(1)+'" fill="none" stroke="'+x.colour
          + '" stroke-width="'+(size*0.20).toFixed(1)+'" stroke-dasharray="'+(C*frac).toFixed(2)+' '+C.toFixed(2)
          + '" stroke-dashoffset="'+(-C*acc).toFixed(2)+'" transform="rotate(-90 '+cx+' '+cy+')"/>';
    acc += frac;
  });
  var centre = opts.centre
    ? '<text x="'+cx+'" y="'+(cy+2)+'" font-size="'+(size*0.15).toFixed(0)+'" font-weight="700" fill="'
      + CH.ink+'" text-anchor="middle">'+e(opts.centre)+'</text>'
      + (opts.centreSub ? '<text x="'+cx+'" y="'+(cy+size*0.15).toFixed(0)+'" font-size="'+(size*0.085).toFixed(0)
         +'" fill="'+CH.grey+'" text-anchor="middle">'+e(opts.centreSub)+'</text>' : '')
    : '';
  return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'">'+rings+centre+'</svg>';
}

/* Horizontal comparison bars — the subject highlighted against its peers. */
function chartPeerBars(rows, opts){
  opts = opts || {};
  var mx = chMax(rows.map(function(r){ return r.value; }));
  return '<div class="chbars">' + rows.map(function(r){
    var v = chNum(r.value);
    var w = v == null ? 0 : Math.abs(v)/mx*100;
    return '<div class="chbar'+(r.me?' me':'')+'">'
      + '<span class="cl">'+e(S(r.label))+'</span>'
      + '<span class="ct"><i style="width:'+w.toFixed(1)+'%;background:'
      + (r.me ? CH.gold : CH.navy2)+'"></i></span>'
      + '<span class="cv en">'+e(v==null?'—':(opts.fmt?opts.fmt(v):n2(v)))+'</span></div>';
  }).join('') + '</div>';
}

/* Scenario ladder: bear / base / bull against the issue price. */
function chartLadder(cases, issuePrice, lang){
  var vals = cases.map(function(c){ return chNum(c.value_per_share != null ? c.value_per_share : c.fair_value); });
  var all = vals.concat([chNum(issuePrice)]).filter(function(x){ return x != null; });
  if(!all.length) return '';
  var lo = Math.min.apply(null, all)*0.9, hi = Math.max.apply(null, all)*1.05;
  var span = (hi - lo) || 1;
  var W = 520, H = 130, pad = 28, base = H - 24;
  var slot = (W - pad*2)/(cases.length || 1);
  var out = '';
  var ipY = base - ((chNum(issuePrice) - lo)/span)*(base - 26);
  if(chNum(issuePrice) != null){
    out += '<line x1="'+pad+'" y1="'+ipY.toFixed(1)+'" x2="'+(W-pad)+'" y2="'+ipY.toFixed(1)
        + '" stroke="'+CH.gold+'" stroke-width="2" stroke-dasharray="6 4"/>'
        + '<text x="'+(W-pad)+'" y="'+(ipY-6).toFixed(1)+'" font-size="10" fill="'+CH.gold
        + '" text-anchor="end">'+e(L(lang,'issue_at'))+' '+n(issuePrice)+'</text>';
  }
  cases.forEach(function(c,i){
    var v = vals[i]; if(v == null) return;
    var x = pad + slot*i + slot/2;
    var y = base - ((v - lo)/span)*(base - 26);
    var col = /bear/i.test(S(c.case)) ? CH.red : /bull/i.test(S(c.case)) ? CH.green : CH.navy2;
    out += '<rect x="'+(x-26)+'" y="'+y.toFixed(1)+'" width="52" height="'+(base-y).toFixed(1)+'" rx="3" fill="'+col+'" fill-opacity="0.85"/>'
        + '<text x="'+x+'" y="'+(y-6).toFixed(1)+'" font-size="11.5" font-weight="700" fill="'+CH.ink
        + '" text-anchor="middle">₹'+n(v)+'</text>'
        + '<text x="'+x+'" y="'+(H-6)+'" font-size="10.5" fill="'+CH.ink+'" text-anchor="middle">'+e(A(lang,c.case))+'</text>';
  });
  return '<div class="ch"><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="xMidYMid meet">'
    + '<line x1="'+pad+'" y1="'+base+'" x2="'+(W-pad)+'" y2="'+base+'" stroke="'+CH.grey+'" stroke-width="1"/>'
    + out + '</svg></div>';
}

/* Radar over the seven scoring blocks. */
function chartRadar(p, lang){
  /* The viewBox is wider than it is tall so the axis labels at 3 and 9 o'clock
     have room; at equal width they were being cut off mid-word. */
  var W = 330, H = 250, cx = W/2, cy = H/2 + 4, R = 74;
  var pts = [], axes = '', labs = '';
  BLOCKS.forEach(function(b, i){
    var frac = b[2] ? Math.max(0, Math.min(1, blockScore(p,b)/b[2])) : 0;
    var ang = -Math.PI/2 + (2*Math.PI*i)/BLOCKS.length;
    var ax = cx + Math.cos(ang)*R, ay = cy + Math.sin(ang)*R;
    axes += '<line x1="'+cx+'" y1="'+cy+'" x2="'+ax.toFixed(1)+'" y2="'+ay.toFixed(1)+'" stroke="'+CH.grey+'" stroke-width="0.8"/>';
    pts.push([(cx + Math.cos(ang)*R*frac).toFixed(1), (cy + Math.sin(ang)*R*frac).toFixed(1)]);
    var lx = cx + Math.cos(ang)*(R+15), ly = cy + Math.sin(ang)*(R+15);
    var anchor = Math.abs(Math.cos(ang)) < 0.3 ? 'middle' : (Math.cos(ang) > 0 ? 'start' : 'end');
    var nm = S(bName(b,lang));
    if(nm.length > 22) nm = nm.slice(0,21)+'…';
    labs += '<text x="'+lx.toFixed(1)+'" y="'+(ly+3).toFixed(1)+'" font-size="8.5" fill="'+CH.ink
         + '" text-anchor="'+anchor+'">'+e(nm)+'</text>';
  });
  var rings = [0.25,0.5,0.75,1].map(function(f){
    var poly = BLOCKS.map(function(b,i){
      var ang = -Math.PI/2 + (2*Math.PI*i)/BLOCKS.length;
      return (cx+Math.cos(ang)*R*f).toFixed(1)+','+(cy+Math.sin(ang)*R*f).toFixed(1); }).join(' ');
    return '<polygon points="'+poly+'" fill="none" stroke="'+CH.grey+'" stroke-width="0.7"/>';
  }).join('');
  return '<div class="ch"><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="xMidYMid meet">'
    + rings + axes
    + '<polygon points="'+pts.map(function(q){ return q[0]+','+q[1]; }).join(' ')
    + '" fill="'+CH.navy2+'" fill-opacity="0.30" stroke="'+CH.navy+'" stroke-width="2.5"/>'
    + labs + '</svg></div>';
}

/* Simple horizontal gauge for a 0-100 score. */
/* The total-score gauge.

   It was an SVG drawn across the full width of its column while the seven
   category bars underneath ran only between the label and the value columns —
   so the total sat visibly narrower than the bars it totals. Insetting the SVG
   fixed the alignment and broke the caption instead: the viewBox is 520 wide,
   the inset column is under 200, and the type scaled down with it.

   So it is not an SVG any more. It is a `.bar` row like the seven beneath it,
   with the five bands painted into the track — same label column, same track,
   same value column, aligned by construction rather than by arithmetic that
   has to be kept in step by hand. */
function chartGauge(value, lang){
  var v = Math.max(0, Math.min(100, Number(value) || 0));
  var bands = [[0,35,PAL5_HEX[0]],[35,50,PAL5_HEX[1]],[50,65,PAL5_HEX[2]],
               [65,80,PAL5_HEX[3]],[80,100,PAL5_HEX[4]]];
  /* The geometry is written inline as well as in the stylesheet. This is one of
     the four charts the rasteriser test renders on its own, outside the
     document, exactly as html2canvas sees it when a page is turned into a PNG —
     and a shape that depends entirely on a class it cannot see comes out blank.
     The values are the same as the rules; the rules keep the printed document
     consistent, these keep the drawing self-contained. */
  var track = bands.map(function(bd){
    return '<i class="gb" style="position:absolute;top:0;bottom:0;opacity:.30;left:' + bd[0]
      + '%;width:' + (bd[1]-bd[0]) + '%;background:' + bd[2] + '"></i>';
  }).join('');
  return '<div class="bar gaugebar" style="display:flex;align-items:center;gap:2.5mm">'
    /* `total_score` is already defined further down the label table —
       "Total Score By Section" — and the later definition wins, so the
       existing one is used rather than a second key of the same name. */
    + '<div class="bl" style="flex:0 0 40mm">' + e(L(lang, 'total_score')) + '</div>'
    + '<div class="bt" style="position:relative;flex:1;height:4.6mm;border-radius:.8mm">' + track
      + '<div class="bf" style="position:absolute;top:0;bottom:0;left:0;border-radius:.8mm 0 0 .8mm;'
        + 'width:' + v.toFixed(1) + '%;background:' + ragBarHex(v) + '"></div>'
      + '<div class="gmark" style="left:' + v.toFixed(1) + '%"></div>'
    + '</div>'
    + '<div class="bv en" style="flex:0 0 16mm;text-align:right;font-weight:800">'
      + v.toFixed(1) + ' / 100</div></div>';
}
function bandColourHex(v){ v=Number(v)||0;
  return v>=75?CH.green:v>=65?CH.teal:v>=55?CH.amber:v>=45?CH.gold:CH.red; }

/* Waterfall for use of proceeds. */
function chartWaterfall(items, lang){
  if(!items.length) return '';
  if(!chHasData(items.map(function(x){ return x.amount_cr; }))) return '';
  var W = 520, H = 150, pad = 20, base = H - 34;
  var mx = chMax(items.map(function(x){ return x.amount_cr; }));
  var slot = (W - pad*2)/items.length, bw = Math.min(slot*0.6, 54);
  var out = '';
  items.forEach(function(x,i){
    var v = chNum(x.amount_cr); if(v == null) return;
    var h = Math.abs(v)/mx*(base-30);
    var cx2 = pad + slot*i + slot/2;
    out += '<rect x="'+(cx2-bw/2).toFixed(1)+'" y="'+(base-h).toFixed(1)+'" width="'+bw.toFixed(1)
        + '" height="'+Math.max(h,2).toFixed(1)+'" rx="2" fill="'+CH.navy2+'"/>'
        + '<text x="'+cx2.toFixed(1)+'" y="'+(base-h-5).toFixed(1)+'" font-size="10.5" font-weight="700" fill="'
        + CH.ink+'" text-anchor="middle">'+n(v)+'</text>';
    var words = S(tr(items[i].__p||{}, lang, x.use)).split(/\s+/).slice(0,3).join(' ');
    out += '<text x="'+cx2.toFixed(1)+'" y="'+(base+14)+'" font-size="8.5" fill="'+CH.ink
        + '" text-anchor="middle">'+e(words)+'</text>';
  });
  return '<div class="ch"><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="xMidYMid meet">'
    + '<line x1="'+pad+'" y1="'+base+'" x2="'+(W-pad)+'" y2="'+base+'" stroke="'+CH.grey+'" stroke-width="1"/>'
    + out + '</svg></div>';
}

/* Heat row for a sensitivity grid. */
function chartHeat(cols, rows, lang){
  if(!rows.length) return '';
  var all = [];
  rows.forEach(function(r){ arr(r.cells).forEach(function(c){ var v=chNum(c); if(v!=null) all.push(v); }); });
  if(!all.length) return '';
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), span = (hi-lo)||1;
  /* Five bands, matching the score scale exactly, so a cell in this grid means
     the same thing as a bar of the same colour anywhere else in the report. */
  function col(v){ return PAL5_HEX[step5(((v-lo)/span)*100)]; }
  return '<table class="chheat"><thead><tr><th></th>'
    + cols.map(function(c){ return '<th>'+e(S(c))+'</th>'; }).join('')+'</tr></thead><tbody>'
    + rows.map(function(r){
        return '<tr><th>'+e(S(r.label))+'</th>'
          + arr(r.cells).map(function(c){
              var v = chNum(c);
              return '<td style="background:'+(v==null?CH.grey:col(v))+';color:#fff">'+(v==null?'—':n(v))+'</td>'; }).join('')
          + '</tr>'; }).join('')
    + '</tbody></table>';
}
function n2(v){ return n(v, Math.abs(Number(v))<100 ? 1 : 0); }


/* Pull a numeric series out of financials.rows by matching its label. */
function rowSeries(f, re){
  var hit = arr(f.rows).filter(function(r){ return re.test(S(r.label)); })[0];
  return hit ? arr(hit.values).map(function(v){ return (v==null||isNaN(v))?null:Number(v); }) : [];
}
function chartLegend(items){
  return '<div class="chleg">'+items.map(function(x){
    return '<span><i style="background:'+x.colour+'"></i>'+e(x.label)+'</span>'; }).join('')+'</div>';
}
/* Revenue columns with the profit line over them — the single most useful
   picture in the whole document, and it replaces reading three table rows. */
function chartFinancials(p, lang){
  var f = p.financials||{};
  var years = arr(f.years).length ? arr(f.years) : ['FY24','FY25','FY26'];
  var rev = rowSeries(f, /revenue|turnover/i);
  var pat = rowSeries(f, /profit after tax|\bPAT\b|net profit/i);
  if(!rev.filter(function(x){return x!=null;}).length) return '';
  var out = chartColumnsLine(years, rev, pat, {
    barColour:'#2E6BB8', lineColour:'#E08A1E',
    barFmt:function(v){ return n(v,0); }, lineFmt:function(v){ return n(v,0); } });
  return out + chartLegend([{ label:L(lang,'revenue_lbl'), colour:'#2E6BB8' },
                            { label:L(lang,'pat_lbl'), colour:'#E08A1E' }]);
}
/* Peer multiple comparison with the subject highlighted. */
function chartPeers(p, lang){
  var f = p.financials||{}, pr = f.peers||{};
  var rows = [];
  if(Array.isArray(pr.rows) && pr.rows.length){
    var cols = arr(pr.columns).map(function(c){ return S(c).toLowerCase(); });
    var peIx = cols.findIndex(function(c){ return /p\/e|pe/.test(c); });
    if(peIx > 0){
      pr.rows.forEach(function(r){
        var cells = arr(r.cells);
        rows.push({ label:S(cells[0]), value:parseFloat(String(cells[peIx]).replace(/[^\d.\-]/g,'')),
                    me:!!r.is_subject });
      });
    }
  } else if(Array.isArray(f.peers)){
    f.peers.forEach(function(x){ rows.push({ label:S(x.name), value:chNum(x.pe), me:!!x.is_subject }); });
  }
  rows = rows.filter(function(r){ return r.value != null && !isNaN(r.value); });
  if(rows.length < 2) return '';
  return chartPeerBars(rows, { fmt:function(v){ return n(v,1)+'×'; } });
}

/* ==================== INSTITUTIONAL RESEARCH REPORT ====================
   The long-form edition: all 30 research sections at full depth, rendered
   from the same imported payload as every other document. Sections are
   emitted as self-contained blocks and packed into pages by measurement, so
   Gujarati — which runs materially longer than English — paginates itself
   instead of being squeezed or clipped.
   ===================================================================== */
function irSec(no, title, body){
  return '<div class="ir-blk">' + sec(no, title) + body + '</div>';
}
function irNote(t){ return t ? '<div class="note">'+e(t)+'</div>' : ''; }
function irNone(lang){ return '<div class="note mut">'+e(L(lang,'ir_none'))+'</div>'; }
function irList(items){
  if(!items.length) return '';
  return '<ul class="ir-ul">'+items.map(function(x){ return '<li>'+x+'</li>'; }).join('')+'</ul>';
}

/* What could not be verified — the longest list in the report.

   It ran to twenty-odd items set one per full-width line, which spread section
   46 over four pages with three of them mostly blank. Two things fix it: the
   list is set in two columns, which halves its height, and each line is cleaned
   of the payload path the model tends to prefix it with. "deep.quarterly:
   Indian RHPs rarely publish a quarterly split" is a note to a developer, not
   to a reader; the reader wants the sentence. */
function missingList(p, lang, src){
  var rows = arr(src.missing);
  if(!rows.length) return '';
  var clean = function(t){
    t = S(tr(p, lang, t));
    /* a leading dotted path, with or without a trailing colon */
    t = t.replace(/^[a-z_]+(?:\.[a-z_]+){1,4}(?:\[\])?\s*:\s*/i, '');
    /* and a bare field name used as a label */
    t = t.replace(/^[a-z_]{3,}(?:_[a-z]+)+\s*:\s*/i, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  return '<div class="mut" style="margin-top:2mm"><b>' + e(L(lang, 'ir_missing')) + '</b></div>'
    + '<ul class="ir-ul misscols">'
    + rows.map(function(x){ return '<li>' + e(clean(x)) + '</li>'; }).join('')
    + '</ul>';
}

/* ================= THE PACKER, SHARED BY EVERY LONG DOCUMENT =================

   The institutional report reads well because it does not lay itself out on
   fixed pages. Every section is a block; the blocks are poured into page two
   and then drained forward until each page is full, the document grows a fresh
   page when it runs out, and empty shells are removed at the end. That is why
   it has no half-empty pages and one uniform type size throughout.

   The company report and the executive summary were built the other way — one
   section per fixed page shell — which is why a short section left most of a
   page blank and every document set its own type size. This function is that
   machinery, lifted out so all three can share it.

   cfg: { B, TITLES, tocPage, runHead, docName, shellTitle, seedPages, extraCss }
*/
/* Turn a document written as one long run of sections into the blocks the
   packer wants.

   The institutional report was written block-by-block from the start. The
   company report and the executive summary were written as pages, and rewriting
   thirty sections by hand to gain proper pagination would be a large edit with
   nothing to show for it but risk. They emit the same markup, so the blocks can
   be recovered from it: sec() opens every section with a known rule, and a
   group heading always immediately precedes the section it introduces — so a
   heading found at the tail of one piece belongs to the head of the next. */
function blocksFromBody(html){
  var B = [], TITLES = [];
  html = String(html).replace(/<div class="grow"><\/div>/g, '');
  var GRP = /<div class="ir-grp"[\s\S]*?<\/div><\/div>\s*$/;
  var pieces = html.split('<div class="sec">');
  /* anything before the first section belongs with the first one */
  var carry = pieces.shift() || '', seq = 0;
  pieces.forEach(function(piece){
    var full = '<div class="sec">' + piece;
    var g = full.match(GRP), nextCarry = '';
    if(g){ nextCarry = g[0]; full = full.slice(0, full.length - g[0].length); }

    /* a heading carried in from the previous piece opens this block, and also
       opens a group in the contents */
    if(carry && /ir-grp/.test(carry)){
      var ht = carry.match(/<div class="ir-grph">([\s\S]*?)<\/div>/);
      if(ht) TITLES.push({ heading: ht[1].replace(/<[^>]*>/g, '').trim() });
    }
    /* The whole carry opens this block, not just its group heading.

       Only the GRP match was kept, so anything else sitting before a section —
       the opening narrative, a pillar bridge — was silently discarded. The
       comment at the top of this function always said the carry belongs with
       the first section; the code kept one substring of it. A group heading
       still has to come last so the contents can find it, so the remainder is
       emitted first and the heading after it. */
    var head = carry.match(GRP);
    var groupOpen = head ? head[0] : '';
    var rest = head ? carry.slice(0, carry.length - head[0].length) : carry;
    /* A carry of nothing but whitespace is not content. */
    var open = (/\S/.test(rest.replace(/<[^>]*>/g, '')) || /<(svg|table|img)/i.test(rest))
      ? rest + groupOpen : groupOpen;

    var m = full.match(/<span class="no en">([^<]*)<\/span><span class="ti">([^<]*)<\/span>/);
    var title = m ? m[2].trim() : '';
    /* Numbered in the order they survive. The builders carry hard-coded
       numbers, which went stale the moment a section was removed — the
       contents would have read 08, 09, 10, 12. */
    var no = '';
    if(m){
      seq++;
      no = (seq < 10 ? '0' : '') + seq;
      full = full.replace(/<span class="no en">[^<]*<\/span>/, '<span class="no en">' + no + '</span>');
    }
    if(no) TITLES.push({ no: no, title: title });
    B.push('<div class="ir-blk"' + (no ? ' id="s' + no + '"' : '') + '>'
           + open + full + '</div>');
    carry = nextCarry;
  });
  return { B: B, TITLES: TITLES };
}

/* The masthead every long document opens with, without the sections that used
   to be welded to it. Contents follows underneath. */
function coverHead(p, lang, docTitleKey, titleFontPt){
  var m = p.meta || {}, v = p.verdict || {}, sc = v.scores || {}, bands = v.score_bands || {};
  return '<div style="height:3mm"></div>'
    + '<div class="eyebrow en">' + EN(e(L('en', docTitleKey))) + ' &nbsp;·&nbsp; '
      + e(A(lang, m.ipo_type || 'Mainboard')) + ' &nbsp;·&nbsp; ' + e(L(lang, 'india')) + '</div>'
    + '<h1 class="en" style="margin-top:1.5mm;font-size:' + (titleFontPt || 19) + 'pt">'
      + EN(e(m.company || '')) + '</h1>'
    + '<div class="mut" style="margin-top:1mm;font-size:6.2pt">' + sectorHtml(p, lang)
      + (m.sector ? ' &nbsp;·&nbsp; ' : '') + e(dmy(m.analysis_datetime)) + '</div>'
    + provStamp(p, lang)
    + '<div style="height:2.5mm;background:var(--gold);width:26mm;border-radius:1mm;margin:3mm 0 4mm"></div>'
    + '<div class="vb"><div class="h">' + e(L(lang, 'verdict_h')) + '</div><div class="c">'
      + '<div class="v">' + e(pick(p, lang, 'verdict.headline', v.headline)) + '</div>'
      + '<div class="lead" style="margin-top:2mm">'
      + e(pick(p, lang, 'verdict.one_liner', v.one_liner)) + '</div></div></div>'
    + '<div class="tiles" style="margin-top:4mm">'
      + [['ipo_quality','/100'],['long_term','/100'],['listing_gain','/100']].map(function(t){
          return '<div class="tile"><div class="k">' + e(L(lang, t[0])) + '</div><div class="v">'
            + n(sc[t[0]], 1) + '<small>' + t[1] + '</small></div><div class="s">'
            + e(A(lang, bands[t[0]] || bandOf(sc[t[0]]))) + '</div></div>';
        }).join('')
      + gmpTile(p.ipo || {}, lang)
      + '<div class="tile"><div class="k">' + e(L(lang, 'allocation')) + '</div><div class="v">'
        + e(v.allocation_band || '—') + '</div><div class="s">' + e(L(lang, 'of_portfolio'))
        + '</div></div>'
    + '</div>';
}

/* The contents list, with the page number filled in after the blocks settle. */
function tocList(TITLES){
  return '<div class="ir-toc">' + TITLES.map(function(t){
      return t.heading
        ? '<div class="ir-toc-grp">' + e(t.heading) + '</div>'
        : '<a class="ir-toc-row" href="#s' + t.no + '"><span class="en">' + t.no + '</span>'
          + '<b>' + e(t.title) + '</b><i class="ir-toc-pg en" data-for="s' + t.no + '"></i></a>';
    }).join('') + '</div>';
}

function packDoc(p, lang, cfg){
  var B = cfg.B, TITLES = cfg.TITLES;
  /* Two shapes. A long report gives page one entirely to the contents, and the
     blocks start on page two. A short one — the executive summary is four to
     six pages — cannot afford a page of contents, so its masthead sits at the
     top of page one and the blocks begin underneath it. `packFrom` is which
     page the packer starts draining from. */
  var lead = cfg.leadIn ? 1 : 0;
  var shells, first;
  if(lead){
    shells = page(p, 1, 25, cfg.runHead,
      '<div class="ir-lead">' + cfg.leadIn + '</div>'
      + '<div class="ir-box">' + B.join('') + '</div><div class="grow"></div>',
      lang, cfg.docName);
    first = 2;
  } else {
    shells = page(p, 1, 25, cfg.runHead,
      '<div class="ir-toc-page">' + (cfg.tocPage || '') + '</div>'
      + '<div class="ir-toc" data-toc></div><div class="grow"></div>',
      lang, cfg.docName);
    first = 2;
  }
  /* Contents is page one, ahead of the cover, without exception. A reader
     opening a forty-page research document should see what is in it before
     anything else. */
  shells = page(p, 1, 25, cfg.runHead,
      '<div class="ir-toc" data-toc></div><div class="grow"></div>',
      lang, cfg.docName)
    + shells;

  for(var i = first; i <= cfg.seedPages; i++){
    shells += page(p, i, 25, cfg.runHead,
      '<div class="ir-box">' + (!lead && i === 2 ? B.join('') : '') + '</div><div class="grow"></div>',
      lang, cfg.docName);
  }

  var CSS2 = (cfg.extraCss || '')
    /* Prose column beside a figure rail — the layout the reference reports
       use on every body page. The rail is the narrower of the two: a chart
       reads fine at 36% of the measure, a paragraph does not. min-width:0 on
       both is what stops a wide table in the rail from pushing the prose
       column off the page instead of shrinking. */
    + '\n.ir-pair{ display:flex; gap:4.5mm; align-items:flex-start;'
      + ' break-inside:avoid; -webkit-column-break-inside:avoid; }\n'
    + '.ir-pair > .ir-prose{ flex:1 1 60%; min-width:0; }\n'
    + '.ir-pair > .ir-sub, .ir-pair .ir-sub{ margin-bottom:0; }\n'
    + '.ir-pair > .ir-rail{ flex:0 0 36%; min-width:0; }\n'
    + '.ir-pair > .ir-rail > *{ max-width:100%; }\n'
    /* A table built for the full measure does not fit 36% of it. table-layout
       alone is not enough: one long unbroken cell value still pushes the
       column wider than its box, which is how labels ended up outside the
       page edge. The rail's type steps down and long values are allowed to
       break, so the table shrinks instead of the column growing. */
    + '.ir-pair > .ir-rail table{ width:100%; table-layout:fixed; }\n'
    + '.ir-pair > .ir-rail table, .ir-pair > .ir-rail td, .ir-pair > .ir-rail th{'
      + ' font-size:calc(var(--body) - 0.7pt); }\n'
    + '.ir-pair > .ir-rail td, .ir-pair > .ir-rail th{'
      + ' overflow-wrap:anywhere; word-break:break-word; }\n'
    + '.ir-pair > .ir-rail svg{ max-width:100%; height:auto; }\n'
    /* A section's own inner box was sized for the full measure and carries the
       table that would not shrink. Nothing inside the rail may be wider than
       the rail. */
    + '.ir-pair > .ir-rail *{ max-width:100%; }\n'
    + '.ir-pair > .ir-rail .ir-box{ min-width:0; width:100%; }\n'
    + '.ir-pair > .ir-prose > *:first-child{ margin-top:0; }\n'
    + '.ir-pair > .ir-rail > *:first-child{ margin-top:0; }\n'
    /* A row must never be divided by a page break. When one was, the label
       column collapsed to its minimum width and the two halves of the row were
       laid on top of each other — the "Evidence it exists" cell in the moat
       table came out as a column of single letters overlapping the value
       beside it. */
    + '\n.ir-blk tr{ break-inside:avoid; -webkit-column-break-inside:avoid;'
      + ' page-break-inside:avoid; }\n'
    /* A label-and-reading table gets a fixed label column. Without one the
       label column is sized from its content, and a long value squeezes it to
       nothing. */
    + '.ir-blk table.kv{ table-layout:fixed; width:100%; }\n'
    + '.ir-blk table.kv td:first-child, .ir-blk table.kv th:first-child{'
      + ' width:30%; overflow-wrap:anywhere; }\n'
    /* A heading is never the last thing on a page. It used to be left behind
       with its table on the next, which reads as a heading over nothing. */
    + '.ir-blk .sec{ break-after:avoid; -webkit-column-break-after:avoid;'
      + ' page-break-after:avoid; }\n'
    + '\n.storybox{ border:0.6pt solid var(--rule); border-left:3pt solid var(--gold);'
      + ' background:var(--paper2, transparent); padding:3mm 3.5mm; margin:3mm 0 4mm;'
      + ' break-inside:avoid; -webkit-column-break-inside:avoid; }\n'
    + '.storyh{ font-size:8.2pt; font-weight:800; letter-spacing:-.01em; margin-bottom:2mm; }\n'
    + '.storyp{ font-size:var(--body); line-height:var(--bodyline); margin:0 0 2mm; }\n'
    + '.storyp:last-child{ margin-bottom:0; }\n'
    /* The pillar bridge is one line of orientation, not a box competing with
       the pillar heading above it. */
    + '.bridgebox{ margin:0 0 3mm; }\n'
    /* The scenario banner is the one block on the page that must not be
       skimmed past, so it is ruled on all four sides rather than on one. */
    + '.scnban{ border:1.4pt solid var(--gold); padding:2.4mm 3mm; margin:0 0 3.5mm;'
      + ' font-size:var(--body); line-height:var(--bodyline);'
      + ' break-inside:avoid; -webkit-column-break-inside:avoid; }\n'
    + '.scnban table.kv{ margin:2mm 0 1.4mm; }\n'
    + '.scnban .mut{ font-size:6.8pt; }\n'
    + '.bridgebox .storyp{ font-size:var(--body); line-height:var(--bodyline);'
      + ' color:var(--ink3); font-style:italic; }\n'
    + '\n.saybox{ border-left:2.2pt solid var(--gold); padding:1.6mm 0 1.6mm 3mm;'
      + ' margin:2.5mm 0 3mm; break-inside:avoid; -webkit-column-break-inside:avoid; }\n'
    + '.sayh{ font-size:6.6pt; font-weight:800; letter-spacing:.02em; text-transform:uppercase;'
      + ' color:var(--gold); margin-bottom:1mm; }\n'
    + '.sayt{ font-size:var(--body); line-height:var(--bodyline); }\n'
    + '\n.ir-blk{ break-inside:avoid; margin-bottom:4mm; }\n'
    + '.ir-blk:last-child{ margin-bottom:0; }\n'
    + '.ir-blk table{ margin-bottom:1.5mm; font-size:var(--body); }\n'
    + '.ir-blk td{ font-size:var(--body); line-height:var(--bodyline); }\n'
    + '.ir-blk td,.ir-blk th{ padding-top:1.7mm; padding-bottom:1.7mm; }\n'
    + 'body.gu .ir-blk td,body.gu .ir-blk th{ padding-top:1.45mm; padding-bottom:1.45mm; }\n'
    + '.ir-blk .sec{ margin:5mm 0 2.5mm; }\n'
    + '.ir-blk .ti{ font-size:7.8pt; }\n'
    + '.ir-blk .note{ font-size:var(--body); line-height:var(--bodyline); margin-top:2mm; }\n'
    /* Everything a section can put on the page, at one size. The sections were
       written at different times and each set its own, which is why a table on
       one page read smaller than the same table on the next. */
    + '.ir-blk, .ir-blk p, .ir-blk li, .ir-blk .mut, .ir-blk .bar, .ir-blk .chbar,'
      + ' .ir-blk .fig-t, .ir-blk .fig-s, .ir-blk .fig .fig-n, .ir-blk .fig-l,'
      + ' .ir-blk .ir-score, .ir-blk .ir-score td, .ir-blk .sc2row'
      + '{ font-size:var(--body); line-height:var(--bodyline); }\n'
    + '.ir-blk .fig-s, .ir-blk .fig-l{ font-size:calc(var(--body) - 2.4pt); }\n'
    /* A long case runs to several paragraphs. Marking them as blocks the
       packer can divide is what stops one over-long box from being an
       indivisible slab that forces the whole document to be scaled. */
    + '.ir-blk .note p{ margin:0 0 1.8mm; }\n'
    + '.ir-blk .note p:last-child{ margin-bottom:0; }\n'
    + 'body.gu .ir-blk .note{ line-height:1.72; }\n'
    + '.ir-blk .lead{ font-size:var(--body); line-height:var(--bodyline); }\n'
    + '.ir-ul{ margin:2mm 0 2.5mm 5mm; padding:0; }\n'
    + '.ir-ul li{ margin:1.6mm 0; line-height:var(--bodyline); font-size:var(--body); }\n'
    + 'body.gu .ir-ul li{ line-height:1.75; }\n'
    + '.ir-grp{ break-inside:avoid; margin:5mm 0 1mm; }\n'
    + '.ir-grp:first-child{ margin-top:0; }\n'
    + '.ir-grph{ font-size:8.4pt; font-weight:800; letter-spacing:-.01em; color:var(--gold);'
    + ' padding-bottom:2mm; border-bottom:1.6pt solid var(--gold); }\n'
    + 'body.gu .ir-grph{ font-size:7.8pt; }\n'
    + '.ir-sub{ font-size:6.2pt; font-weight:800; color:var(--navy); letter-spacing:.03em;'
    + ' text-transform:uppercase; margin:3.5mm 0 1.5mm; }\n'
    + '.ir-toc{ margin-top:2mm; column-count:2; column-gap:8mm; }\n'
    + '.ir-toc-row{ display:flex; gap:3mm; align-items:baseline; padding:1mm 0;'
    + ' border-bottom:.4pt solid var(--rule); font-size:6.6pt; text-decoration:none; color:inherit;'
    + ' break-inside:avoid; -webkit-column-break-inside:avoid; }\n'
    + '.ir-toc-row span{ color:var(--ink4); font-weight:700; flex:0 0 6.5mm; }\n'
    + '.ir-toc-row b{ flex:1; font-weight:600; }\n'
    + '.ir-toc-row .ir-toc-pg{ font-style:normal; color:var(--ink4); font-weight:700;'
    + ' flex:0 0 6mm; text-align:right; }\n'
    + '.ir-toc.tight{ column-count:3; column-gap:5mm; font-size:6.2pt; }\n'
    + '.ir-toc.tight .ir-toc-row{ break-inside:avoid; padding:.7mm 0; }\n'    + '.ir-toc.tight .ir-toc-row b{ font-size:6.2pt; }\n'    + '.ir-toc-grp{ font-size:6.3pt; font-weight:800; color:var(--gold); letter-spacing:.02em;'
    + ' margin:3mm 0 1mm; padding-bottom:.8mm; border-bottom:1pt solid var(--gold);'
    + ' break-inside:avoid; -webkit-column-break-inside:avoid;'
    /* A group heading must never be the last thing in a column. "Financials"
       sat at the foot of the left column with its six sections at the top of
       the right one, reading as a heading over nothing. break-after keeps it
       with the row it introduces. */
    + ' break-after:avoid; -webkit-column-break-after:avoid; page-break-after:avoid; }\n'
    /* and the row that follows a heading must not be orphaned from it either */
    + '.ir-toc-grp + .ir-toc-row{ break-before:avoid; -webkit-column-break-before:avoid; }\n'
    /* A group heading takes at least two of its entries with it. One
       line under a heading at the foot of a column reads as an orphan:
       the heading belongs at the top of the next column, over the
       points it introduces. */
    + '.ir-toc-grp + .ir-toc-row + .ir-toc-row{ break-before:avoid;'
      + ' -webkit-column-break-before:avoid; }\n'
    + '.misscols{ column-count:2; column-gap:7mm; margin-top:1mm; }\n'
    + '.misscols li{ break-inside:avoid; -webkit-column-break-inside:avoid;'
    + ' margin-bottom:1.1mm; font-size:6.2pt; line-height:1.42; }\n'
    + '.ir-toc-grp:first-child{ margin-top:0; }\n'
    + '.ir-scoreblk{ margin-bottom:2.5mm; }\n'
    + '.ir-scorehd{ display:flex; justify-content:space-between; align-items:baseline;'
    + ' font-size:6.4pt; font-weight:800; color:var(--navy); padding:1.5mm 0 1mm;'
    + ' border-bottom:.8pt solid var(--navy); }\n'
    + '.ir-score{ width:100%; border-collapse:collapse; font-size:6.2pt; }\n'
    + '.ir-score td{ padding:1.3mm 2mm; border-bottom:.4pt solid var(--rule); vertical-align:top; }\n'
    + '.ir-score td.nm{ width:33mm; }\n'
    + '.ir-score td.bar-c{ width:22mm; }\n'
    + '.ir-score td.n{ text-align:right; white-space:nowrap; width:15mm; font-weight:700; }\n'
    + '.ir-score td.n .mx{ color:var(--ink4); font-weight:500; font-size:6.2pt; }\n'
    + '.ir-score .mini{ display:block; height:2.4mm; background:#EEF1F5; border-radius:1.2mm;'
    + ' overflow:hidden; }\n'
    + '.ir-score .mini i{ display:block; height:100%; border-radius:0 1.2mm 1.2mm 0; }\n'
    + '.ir-score tr.tot td{ background:#EAF0F6; font-weight:800; border-bottom:0; }\n'
    /* Gujarati sets taller than English at the same point size, which pushed the
       scoring section onto a third page. Tightening only the scoring tables
       keeps it to the two pages the brief calls for without touching the rest
       of the document. */
    + 'body.gu .ir-score{ font-size:6.3pt; }\n'
    + 'body.gu .ir-score td{ padding:.85mm 1.6mm; line-height:1.42; }\n'
    + 'body.gu .ir-scorehd{ font-size:6.2pt; padding:1mm 0 .7mm; }\n'
    + 'body.gu .ir-scoreblk{ margin-bottom:1.8mm; }\n'
    /* `.body` is a flex column, so a page that fills up shrinks its children
       rather than overflowing. That silently squashed the recommendation box on
       the executive summary's first page to two pixels. Nothing in a packed
       document may shrink: the packer decides what moves, not flexbox. */
    + '.ir-box{ display:block; flex:0 0 auto; }\n'
    + '.ir-lead{ flex:0 0 auto; }\n'
    + '.ir-lead > *{ flex:0 0 auto; }\n';

  var FIT = '<script>(function(){'
    /* Which page the blocks start on: page one for a short document that puts
       its masthead above them, page two for one that gives page one to the
       contents. */
    /* Where the blocks start. This used to be a constant computed from whether
       the document has a masthead — and then a contents page was put in front
       of everything, every index shifted by one, and the packer began reading
       a page that has no .ir-box at all: boxes[i].scrollHeight on null, thrown
       from drain, aborting the pack and leaving the whole report in one box.
       Finding the first page that actually has a box cannot go stale. */
    /* ---- pair pass: prose column beside a figure rail -------------------
       Runs before the packer and changes nothing the packer looks at. Every
       .ir-blk stays exactly one .ir-blk in exactly the same order; some of
       them simply become two columns inside. The packer still works on a flat
       list of blocks in an .ir-box and never learns this happened.

       This is deliberately NOT a second paginator. Writing one of those over
       the top of the working packer is what broke pagination six times: it
       moved blocks out of the boxes the real packer was holding and then read
       scrollHeight off a null. A pre-pass that restructures the inside of a
       block, finishes, and hands the same list onward cannot do that.

       A full-width chart followed by a full-width paragraph wastes a third of
       every page. Beside each other they waste nothing, and the figure sits
       next to the sentence that argues it, which is how the reference reports
       read. */
    /* Each numbered section is a heading plus EITHER a table/chart OR prose,
       never both — so there is nothing to set side by side within one block.
       Pairing therefore joins two adjacent blocks: the prose of one beside the
       exhibit of the next.

       (Once the sections are consolidated into the five pillars, a single
       block will carry its own prose and its own figure, and pairing inside a
       block becomes the better seam. The CSS below serves either.) */
    /* ---- abbreviations -------------------------------------------------
       Financial abbreviations are capitals. They arrive in every case a
       payload or a heading can produce — "Ebitda" from Title Case, "roe" from
       a model writing prose, "Wacc" from a label — and a report that writes
       EBITDA one way in a heading and another in a sentence reads as careless.

       This runs over text nodes only. Touching innerHTML would rewrite tags
       and attributes; a text node cannot damage markup. Whole words only, so
       "Peer" never becomes "PEer" and a company called Roeder is left alone. */
    + 'var ABBR=["EBITDA","EBIT","EPS","PAT","PBT","NII","NIM","CASA","CRAR","CRR","SLR",'
      + '"NPA","GNPA","NNPA","PCR","LCR","NSFR","ECL","AQR","ROE","ROCE","ROIC","ROA",'
      + '"WACC","CAGR","DCF","FCF","FCFF","FCFE","SOTP","CWIP","PEG","TSR","ARPU",'
      + '"TAM","SAM","SOM","ESG","SEBI","RBI","NSE","BSE","IPO","GST","MSME","RAM",'
      + '"FII","DII","ADTV","GDP","USD","INR","UPI","API","ISIN","YoY","QoQ","EV",'
      + '"CET","MOAT"];'
    /* P/E, P/B, EV/EBITDA and D/E carry a slash, so they need their own
       patterns — a word boundary does not survive the slash. */
    + 'var ABBR_SLASH=[["p/e","P/E"],["p/b","P/B"],["d/e","D/E"],["ev/ebitda","EV/EBITDA"],'
      + '["ev/sales","EV/Sales"],["p/bv","P/BV"],["yoy","YoY"],["qoq","QoQ"]];'
    + '(function abbrPass(){'
      /* Tokenise into letter runs, optionally joined by one slash so P/E and
         EV/EBITDA survive as single tokens, and look each token up whole.
         An earlier version built a word-boundary regex from a string and
         emitted "\\b" as a literal backspace character rather than a boundary,
         so it silently matched nothing. Matching maximal letter runs needs no
         escaping and cannot go wrong the same way: a token is only replaced
         when the entire token is an abbreviation, so Roeder is left alone. */
      + 'var up={};'
      + 'ABBR.forEach(function(a){ up[a.toUpperCase()]=a; });'
      + 'ABBR_SLASH.forEach(function(pr){ up[pr[0].toUpperCase()]=pr[1]; });'
      + 'var rx=new RegExp("[A-Za-z]+(?:/[A-Za-z]+)?","g");'
      + 'var walker=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);'
      + 'var nodes=[], nd;'
      + 'while((nd=walker.nextNode())) nodes.push(nd);'
      + 'nodes.forEach(function(t){'
        + 'var pn=t.parentNode; if(!pn) return;'
        + 'var tag=pn.nodeName;'
        + 'if(tag==="SCRIPT"||tag==="STYLE"||tag==="CODE"||tag==="A") return;'
        + 'var v=t.nodeValue; if(!v || v.length>4000) return;'
        + 'var out=v.replace(rx,function(w){ return up[w.toUpperCase()] || w; });'
        + 'if(out!==v) t.nodeValue=out;'
      + '});'
    + '})();'
    /* WHY THIS DOCUMENT IS NOT SET IN TWO COLUMNS.

       The question was asked for the right reason — the reports carry rich
       commentary now, and a reader should not have to cross a 173mm line to
       read it. Measured on the finished documents, the prose runs at a median
       of 125 characters per line and reaches 149, against the 55 to 75
       typography has settled on and the ~90 past which the eye starts losing
       its return to the left margin. That defect is real.

       Four fixes were built and measured, and each was reverted for a reason
       the measurement gave:

         Two-column pages. Prose is 7-10% of these documents by height. The
         other 90% is tables and figures that need the full measure, and a
         7-column financial statement (FY25 through FY31E) crushed to 83mm
         either spills or wraps into something unreadable.

         Two-column prose blocks. Individual paragraphs render 3 to 5 lines
         tall, 8-20mm. Split into two columns that is two stubs of a line and a
         half, which reads worse than one wide paragraph.

         Grouping consecutive prose and columning the run. Only 1 to 2 runs per
         document are long enough to qualify, because prose here is interleaved
         between exhibits rather than continuous. A layout that applies to two
         blocks out of eighteen reads as a mistake, not a design.

         Larger type. From 7.4pt to 9.6pt moves the median only from 125 to 103
         characters, because the cause is the 173mm measure and not the size,
         and it costs two pages.

       What remains is pairPass below: prose in a 60% column beside the exhibit
       it discusses, which is the institutional layout and needs no continuous
       prose to work. It keeps what it can — see __pairStats, which records why
       each candidate was rejected rather than leaving "0 pairs" to be read as
       "nothing to gain". On the current documents most candidates fail because
       the exhibit spills when narrowed, which is a fact about 7-column tables
       rather than something the layout can talk it out of.

       The honest remaining lever is narrowing the text measure itself, leaving
       white space beside prose but not beside exhibits. That changes the look
       of every report, so it is a decision to be taken deliberately rather
       than slipped in under a layout pass. */
    + 'var PAIR_MAX_MM=118;'   /* neither half may be taller than this        */
    + 'var PAIR_MIN_MM=16;'    /* below this, stacking wastes nothing anyway  */
    + '(function pairPass(){'
      + 'var MM=3.7795275591; var W=window;'
      /* .ir-box names two different things: the page's content container, and
         an inner box a section may use for its own content. Selecting all of
         them paired blocks INSIDE a section — which is why this first cost a
         page instead of saving one. The packer takes the first .ir-box in each
         page and nothing else; match that exactly, or the two disagree about
         what a block is. */
      + 'var boxes=[].slice.call(document.querySelectorAll(".page"))'
        + '.map(function(pg){ return pg.querySelector(".ir-box"); })'
        + '.filter(Boolean);'
      + 'boxes.forEach(function(box){'
        + 'var room=box.clientHeight||0;'
        + 'var blks=[].slice.call(box.children).filter(function(n){'
          + 'return n.classList && n.classList.contains("ir-blk"); });'
        + 'var i=0;'
        + 'while(i < blks.length-1){'
          + 'var a=blks[i], b=blks[i+1];'
          + 'var ha=a.getBoundingClientRect().height, hb=b.getBoundingClientRect().height;'
          /* An exhibit is a table or a chart; prose is anything without one.
             Pair only prose with exhibit, so two tables never end up side by
             side reading as one wider table. */
          + 'var ea=!!a.querySelector("table,.fig,svg"), eb=!!b.querySelector("table,.fig,svg");'
          + 'var ok = (ea!==eb)'
            + ' && ha>PAIR_MIN_MM*MM && hb>PAIR_MIN_MM*MM'
            + ' && ha<PAIR_MAX_MM*MM && hb<PAIR_MAX_MM*MM'
            + ' && (room ? Math.max(ha,hb) < room : true);'
          + 'if(!ok){ i++; continue; }'
          /* The pair becomes the block. The two originals stop being blocks —
             otherwise the packer would count three where there is one, and
             move a half out from under its own container. Their ids survive
             so the contents page still links to them. */
          + 'var pair=document.createElement("div");'
          + 'pair.className="ir-blk ir-pair";'
          + 'box.insertBefore(pair,a);'
          + 'var ca=document.createElement("div"); ca.className=ea?"ir-rail":"ir-prose";'
          + 'var cb=document.createElement("div"); cb.className=eb?"ir-rail":"ir-prose";'
          + 'a.classList.remove("ir-blk"); a.classList.add("ir-sub");'
          + 'b.classList.remove("ir-blk"); b.classList.add("ir-sub");'
          + 'ca.appendChild(a); cb.appendChild(b);'
          /* Prose always on the left, exhibit always on the right: a rail that
             swaps sides page to page reads as a mistake. */
          + 'if(ea){ pair.appendChild(cb); pair.appendChild(ca); }'
          + 'else   { pair.appendChild(ca); pair.appendChild(cb); }'
          /* If the pair somehow exceeds the page it must sit on, undo it — the
             packer moves whole blocks and could not divide this one. */
          /* Not everything survives being narrowed. Some exhibits hold content
             with a hard minimum width — a bar with a fixed track, a cell whose
             value cannot be broken — and in the rail they spill sideways out
             of the column. Clipping them would hide data, which is the defect
             this whole layout exists to avoid, so such a block simply does not
             get paired and keeps the full measure. */
          + 'var spills=false;'
          + '[ca,cb].forEach(function(col){'
            + 'if(col.scrollWidth > col.clientWidth+2){ spills=true; return; }'
            + 'var kids=col.querySelectorAll("*");'
            + 'for(var q=0;q<kids.length;q++){'
              + 'if(kids[q].scrollWidth > col.clientWidth+2){ spills=true; return; }'
            + '}'
          + '});'
          /* The point of pairing is to use less vertical space. It does not
             always: narrowing a table to 36% of the measure can make it far
             taller than it was, and max(prose', table') then exceeds what the
             two cost stacked at full width. So compare the two directly and
             keep the arrangement that is actually shorter. Without this the
             sector report grew from 6 pages to 7. */
          + 'var stacked=ha+hb;'
          + 'var paired=pair.getBoundingClientRect().height;'
          /* Why a candidate was rejected, kept on the document. Pairing that
             silently produces nothing is indistinguishable from pairing that
             is switched off, and for a long time the two were confused here:
             the layout was reported as "0 pairs, 99% fill" and read as "there
             is nothing to gain", when what it actually meant was unknown. */
          + 'W.__pairStats=W.__pairStats||{candidates:0,spill:0,taller:0,noRoom:0,kept:0};'
          + 'W.__pairStats.candidates++;'
          + 'if(spills) W.__pairStats.spill++;'
          + 'else if(paired >= stacked) W.__pairStats.taller++;'
          + 'else if(room && paired > room) W.__pairStats.noRoom++;'
          + 'else W.__pairStats.kept++;'
          + 'if(spills || paired >= stacked || (room && paired > room)){'
            + 'a.classList.add("ir-blk"); a.classList.remove("ir-sub");'
            + 'b.classList.add("ir-blk"); b.classList.remove("ir-sub");'
            + 'box.insertBefore(a,pair); box.insertBefore(b,pair);'
            + 'box.removeChild(pair); i++; continue;'
          + '}'
          + 'i+=2;'
        + '}'
      + '});'
    + '})();'
    + 'var PACKFROM=(function(){'
      + 'var all=document.querySelectorAll(".page");'
      + 'for(var i=0;i<all.length;i++){ if(all[i].querySelector(".ir-box")) return i; }'
      + 'return 0; })();'
    /* This document packs itself; the generic guard must not scale it again. */
    + 'document.body.setAttribute("data-fitted","1");'
    + 'var ps=[].slice.call(document.querySelectorAll(".page")).slice(PACKFROM);'
    + 'ps=ps.filter(function(el){ return !!el.querySelector(".ir-box"); });'
    + 'var boxes=ps.map(function(el){ return el.querySelector(".ir-box"); });'
    /* On a page that carries a masthead above the blocks, the space the blocks
       may use is what is left under it — not the whole page. Measuring the
       whole page is why the executive summary's first page ran 263px past its
       own footer. */
    + 'function avail(el){ var bd=el.querySelector(".body"), ld=el.querySelector(".ir-lead");'
      + ' return bd.clientHeight - 4 - (ld ? ld.offsetHeight : 0); }'
    /* Move whatever will not fit on page i onto page i+1. A block taller than a
       whole page is divided at its own child boundaries rather than being left
       to spill, so a long table continues instead of losing its tail. */
    /* Every table's column proportions, measured once while the document is
       still whole. A table that is later divided has both halves set to
       these, so the columns of a continued table run straight down the
       page instead of each half choosing its own from its own rows. */
    + 'document.querySelectorAll(".ir-box table").forEach(function(t){'
      + 'var r=t.rows && t.rows[0]; if(!r) return;'
      + 'var tw=t.getBoundingClientRect().width || 1, ws=[], i=0;'
      + 'for(i=0;i<r.cells.length;i++)'
        + 'ws.push((r.cells[i].getBoundingClientRect().width/tw*100).toFixed(3));'
      + 't.setAttribute("data-cols", ws.join(","));'
    + '});'
    + 'var CUT=0;'
    + 'function cut(only, i, A){'
        /* Descend to the deepest node that still has something to divide. A
           block reduced to a single long note — a bull or bear case that runs
           past a page on its own — has one child at the top level and its
           paragraphs one level down. Stopping at the top level is what left
           such a block indivisible, and an indivisible block is what forces
           the whole document to be scaled. */
      + 'var host=only, depth=0;'
      + 'while(host.children.length===1 && depth++<6) host=host.children[0];'
        /* Never part a heading from what it introduces: the leading
           section and group headings, plus one element of content, stay
           on this page or the block does not divide here at all. */
      + 'var keep=1, kk=0;'
      + 'for(kk=0;kk<host.children.length;kk++){'
        + 'var kc=" "+host.children[kk].className+" ";'
        + 'if(kc.indexOf(" sec ")>=0 || kc.indexOf(" ir-grp ")>=0) keep=kk+2; else break; }'
        /* A section that is a heading and one long table has nothing to
           divide at this level. Go down into the table and continue it
           by the row instead, leaving at least two rows under the
           heading so the first half is a table and not a stub. */
        /* A long table is continued by the row rather than moved away
           whole. Taking the table off the page would leave the section
           heading standing over nothing, which is what emptied
           "Products and services" of its rows; two rows stay behind so
           the first half is a table and not a stub. */
      /* Only go into a table when the block has nothing else to give. A
         section built as heading + table + two figures + a note used to be
         divided by table row alone, so the figures stayed welded to the
         heading and the block overflowed its page however many rows were
         carried away. Whole children come off the end first; the table is
         continued by the row only once it is the last thing left. */
      + 'var tail=host.children[host.children.length-1], rows=null;'
      /* A table is a table however many colgroups and heads sit in front
         of its body: divide it by the row, never by moving the whole body
         away and leaving the header standing over nothing. */
      + 'if(host.tagName==="TABLE"){'
        + 'var bs0=host.tBodies;'
        + 'if(bs0 && bs0.length && bs0[bs0.length-1].rows.length>=2) rows=bs0[bs0.length-1];'
      + '}'
      + 'else if(tail && host.children.length<=keep+1){'
        /* pinCols puts a <colgroup> in front of the body, so a continuation
           that is one table stops being a single-child chain and the descent
           lands on the TABLE with two children. Recognise the body itself
           here, or a re-pinned table can never be divided again. */
        + 'var tb=tail.tagName==="TABLE" ? tail'
          + ' : (tail.tagName==="TBODY" ? tail.parentNode : tail.querySelector("table"));'
        + 'if(tb){ var bodies=tb.tBodies; if(bodies && bodies.length && bodies[0].rows.length>=2)'
          + 'rows=bodies[0]; }'
      + '}'
      /* Two rows stay behind so the half left above is a table and not a
         stub — but a continuation carries no header of its own, so one row
         is a whole answer there. Insisting on two is what left a 1,186px
         continuation undividable and sent the whole document to the scale
         guard. */
      + 'if(rows){ host=rows; keep=only.hasAttribute("data-cont") ? 1 : 2; }'
      + 'else if(host.children.length<=keep){'
        + 'var h2=host.children[host.children.length-1], d2=0;'
        + 'while(h2 && h2.children.length && h2.children.length<2 && d2++<4)'
          + 'h2=h2.children[h2.children.length-1];'
        + 'if(!h2 || h2.children.length<2) return false;'
        + 'host=h2; keep=1;'
      + '}'
        /* Rebuild the ancestors so the continuation keeps its box, its colour
           and its type — the carried half must not look like a different
           element from the half above it. The id is dropped: it anchors the
           contents entry and must stay on the first half only. */
      + 'var hadRows=only.querySelectorAll("table tr").length;'
      + 'var carry=only.cloneNode(false); carry.removeAttribute("id");'
      + 'var cid="c"+(CUT++);'
      + 'only.setAttribute("data-cutid", cid);'
      + 'carry.setAttribute("data-cont", cid);'
      + 'var path=[], node=host;'
      + 'while(node!==only){ path.unshift(node); node=node.parentNode; }'
      + 'var cur=carry;'
      + 'path.forEach(function(el){ var c=el.cloneNode(false);'
        + 'c.removeAttribute("id"); cur.appendChild(c); cur=c; });'
      + 'var g3=0;'
      + 'while(boxes[i].scrollHeight>A-8 && host.children.length>keep && g3++<400){'
        + 'cur.insertBefore(host.children[host.children.length-1], cur.firstChild); }'
        /* Nothing moved, or the heading was left stranded: put the block back
           together and let the caller move it forward whole. */
        /* The half left behind has to read as the section it is titled
           as: a table that kept at least its header and two rows, or
           failing that a dozen words of prose. A heading over an empty
           space is worse than a page that ends early, so a cut that
           produces one is put back and the block moves forward whole. */
      + 'var kept=only.querySelectorAll("table tr").length;'
      + 'var words=(only.innerText||"").trim().split(/\\s+/).length;'
      /* A continuation carries no heading and no table header, so one row
         left on the page is a complete thing to read. Judging it by the
         two-row rule meant for a first half is what reverted the Sources
         cut and left the page fifteen pixels over. */
      + 'var minKeep=only.hasAttribute("data-cont") ? 1 : 2;'
      + 'var thin=(hadRows>=2 && kept<minKeep ? words<25 : words<12);'
      /* Moving whole children was not enough and it has taken the table
         with it. Continue the table by the row instead: the rows lead the
         continuation, so a note that followed the table still follows it
         on the page below. */
      /* Moving whole children was not enough, or it took the section's
         table with it. Continue the longest run of like things instead —
         table rows, tile grids, bullet lists — by cloning the ancestors
         down to it and carrying its tail. The continued run leads the next
         page, so a note that followed it still follows it. */
      + 'var pick=null, cRun=null, cTop=null;'
      + 'if(thin || boxes[i].scrollHeight>A){'
        + 'var cands=only.querySelectorAll("tbody,.grid4,.grid3,.grid2,ul,ol"), qi=0;'
        + 'for(qi=cands.length-1;qi>=0;qi--){'
          + 'if(cands[qi].children.length>=2 && !cur.contains(cands[qi])){ pick=cands[qi]; break; } }'
        + 'if(pick){'
          /* measured before anything moves: once rows leave, the columns
             the measurement preserves have already changed */
          + 'var pinTbl=(pick.tagName==="TBODY") ? pick.parentNode : null;'
          + 'var pinW=pinTbl ? colWidths(pinTbl) : null;'
          + 'var pth=[], nd=pick;'
          + 'while(nd && nd!==only){ pth.unshift(nd); nd=nd.parentNode; }'
          + 'var c2=null, ci2=0;'
          + 'for(ci2=0;ci2<pth.length;ci2++){'
            + 'var cc=pth[ci2].cloneNode(false); cc.removeAttribute("id");'
            + 'if(ci2===0){ cTop=cc; cur.insertBefore(cc, cur.firstChild); }'
            + 'else c2.appendChild(cc);'
            + 'c2=cc; }'
          + 'cRun=c2;'
          + 'var g8=0;'
          + 'var pmin=1;'
      + 'while(boxes[i].scrollHeight>A-8 && pick.children.length>pmin && g8++<400){'
            + 'cRun.insertBefore(pick.children[pick.children.length-1], cRun.firstChild); }'
          + 'kept=only.querySelectorAll("table tr").length;'
          + 'thin=(hadRows>=2 ? kept<minKeep'
            + ' : (only.innerText||"").trim().split(/\\s+/).length<12);'
        + '}'
      + '}'
      + 'if(!cur.children.length || boxes[i].scrollHeight>A || thin){'
        + 'if(cRun && pick){ while(cRun.children.length) pick.appendChild(cRun.children[0]); }'
        + 'if(cTop && cTop.parentNode) cTop.parentNode.removeChild(cTop);'
        + 'while(cur.firstChild) host.appendChild(cur.firstChild);'
        + 'return false;'
      + '}'
      + 'if(typeof pinTbl!=="undefined" && pinTbl && pinW){ pinCols(pinTbl, pinW);'
        + 'if(cRun && cRun.parentNode) pinCols(cRun.parentNode, pinW); }'
      + 'boxes[i+1].insertBefore(carry, boxes[i+1].firstChild);'
        /* A table that loses rows re-lays out: its columns get narrower,
           its remaining rows wrap onto fewer lines, and the half left
           behind ends up shorter than it was measured to be. That is what
           left a two-line remnant alone on a page of its own. Hand rows
           back one at a time for as long as they still fit. */
      + 'var g4=0;'
      + 'while(cur.firstChild && g4++<400){'
        + 'host.appendChild(cur.firstChild);'
        + 'if(boxes[i].scrollHeight>A){ cur.insertBefore(host.children[host.children.length-1], cur.firstChild); break; }'
      + '}'
      + 'if(!cur.children.length) carry.parentNode.removeChild(carry);'
      + 'return true;'
    + '}'
    + 'function drain(i){'
      + 'var A=avail(ps[i]), guard=0;'
      /* Divide one block at its own child boundaries: leave as much of it on
         this page as fits, carry the rest onto the next. Answers false when the
         block will not divide usefully — nothing to divide, or the first half
         would be reduced to a heading standing on its own, which reads worse
         than a short page. */
      + 'while(boxes[i].scrollHeight>A && guard++<600){'
        + 'var kids=boxes[i].querySelectorAll(".ir-blk");'
        + 'if(!kids.length) return false;'
        + 'var last=kids[kids.length-1];'
        + 'if(kids.length===1){'
          + 'if(!cut(last, i, A)) return false;'
          + 'continue;'
        + '}'
        /* More than one block on the page. Moving the last one forward whole is
           the safe answer, and it is also what left a third of a page empty
           beneath a section that was only slightly too long. Divide it instead
           when the space that would go to waste is worth a division, and fall
           back to moving it whole when it will not divide. */
        + 'var free=A-(boxes[i].scrollHeight-last.offsetHeight);'
        + 'if(free>=110 && cut(last, i, A)) continue;'
        + 'boxes[i+1].insertBefore(last, boxes[i+1].firstChild);'
      + '}'
      + 'return boxes[i].scrollHeight<=A;'
    + '}'
    /* One sweep: push every page's overflow forward, then grow the document
       if the last page still has more than it can hold. */
    + 'function sweep(){'
      + 'for(var i=0;i<ps.length-1;i++) drain(i);'
      + 'var grow=0;'
      + 'while(boxes[boxes.length-1].scrollHeight>avail(ps[ps.length-1]) && grow++<40){'
        + 'var lastPg=ps[ps.length-1];'
        + 'var np=lastPg.cloneNode(true);'
        + 'var nb=np.querySelector(".ir-box");'
        + 'if(!nb) break;'
        + 'while(nb.firstChild) nb.removeChild(nb.firstChild);'
        + 'lastPg.parentNode.insertBefore(np, lastPg.nextSibling);'
        + 'ps.push(np); boxes.push(nb);'
        + 'if(!drain(ps.length-2)) break;'
      + '}'
    + '}'
    + 'sweep();'
    /* Grow the document rather than squeeze it. The shells are written before
       anything is measured, so a payload with more prose than usual can fill
       every one of them and still have blocks left over — and `.page` is
       overflow:hidden, which means the surplus does not merely look bad, it is
       gone from the PDF without a trace. A fresh shell is cloned from the last
       one and the overflow drains into it, as many times as it takes. */

    /* A settling pass. Dividing a block changes the width its table columns
       get, so the half left behind can measure shorter after the fact than
       it did at the moment of the cut — which is how a two-line remnant
       ended up alone on a page of its own. Walk forward once more and hand
       a whole block back whenever the page above turns out to have room
       for it. Only whole blocks move, so no heading is ever parted from
       what it introduces. */
    /* One more pass, now that every page is settled. drain only ever
       moves work forward, so a page that ended up with room to spare —
       because the block below it was measured before the tables above
       re-laid themselves out — kept that room. Pull the next opener up,
       whole if it fits and divided if it does not. */
    /* Settling and sweeping are two halves of the same job and each creates
       work for the other: pulling a block up leaves a continuation that may
       itself overrun, and pushing overflow forward leaves room above. Running
       settle once and stopping is what left four pages overflowing into the
       scale guard, which then shrank the whole document to 84 per cent. */
    + 'for(var round=0;round<4;round++){'
    + 'for(var s2=0;s2<boxes.length-1;s2++){'
      + 'var Av2=avail(ps[s2]), g7=0;'
      + 'while(boxes[s2+1].firstElementChild && g7++<20){'
        + 'var nb2=boxes[s2+1].firstElementChild;'
        + 'boxes[s2].appendChild(nb2);'
        + 'if(boxes[s2].scrollHeight<=Av2) continue;'
        + 'if(cut(nb2, s2, Av2)) break;'
        + 'boxes[s2+1].insertBefore(nb2, boxes[s2+1].firstChild); break;'
      + '}'
    + '}'
    + 'sweep();'
    + '}'
    /* A table divided across a page break lays each half out on its own, so
       the halves choose different column widths from their own contents:
       "Products and services" put revenue share and margin profile in one
       place for its first three rows and somewhere else for the other five.
       Both halves get the widths the whole table had before it was cut. */
    + 'function pinCols(tbl, ws){'
      + 'if(!tbl || !ws || !ws.length) return;'
      /* querySelector reaches into nested tables, and removing a colgroup that
         belongs to one of those throws — which aborted the whole packer and
         left twenty empty shells in the document. */
      + 'var og=tbl.querySelector("colgroup");'
      + 'if(og && og.parentNode===tbl) tbl.removeChild(og);'
      + 'var cg=document.createElement("colgroup");'
      /* proportions, not pixels: a continuation can sit inside a container of
         a different width — a scaled page, for one — and a pixel width
         pinned from the other half would not fit it */
      + 'ws.forEach(function(w){ var c=document.createElement("col");'
        + 'c.style.width=w.toFixed(3)+"%"; cg.appendChild(c); });'
      + 'tbl.insertBefore(cg, tbl.firstChild);'
      + 'tbl.style.tableLayout="fixed";'
    + '}'
    + 'function colWidths(tbl){'
      + 'var r=tbl.rows && tbl.rows[0]; if(!r) return null;'
      + 'var tw=tbl.getBoundingClientRect().width || 1;'
      + 'var ws=[], i=0;'
      + 'for(i=0;i<r.cells.length;i++)'
        + 'ws.push(r.cells[i].getBoundingClientRect().width / tw * 100);'
      + 'return ws;'
    + '}'
    + 'function deep(el){ var h=el, d=0;'
      + 'while(h && h.children.length===1 && d++<6) h=h.children[0]; return h; }'
    + 'for(var s1=0;s1<boxes.length-1;s1++){'
      + 'var Av=avail(ps[s1]), g5=0;'
      /* First, whole blocks: if the page above turns out to have room for
         the next page opener, it belongs there. */
      + 'while(boxes[s1+1].firstChild && g5++<60){'
        + 'var head=boxes[s1+1].firstChild;'
        + 'boxes[s1].appendChild(head);'
        + 'if(boxes[s1].scrollHeight>Av){'
          + 'boxes[s1+1].insertBefore(head, boxes[s1+1].firstChild); break; }'
      + '}'
      /* Then rows: where a divided block continues across the break, the
         two halves have the same shape, and the cut was measured before
         the table re-laid itself out. Hand rows back one at a time for as
         long as they fit — this is what stops a table from leaving two
         lines stranded on a page of their own. */
      + 'var prev=boxes[s1].lastElementChild, next=boxes[s1+1].firstElementChild;'
      + 'if(!prev || !next) continue;'
      + 'var cont=next.getAttribute("data-cont");'
      + 'if(!cont || prev.getAttribute("data-cutid")!==cont) continue;'
      + 'var nh=deep(next), ph=deep(prev);'
      + 'if(!nh || !nh.children.length) continue;'
      + 'if(!ph || ph.tagName!==nh.tagName || ph.className!==nh.className){'
        + 'ph=null;'
        + 'var cands=prev.querySelectorAll(nh.tagName);'
        + 'for(var ci=cands.length-1;ci>=0;ci--){'
          + 'if(cands[ci].className===nh.className){ ph=cands[ci]; break; } }'
      + '}'
      + 'if(!ph) continue;'
      + 'var g6=0;'
      + 'while(nh.children.length && g6++<200){'
        + 'var row=nh.children[0];'
        + 'ph.appendChild(row);'
        + 'if(boxes[s1].scrollHeight>Av){ nh.insertBefore(row, nh.firstChild); break; }'
      + '}'
      + 'if(!nh.children.length) boxes[s1+1].removeChild(next);'
    + '}'
    /* Every table that ends up divided, however it was divided, is given one
       set of column widths across both halves. A table lays itself out from
       its own contents, so the five rows that carried over used to choose
       different columns from the three left behind, and the section read as
       two tables that had drifted apart. */
    /* Pinning a divided table's columns changes how its rows wrap, so the
       halves settle to heights nobody measured. Pin, sweep the new heights
       forward, then pin again — otherwise a page ends fifteen pixels over
       and the scale guard shrinks the whole document for it. */
    + 'function pinAll(){'
      + 'document.querySelectorAll("[data-cont]").forEach(function(c){'
      + 'var cid=c.getAttribute("data-cont");'
      + 'var first=document.querySelector("[data-cutid=\\""+cid+"\\"]");'
      + 'if(!first) return;'
      /* the half above may hold several tables; the one that continues is
         its last, and it continues into the first table below */
      + 'var ts=first.querySelectorAll("table");'
      + 'var t1=ts.length ? ts[ts.length-1] : null, t2=c.querySelector("table");'
      + 'if(!t1 || !t2 || !t1.rows.length || !t2.rows.length) return;'
      + 'if(t1.rows[0].cells.length!==t2.rows[0].cells.length) return;'
      + 'var stored=t1.getAttribute("data-cols") || t2.getAttribute("data-cols");'
      + 'var ws=stored ? stored.split(",").map(Number) : colWidths(t1);'
      + 'if(!ws || !ws.length) return;'
      + 'pinCols(t1, ws); pinCols(t2, ws);'
      + '});'
    + '}'
    + 'for(var pz=0;pz<4;pz++){ pinAll(); sweep(); }'
    + 'for(var j=ps.length-1;j>=0;j--){'
      + 'if(!boxes[j].children.length) ps[j].parentNode.removeChild(ps[j]);'
    + '}'
    + 'var live=[].slice.call(document.querySelectorAll(".page"));'
    + 'for(var k=0;k<live.length;k++){'
      + 'var t=live[k].querySelector(".pgtot"); if(t) t.textContent=live.length;'
      + 'var nm=live[k].querySelector(".pgnum"); if(nm) nm.textContent=(k+1);'
    + '}'
    /* Last resort, for the one block that is taller than a page and cannot be
       divided. transform:scale is used rather than zoom because html2canvas
       reproduces transform faithfully and zoom corrupts Gujarati advance
       widths. Nothing should reach this now, but overflow:hidden means a page
       that does would lose text silently, so the guard stays. */
    /* ONE factor for the whole document, not one per page. Scaling each page by
       whatever it happened to need is what made type sizes differ from page to
       page — the tightest page sets the factor and every page uses it, so the
       document reads as one document. */
    /* Page 1 carries the contents rather than an .ir-box, so it was outside the
       packer entirely — and a contents list one line too long ran into the
       footer. Every page now offers something scalable: its .ir-box where it has
       one, and otherwise its body content wrapped for the purpose. */
    + 'function target(pg){'
      + 'var bd=pg.querySelector(".body"); if(!bd) return null;'
      + 'var box=bd.querySelector(".ir-box");'
      + 'if(box) return box;'
      + 'if(bd.children.length===1 && bd.firstElementChild.className==="ir-fitwrap")'
        + 'return bd.firstElementChild;'
      + 'var w=document.createElement("div"); w.className="ir-fitwrap";'
      + 'while(bd.firstChild) w.appendChild(bd.firstChild);'
      + 'bd.appendChild(w); return w;'
    + '}'
    /* The Gujarati contents runs longer than the English one and can
       overflow the opening page by a line or two. Setting it in two
       columns costs nothing; scaling the document to fit it would
       shrink the type on all twenty-odd pages for the sake of one. */
    + 'var toc0=document.querySelector(".ir-toc");'
    + 'if(toc0){ var tb=toc0.parentNode;'
      + 'while(tb && tb.className.indexOf("body")<0) tb=tb.parentNode;'
      + 'if(tb && tb.scrollHeight>tb.clientHeight+4) toc0.className+=" tight"; }'
    /* One factor for the whole document is right when several pages are tight:
       a report whose type steps down and up again reads as two documents. It
       is wrong when a single block — one table row of prose that is taller
       than a page and cannot be divided anywhere — is the only thing over the
       line, because then thirty-five pages are shrunk to rescue one. Up to two
       outliers are scaled where they sit; beyond that the old single factor
       still applies. */
    + 'var tight=[];'
    + 'live.forEach(function(pg){'
      + 'var bd=pg.querySelector(".body"); if(!bd) return;'
      + 'var box=target(pg); if(!box) return;'
      + 'var A=bd.clientHeight-2;'
      + 'if(box.scrollHeight<=A) return;'
      + 'tight.push({ pg:pg, z:A/box.scrollHeight });'
    + '});'
    + 'if(tight.length){'
      + 'var zMin=1, t2=0;'
      + 'for(t2=0;t2<tight.length;t2++) zMin=Math.min(zMin, tight[t2].z);'
      + 'var wide=tight.length>2;'
      + 'var plan=[];'
      + 'if(wide){ live.forEach(function(pg){ plan.push({ pg:pg, z:zMin }); }); }'
      + 'else { tight.forEach(function(t){ plan.push({ pg:t.pg, z:t.z }); }); }'
      + 'plan.forEach(function(t){'
        + 'var z=Math.max(0.35, Math.floor(t.z*1000)/1000);'
        + 'if(z>=0.999) return;'
        + 'var bd=t.pg.querySelector(".body"); if(!bd) return;'
        + 'var box=target(t.pg); if(!box) return;'
        + 'var A=bd.clientHeight-2;'
        + 'var wrap=document.createElement("div");'
        + 'wrap.style.cssText="height:"+A+"px;overflow:hidden";'
        + 'box.parentNode.insertBefore(wrap, box); wrap.appendChild(box);'
        + 'box.style.width=(100/z)+"%";'
        + 'box.style.transformOrigin="top left";'
        + 'box.style.transform="scale("+z+")";'
      + '});'
    + '}'
    /* Fill the contents with the page each section actually landed on. The
       packing above decides that, so it cannot be known when the HTML is
       written — it has to be measured here, after the blocks have settled. */
    + 'live.forEach(function(pg, idx){'
      + 'pg.querySelectorAll("[id^=s]").forEach(function(el){'
        + 'var cell=document.querySelector(\'.ir-toc-pg[data-for="\'+el.id+\'"]\');'
        + 'if(cell) cell.textContent=(idx+1);'
      + '});'
    + '});'
    + '})();<\/script>';

  return shell(cfg.shellTitle, '', shells, CSS2)
    .replace('<!--FIT-->', FIT);
}

function buildSector(p, lang){
  lang = lang || 'en';
  var rep = eqRep(p), run = rep.run || {}, cts = rep.counts || {};
  var top = arr(rep.top3);
  var out = '';
  var no = 0;
  function S2(title){ no += 1; return sec(no < 10 ? '0' + no : String(no), title); }

  var leadIn = eqCover(p, lang, 'Sector Research Report', 19);
  if(window.EQCharts) window.EQCharts.resetFigures();

  /* The argument in pictures, before any prose. Every report in the reference
     set opens this way, and it is the most efficient page in the document. */
  var focus = focusPage(p, null);
  if(focus) out += S2('Focus charts') + focus;

  /* ---------------- the mandate ---------------- */
  out += S2('The mandate')
    + '<div class="lead"><p>' + e(eqTitle(p)) + ', over a holding horizon of '
      + e(S(run.horizon)) + '. The Indian listed universe was screened for this sector; '
      + (cts.universe || 0) + ' companies were taken to full analysis and '
      + (cts.top3Eligible || 0) + ' cleared the kill switch.</p></div>'
    + (S(run.researchNotes) ? '<div class="note">' + e(S(run.researchNotes)) + '</div>' : '')
    + tbl(['Measure','Value'], [
        { cells:['Methodology version', e(S(run.methodologyVersion))] },
        { cells:['Payload schema', e(S(run.payloadSchemaVersion))] },
        { cells:['Research gathered', e(dmy(run.payloadGeneratedAt))] },
        { cells:['Report built', e(dmy(run.reportBuiltAt))] },
        { cells:['Searches recorded', run.searchesRun == null
            ? '<span class="mut">not stated</span>' : n(run.searchesRun,0)] },
        { cells:['Ranking noise band', (run.noiseBand || 3) + ' points'] }
      ], { num:[1] });

  /* ---------------- the world ----------------
     Every reference report establishes why the industry compounds before it
     names a company. The sector is the argument; the companies express it. */
  out += S2('The world') + eqWorld(p, lang);

  /* ---------------- India: macro and policy ---------------- */
  out += S2('Where India is in the cycle') + eqMacro(p, lang);
  out += S2('The Union Budget and the Economic Survey') + eqBudget(p, lang);
  out += S2('Policy') + eqPolicy(p, lang);
  out += S2('Regulation') + eqRegulation(p, lang);
  out += S2('Geopolitics and supply chains') + eqGeopolitics(p, lang);

  /* ---------------- the industry ---------------- */
  out += S2('Industry structure and cycle') + eqIndustry(p, lang);
  out += S2('The value chain') + eqValueChain(p, lang);
  out += S2('Market size') + eqTam(p, lang);
  out += S2('Programmes, contracts and the order pipeline') + eqPrograms(p, lang);
  out += S2('Competition') + eqCompetition(p, lang);
  var sv = eqSectorValuation(p, lang);
  if(sv) out += S2('Where the sector trades') + sv;

  var rotC = eqRotation(p, lang);
  if(rotC) out += S2('Where capital has moved') + rotC;

  /* ---------------- the leading companies in full ---------------- */
  var coverage = eqCovered(rep);
  top = coverage.list;
  if(top.length) out += S2(coverage.allBarred ? 'The leading companies' : 'The Top 3')
    + eqBarredBanner(coverage);
  top.forEach(function(c){
    out += S2((S(c.name) || S(c.symbol)) + ' — snapshot') + eqSnapshot(c, lang);
    out += S2((S(c.name) || S(c.symbol)) + ' — the case');
    if(arr(c.theses).length) out += eqTheses(c, lang);
    else if(arr(c.thesis).length) out += '<div class="lead">'
      + arr(c.thesis).map(function(t){ return '<p style="margin-bottom:1.6mm">' + e(S(t)) + '</p>'; }).join('')
      + '</div>';
    if(S(c.business)) out += '<p>' + e(S(c.business)) + '</p>';
    out += tbl(['Model','Score','Coverage'],
        ['businessQuality','growthMultibagger','valuationOpportunity','riskQuality'].map(function(k){
          var pl = (window.EQ && window.EQ.scoring.PILLARS[k]) || { label:k };
          var s2 = c.pillars && c.pillars[k];
          return { cells:[e(pl.label), '<b>' + eqNum(s2 && s2.score) + '</b>',
            s2 && s2.coverage != null ? Math.round(s2.coverage*100) + '%' : '&mdash;'] };
        }).concat([{ __cls:'tot', cells:['<b>Overall</b>',
          '<b>' + eqNum(c.overall && c.overall.score) + '</b>',
          c.overall && c.overall.coverage != null ? Math.round(c.overall.coverage*100) + '%' : '&mdash;'] }]),
        { num:[1,2] });

    var mo = c.model;
    if(mo && mo.model && mo.model.available){
      var m2 = mo.model;
      out += S2((S(c.symbol)) + ' — forecast')
        + figForecast(c)
        + tbl(['Year','Revenue','EBITDA','Margin','PAT','EPS diluted','FCFF'],
            arr(m2.years).map(function(y){
              return { cells:['<span class="en">' + y.year + '</span>', n(y.revenue,0), n(y.ebitda,0),
                n(y.ebitdaMargin,1) + '%', n(y.pat,0), n(y.epsDiluted,2), n(y.fcff,0)] };
            }), { num:[1,2,3,4,5,6] })
        + '<div class="mut" style="margin-top:1.5mm">'
          + eqReconLine(m2)
          + ' Revenue compounds at ' + (m2.summary && m2.summary.revenueCagr != null
              ? n(m2.summary.revenueCagr,1) + '%' : 'an unstated rate')
          + '. Diluted share count ' + n(m2.dilutedShares,2) + '.</div>';
      if(mo.sensitivity && mo.sensitivity.available){
        out += tbl(['Driver','Change','Cumulative FCFF','Terminal EPS'],
            arr(mo.sensitivity.results).filter(function(r){ return !r.error; }).map(function(r){
              return { cells:[e(S(r.driver)), e(S(r.change)),
                eqSignedPct(r.fcffDeltaPct), eqSignedPct(r.epsDeltaPct)] };
            }), { num:[2,3] })
          + '<div class="mut" style="margin-top:1.5mm">Most sensitive to '
          + e(S(mo.sensitivity.mostSensitiveTo)) + '. ' + e(S(mo.sensitivity.note)) + '</div>';
      }
      if(mo.valuation && mo.valuation.available){
        out += tbl(['Measure','Value'], [
            { cells:['Value per share', '<b>' + n(mo.valuation.perShare,2) + '</b>'] },
            { cells:['In the forecast period', n(mo.valuation.pvExplicit,0)] },
            { cells:['In the terminal', n(mo.valuation.pvTerminal,0) + ' ('
              + Math.round((mo.valuation.terminalShare||0)*100) + '%)'] },
            { cells:['Terminal method', e(S(mo.valuation.terminalMethod))] }
          ], { num:[1] })
          + arr(mo.valuation.warnings).map(function(w){
              return '<div class="note">' + e(S(w)) + '</div>'; }).join('');
      } else if(mo.valuation && mo.valuation.reason){
        out += '<div class="note"><b>No intrinsic value is computed here.</b> '
          + e(S(mo.valuation.reason)) + '</div>';
      }
      if(mo.impliedGrowth && mo.impliedGrowth.available){
        out += '<div class="note"><b>What the price already assumes.</b> '
          + n(mo.impliedGrowth.valuePct,1) + '% growth. ' + e(S(mo.impliedGrowth.note)) + '</div>';
      }
    } else if(mo && mo.model){
      out += S2((S(c.symbol)) + ' — forecast')
        + '<div class="note">The model did not build: ' + e(S(mo.model.reason))
        + ' Its intrinsic value is therefore asserted rather than built.</div>';
    }

    out += S2((S(c.symbol)) + ' — valuation and expectations')
      + figFootball(c) + eqScenarios(c, lang)
      + figConsensus(c) + eqVariant(c, lang);
    if(c.bearCase && (S(c.bearCase.argument) || S(c.bearCase.answer))){
      out += '<p style="margin-top:2mm"><b>The case against.</b> ' + e(S(c.bearCase.argument)) + '</p>'
        + '<p><b>Why we think it is wrong.</b> ' + e(S(c.bearCase.answer)) + '</p>';
    }
    out += eqMultibagger(c, lang);

    var moatS = eqMoat(c, lang), mgmtS = eqManagement(c, lang);
    out += S2((S(c.symbol)) + ' — moat, management and capital') + moatS + mgmtS
      + eqCapitalAllocation(c, lang);
    var mis = eqMispricing(c, lang);
    if(mis) out += S2((S(c.symbol)) + ' — why the market has this wrong') + mis;
    var pe = eqPeers(c, lang), esg = eqEsg(c, lang);
    if(pe || esg) out += S2((S(c.symbol)) + ' — peers and ESG') + pe + esg;
    out += S2((S(c.symbol)) + ' — accounting quality') + eqForensic(c, lang);
    out += S2((S(c.symbol)) + ' — registers') + eqLitigation(c, lang);
    out += S2((S(c.symbol)) + ' — liquidity') + eqLiquidity(c, lang);

    var risky = '';
    if(arr(c.risks).length){
      risky += tbl(['Risk','Severity','Probability','Impact'], arr(c.risks).map(function(r){
          return { cells:[e(S(r.risk)),
            '<span class="' + (r.severity==='severe'?'neg':'') + '">' + e(S(r.severity)) + '</span>',
            r.probability == null ? '&mdash;' : Math.round(r.probability*100) + '%',
            r.impactPct == null ? '<span class="mut">not quantified</span>' : eqSignedPct(r.impactPct)] };
        }), { num:[2,3] });
    }
    if(arr(c.catalysts).length){
      risky += '<div style="height:2mm"></div>'
        + tbl(['Catalyst','Window','Effect'], arr(c.catalysts).map(function(x){
            return { cells:[e(S(x.event)), e(S(x.expectedWindow)), e(S(x.impact))] }; }));
    }
    if(risky) out += S2((S(c.symbol)) + ' — risks and catalysts')
      + figRisks(c) + figCatalysts(c) + risky;

    var mon = '';
    if(arr(c.thesisBreakers).length) mon += '<div class="mut"><b>Thesis breakers.</b></div>' + eqList(c.thesisBreakers);
    if(arr(c.upgradeTriggers).length) mon += '<div class="mut"><b>What would make us more positive.</b></div>' + eqList(c.upgradeTriggers);
    if(arr(c.managementQuestions).length) mon += '<div class="mut"><b>Questions for management.</b></div>' + eqList(c.managementQuestions);
    if(mon) out += S2((S(c.symbol)) + ' — monitoring') + mon;

    if(arr(c.sources).length){
      out += S2((S(c.symbol)) + ' — sources')
        + tbl(['Source','Publisher','Tier','Date','Label'], arr(c.sources).map(function(x){
            return { cells:[e(S(x.title)), e(S(x.publisher)), '<span class="en">' + e(S(x.tier)) + '</span>',
              e(S(x.date)), e(S(x.evidence))] }; }), { num:[2] , cls:'srctab' })
        + '<div class="mut" style="margin-top:1.5mm">Confidence: '
          + e(S(c.confidence && c.confidence.label)) + '.</div>'
        + (arr(c.conflicts).length
            ? '<div style="height:2mm"></div>'
              + tbl(['Figure','Sources','Preferred','Why'], arr(c.conflicts).map(function(x){
                  return { cells:[e(S(x.figure)), e(S(x.sources)), e(S(x.preferred)), e(S(x.why))] }; }))
            : '');
    }
  });

  /* ---------------- what was barred, and why ---------------- */
  var excl = arr(rep.excludedFromTop3);
  if(excl.length){
    out += S2('Barred from the Top 3')
      + tbl(['Company','Score','Forensic','Why'], excl.map(function(c){
          return { cells:['<span class="en">' + e(S(c.name) || S(c.symbol)) + '</span>',
            eqNum(c.overall && c.overall.score),
            c.forensicScore == null ? '&mdash;' : n(c.forensicScore,0),
            e(arr(c.exclusionReasons).join(' '))] };
        }), { num:[1,2] })
      + '<div class="mut" style="margin-top:1.5mm">A high score does not override a severe finding, '
        + 'and it does not override work that was never done. Both bar the Top 3.</div>';
  }
  if(arr(rep.unscored).length){
    out += S2('Not scored')
      + eqList(arr(rep.unscored).map(function(c){ return (S(c.name) || S(c.symbol)); }))
      + '<div class="mut">Too little survived the evidence gate to score these. They are listed '
      + 'for completeness rather than dropped.</div>';
  }

  out += S2('Key monitorables') + eqMonitorables(p, lang);

  var warn = arr(p && p.warnings);
  if(warn.length){
    out += S2('Gaps in this research') + eqList(warn)
      + '<div class="mut">Printed rather than hidden. A gap you can see is a gap you can close.</div>';
  }

  out += S2('Method')
    + '<p>Ratings are made against written anchors tied to observables, and each one '
      + 'carries the evidence sentence behind it. A rating supplied without evidence is not '
      + 'counted, and the coverage figure falls accordingly.</p>'
    + '<p>Scores are computed by the application from those component ratings. Nothing in the '
      + 'research payload can set a score directly. Companies whose overall scores differ by '
      + 'less than the ' + (run.noiseBand || 3) + '-point noise band share a rank, because ranking '
      + 'to one decimal would claim a precision the ratings do not have.</p>'
    + '<p>Forecasts are built by the application from operating drivers — volume, realisation, '
      + 'margin, working capital, capital expenditure and the debt schedule — and tied across the '
      + 'three statements each year. The base year is checked against the revenue the company '
      + 'reported, within 2%; where it does not tie, the forecast is printed with that stated and '
      + 'no intrinsic value is computed from it. Sensitivity is run on those drivers rather than '
      + 'on the discount rate.</p>'
    + '<p>A severe accounting, governance, promoter, solvency or data-integrity finding bars a '
      + 'company from the Top 3 whatever it scores. So does an absent forensic assessment, an '
      + 'absent litigation search, or an essential register left unsearched.</p>';

  var gl = eqGlossary(p, lang);
  if(gl) out += S2('Glossary') + gl;

  var built = blocksFromBody(out);
  return packDoc(p, lang, {
    B: built.B, TITLES: built.TITLES, leadIn: leadIn,
    runHead: 'Sector Research Report', docName: 'Sector Research Report',
    shellTitle: eqTitle(p) + ' — Sector Research Report',
    toc: true, seedPages: 48
  });
}

global.EQDocs = { buildCompany:buildCompany, buildExec:buildExec,
                   buildCompanyExec:buildCompanyExec,
                   buildSector:buildSector,
                   charts:{ financials:chartFinancials, radar:chartRadar, gauge:chartGauge,
                            peers:chartPeers, donut:chartDonut, ladder:chartLadder,
                            columns:chartColumns, columnsLine:chartColumnsLine,
                            waterfall:chartWaterfall, heat:chartHeat },
                   buildScorecard:buildScorecard, BLOCKS:BLOCKS, S:S,
                   /* exposed for the suites: the lot ladder and the date
                      arithmetic are the two pieces worth testing on their own */
                   _lotRows:lotRows, _keyDates:keyDates };
})(window);
