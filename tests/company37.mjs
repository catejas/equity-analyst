/* Build 37: what the ICICI Securities reports carry that ours did not, from
 * the company research side (Tejas, 26-11-2026: "review that information from
 * Company Research perspective and add those information in all company
 * research reports"). Rating with target and upside, key facts, the key
 * financial summary with past and forward growth, capacity, unit economics,
 * the key assumption and its sensitivity, estimate revisions, business mix,
 * raw materials, the debt path, corporate actions, the latest quarter, policy
 * links, asset quality from its peak, and a holding discount in the sum of the
 * parts. The real PNB run, with TEST DATA added; every figure worked by hand. */
import { ROOT, REAL } from './_paths.mjs';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import vm from 'node:vm';
const { parsePayload } = await import(ROOT + '/src/core/payload-schema.js');
const { buildReport } = await import(ROOT + '/src/core/report.js');
const { completeness, topUpPrompt } = await import(ROOT + '/src/core/completeness.js');
const { buildResearchPrompt } = await import(ROOT + '/src/core/prompt-builder.js');
const scoring = await import(ROOT + '/src/core/scoring.js');
const indicators = await import(ROOT + '/src/core/indicators.js');
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if (!p) fail++; console.log(`  ${p ? 'ok  ' : 'FAIL'}  ${l}${d != null && d !== '' ? '  — ' + d : ''}`); };
const dom = new JSDOM('<!doctype html><body></body>'); const w = dom.window;
w.EQ = { scoring, indicators };
const sb = { window: w, document: w.document, navigator: { language: 'en-IN' }, console };
sb.self = sb; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(ROOT + '/charts.js', 'utf8'), sb, { filename: 'charts.js' });
vm.runInContext(fs.readFileSync(ROOT + '/render.js', 'utf8'), sb, { filename: 'render.js' });
const raw = JSON.parse(fs.readFileSync(REAL + '/pnb-merged-16-11-2026.json', 'utf8').replace(/�/g, '-'));

console.log('\nThe prompt asks for the operating picture');
const pr = buildResearchPrompt ? buildResearchPrompt({ sector: 'Metals and mining', subSector: 'Aluminium' }) : '';
ok('capacity, unit economics, key assumption, revisions, mix, raw materials, debt path, corporate actions, latest quarter, policy, asset quality',
  ['"capacity"', '"unitEconomics"', '"keyAssumption"', '"estimateRevisions"', '"mix"', '"rawMaterials"', '"deleveraging"', '"corporateActions"', '"recentEvent"', '"policyLinks"', '"assetQualityTrend"', '"faceValue"', '"holdingDiscountPct"'].every((k) => pr.includes(k)));

console.log('\nThe depth check asks for them');
const c0 = completeness(raw).sections[0].checks.filter((k) => k.group === 'Operating picture');
ok('a lender (PNB) is asked for asset quality, not capacity', c0.some((k) => /Asset quality/.test(k.label)) && !c0.some((k) => /Capacity/.test(k.label)));
const nonLender = JSON.parse(JSON.stringify(raw)); nonLender.companies[0].sector = 'commodity'; nonLender.companies[0].name = 'TEST Metals Ltd'; nonLender.run.sector = 'Metals and mining'; nonLender.run.subSector = 'Aluminium';
const c1 = completeness(nonLender).sections[0].checks.filter((k) => k.group === 'Operating picture');
ok('a manufacturer is asked for capacity, unit economics, raw materials and the debt path', ['Capacity', 'Unit economics', 'Raw-material', 'Debt path'].every((t) => c1.some((k) => k.label.startsWith(t))));
ok('and the follow-up asks for them by path', /\.capacity — each plant/.test(topUpPrompt(nonLender)));

console.log('\nThe report, with TEST DATA');
const d = JSON.parse(JSON.stringify(raw)), co = d.companies[0];
co.faceValue = 2;
/* Target: bear 80 × .25 + base 120 × .5 + bull 160 × .25 = 120; price 100 → +20% → Buy. */
co.valuation = Object.assign({}, co.valuation, { currentPrice: 100, bear: { fairValue: 80, probability: 0.25 }, base: { fairValue: 120, probability: 0.5 }, bull: { fairValue: 160, probability: 0.25 },
  sotp: [{ name: 'Core lending', metric: 'book value', metricValue: 1000, multiple: 1.2, enterpriseValue: 1200, stakePct: 100, perShare: 100 },
         { name: 'TEST listed subsidiary', metric: 'market value', metricValue: 300, multiple: 1, enterpriseValue: 300, stakePct: 52.6, holdingDiscountPct: 30, perShare: 11 }] });
