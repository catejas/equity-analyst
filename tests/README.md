# Tests

Not needed to run the app — the PWA is `index.html` plus the files in `sw.js`'s
precache list, and it has been verified to run from those alone with no 404s.
These are here because they are part of the project.

## Running them

    npm install            # playwright-core and jsdom
    npm test               # all 52 suites, including the Python cross-check
    node tests/run-all.mjs pnbfix reconcile     # named suites only

`run-all.mjs` starts the static server itself if one is not already listening
on 127.0.0.1:8848, and builds the document fixtures before the layout suites
that read them.

## Two things worth knowing

**A suite that cannot load is not a suite that passed.** 24 of these import
`jsdom`, and for a while they were being counted as green while failing with
module-not-found — a crash prints no FAIL line, and the count was grepping for
FAIL lines. `run-all.mjs` treats a non-zero exit as failure whatever was
printed, and a printed FAIL as failure whatever the exit code.

**Fixtures go stale.** `pairpass.mjs` reads `/tmp/doc-*.html`. It used to skip
silently when they were missing and report PASS having measured nothing; the
"0 pairs, 99% fill" reading that nearly closed the two-column question came
from there. It now refuses to run on missing or stale fixtures.

## The Python cross-check

`arith.py` recomputes the model and the discounted valuation from the raw
driver payload in exact rational arithmetic (`fractions.Fraction`), with no
reference to the JavaScript, and checks every stored figure is the correctly
rounded exact value. It found the engine summing rounded sector revenues into
its totals. Run it with `python3 tests/arith.py`.
