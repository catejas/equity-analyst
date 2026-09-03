# Running the app

You do not need to install anything to look at it, but a service worker only
works over http, not by opening the file directly.

From the project folder:

    python3 -m http.server 8080

Then open http://localhost:8080 on your computer, or the same address with your
computer's local IP on your phone if both are on the same wifi.

To run the calculation tests:

    node tests/run-tests.js

Expect "40 passed, 0 failed". If any test fails, a calculation is wrong and the
release gate in doc 08 is not met.

## What you will see
The dashboard opens on a data-status block saying research is paused. That is
correct and intended. There is no market-data feed connected, so the app refuses
to produce numbers rather than showing plausible-looking ones.

The Alerts tab has an engine self-check that runs the scoring, ranking and
integrity engines in your browser on fixed test values. Those numbers are test
inputs, clearly labelled, and are not research.
