/* The real renderer, at last. Everything before this was measured in jsdom,
   which has no layout — which is why six pagination rewrites all passed their
   tests and all failed on the phone. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const b = await chromium.launch({ executablePath:'/opt/google/chrome/chrome', args:['--no-sandbox'] });
const page = await b.newPage({ viewport:{ width:1000, height:1400 } });
const errs = [];
page.on('pageerror', e => errs.push(e.stack ? e.stack.split('\n').slice(0,4).join(' | ') : e.message));
await page.setContent(fs.readFileSync('/tmp/company-new.html','utf8'), { waitUntil:'networkidle' });
await page.waitForTimeout(700);

const r = await page.evaluate(() => {
  const pages = [...document.querySelectorAll('.page')];
  return {
    audit: window.__EQ_PAGINATION || null,
    pages: pages.length,
    perPage: pages.map(p => p.querySelector('.body') ? p.querySelector('.body').children.length : -1),
    heights: pages.slice(0,6).map(p => {
      const bd = p.querySelector('.body');
      return bd ? { client: bd.clientHeight, scroll: bd.scrollHeight } : null;
    }),
    tocRows: document.querySelectorAll('[data-toc] a').length,
  };
});
console.log('script errors :', errs.length ? errs.join(' | ') : 'none');
console.log('audit         :', JSON.stringify(r.audit));
console.log('pages         :', r.pages);
console.log('blocks/page   :', r.perPage.join(', '));
console.log('first 6 boxes :', JSON.stringify(r.heights));
console.log('contents rows :', r.tocRows);
await b.close();
