/* The contents list is only worth having if its page numbers are true, so this
   runs the real paginator in a DOM and reads what it produced. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
const html = fs.readFileSync('/tmp/company-new.html','utf8');
const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
    w.addEventListener('error', e => console.log('SCRIPT ERROR:', e.error ? e.error.stack.split('\n').slice(0,3).join(' | ') : e.message));
    /* jsdom has no layout, so scrollHeight is always 0 and the packer believes
       everything fits. That is fine for checking the map is BUILT; the page
       numbers themselves can only be trusted in a real browser. */ } });
await new Promise(r=>setTimeout(r,400));
const w = dom.window, d = w.document;
console.log('sections found in markup :', d.querySelectorAll('.sec').length);
console.log('toc host present         :', !!d.querySelector('[data-toc]'));
console.log('toc map built            :', Array.isArray(w.__EQ_TOC) ? w.__EQ_TOC.length + ' entries' : 'NOT BUILT');
if (Array.isArray(w.__EQ_TOC)) {
  w.__EQ_TOC.slice(0,6).forEach(e => console.log('   ', String(e.num).padStart(3), e.title.slice(0,46).padEnd(48), 'p.'+e.page, e.id));
}
const host = d.querySelector('[data-toc]');
console.log('toc rendered rows        :', host ? host.querySelectorAll('.toc-row').length : 0);
const first = host && host.querySelector('.toc-row');
console.log('first row links to       :', first ? first.getAttribute('href') : '(none)');
console.log('anchor target exists     :', first ? !!d.querySelector(first.getAttribute('href')) : false);
