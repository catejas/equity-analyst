/* Every report is set at the same size, and that size is 9pt.
 *
 * Tejas approved the sample and then said where it has to apply: "Change font
 * size 9 in every Reports, Sector, Company Research, Top3 and Independent and
 * Score Card. Scenario." They all share one stylesheet, so they all moved
 * together — but "they share a stylesheet" is a claim about the code, and this
 * checks the rendered documents instead.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DOCS = ['co1', 'co2', 'co3', 'sector', 'exec', 'score'];
const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
let fail = 0, ran = 0;
const ok = (l, p, d) => { ran++; if(!p) fail++;
  console.log(`  ${p?'ok  ':'FAIL'}  ${l}${d?'  — '+d:''}`); };

for (const kind of DOCS) {
  const f = `/tmp/doc-${kind}.html`;
  if (!fs.existsSync(f)) { ok(`${kind} fixture present`, false, 'run gen-fixtures'); continue; }
  const p = await b.newPage({ viewport:{width:1000,height:1400} });
  await p.setContent(fs.readFileSync(f,'utf8'), { waitUntil:'networkidle' });
  await p.waitForTimeout(700);
  const m = await p.evaluate(() => {
    const px = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : null;
    const para = [...document.querySelectorAll('.lead p, p')]
      .find((x) => (x.textContent||'').trim().length > 120);
    return { body: px(document.body), para: px(para),
      /* No paragraph may still be held to a narrow measure: the two-column
         look Tejas asked to be rid of was a max-width, not a column rule. */
      capped: [...document.querySelectorAll('p,li,.note')]
        .filter((x) => x.style && x.style.maxWidth).length };
  });
  await p.close();
  /* 9pt at 96dpi is 12px. */
  ok(`${kind.padEnd(7)} body is 9pt`, Math.abs(m.body - 12) < 0.2, m.body + 'px');
  ok(`${kind.padEnd(7)} its prose is set at the body size or larger`,
    m.para == null || m.para >= 11.9, m.para + 'px');
  ok(`${kind.padEnd(7)} no paragraph is held to a narrow measure`, m.capped === 0,
    m.capped + ' capped');
}
await b.close();
console.log(fail ? `\nFAIL  ${fail} of ${ran}` : `\nPASS  ${ran} checks`);
process.exit(fail ? 1 : 0);
