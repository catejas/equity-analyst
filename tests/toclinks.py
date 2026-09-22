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

The same mistake was then made three more times in this file itself.

It hard-coded the PDF it read and ignored the path it was given, so four runs
against four documents all reported the same 42 links — the in-page vector
writer's output was never examined at all.

It insisted on NAMED destinations. A link may instead point straight at a page
object, which is what the vector writer emits and what every reader resolves
without complaint. Requiring one spelling failed four valid documents.

And it tried to scrape each row's printed page number back out of the PDF. The
contents is set in two columns, every text extractor interleaves them, and the
comparison ended up matching a row's page number against the next column's
section number — reporting all 42 wrong. So the answer now comes from the DOM,
where it is not in doubt: gen-fixtures records what each row prints and where
its anchor actually landed, and this checks the PDF's links agree with it.

    python3 tests/toclinks.py [/tmp/vec-co1.pdf] [co1]
"""
import json
import sys
from pathlib import Path

from pypdf import PdfReader

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/toc-plain.pdf')
# Which document's contents this PDF should agree with.
KIND = sys.argv[2] if len(sys.argv) > 2 else (
    next((k for k in ('co1', 'sector', 'exec', 'score') if k in SRC.name), 'co1'))
EXPECT = Path(f'/tmp/toc-{KIND}.json')

fail = 0


def ok(label, cond):
    global fail
    if not cond:
        fail = 1
        print('FAIL  ' + label)
    else:
        print('ok    ' + label)


if not SRC.exists():
    print(f'FAIL  no PDF at {SRC} — run tests/gen-fixtures.mjs first')
    raise SystemExit(1)
if not EXPECT.exists():
    print(f'FAIL  no contents record at {EXPECT} — run tests/gen-fixtures.mjs first')
    raise SystemExit(1)

rows = json.loads(EXPECT.read_text())
r = PdfReader(str(SRC))
root = r.trailer['/Root']
pages = {p.indirect_reference.idnum: i + 1 for i, p in enumerate(r.pages)}

# The destination table, in EITHER of the two places a PDF may hold it.
table = None
if '/Dests' in root:
    table = {str(k).lstrip('/'): v for k, v in root['/Dests'].get_object().items()}
elif '/Names' in root and '/Dests' in root['/Names']:
    flat = root['/Names']['/Dests']['/Names']
    table = {str(flat[i]).lstrip('/'): flat[i + 1] for i in range(0, len(flat), 2)}


def dest_y(dest):
    """The y a destination scrolls to, in points from the page bottom, or None
    when it points at the page as a whole."""
    if dest is None:
        return None
    if not isinstance(dest, list):
        dest = (table or {}).get(str(dest).lstrip('/'))
    if dest is None:
        return None
    try:
        target = dest.get_object() if hasattr(dest, 'get_object') else dest
        if isinstance(target, dict):
            target = target.get('/D')
        if len(target) < 3 or str(target[1]) != '/XYZ':
            return None
        return None if target[2 + 1] is None else float(target[2 + 1])
    except Exception:
        return None


def dest_page(dest):
    """The 1-based page a destination points at — named or direct, or None."""
    if dest is None:
        return None
    if not isinstance(dest, list):
        dest = (table or {}).get(str(dest).lstrip('/'))
    if dest is None:
        return None
    try:
        target = dest.get_object() if hasattr(dest, 'get_object') else dest
        if isinstance(target, dict):
            target = target.get('/D')
        return pages.get(target[0].idnum)
    except Exception:
        return None


# Link annotations, in the order a reader meets them: down the left column,
# then down the right. x is bucketed so a hair of sub-pixel drift inside one
# column does not reorder it.
found = []
found_y = []
for page in r.pages:
    here = []
    for annot in (page.get('/Annots') or []):
        o = annot.get_object()
        if o.get('/Subtype') != '/Link':
            continue
        d = o.get('/Dest')
        if d is None and o.get('/A'):
            d = o.get('/A').get_object().get('/D')
        rect = [float(x) for x in o.get('/Rect')]
        here.append((round(rect[0] / 20), -max(rect[1], rect[3]), dest_page(d), dest_y(d)))
    if here:
        here.sort()
        found = [h[2] for h in here]
        found_y = [h[3] for h in here]
        break                       # the contents page is the only one with them

if not rows:
    print(f'      {SRC.name}: this document has no contents page')
    ok('and the PDF carries no stray links either', not found)
    print('\n' + ('FAIL' if fail else 'PASS'))
    raise SystemExit(1 if fail else 0)

# The DOM's own reading order, sorted the same way.
ordered = sorted(rows, key=lambda x: (round(x['x'] / 20), x['y']))
expected = [x['actual'] for x in ordered]
printed = [x['printed'] for x in ordered]

print(f'      {len(r.pages)} pages, {len(found)} link annotations, '
      f'{len([p for p in found if p])} resolve to a page')
ok('the contents rows are links', len(found) >= 4)
ok('one link per contents row', len(found) == len(rows))
ok('every link resolves to a real page in this document', bool(found) and all(found))
ok('none lands on the tear sheet', all(p != 1 for p in found if p))

wrong = [(i, a, b) for i, (a, b) in enumerate(zip(found, expected)) if a != b]
for i, a, b in wrong[:6]:
    print(f'      row {i + 1} jumps to page {a}, the section is on page {b}')
print(f'      checked {min(len(found), len(expected))} links against where the section landed, '
      f'{len(wrong)} disagree')
ok('every link jumps to the page its section is on', not wrong)

mislabelled = [(i, p, a) for i, (p, a) in enumerate(zip(printed, expected)) if p != a]
for i, p, a in mislabelled[:6]:
    print(f'      row {i + 1} prints page {p}, the section is on page {a}')
ok('and the contents prints the page the section is on', not mislabelled)

# And it lands on the section, not at the top of the page.
#
# A destination given only a page number resolves to the page's top-left, so
# tapping "Sum of the parts" jumped to page 13 and left the reader to find the
# heading somewhere down it. Where several rows point at the same page, their
# destinations must differ — and each must sit near where the section starts.
# The PAGE BOX, which is not always the sheet. The vector writer makes the
# sheet the box (210 x 263mm); the browser print path puts the same box at the
# top of an A4 sheet, so a section 44% down the box is 39% down that sheet. The
# box is 210mm wide in both, so its height follows from the sheet's width.
sheet_h = float(r.pages[0].mediabox.height)
page_w = float(r.pages[0].mediabox.width)
box_h = page_w * (263.0 / 210.0)
# The symptom was every destination resolving to the same place: the top of a
# page. Two sections CAN legitimately share a y — one at the foot of a page and
# its continuation at the top of the next — so this asks the weaker question
# that the defect actually failed: does anything at all land below the top?
below_top = [y for y in found_y if y is not None and (sheet_h - y) / box_h > 0.06]
ok('destinations are section positions, not page tops',
   not found_y or bool(below_top))

wrong_y = 0
checked_y = 0
for i, y in enumerate(found_y):
    if y is None or i >= len(ordered):
        continue
    want = ordered[i].get('offsetFrac')
    if want is None:
        continue
    checked_y += 1
    # The destination is measured from the page bottom, the DOM offset from the
    # top, and the two are in different units — so both are taken as a fraction
    # of the page height. 3% of a page is about 8mm of slack, which covers the
    # headroom the writer leaves above a heading.
    got = (sheet_h - y) / box_h
    if abs(got - want) > 0.03:
        wrong_y += 1
        if wrong_y <= 4:
            print(f'      row {i + 1} lands {round(got * 100)}% down its page, '
                  f'the section starts at {round(want * 100)}%')
print(f'      checked {checked_y} destinations against where the section sits, '
      f'{wrong_y} off by more than 3% of a page')
ok('every link lands on its section, not on the page top', wrong_y == 0)

print('\n' + ('FAIL' if fail else 'PASS'))
raise SystemExit(1 if fail else 0)
