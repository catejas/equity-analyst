# Real research payloads used by the test suites

Every suite finds these through `tests/_paths.mjs` (`REAL`). Before build 24,
the suites read them from the build session's own upload folder
(`/root/.claude/uploads/a65cacee-…/`). That folder existed nowhere else, so a
fresh checkout failed 68 of 89 suites before testing anything.

## Real, exactly as received (16-11-2026, Claude)

| File | What it is |
|---|---|
| `banking-psb-sector-16-11-2026.json` | Banking / Public sector banks sector run: 12-bank shortlist, 34 searches |
| `banking-psb-topup1-16-11-2026.json` | Top-up 1: competition on one metric, TAM corrected, SAM set, 5-year global CAGR |
| `banking-psb-topup2-16-11-2026.json` | Top-up 2: group rows restated |
| `banking-psb-topup3-16-11-2026.json` | Top-up 3: every player on RBI BSR-1, March 2026 |
| `pnb-company-16-11-2026.json` | PNB company run, **cut off at 67,215 bytes** as pasted (part 2 never arrived) |
| `pnb-topup-sources-litigation-16-11-2026.json` | PNB top-up carrying `sources` and `litigation.searched` |

## Sector Finder, real, exactly as received (22-11-2026)

Tejas's first real Sector Finder run and its seven follow-ups, read by
`finderreal.mjs` (build 30) and `finder31.mjs` (build 31).

| File | What it is |
|---|---|
| `finder-22-11-2026-base.json` | The 41-sector screen (77% depth on build 29) |
| `finder-22-11-2026-topup1.json` to `-topup4.json` | The four follow-ups, in the order they were sent |
| `finder-22-11-2026-topup5.json` to `-topup7.json` | Follow-ups 5 to 7 (23-11-2026): long-run medians, bellwether business growth; read by `finderreal.mjs` and `finder31.mjs` |

## Built from those by the app itself

| File | How it was made |
|---|---|
| `banking-psb-merged-16-11-2026.json` | Sector run plus top-ups 1 to 3 via `mergeTopUp` (completeness 89% → 98%) |
| `pnb-merged-16-11-2026.json` | The cut-off PNB run read by the page's own `readOne` (which repairs the truncation; 46 sections recovered), plus its top-up via `mergeTopUp` (completeness 96%) |
| `banking-psb-with-pnb-16-11-2026.json` | `composePayload(banking-merged, [pnb-merged])`: the full study |

## Legacy names kept by the older suites

The September payloads these names stood for were chat attachments and were
not retained. Each name now holds the closest real equivalent.

| Legacy file | Now holds | Basis |
|---|---|---|
| `944cc4df-attachment.txt` | The full 16-11 study (`banking-psb-with-pnb`) | Real |
| `da0c46c1-attachment.txt` | The 16-11 Banking sector run, raw (percentage points) | Real |
| `57d8e52f-attachment.txt` | Reliance, Gemini, 20-09-2026 (= `tests/fixtures/ril.json`) | Real |
| `2f13d57b-PNB_gemini-code-1789969768806.json` | PNB, Gemini, 21-09-2026, percentage points (= `tests/fixtures/psu.json`) | Real |
| `107fec97-attachment.txt` | PNB, Gemini, 21-09-2026, **fraction-scaled**: the real PNB entry of `psu-banks-3.json` with its sector block, shortlist removed | Real company, reconstructed wrapper |
| `ffcba469-attachment.txt` | **Derived**: the Reliance run renamed SpiceJet, run sector "Aviation / Airlines", to replay the wrong-sector reply in `sectorclean.mjs` | Derived; not research |

Where a suite's assertion depended on a September run's particular facts
(which three banks the screen picked, a two-year-old macro reading, one global
peer), it was changed in build 24 to check the rule. Either the expected
answer is worked out from the payload in the test, or a thin case is derived
from the real run in the open. Each such place carries a comment saying so.
