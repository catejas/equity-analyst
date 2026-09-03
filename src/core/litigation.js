// litigation.js — the register battery.
//
// The governing idea, taken from the IPO framework: an empty list is not
// evidence that nothing exists. A register that was never searched and a
// register that came back clean look identical in a report unless the report
// says which is which. So every register is named, every search is recorded,
// and the ones that found nothing are recorded too.

export const REGISTERS = Object.freeze([
  // Courts and tribunals
  { id: 'indiankanoon', name: 'Indian Kanoon', kind: 'court', find: 'indiankanoon.org search by party name', essential: true },
  { id: 'ecourts', name: 'e-Courts and NJDG', kind: 'court', find: 'ecourts.gov.in case status by party', essential: true },
  { id: 'nclt', name: 'NCLT', kind: 'tribunal', find: 'nclt.gov.in orders, and a named search', essential: true },
  { id: 'nclat', name: 'NCLAT', kind: 'tribunal', find: 'nclat.gov.in judgements', essential: false },
  { id: 'ibbi', name: 'IBBI', kind: 'insolvency', find: 'ibbi.gov.in ongoing and closed insolvency proceedings', essential: true },

  // Securities regulator
  { id: 'sebi_orders', name: 'SEBI enforcement orders', kind: 'regulator', find: 'site:sebi.gov.in orders, searched for the company and each promoter', essential: true },
  { id: 'sebi_settlement', name: 'SEBI settlement orders', kind: 'regulator', find: 'sebi.gov.in settlement orders', essential: true },
  { id: 'sebi_debarment', name: 'SEBI debarment list', kind: 'regulator', find: 'sebi.gov.in list of debarred entities', essential: true },

  // Companies registry
  { id: 'mca_master', name: 'MCA master data', kind: 'registry', find: 'mca.gov.in company master data', essential: true },
  { id: 'mca_charges', name: 'MCA index of charges', kind: 'registry', find: 'mca.gov.in index of charges — holder, amount, date, satisfaction', essential: true },
  { id: 'mca_din', name: 'MCA DIN and disqualified directors', kind: 'registry', find: 'mca.gov.in DIN status and the disqualified directors list', essential: true },

  // Tax and indirect tax
  { id: 'cestat', name: 'CESTAT', kind: 'tax', find: 'cestat.gov.in orders by party', essential: false },
  { id: 'itat', name: 'ITAT', kind: 'tax', find: 'itat.gov.in orders by party', essential: false },
  { id: 'gst_appellate', name: 'State GST appellate portals', kind: 'tax', find: 'the relevant state GST appellate authority', essential: false },

  // Consumer, labour, other
  { id: 'ncdrc', name: 'NCDRC', kind: 'consumer', find: 'ncdrc.nic.in case search', essential: false },
  { id: 'epfo', name: 'EPFO', kind: 'labour', find: 'EPFO default and arrears records', essential: false },

  // Listed-company specific — not needed for an IPO, essential for a listed one
  { id: 'exchange_lodr', name: 'Exchange LODR non-compliance and penalties', kind: 'exchange', find: 'NSE and BSE non-compliance filings and penalty statements', essential: true, listedOnly: true },
  { id: 'surveillance', name: 'Exchange surveillance measures', kind: 'exchange', find: 'NSE and BSE ASM, GSM and trade-to-trade lists', essential: true, listedOnly: true },
  { id: 'rating_actions', name: 'Credit rating actions', kind: 'credit', find: 'CRISIL, ICRA, CARE, India Ratings, Brickwork and Acuité, including withdrawal and Issuer Not Cooperating', essential: true, listedOnly: true },
  { id: 'ed_fema', name: 'ED and FEMA matters', kind: 'regulator', find: 'a dated named search plus exchange disclosures', essential: false, listedOnly: true },
  { id: 'tax_search', name: 'Income-tax search or survey disclosures', kind: 'tax', find: 'exchange disclosures and dated media', essential: false, listedOnly: true },
  { id: 'media', name: 'Dated media search', kind: 'media', find: 'a named search restricted by date, covering the company and each promoter', essential: true },
]);

