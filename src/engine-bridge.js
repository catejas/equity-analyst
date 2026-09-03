// engine-bridge.js — the engine is written as ES modules and tested under Node.
// The app shell, the document builders and the PDF pipeline are classic
// scripts, as they were in the IPO app. This module is the only seam between
// the two: it imports the engine once and hangs it on window under a single
// name, then announces that it is ready.
//
// Nothing else may import the engine directly. One seam is auditable; a dozen
// scattered imports are not.

import * as scoring from './core/scoring.js';
import * as rubrics from './core/rubrics.js';
import * as ranking from './core/ranking.js';
import * as model from './core/model.js';
import * as valuation from './core/valuation.js';
import * as metrics from './core/metrics.js';
import * as technicals from './core/technicals.js';
import * as forensic from './core/forensic.js';
import * as litigation from './core/litigation.js';
import * as multibagger from './core/multibagger.js';
import * as integrity from './core/integrity.js';
import * as schema from './core/payload-schema.js';
import * as prompt from './core/prompt-builder.js';
import * as report from './core/report.js';
import * as compare from './core/compare.js';
import * as store from './data/store.js';

const EQ = Object.freeze({
  version: {
    methodology: scoring.METHODOLOGY_VERSION,
    payloadSchema: schema.PAYLOAD_SCHEMA_VERSION,
  },
  scoring, rubrics, ranking, model, valuation, metrics, technicals,
  forensic, litigation, multibagger, integrity, schema, prompt, report,
  compare, store,

  // The three calls the shell actually makes.
  buildPrompt: prompt.buildResearchPrompt,
  parsePayload: schema.parsePayload,
  buildReport: report.buildReport,
});

window.EQ = EQ;
window.dispatchEvent(new CustomEvent('eq:ready', { detail: EQ.version }));
