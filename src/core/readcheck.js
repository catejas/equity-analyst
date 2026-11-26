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
import { buildFinderPrompt, buildDeepDivePrompt, isFinderPayload, normaliseFinder } from './finder.js';

const S = (v) => (v == null ? '' : String(v).trim());
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => !(v == null || v === '' || v === 0 || (Array.isArray(v) && !v.length)
  || (isObj(v) && !Object.keys(v).length));
const flat = (k) => S(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/* Keys the application reads that the brief's example does not print. */
const EXTRA = {
  '': ['schema', 'changes', 'thesisCheck', 'warnings', 'screen', 'report', 'meta', 'verified', 'companies'],
  run: ['topUp', 'update', 'kind', 'searchLog', 'searchLogSetAside', 'asOf', 'company', 'mode', 'line'],
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
  /* Build 33: the screen's example, the deep dive's, and the 3- and 6-month
     returns that earlier screens carried (still read and shown). */
  if (!FINDER_TEMPLATE) FINDER_TEMPLATE = union(union(parseExample(buildFinderPrompt({})) || {},
    parseExample(buildDeepDivePrompt({ sectors: [] })) || {}),
    { benchmark: { returns: { m3: 0, m6: 0 } }, sectors: [{ returns: { m3: 0, m6: 0 } }] });
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

/* A value in the shape the schema shows: a number where it shows 0, a list
   where it shows one (from "a; b" text), a list of { symbol } where it shows
   that (from plain tickers), a list of sentences where it shows that (from
   { text } objects). */
function reshape(obj, k, t, path, out) {
  const at = (path ? path + '.' : '') + k;
  const v = obj[k];
  if (typeof t === 'number' && typeof v === 'string') {
    /* A figure with a scale word carries its unit in the text; turning it
       into a bare number would lose it. It is listed instead. */
    if (/(crore|\bcrs?\b|lakh|\blacs?\b|\bbn\b|billion|\bmn\b|million|thousand|trillion)/i.test(v)) { out.unreadable.push({ path: at, value: v }); return; }
    const n = parseNum(v);
    if (n != null) { obj[k] = n; out.coerced.push({ path: at, from: v, to: n }); }
    else if (S(v)) out.unreadable.push({ path: at, value: v });
    return;
  }
  if (!Array.isArray(t)) return;
  const row = t[0];
  let list = v;
  if (typeof v === 'string' && S(v)) {
    list = isObj(row) && ('symbol' in row)
      ? v.split(/[,;|\s]+/).filter(Boolean)
      : v.split(/\s*(?:;|\n|\||\u2022|(?:^|\s)-\s)\s*/).map(S).filter(Boolean);
    out.coerced.push({ path: at, from: v.length > 40 ? v.slice(0, 37) + '...' : v, to: list.length + ' items' });
  } else if (isObj(v) && !isObj(row)) {
    list = Object.values(v);
  }
  if (!Array.isArray(list)) return;
  if (isObj(row) && ('symbol' in row)) {
    list = list.map((x) => (typeof x === 'string' ? (/^[A-Z0-9&\-.]{2,20}$/.test(x.trim()) ? { symbol: x.trim() } : { name: x.trim() }) : x));
  } else if (typeof row === 'string') {
    list = list.map((x) => (isObj(x) ? S(x.text || x.point || x.description || x.detail || x.title || Object.values(x).find((y) => typeof y === 'string')) : x));
  }
  if (list !== v) obj[k] = list;
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
    if (keys.includes(k)) {
      if (k in tpl) { reshape(obj, k, tpl[k], path, out); walk(obj[k], tpl[k], path ? `${path}.${k}` : k, out); }
      return;
    }
    /* A variant of a key this spot of the schema has ("cagr_5y" for "y5",
       "net_profit" for "netProfit") is moved to it. A key some part of the
       application reads elsewhere is otherwise left alone and not reported. */
    const known = KNOWN_KEYS.has(k.toLowerCase());
    const to = variantOf(k, keys);
    if (to && !(to in obj)) {
      obj[to] = obj[k]; delete obj[k];
      out.renamed.push({ from: (path ? path + '.' : '') + k, to: (path ? path + '.' : '') + to });
      if (to in tpl) { reshape(obj, to, tpl[to], path, out); walk(obj[to], tpl[to], path ? `${path}.${to}` : to, out); }
      return;
    }
    if (!known && filled(obj[k])) {
      const at = (path ? path + '.' : '') + k;
      if (!out.unread.includes(at)) out.unread.push(at);
    }
  });
}

