# Equity Analyst

Institutional-grade research on the Indian listed universe, by segment or by
company. A progressive web app: static files, no build step, no server, no
account. Everything stays on the device.

## What it does

Enter a segment. The app generates a research prompt from its own scoring
constants. You run that prompt in an assistant that can search the web, bring
the JSON back, and the app validates it, scores it, ranks it and produces six
documents.

| Document | Scope |
|---|---|
| Sector Research Report | The segment: the world, macro, Budget, policy, industry, programmes, competition, then the ranking and the Top 3 |
| Company Research Report, one per Top 3 rank | One company in full |
| Executive Summary | Both, at a level that reads in one sitting |
| Score Card | Every rating with its anchor and the evidence behind it |

Naming a company instead switches to company mode: one report, a segment
backdrop rather than a sector study, nothing screened and nothing ranked.

## What makes it different from a chat transcript

The app owns the arithmetic. The payload carries judgements, evidence and
operating drivers; it carries no scores. Every score, ratio, forecast and
valuation is computed here, so the methodology cannot be rewritten by whatever
produced the JSON.

- Every rating is made against a written anchor and must arrive with the
  evidence sentence behind it. No evidence, no score.
- Forecasts are built from drivers and reconciled across the three statements
  every year, and the report says whether they tie.
- The forensic battery runs: Beneish, Altman, Piotroski, Montier, Sloan, plus
  the tests that catch Indian frauds — cash against the interest it earns,
  a decade of profit against a decade of operating cash, related-party lending,
  the pledge.
- Twenty-two litigation registers, with nil results recorded, so a clean record
  and an unexamined one do not look alike.
- Companies within three points share a rank, because ranking to one decimal
  would claim a precision the ratings do not have.
- Research that was not done is printed as a gap on the page.

None of it is investment advice.

## Files

```
index.html            the app
charts.js             the figures
render.js             the document builders
docs.js               the PDF and image pipeline
segments.js           the segment taxonomy
sw.js                 the service worker
manifest.webmanifest  the install manifest
icons/                the icon set
src/                  the engine and its bridge
vendor/               jsPDF and html2canvas
```

`EQUITY_ANALYST_FRAMEWORK.md` is the research framework, generated from the
engine so it cannot drift from the software. `VERSION.md` is how to cut a
release. `docs/` is the project record.

## Hosting on GitHub Pages

Create a repository named `equity-analyst`, upload the contents of this folder
to the root so `index.html` sits at the top level, then set Pages to deploy from
`main` at `/root`. Every path is relative, so it works under the
`/equity-analyst/` sub-path with no change.

## On the phone

Open the address and use Add to Home Screen. It runs full screen with its own
icon, and the shell works offline. Research needs a network, because the prompt
has to reach an assistant and come back.

## Where your data lives

On the device, in browser storage under keys beginning `eq.`. Imported runs,
their reports, the watchlist and settings are never uploaded. Clearing site data
clears them and there is no copy elsewhere, so download what you want to keep.
