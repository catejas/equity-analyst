// store.js — persistence.
//
// Browser storage is wrapped rather than used directly: some embedded contexts
// throw on access, private browsing can refuse writes, and quota can run out
// mid-save. Every one of those is handled as a normal outcome, so a storage
// failure degrades the app instead of breaking it.

const MEMORY = new Map();
const PREFIX = 'iee:';

function backend() {
  try {
    const k = `${PREFIX}probe`;
    globalThis.localStorage.setItem(k, '1');
    globalThis.localStorage.removeItem(k);
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

let persistent = null;
let checked = false;

function store() {
  if (!checked) { persistent = backend(); checked = true; }
  return persistent;
}

export function storageIsPersistent() { return Boolean(store()); }

function readRaw(key) {
  const s = store();
  if (!s) return MEMORY.has(PREFIX + key) ? MEMORY.get(PREFIX + key) : null;
  try { return s.getItem(PREFIX + key); } catch { return null; }
}

function writeRaw(key, value) {
  const s = store();
  if (!s) { MEMORY.set(PREFIX + key, value); return { ok: true, persistent: false }; }
  try { s.setItem(PREFIX + key, value); return { ok: true, persistent: true }; }
  catch (e) {
    MEMORY.set(PREFIX + key, value);
    return { ok: true, persistent: false, note: `Saved in memory only for this session. ${e.name}` };
  }
}

function removeRaw(key) {
  const s = store();
  MEMORY.delete(PREFIX + key);
  if (s) { try { s.removeItem(PREFIX + key); } catch { /* already gone */ } }
}

export function readJson(key, fallback = null) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function writeJson(key, value) {
  return writeRaw(key, JSON.stringify(value));
}

// ------------------------------------------------------------- saved runs

const RUNS_INDEX = 'runs:index';
const runKey = (id) => `runs:${id}`;

export function makeRunId(segment, at = new Date()) {
  const slug = String(segment).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${slug || 'run'}-${at.toISOString().replace(/[:.]/g, '-')}`;
}

/** Saves the report and returns the index entry. Reports are stored whole. */
export function saveRun(built, { at = new Date() } = {}) {
  if (!built?.ok || !built.report) throw new Error('Only a successfully built report can be saved.');
  const r = built.report;
  const id = makeRunId(r.run.segment, at);
  const entry = {
    id,
    segment: r.run.segment,
    subsegment: r.run.subsegment,
    horizon: r.run.horizon,
    savedAt: at.toISOString(),
    methodologyVersion: r.run.methodologyVersion,
    companies: r.counts.universe,
    top3: r.top3.map((c) => ({ symbol: c.symbol, name: c.name, score: c.overall.score })),
  };
  const write = writeJson(runKey(id), { entry, report: r, warnings: built.warnings });
  const index = [entry, ...listRuns().filter((e) => e.id !== id)];
  writeJson(RUNS_INDEX, index);
  return { entry, persistent: write.persistent, note: write.note ?? null };
}

export function listRuns() {
  const index = readJson(RUNS_INDEX, []);
  return Array.isArray(index) ? index : [];
}

export function loadRun(id) {
  return readJson(runKey(id), null);
}

export function deleteRun(id) {
  removeRaw(runKey(id));
  writeJson(RUNS_INDEX, listRuns().filter((e) => e.id !== id));
}

/** Most recent earlier run for the same segment and subsegment. */
export function previousRunFor(segment, subsegment = null, excludeId = null) {
  const match = listRuns().filter((e) =>
    e.segment === segment && (e.subsegment ?? null) === (subsegment ?? null) && e.id !== excludeId);
  return match.length ? loadRun(match[0].id) : null;
}

// -------------------------------------------------------------- watchlist

const WATCHLIST = 'watchlist';

export function listWatchlist() {
  const w = readJson(WATCHLIST, []);
  return Array.isArray(w) ? w : [];
}

export function addToWatchlist(company, { runId = null, at = new Date() } = {}) {
  if (!company?.symbol) throw new Error('A symbol is required.');
  const existing = listWatchlist().filter((w) => w.symbol !== company.symbol);
  const item = {
    symbol: company.symbol,
    name: company.name ?? company.symbol,
    addedAt: at.toISOString(),
    runId,
    scoreWhenAdded: company.overall?.score ?? null,
    priceWhenAdded: company.valuation?.currentPrice ?? null,
    thesisBreakers: company.thesisBreakers ?? [],
    breakersTriggered: [],
  };
  writeJson(WATCHLIST, [item, ...existing]);
  return item;
}

export function removeFromWatchlist(symbol) {
  writeJson(WATCHLIST, listWatchlist().filter((w) => w.symbol !== symbol));
}

/**
 * Record that a thesis breaker has been observed. Judging whether a breaker has
 * tripped is a human call; the app records and surfaces it, and never decides.
 */
export function markBreakerTriggered(symbol, breaker, { note = null, at = new Date() } = {}) {
  const list = listWatchlist();
  const item = list.find((w) => w.symbol === symbol);
  if (!item) throw new Error(`${symbol} is not on the watchlist.`);
  item.breakersTriggered = [
    ...item.breakersTriggered.filter((b) => b.breaker !== breaker),
    { breaker, note, at: at.toISOString() },
  ];
  writeJson(WATCHLIST, list);
  return item;
}

export function openAlerts() {
  return listWatchlist()
    .filter((w) => w.breakersTriggered.length > 0)
    .map((w) => ({ symbol: w.symbol, name: w.name, triggered: w.breakersTriggered }));
}

/** Test seam. */
export function clearAll() {
  for (const e of listRuns()) removeRaw(runKey(e.id));
  removeRaw(RUNS_INDEX);
  removeRaw(WATCHLIST);
  MEMORY.clear();
}