export const OUTCOMES = Object.freeze(['clear', 'matters found', 'register unreachable']);
export const SUBJECTS = Object.freeze(['company', 'promoter', 'subsidiary']);

/**
 * Assess what was actually searched.
 * `searched` is one entry per register per subject:
 *   { register, subject, subjectName, outcome, detail, matters[] }
 */
export function assessLitigation(searched, { listed = true } = {}) {
  if (!Array.isArray(searched)) {
    return {
      available: false,
      reason: 'No litigation search was recorded. An empty list is not evidence that nothing exists.',
    };
  }

  const applicable = REGISTERS.filter((r) => listed || !r.listedOnly);
  const byId = new Map(applicable.map((r) => [r.id, r]));

  const errors = [];
  for (const [i, s] of searched.entries()) {
    if (!s || typeof s !== 'object') { errors.push(`searched[${i}] is not an object.`); continue; }
    if (!byId.has(s.register)) errors.push(`searched[${i}]: "${s.register}" is not a known register.`);
    if (!OUTCOMES.includes(s.outcome)) errors.push(`searched[${i}]: outcome must be one of ${OUTCOMES.join(', ')}.`);
    if (s.subject && !SUBJECTS.includes(s.subject)) errors.push(`searched[${i}]: subject must be one of ${SUBJECTS.join(', ')}.`);
  }
  if (errors.length) return { available: false, reason: errors.join(' '), errors };

  const hit = new Set(searched.map((s) => s.register));
  const unreachable = searched.filter((s) => s.outcome === 'register unreachable');
  const withMatters = searched.filter((s) => s.outcome === 'matters found');
  const neverSearched = applicable.filter((r) => !hit.has(r.id));
  const essentialMissed = neverSearched.filter((r) => r.essential);
  /* Named, not the register objects: this string is printed on the report and
     read by a person. */
  const essentialMissedNames = essentialMissed.map((r) => r.name);

  const matters = withMatters.flatMap((s) => (s.matters || []).map((m) => ({
    register: byId.get(s.register).name,
    subject: s.subject || 'company',
    subjectName: s.subjectName || null,
    ...m,
  })));

  const severe = matters.filter((m) => m.severity === 'severe');

  return {
    available: true,
    registersApplicable: applicable.length,
    registersSearched: hit.size,
    coverage: Math.round((hit.size / applicable.length) * 10000) / 10000,
    essentialCoverage: Math.round(
      (applicable.filter((r) => r.essential && hit.has(r.id)).length
        / applicable.filter((r) => r.essential).length) * 10000) / 10000,
    searched: searched.map((s) => ({ ...s, registerName: byId.get(s.register).name })),
    clear: searched.filter((s) => s.outcome === 'clear').length,
    unreachable: unreachable.map((s) => ({ register: byId.get(s.register).name, detail: s.detail || null })),
    neverSearched: neverSearched.map((r) => ({ id: r.id, name: r.name, essential: r.essential, find: r.find })),
    essentialMissed: essentialMissedNames,
    matters,
    severeMatters: severe,
    killSwitchFlags: severe.map((m) => ({
      category: m.category || 'governance',
      severity: 'severe',
      detail: `${m.register}: ${m.summary || m.detail || 'severe matter recorded'}`,
    })),
    // The honest statement the report prints where coverage is thin.
    caveat: essentialMissed.length
      ? `${essentialMissed.length} essential registers were never searched: ${essentialMissedNames.join(', ')}. The absence of findings against them means nothing.`
      : unreachable.length
        ? `${unreachable.length} registers were unreachable. Those results are unknown, not clean.`
        : null,
    sufficient: essentialMissed.length === 0,
  };
}

/** The searches a run must perform, for the prompt and the report checklist. */
export function registerChecklist({ listed = true } = {}) {
  return REGISTERS.filter((r) => listed || !r.listedOnly).map((r) => ({
    id: r.id, name: r.name, kind: r.kind, essential: r.essential, howToFind: r.find,
  }));
}
