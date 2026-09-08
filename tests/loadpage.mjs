import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const dir = '/home/claude/eqapp';
const errors = [];
const logs = [];

const dom = new JSDOM(fs.readFileSync(dir + '/index.html', 'utf8'), {
  runScripts: 'dangerously',
  url: 'https://example.com/equity-analyst/',
  pretendToBeVisual: true,
  resources: undefined,
  beforeParse(window) {
    window.matchMedia = window.matchMedia || (() => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
    window.scrollTo = () => {};
    window.alert = (m) => logs.push('ALERT: ' + m);
    window.navigator.clipboard = { writeText: async () => {} };
    window.HTMLCanvasElement.prototype.getContext = () => null;
    window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.error ? e.error.stack : e.message)));
  },
});
const w = dom.window;
w.console.error = (...a) => errors.push('console.error: ' + a.join(' '));

// The page loads charts.js, render.js, docs.js and segments.js as separate
// files; jsdom will not fetch them, so inject them in the same order the page
// does, then the engine bridge's exports.
for (const f of ['segments.js', 'charts.js', 'render.js', 'docs.js']) {
  try {
    const el = w.document.createElement('script');
    el.textContent = fs.readFileSync(dir + '/' + f, 'utf8');
    w.document.body.appendChild(el);
  } catch (e) { errors.push('loading ' + f + ': ' + e.message); }
}

await new Promise((r) => setTimeout(r, 400));

console.log('=== load errors ===');
console.log(errors.length ? errors.join('\n---\n') : 'none');
console.log('\n=== key globals present ===');
for (const n of ['buildPrompt','formVals','readPayload','auditPayload','libRead',
                 'renderScoreTab','drawAnalysisPanel','recName','syncSearchButton','setPending']) {
  console.log('  ' + n + ':', typeof w[n]);
}
console.log('\n=== Setup build element ===');
const vb = w.document.getElementById('verBuild');
console.log('  #verBuild text:', vb ? JSON.stringify(vb.textContent) : 'ELEMENT MISSING');
console.log('  APP_BUILD:', w.APP_BUILD);
console.log('\n=== import controls ===');
for (const id of ['importText','btnRead','btnSaveImport','importCard','reviewBox','importSrc','payloadFile']) {
  console.log('  #' + id + ':', w.document.getElementById(id) ? 'present' : 'MISSING');
}
