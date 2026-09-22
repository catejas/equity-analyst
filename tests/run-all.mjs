/* Run the suite.
 *
 * There were 44 test files and no way to run them as a set, so "all tests
 * pass" meant whichever ones were remembered that day. Two of the defects
 * found in this cycle — a reconciliation flag that checked nothing, and a
 * layout test that passed having measured nothing — survived precisely
 * because nothing enumerated the suite.
 *
 * Order matters in one place: the layout tests read document fixtures, and
 * those fixtures have to be built from the current renderer first.
 *
 *   node tests/run-all.mjs            everything
 *   node tests/run-all.mjs pnbfix     one or more by name
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname);
const ROOT = path.resolve(DIR, '..');

/* Fixture builders first, then everything that reads a fixture. */
const FIRST = ['gen-fixtures'];
/* Files that are tools or generators rather than assertions.
 *
 * Named WITH their extension. This was a set of bare names, and `audit` on it
 * — meant for the tool audit.py — silently excluded a new tests/audit.mjs
 * carrying 25 assertions. The suite reported 75 of 75 passing and never ran
 * it. That is the same failure this runner was written to end: 24 suites once
 * sat unrun while everything reported green.
 *
 * So exclusions are exact filenames, and anything skipped is printed. */
const NOT_TESTS = new Set([
  'run-all.mjs', 'gen-fixtures.mjs', 'gen-test.mjs', 'gen-write.mjs', 'gen-bank.mjs',
  'measure.mjs', 'scmeasure.mjs', 'probe.mjs', 'readit.mjs', 'loadpage.mjs',
  'picker.mjs', 'audit.py', 'flow.py']);
/* Anything starting with an underscore is a scratch probe, not a suite. */

const only = process.argv.slice(2);
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs'));
const skipped = files.filter((f) => NOT_TESTS.has(f) || f.startsWith('_'));
const all = files
  .filter((f) => !NOT_TESTS.has(f) && !f.startsWith('_'))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();
/* Say what is not being run. A suite that quietly stops being run is worse
   than one that fails, because the report still says everything passed. */
if (!only.length && skipped.length) {
  console.log('not run (tools, not suites): ' + skipped.join(', ') + '\n');
}
const chosen = only.length ? only : all;
const order = [...FIRST.filter((f) => !only.length || only.includes(f)), ...chosen];

/* The app has to be served: several suites drive it in a real browser. */
async function serving() {
  return new Promise((res) => {
    const req = http.get('http://127.0.0.1:8848/index.html', (r) => { r.destroy(); res(r.statusCode === 200); });
    req.on('error', () => res(false));
    req.setTimeout(1500, () => { req.destroy(); res(false); });
  });
}
let server = null;
if (!(await serving())) {
  server = spawn('python3', ['-m', 'http.server', '8848', '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore', detached: false });
  await new Promise((r) => setTimeout(r, 1500));
  if (!(await serving())) {
    console.log('could not serve the app on 127.0.0.1:8848');
    process.exit(1);
  }
}

const run = (name) => new Promise((res) => {
  const p = spawn('node', [path.join(DIR, name + '.mjs')], { cwd: ROOT });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => res({ name, code, out }));
});

const results = [];
for (const name of order) {
  if (!fs.existsSync(path.join(DIR, name + '.mjs'))) {
    console.log(`${name.padEnd(16)} MISSING`);
    results.push({ name, code: 1 });
    continue;
  }
  const r = await run(name);
  /* A suite that neither prints FAIL nor exits non-zero has passed. A suite
     that prints a FAIL line has not, whatever it exits with — some of these
     report and then exit 0, which is how a failing assertion once went by
     unnoticed for a full cycle. */
  const printedFail = /^FAIL/m.test(r.out);
  const ok = r.code === 0 && !printedFail;
  results.push({ ...r, ok });
  console.log(`${name.padEnd(16)} ${ok ? 'pass' : 'FAIL'}`);
  if (!ok) {
    const lines = r.out.split('\n').filter((l) => /^FAIL|Error|error/.test(l)).slice(0, 4);
    lines.forEach((l) => console.log('                 ' + l.trim()));
  }
}

/* The Python suites are part of this, not extras: arith.py is the only
   independent check on the engine's arithmetic, and toclinks.py reads the
   printed PDF, which no JavaScript suite can do. */
if (!only.length) {
  /* toclinks reads one PDF per run, so it is run once per document. It used
     to be run once, against a hard-coded path — which meant three of the four
     documents' contents links were never checked at all, and the vector
     writer's output never once. */
  const PY = [['arith.py', []],
    ['toclinks.py', ['/tmp/vec-co1.pdf', 'co1']],
    ['toclinks.py', ['/tmp/vec-sector.pdf', 'sector']],
    ['toclinks.py', ['/tmp/vec-exec.pdf', 'exec']],
    ['toclinks.py', ['/tmp/vec-score.pdf', 'score']],
    ['toclinks.py', ['/tmp/toc-plain.pdf', 'co1']]];
  for (const [file, args] of PY) {
    const name = args.length ? `${file} ${args[1] || ''}`.trim() : file;
    const py = await new Promise((res) => {
      const p = spawn('python3', [path.join(DIR, file), ...args], { cwd: ROOT });
      let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
      p.on('close', (code) => res({ code, out }));
    });
    const ok = py.code === 0;
    results.push({ name, ok });
    console.log(`${name.padEnd(22)} ${ok ? 'pass' : 'FAIL'}`);
    if (!ok) console.log(py.out.split('\n').slice(-10).join('\n'));
  }
}

if (server) server.kill();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} suites pass`);
if (bad.length) console.log('failing: ' + bad.map((r) => r.name).join(' '));
process.exit(bad.length ? 1 : 0);
