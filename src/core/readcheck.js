/* Did the application read everything the research tool sent? (build 28)
 *
 * Tejas, on marking a figure "not available": "for any reason figure was not
 * available or not included in the payload or included in the payload but is
 * not read or picked up by the app and hence missed". The last case is the
 * application's own fault, and nothing caught it: a figure sent as "cagr_5y"
 * where the schema says "y5" was simply never seen, and the depth check then
 * asked for it again as if the tool had not answered.
 *
 * readCheck(payload) runs on every import, before anything else reads it:
 *
 *   renamed   keys sent under a near-variant of a schema key ("cagr_5y",
 *             "5yr", "Y5" for "y5"; "netprofit" for "netProfit") are moved
 *             to the schema key, so the figure is read. Only when the schema
 *             key is not already there.
 *   unread    keys with a value that the schema does not know and no variant
 *             matched. They are listed for the reader as "sent but not read",
 *             never silently dropped.
 *   claimed   items the tool's search record says could not be found, but
 *             whose value is in fact in the reply. The value is used; the
 *             contradiction is shown.
 *
 * The schema is the one the research brief itself prints, parsed from the
 * prompt, so this check and the brief cannot drift apart. */
import { buildResearchPrompt } from './prompt-builder.js';
import { KNOWN_KEYS } from './known-keys.js';
import { buildFinderPrompt, isFinderPayload } from './finder.js';

const S = (v) => (v == null ? '' : String(v).trim());
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => !(v == null || v === '' || v === 0 || (Array.isArray(v) && !v.length)
  || (isObj(v) && !Object.keys(v).length));
const flat = (k) => S(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/* Keys the application reads that the brief's example does not print. */
const EXTRA = {
  '': ['schema', 'changes', 'thesisCheck', 'warnings', 'screen', 'report', 'meta', 'verified', 'companies'],
  run: ['topUp', 'update', 'kind', 'searchLog', 'asOf', 'company', 'mode', 'line'],
};

/* The example JSON in section 9 of the brief, with its comments and its
   shorthand key lists ({ "moat", "pricingPower" }) turned into plain JSON. */
function parseExample(text) {
  let i = text.indexOf('{\n  "run"');
  if (i < 0) i = text.indexOf('{\n  "schema"');
  if (i < 0) return null;
  let depth = 0, j = i, inS = false, esc = false;
  for (; j < text.length; j++) {
    const ch = text[j];
    if (inS) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inS = false; continue; }
    if (ch === '"') inS = true; else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) break; }
  }
  let js = text.slice(i, j + 1).split('\n').map((l) => {
    let out = '', q = false, e = false;
    for (let k = 0; k < l.length; k++) {
      const c = l[k];
      if (q) { out += c; if (e) e = false; else if (c === '\\') e = true; else if (c === '"') q = false; continue; }
      if (c === '"') { q = true; out += c; continue; }
      if (c === '/' && l[k + 1] === '/') break;
      out += c;
    }
    return out;
  }).join('\n').replace(/,(\s*[}\]])/g, '$1');
  for (let n = 0; n < 5000; n++) {
    try { return JSON.parse(js); } catch (err) {
      const m = /Expected ':' after property name in JSON at position (\d+)/.exec(err.message);
      if (!m) return null;
      const p = Number(m[1]);
      js = js.slice(0, p) + ': null' + js.slice(p);
    }
  }
  return null;
}
/* Two briefs, merged: a sector study and a company carry different blocks. */
function union(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return [union(a[0], b[0])];
  if (isObj(a) && isObj(b)) {
    const o = { ...a };
    Object.keys(b).forEach((k) => { o[k] = k in a ? union(a[k], b[k]) : b[k]; });
    return o;
  }
  return a === undefined ? b : a;
}
let TEMPLATE = null, FINDER_TEMPLATE = null;
export function finderTemplate() {
  if (!FINDER_TEMPLATE) FINDER_TEMPLATE = parseExample(buildFinderPrompt({})) || {};
  return FINDER_TEMPLATE;
}
export function schemaTemplate() {
  if (TEMPLATE) return TEMPLATE;
  const brief = (mode) => {
    const t = buildResearchPrompt({ sector: 'Banking', subSector: 'Public Sector Banks',
      company: mode === 'company' ? 'State Bank of India' : '', mode, horizon: '3-5' });
    return parseExample(typeof t === 'string' ? t : JSON.stringify(t));
  };
  TEMPLATE = union(brief('sector') || {}, brief('company') || {});
  return TEMPLATE;
}

