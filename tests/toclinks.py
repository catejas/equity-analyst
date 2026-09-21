"""The contents links in the printed PDF.

THIS WAS CLOSED TWICE AS IMPOSSIBLE, AND IT ALREADY WORKED.

The measurement was: "41 link annotations emitted, but no /Names dictionary in
any combination of options — impossible on the browser print path, would need
an in-JS vector writer." Every fact in that sentence was true. The conclusion
was wrong, because it looked for the destination table in one place.

A PDF may hold named destinations two ways. `/Names /Dests` is the name-tree
form added in PDF 1.2. `/Dests` directly in the catalogue is the older
dictionary form from PDF 1.1, and it is equally valid and equally resolvable.
Chromium writes the second. Looking only for the first and reporting absence is
how a working feature was written off twice, and how a tool then got built to
repair something that was not broken.

The lesson is narrower than "check twice": an absence is only evidence when you
have enumerated the places the thing could be. `/Names not in root` answers
"is it in this one place", and that was reported as "it does not exist".

What this pins is the behaviour itself, so that a real regression — Chromium
dropping the table, or the anchors drifting out of step with the contents —
would be caught rather than argued about.
"""
import re
from pathlib import Path

from pypdf import PdfReader

SRC = Path('/tmp/toc-plain.pdf')
fail = 0


def ok(label, cond):
    global fail
    if not cond:
        fail = 1
        print('FAIL  ' + label)
    else:
        print('ok    ' + label)


if not SRC.exists():
    print('FAIL  no printed fixture at /tmp/toc-plain.pdf — run tests/vectorpdf.mjs first')
    raise SystemExit(1)

r = PdfReader(str(SRC))
root = r.trailer['/Root']

links = named = 0
for page in r.pages:
    for annot in (page.get('/Annots') or []):
        o = annot.get_object()
        if o.get('/Subtype') != '/Link':
            continue
        links += 1
        d = o.get('/Dest') or (o.get('/A').get_object().get('/D') if o.get('/A') else None)
        if d is not None and str(d).lstrip('/').startswith('sec-'):
            named += 1

print(f'      {len(r.pages)} pages, {links} link annotations, {named} with a section destination')
ok('the print path emits contents links', links > 20)
ok('each carries a named destination', named == links)

# The destination table, in EITHER of the two places a PDF may hold it.
table = None
if '/Dests' in root:
    table = {str(k).lstrip('/'): v for k, v in root['/Dests'].get_object().items()}
elif '/Names' in root and '/Dests' in root['/Names']:
    flat = root['/Names']['/Dests']['/Names']
    table = {str(flat[i]).lstrip('/'): flat[i + 1] for i in range(0, len(flat), 2)}

ok('a destination table is present — in /Dests or under /Names, both are valid',
   table is not None and len(table) > 0)
ok('it holds one entry per link', table is not None and len(table) == named)
ok('and a standard reader resolves every one of them', len(r.named_destinations) == named)

pages = {p.indirect_reference.idnum: i + 1 for i, p in enumerate(r.pages)}
mapped = {k: pages.get(v[0].idnum) for k, v in (table or {}).items()}
ok('every destination resolves to a real page', all(p is not None for p in mapped.values()))
ok('none lands on the tear sheet', all(p != 1 for p in mapped.values()))

# Against the contents the application itself printed.
contents = ''
for p in r.pages[:3]:
    t = p.extract_text() or ''
    if 'Contents' in t:
        contents = t[t.find('Contents') + len('Contents'):]
        break
ok('the contents page is readable', bool(contents))

stated = []
for m in re.finditer(r'\s(\d{1,3})(?=[A-Z\n]|$)', contents):
    v = int(m.group(1))
    if v < 1 or v > len(r.pages) or (stated and v < stated[-1]):
        break
    stated.append(v)

checked = wrong = 0
for name, page in mapped.items():
    m = re.search(r'(\d+)$', name)
    if not m:
        continue
    i = int(m.group(1)) - 1
    if i < len(stated):
        checked += 1
        if page != stated[i]:
            wrong += 1
            print(f'      {name} -> page {page}, contents says {stated[i]}')

print(f'      checked {checked} destinations against the printed contents, {wrong} disagree')
ok('every link goes where the contents says it goes', checked > 20 and wrong == 0)

print('\n' + ('FAIL' if fail else 'PASS'))
raise SystemExit(1 if fail else 0)
