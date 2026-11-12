# HK ELI business database (SQLite)

One SQLite file holding the HK ELI demo business at row level: clients, deals, trades, RFQs, maturities and rollovers. It is generated from the gateway's demo seed (`gateway/src/main/resources/seed/`). Every figure the seed shows on Today, the client brief, the Business update and Ideas adds back up exactly from these rows. All data is fictional.

It uses the table layout of Niharika's HK_ELI service, so her `eli.*` skills can read it as their `business.sqlite`. We add columns and four tables for our screens. Her repo is not changed.

```bash
python3 business-db/build.py                         # writes business-db/out/business.sqlite (git-ignored)
python3 -m unittest discover -s business-db -v       # reconciliation tests
```

Standard library only, Python 3.9 or later. The build is deterministic. To also run her 13 business queries on the file, point `HKELI_REPO` at her clone and use an interpreter that has `pydantic` installed (her lock pins 2.14.1):

```bash
HKELI_REPO=../HK_ELI_niharika path/to/python -m unittest discover -s business-db -v
```

To use it in her service, copy the file to her `var/business.sqlite` before starting it. Her loader only seeds when `metadata` is empty, so it keeps this data. Ask her skills for `currency: USD`. Her default is HKD, which returns nothing here.

## What is in it

| Table | Rows | What it holds |
| --- | --- | --- |
| `customers` | 2,010 | 12 named clients from `today.json`, plus generated clients that make the Business update counts (active and idle per branch and segment) |
| `positions` | 2,157 deals / 2,659 legs | Deals outstanding at the data date, one row per basket leg; USD 600m book |
| `sales` | 2,672 | Every trade, including those for deals that have since matured |
| `rfqs` | 967 | The named clients' RFQs and this month's RFQs per branch, segment and underlying |
| `rollovers` | 559 | 44 upcoming eligible maturities (contacted or not), plus deals that already matured (rolled or cashed), including this month's |
| `maturities`, `branches`, `engagement`, `channel_events` | | Her layout, filled or derived from the rows above |
| `market` | 16 | Symbols and volatility. Price is NULL because the seed has no prices |
| `products`, `idea_warehouse` | 16 | The Ideas warehouse from `ideas.json` |
| `thresholds`, `underlying_limits` | | Book limit per underlying, client limit, rollover baseline, idle days, window length |
| `fx_rates`, `source_loads` | | USD and HKD (HKD at the 7.8 peg, an assumption, not from the seed); data and pricing load times for the freshness banner |

Column-by-column notes are in [`schema.sql`](schema.sql).

## Rules the data follows

- **Dates.** "Today" is 3 Nov 2026, the demo date. `metadata.as_of` is the data date, 2 Nov 2026 (the last close, as the freshness banner says). "This month" is 1 Nov to the data date and "last month" is October. The maturing window is the next 10 business days after today. A client is active if they traded within 90 days of today.
- **Look-through exposure.** A worst-of deal has one `positions` row per underlying, and all of them share the deal id. `sum(notional)` by underlying gives exposure, and `count(DISTINCT id)` counts deals. Leg weights are explicit (`leg_weight`) and chosen so the seed's client shares hold.
- **Maturing cash** counts cash-settled deals maturing in the window, plus likely knock-outs (`ko_flag = 1`) whose next observation is in the window. Physical delivery (`settlement = 'physical'`) does not count.
- **RFQ status** keeps her words: `won` means traded, `open` means quoted and still live, `lost` means not traded.
- **Not invented:** revenue (NULL), prices (NULL), and calls or meetings. `engagement` only lists trades and RFQs.

## What is checked (`test_business_db.py`)

- Her 13 tables keep all their columns in her order. Our four new tables exist.
- Each named client's name, CIF, risk, RM, branch, outstanding, maturing cash, days since last trade, listed concentrations and RFQs match `today.json`. Unlisted underlyings are all smaller than the listed ones.
- The lead stories hold. c-4821 has USD 420k of NVDA/AMD maturing in 3 business days and rolled 2 of the last 3 maturities into NVDA. c-1093 is 1.8% below the TSLA barrier with USD 260k. c-7720 has 3,000 AMD shares due. c-3310 made 12 trades in 2025 and holds nothing.
- Book concentration: the top five underlyings and their shares (24.63%, 17.9%, and so on) match, with the 25% limits.
- Business update: for each branch and segment, this month's trades and notional, last month's notional, RFQs and traded, matured and rolled, and active and idle clients all match. Each pocket's maturing USD and rollover % match too.
- Unmet demand: quotes and traded per underlying and channel match, the most common ask matches `topAsk`, and no other underlying has more quotes.
- The idea warehouse matches `ideas.json`, and two builds give the same file.
- With `HKELI_REPO` set: all 13 of her business operations return rows, and her concentration shares equal the seed's.

## Known gaps

- Her skills read only her original columns, so KO risk, RFQ terms, RM and client names and the idea warehouse need query changes on her side before her answers use them.
- Her `yield` operation uses `count(*)`, so it counts basket legs as positions.
- Four named clients' last trades fall on a weekend (the seed's day counts, kept exactly).
- The seed puts two Digibank clients in the Treasures segment, but the Business update row is "Digibank, Self-directed". Rows are matched by branch for Digibank.
