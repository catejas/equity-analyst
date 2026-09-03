// provider.js — external data behind an adapter (doc 07).
// No provider is configured yet. The unconfigured provider returns explicit
// unavailability. It never returns sample, placeholder or synthetic prices,
// because a plausible-looking number is the most dangerous output this app
// could produce.

import { missing, UNAVAILABLE } from '../core/integrity.js';

/**
 * Every adapter must implement this shape. Keys are never held client-side;
 * a configured adapter calls the app's own server route, which holds the secret.
 */
export const ProviderContract = Object.freeze({
  id: 'string',
  name: 'string',
  tier: 'number (1-4, doc 05)',
  capabilities: '{ universe, quotes, fundamentals, corporateActions, filings }',
  listUniverse: 'async ({ exchange }) => DataPoint[] | Unavailable',
  getQuote: 'async ({ symbol }) => DataPoint | Unavailable',
  getFundamentals: 'async ({ symbol, years }) => DataPoint[] | Unavailable',
  getCorporateActions: 'async ({ symbol }) => DataPoint[] | Unavailable',
  health: 'async () => { ok, checkedAt, detail }',
});

export const NO_PROVIDER_REASON =
  'No market-data provider is configured. Connect a licensed feed in Settings before running research.';

export const unconfiguredProvider = Object.freeze({
  id: 'unconfigured',
  name: 'No provider configured',
  tier: null,
  capabilities: {
    universe: false, quotes: false, fundamentals: false,
    corporateActions: false, filings: false,
  },
  async listUniverse() { return missing(NO_PROVIDER_REASON); },
  async getQuote() { return missing(NO_PROVIDER_REASON); },
  async getFundamentals() { return missing(NO_PROVIDER_REASON); },
  async getCorporateActions() { return missing(NO_PROVIDER_REASON); },
  async health() {
    return { ok: false, checkedAt: new Date().toISOString(), detail: NO_PROVIDER_REASON };
  },
});

const registry = new Map([[unconfiguredProvider.id, unconfiguredProvider]]);
let active = unconfiguredProvider.id;

export function registerProvider(adapter) {
  for (const key of ['id', 'name', 'listUniverse', 'getQuote', 'getFundamentals', 'health']) {
    if (!(key in adapter)) throw new Error(`Provider adapter missing "${key}".`);
  }
  if (typeof adapter.apiKey === 'string') {
    throw new Error('Adapters must not carry API keys. Credentials stay server-side (doc 01).');
  }
  registry.set(adapter.id, adapter);
  return adapter.id;
}

export function useProvider(id) {
  if (!registry.has(id)) throw new Error(`Provider not registered: ${id}`);
  active = id;
  return registry.get(id);
}

export function getProvider() { return registry.get(active); }
export function listProviders() { return [...registry.values()].map(({ id, name, tier, capabilities }) => ({ id, name, tier, capabilities })); }

/** True only when a real feed is wired and healthy. Gates the research run. */
export async function researchReadiness() {
  const p = getProvider();
  const h = await p.health();
  const blocking = [];
  if (p.id === 'unconfigured') blocking.push(NO_PROVIDER_REASON);
  if (!h.ok) blocking.push(h.detail || UNAVAILABLE);
  if (!p.capabilities?.universe) blocking.push('Provider cannot list the Indian listed universe.');
  if (!p.capabilities?.fundamentals) blocking.push('Provider cannot supply financial statements.');
  return { ready: blocking.length === 0, provider: p.name, blocking, checkedAt: h.checkedAt };
}