/* The variant a key was sent under, mapped to the schema key it means. */
function yearsOf(k) {
  const f = flat(k);
  let m = /^(?:cagr)?(\d{1,2})(?:y|yr|yrs|year|years)(?:cagr)?$/.exec(f)
       || /^(?:y|yr|year|years|cagr|last)(\d{1,2})(?:y|yr|yrs|year|years|cagr)?$/.exec(f);
  if (m) return Number(m[1]);
  if (/^(latest|latestyear|lastyear|yoy|oneyear|1year|cagr1)$/.test(f)) return 1;
  if (/^(threeyear|threeyears)$/.test(f)) return 3;
  if (/^(fiveyear|fiveyears)$/.test(f)) return 5;
  return null;
}
function variantOf(k, keys) {
  const f = flat(k);
  const exact = keys.find((t) => flat(t) === f);
  if (exact) return exact;
  const y = yearsOf(k);
  if (y != null && keys.includes('y' + y)) return 'y' + y;
  /* Months: "3m", "6mo", "3months", "m3" for the Finder's returns. */
  const mo = /^(\d{1,2})(?:m|mo|mth|mths|month|months)$/.exec(f) || /^(?:m|mo|month|months)(\d{1,2})$/.exec(f);
  if (mo && keys.includes('m' + Number(mo[1]))) return 'm' + Number(mo[1]);
  if (mo && Number(mo[1]) === 12 && keys.includes('y1')) return 'y1';
  return null;
}

function walk(obj, tpl, path, out) {
  if (Array.isArray(obj)) {
    const row = Array.isArray(tpl) ? tpl[0] : null;
    if (isObj(row)) obj.forEach((x) => { if (isObj(x)) walk(x, row, path + '[]', out); });
    return;
  }
  if (!isObj(obj) || !isObj(tpl)) return;
  const keys = Object.keys(tpl).concat(EXTRA[path] || []);
  /* An example object with no keys of its own, or keyed by examples (a map),
     is free-form: anything under it is read as sent. */
  if (!Object.keys(tpl).length) return;
  Object.keys(obj).forEach((k) => {
    if (keys.includes(k)) { if (k in tpl) walk(obj[k], tpl[k], path ? `${path}.${k}` : k, out); return; }
    /* A variant of a key this spot of the schema has ("cagr_5y" for "y5",
       "net_profit" for "netProfit") is moved to it. A key some part of the
       application reads elsewhere is otherwise left alone and not reported. */
    const known = KNOWN_KEYS.has(k.toLowerCase());
    const to = variantOf(k, keys);
    if (to && !(to in obj)) {
      obj[to] = obj[k]; delete obj[k];
      out.renamed.push({ from: (path ? path + '.' : '') + k, to: (path ? path + '.' : '') + to });
      if (to in tpl) walk(obj[to], tpl[to], path ? `${path}.${to}` : to, out);
      return;
    }
    if (!known && filled(obj[k])) {
      const at = (path ? path + '.' : '') + k;
      if (!out.unread.includes(at)) out.unread.push(at);
    }
  });
}

/* A path as the depth check writes it — "companies[symbol=PNB].financials",
   "global.cagr.y3" — looked up in the payload. */
export function resolvePath(payload, path) {
  const symKey = (v) => S(v).toUpperCase().replace(/\.(NS|BO)$/, '').replace(/[^A-Z0-9&]/g, '');
  let cur = payload;
  const parts = S(path).replace(/\[(\d+)\]/g, '.$1').split(/\.(?![^[]*\])/).filter(Boolean);
  for (const p of parts) {
    if (cur == null) return undefined;
    const m = /^([A-Za-z_]\w*)\[(?:symbol=|name=)?([^\]]*)\]$/.exec(p);
    if (m) {
      const list = cur[m[1]];
      if (!Array.isArray(list)) return undefined;
      cur = list.find((x) => x && (symKey(x.symbol) === symKey(m[2]) || S(x.name).toLowerCase() === S(m[2]).toLowerCase()));
      continue;
    }
    cur = cur[p];
  }
  return cur;
}

export function readCheck(payload, { template } = {}) {
  const out = { renamed: [], unread: [], claimed: [] };
  if (!isObj(payload)) return out;
  walk(payload, template || (isFinderPayload(payload) ? finderTemplate() : schemaTemplate()), '', out);
  const log = Array.isArray(payload.run && payload.run.searchLog) ? payload.run.searchLog : [];
  log.forEach((e) => {
    const path = isObj(e) ? S(e.path || e.item || e.key) : '';
    if (!path) return;
    const v = resolvePath(payload, path);
    const scalar = (typeof v === 'number' && v !== 0 && Number.isFinite(v)) || (typeof v === 'string' && S(v));
    if (scalar || (Array.isArray(v) && v.length)) {
      if (!out.claimed.some((c) => c.path === path)) out.claimed.push({ path, value: Array.isArray(v) ? v.length + ' rows' : v });
    }
  });
  return out;
}
