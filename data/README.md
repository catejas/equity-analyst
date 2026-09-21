# nse-instruments.json

Upstox keys its candle API by ISIN, not by ticker: `NSE_EQ|INE002A01018`. Its
live instrument-search endpoint needs a bearer token, so it is no use to a
static app, and the full daily master file is tens of thousands of rows of
gzip — too much to pull into a phone browser on every report.

So a trimmed `symbol -> instrument_key` map is shipped as a static asset and
looked up locally.

**This file is a seed, not the finished map.** It holds only keys that have
been verified against a primary source. It is deliberately not filled in by
guesswork: a wrong ISIN does not fail loudly, it returns somebody else's price
history, and every indicator downstream would then be confidently wrong about
the wrong company.

Two things already cover the gaps:

- A payload that states the company's own `isin` is used directly and does not
  consult this map at all.
- A symbol that is in neither place is reported in the provider attempts as
  "no instrument key", rather than failing silently.

## Regenerating it properly

Upstox publishes the full master daily, around 06:00 IST:

    https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz

Fetch it server-side — a scheduled GitHub Action is the intended home, since it
also solves the price fetch itself — keep only `NSE_EQ` equity rows, and emit
`{ trading_symbol: instrument_key }`. Commit the result here.