co.assetQualityTrend = [{ period: 'FY19', gnpa: 12.5, nnpa: 10.6, pcr: 60 }, { period: 'FY22', gnpa: 5.1, nnpa: 1.7, pcr: 80 }, { period: 'FY26', gnpa: 1.6, nnpa: 0.2, pcr: 84, governmentBackedPct: 75 }];
co.mix = [{ period: 'FY24', basis: 'loan book', lines: [{ name: 'Generation', sharePct: 48 }, { name: 'T&D', sharePct: 46 }, { name: 'Infra', sharePct: 6 }] },
          { period: 'FY25', basis: 'loan book', lines: [{ name: 'Generation', sharePct: 47 }, { name: 'T&D', sharePct: 46 }, { name: 'Infra', sharePct: 7 }] }];
co.keyAssumption = { driver: 'TEST loan growth', unit: '%', assumed: 12, current: 11, sensitivity: [{ change: '+1 point', ebitdaChangePct: 3, epsChangePct: 4 }, { change: '-1 point', ebitdaChangePct: -3, epsChangePct: -4 }] };
co.estimateRevisions = [{ item: 'EPS FY28E', now: 22, earlier: 20, earlierAsOf: 'Aug-2026', source: 'TEST consensus' }];
co.corporateActions = [{ action: 'TEST merger with a subsidiary', status: 'board approval', expected: 'FY28', effect: 'removes the holding-company discount' }];
co.recentEvent = { period: 'Q2FY27', highlights: ['TEST: net interest income up 9% on the year'], nextQuarterGuidance: 'TEST: credit cost under 0.5%' };
co.policyLinks = [{ item: 'TEST nodal agency for a distribution scheme', effect: 'helps', detail: 'channel for scheme funds' }];
const parsed = parsePayload(JSON.stringify(d));
const b = buildReport(parsed.payload);
const p = { meta: { sector: d.run.sector, analysis_datetime: new Date().toISOString() }, report: b.report, warnings: b.warnings, companyIndex: 0, standalone: true };
const html = sb.window.EQDocs.buildCompany(p, 'en');
const text = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok('the rating by the bands: target ₹120, +20%, Buy', /Rating by the bands · Buy/.test(text) && /Target ₹120 · price ₹100\.00 · \+20\.0%/.test(text), (text.match(/Rating by the bands[^.]{0,80}/) || [''])[0]);
ok('key facts, with equity capital and face value ₹2.00', /Key facts/.test(text) && /Face value ₹2\.00/.test(text) && /Enterprise value not used for a lender/.test(text));
const ann = b.report.full[0].financials.annual.slice().sort((a, b2) => String(a.period) < String(b2.period) ? -1 : 1).slice(-5);
const tp = ann[0].revenue, tl = ann[ann.length - 1].revenue, yrs = ann.length - 1;
const c5 = (Math.pow(tl / tp, 1 / yrs) - 1) * 100;
ok('the key financial summary: total income and its past growth, worked by hand', /Key financial summary/.test(text) && text.includes((Math.round(c5 * 10) / 10).toFixed(1) + '%'), c5.toFixed(2) + '% over ' + yrs + ' years');
ok('no EBITDA line for a lender', !/Key financial summary[^]*?EBITDA margin/.test(text.slice(text.indexOf('Key financial summary'), text.indexOf('Key financial summary') + 1500)));
ok('asset quality from its peak, FY19 marked as the peak', /Asset quality from its peak/.test(text) && /FY19 peak 12\.50%/.test(text));
ok('the business mix chart', /business mix by year/.test(text));
ok('the key assumption and a move each way', /What the earnings turn on TEST loan growth\s*: assumed at 12 %, against 11 now/.test(text) && /\+1 point \+3\.0% \+4\.0%/.test(text));
ok('estimate revisions: 22 against 20 is +10.0%', /EPS FY28E[^]*?22\.0 20\.0[^]*?\+10\.0%/.test(text));
ok('corporate actions, the latest quarter and policy links', /TEST merger with a subsidiary/.test(text) && /Guided for the next quarter\. TEST: credit cost/.test(text) && /TEST nodal agency[^]*?helps/.test(text));
ok('the sum of the parts carries the holding discount', /Holding discount/.test(text) && /52\.6%|53%/.test(text) && /30%/.test(text));
ok('no NaN or undefined', !/\bNaN\b|\bundefined\b/.test(text));
const ex = sb.window.EQDocs.buildCompanyExec(p, 'en').replace(/<[^>]+>/g, ' ');
ok('the Executive Summary carries the rating too', /Rating by the bands · Buy/.test(ex));
/* With none of it supplied, nothing new is printed. */
const bare = sb.window.EQDocs.buildCompany({ ...p, report: buildReport(parsePayload(JSON.stringify(raw)).payload).report }, 'en').replace(/<[^>]+>/g, ' ');
ok('a report without the new blocks shows no empty sections', !/Operations, drivers and what has changed/.test(bare));
console.log(`\n${ran - fail}/${ran} checks pass`);
process.exit(fail ? 1 : 0);