/* Numbers sent as text (build 29). AI tools write "12.5%", "22.4x", "+3.1",
   "(4.2)", "12-14%", "~18", "₹1,250 Cr", "-6.5 % YoY". Each is read as the
   number it states; a range as its midpoint. Text that states no number
   ("NA", "not available") is left alone and listed. */
export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.trim().replace(/[\u2212\u2012\u2013\u2014]/g, '-').replace(/\u00a0/g, ' ');
  if (!t) return null;
  let neg = false;
  const par = /^\((.*)\)$/.exec(t);
  if (par) { neg = true; t = par[1]; }
  t = t.replace(/^(approx\.?|approximately|about|around|c\.|ca\.|~|≈)\s*/i, '')
    .replace(/(₹|rs\.?|inr|us\$|\$)/gi, '').replace(/,(?=\d{2,3}\b)/g, '').trim();
  const rng = /^([+-]?\d*\.?\d+)\s*%?\s*(?:-|to|–)\s*([+-]?\d*\.?\d+)\s*(%|x|×)?(\s*[a-z].*)?$/i.exec(t);
  if (rng) { const a = Number(rng[1]), b = Number(rng[2]); if (Number.isFinite(a) && Number.isFinite(b)) return (neg ? -1 : 1) * +((a + b) / 2).toFixed(4); }
  const one = /^([+-]?\d*\.?\d+)\s*(%|x|×|times|pct|per\s*cent|percent|bps)?(\s*[a-z(].*)?$/i.exec(t);
  if (one) {
    let n = Number(one[1]);
    if (!Number.isFinite(n)) return null;
    if (one[2] && /bps/i.test(one[2])) n = n / 100;
    return (neg ? -1 : 1) * n;
  }
  return null;
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
  const out = { renamed: [], unread: [], claimed: [], coerced: [], unreadable: [], tidied: [], resolved: 0 };
  if (!isObj(payload)) return out;
  const finder = isFinderPayload(payload);
  if (finder) out.tidied = normaliseFinder(payload);
  walk(payload, template || (finder ? finderTemplate() : schemaTemplate()), '', out);
  const log = Array.isArray(payload.run && payload.run.searchLog) ? payload.run.searchLog : [];
  log.forEach((e) => {
    const path = isObj(e) ? S(e.path || e.item || e.key) : '';
    if (!path) return;
    const v = resolvePath(payload, path);
    /* Only a single figure can contradict "not found". A list with one item
       where two were wanted is a partial answer, and the note stands. */
    const scalar = (typeof v === 'number' && v !== 0 && Number.isFinite(v)) || (typeof v === 'string' && S(v) && parseNum(v) != null);
    if (scalar && !out.claimed.some((c) => c.path === path)) out.claimed.push({ path, value: v });
  });
  /* Build 29: the figure the reply carries wins, and the note that said it
     could not be found is set aside, so it does not mark the item as
     searched-and-not-found. The notes are kept under run.searchLogSetAside. */
  if (out.claimed.length && payload.run) {
    const gone = new Set(out.claimed.map((c) => c.path));
    const keep = [], aside = [];
    log.forEach((e) => ((isObj(e) && gone.has(S(e.path || e.item || e.key))) ? aside : keep).push(e));
    payload.run.searchLog = keep;
    payload.run.searchLogSetAside = (Array.isArray(payload.run.searchLogSetAside) ? payload.run.searchLogSetAside : []).concat(aside);
    out.resolved = aside.length;
  }
  return out;
}
