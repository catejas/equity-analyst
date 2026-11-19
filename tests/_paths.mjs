/* Where the suites find the application and the real research payloads.
 *
 * The suites were written in one long session and pointed at that machine's
 * folders: the app at /home/claude/eqapp and the payloads Tejas sent at
 * /root/.claude/uploads/<session>/. Neither exists anywhere else, so a fresh
 * checkout failed 68 of 89 suites before testing anything (19-11-2026).
 * Everything now resolves from the repository itself. */
import path from 'node:path';
export const ROOT = path.resolve(import.meta.dirname, '..');
export const REAL = path.join(ROOT, 'tests', 'fixtures', 'real');
