-- HK ELI business database (SQLite). Fictional data, generated from gateway/src/main/resources/seed/.
--
-- The first 12 tables keep every column of the layout in Niharika's HK_ELI service
-- (mock_data/generate.py) with the same names and meanings, so her eli.* skills can read this file
-- unchanged. Columns after "-- added" and the last four tables are our additions for the HK ELI
-- Chatbot screens (Today, client brief, Business update, Ideas, freshness).
--
-- Conventions
--   * Amounts are USD. Every row has currency = 'USD'; ask her skills for currency USD.
--   * positions holds one row per basket leg. Legs of one deal share the same id, so
--     count(DISTINCT id) counts deals, sum(notional) over a deal gives its full notional, and
--     sum(notional) by underlying gives look-through exposure. This is why positions.id is not a
--     primary key here (it is in her layout).
--   * metadata.as_of is the data date: the close of the last business day before "today", as the
--     gateway's freshness banner says. positions holds deals outstanding at that close only.
--     "Today" is the next business day; seed values like lastTradeDaysAgo count back from today.

CREATE TABLE metadata(version TEXT, as_of TEXT);

CREATE TABLE positions(
  id TEXT NOT NULL, client TEXT, branch TEXT, district TEXT, country TEXT,
  product TEXT, underlying TEXT, sector TEXT, currency TEXT, notional INTEGER, coupon REAL, maturity TEXT,
  snapshot TEXT, worst_of INTEGER, ki_flag INTEGER, ko_flag INTEGER,
  -- added
  basket TEXT,                -- all underlyings of the deal, '|' separated, e.g. 'NVDA|AMD'
  leg_weight REAL,            -- this leg's share of the deal notional (legs of a deal sum to 1)
  tenor_months INTEGER,
  strike_pct REAL,            -- strike as % of initial price
  ki_pct REAL,                -- knock-in barrier as % of initial price
  ko_pct REAL,                -- knock-out barrier as % of initial price
  trade_date TEXT,
  settlement TEXT,            -- 'cash', or 'physical' when stock is expected to be delivered
  next_ko_observation TEXT,   -- next knock-out observation date
  last_vs_ko_pct REAL,        -- last close vs the knock-out barrier, % (negative = below the barrier)
  shares_deliverable INTEGER  -- shares expected on physical settlement
);
-- ki_flag = 1: knock-in breached. ko_flag = 1: knock-out likely at next_ko_observation.

CREATE TABLE sales(
  id TEXT PRIMARY KEY, client TEXT, branch TEXT, country TEXT,
  currency TEXT, amount INTEGER, revenue INTEGER, trade_date TEXT, channel TEXT,
  -- added
  segment TEXT,
  position_id TEXT,           -- the deal this trade opened (NULL for deals that have since matured)
  basket TEXT,
  tenor_months INTEGER
);
-- revenue is NULL: our seed has no revenue figures, and we do not invent them.

CREATE TABLE rfqs(
  id TEXT, client TEXT, country TEXT, status TEXT, created TEXT,
  -- added
  branch TEXT, segment TEXT, channel TEXT,
  underlying TEXT,            -- first underlying of the basket, used for unmet demand
  basket TEXT, tenor_months INTEGER, ki_pct REAL, coupon_pct REAL
);
-- status keeps her vocabulary: 'won' = traded, 'open' = quoted and still live, 'lost' = not traded.

CREATE TABLE customers(
  id TEXT PRIMARY KEY, country TEXT, segment TEXT, branch TEXT,
  -- added
  name TEXT, short_name TEXT, cif_masked TEXT, risk_profile INTEGER,
  rm_name TEXT, channel TEXT,
  last_trade_date TEXT        -- latest row in sales for this client
);
-- A client is active when last_trade_date is within 90 days of as_of, otherwise idle.

CREATE TABLE engagement(id TEXT PRIMARY KEY, client TEXT, country TEXT, kind TEXT, event_date TEXT);
-- Derived from sales ('trade') and rfqs ('rfq') in the last 90 days. No invented calls or meetings.

CREATE TABLE maturities(position_id TEXT, maturity TEXT, country TEXT);

CREATE TABLE rollovers(
  position_id TEXT, country TEXT, eligible INTEGER, status TEXT,
  -- added
  client TEXT, branch TEXT, segment TEXT,
  maturity TEXT,              -- the deal's maturity date
  notional INTEGER,
  new_position_id TEXT        -- the deal it rolled into, when status = 'rolled'
);
-- status: 'not_contacted' | 'contacted' for deals maturing after as_of (they join to positions);
-- 'rolled' | 'cashed' for deals that already matured (they are no longer in positions).

CREATE TABLE branches(id TEXT, district TEXT, valid_from TEXT, valid_to TEXT);

CREATE TABLE channel_events(id TEXT, client TEXT, country TEXT, stage TEXT, event_date TEXT);
-- Digibank journey this month, derived from Digibank rfqs ('quote') and sales ('trade').

CREATE TABLE market(symbol TEXT, price REAL, observed TEXT, currency TEXT,
  -- added
  vol REAL                    -- annualised volatility used by the Ideas screen
);
-- price is NULL: our seed has no prices.

CREATE TABLE products(id TEXT, name TEXT, basket TEXT);
-- One row per idea in idea_warehouse.

CREATE TABLE thresholds(metric TEXT, limit_value REAL, version TEXT);
-- concentration_share is a ratio (0.25 = 25%), as her concentration skill expects.

-- New tables ---------------------------------------------------------------------------------

CREATE TABLE idea_warehouse(
  id TEXT PRIMARY KEY, basket TEXT, tenor_months INTEGER, coupon_pct REAL, ki_pct REAL, strike_pct REAL,
  coupon_change_bp INTEGER, vol_rank INTEGER, rm_trades INTEGER, rfqs_5d INTEGER, fill_rate_pct INTEGER,
  correlation REAL, earnings_in_days INTEGER
);

CREATE TABLE underlying_limits(underlying TEXT, scope TEXT, limit_pct REAL);
-- scope 'book': share of the whole ELI book. scope 'client': share of one client's ELI holdings
-- (underlying '*' = every underlying).

CREATE TABLE fx_rates(currency TEXT, usd_per_unit REAL, as_of TEXT);

CREATE TABLE source_loads(source TEXT, business_date TEXT, loaded_at TEXT, status TEXT);
