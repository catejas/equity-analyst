# Data Source Requirements and Constraints

Nothing below has been tested, priced or verified against a live account. These
are the categories of source the specification requires, and the constraints
that apply to each. Treat every figure as needing confirmation from the vendor.

## What the engine needs before it can rank anything
1. Listed universe for NSE and BSE, with ISIN, symbol, name, sector, market cap
   and a liquidity measure. Blocks universe discovery and screening.
2. Annual and quarterly financial statements, consolidated and standalone kept
   separate, roughly 10 years. Blocks financial, fundamental and forensic work.
3. Price and volume history, roughly 5 years, adjusted for corporate actions,
   with unadjusted series retained. Blocks technicals and multibagger maths.
4. Corporate actions: splits, bonuses, rights, dividends, mergers, demergers.
   Without these the price history is wrong rather than merely incomplete.
5. Shareholding pattern and pledge data. Blocks the promoter red flag.
6. Filings and announcements. Blocks forensic and catalyst work.

## Constraint categories to check with any vendor
- Redistribution rights. Exchange data is generally licensed, and displaying it
  in an app is a different right from using it privately.
- Whether the licence is personal or commercial.
- Delay: real-time, 15-minute, or end-of-day. End-of-day is sufficient for this
  product; real-time is not needed and costs materially more.
- Rate limits and historical depth on the plan, not the marketing page.
- Whether corporate-action adjustment is done by the vendor or left to you.

## Access paths worth evaluating
- Exchange and regulator sources directly (NSE, BSE, SEBI, RBI). Authoritative
  and Tier 1, but the interfaces are not designed as product APIs.
- Licensed Indian market-data vendors and broker APIs.
- Fundamental-data aggregators covering Indian listed companies.

## The decision needed
Which provider, on which licence tier, at what budget. Until that is settled the
research pipeline cannot run, and the app will keep saying so rather than
producing a number.
