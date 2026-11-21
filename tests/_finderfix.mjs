/* A synthetic Sector Finder screen for the suites. TEST DATA, NOT RESEARCH:
 * every figure is generated from the sector's position in the list, so the
 * expected ranking can be worked out by hand. */
import { FINDER_SECTORS } from '../src/core/finder.js';
export function finderFixture({ upto = FINDER_SECTORS.length, thin = [] } = {}) {
  const sectors = FINDER_SECTORS.slice(0, upto).map((name, i) => {
    const k = (i * 37) % 41;                       /* a fixed shuffle */
    const row = {
      name, subSector: '', index: '',
      returns: { m3: +(k / 4 - 3).toFixed(1) || 0.4, m6: +(k / 2 - 5).toFixed(1) || 0.6, y1: +(k - 12).toFixed(1) || 0.8, asOf: '20-11-2026', source: 'test data' },
      bellwethers: [{ symbol: 'AAA' + i }, { symbol: 'BBB' + i }, { symbol: 'CCC' + i }],
      business: { revenueGrowth: 5 + (k % 9), profitGrowth: 3 + (k % 13), period: 'four quarters to Q2 FY27', basis: 'test', source: 'test data' },
      outlook: { earningsGrowth3y: 6 + ((k * 7) % 15), demandGrowth3y: 4 + ((k * 3) % 11), years: 'FY26 to FY29',
        tailwinds: ['Test tailwind one, 10 percent', 'Test tailwind two, 12 percent'], risks: ['Test risk one, 5 percent', 'Test risk two, 7 percent'], source: 'test data' },
      valuation: { pe: 15 + (k % 20), pe5yAvg: 20 + ((k * 5) % 10), asOf: '20-11-2026', source: 'test data' },
      why: 'Test data for ' + name + '.',
    };
    if (name === 'Banking') { row.subSector = 'Public sector banks'; row.index = 'Nifty Bank'; }
    if (thin.includes(name)) delete row.valuation;
    return row;
  });
  return { schema: 'equity-analyst/5',
    run: { kind: 'sectorScreen', schemaVersion: '5.0.0', generatedAt: '2026-11-21T09:00:00Z', tool: 'Claude', searchesRun: 60,
      researchNotes: 'TEST DATA', searchLog: [] },
    benchmark: { name: 'Nifty 50', returns: { m3: 1.5, m6: 3.0, y1: 6.0 }, asOf: '20-11-2026', source: 'test data' },
    sectors };
}
