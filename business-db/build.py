"""Builds the HK ELI business database (SQLite) from the gateway's demo seed.

Usage: python3 business-db/build.py [--out business-db/out/business.sqlite]

Standard library only (Python 3.9+). The output is deterministic: the same seed gives the same file.
Every total in the seed is reproduced exactly; test_business_db.py checks them. Layout and
conventions are in schema.sql and README.md.
"""
import argparse
import json
import random
import sqlite3
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED_DIR = HERE.parent / "gateway" / "src" / "main" / "resources" / "seed"
VERSION = "hk-eli-seed-1.0"
TODAY = date(2026, 11, 3)          # the demo "today" (gateway demo profile)
HOLIDAYS = {date(2026, 12, 25), date(2026, 12, 26), date(2027, 1, 1)}
COUNTRY = "HK"
CCY = "USD"
BOOK_TOTAL = 600_000_000           # total outstanding ELI notional, USD; seed book shares are of this
ACTIVE_DAYS = 90
WINDOW_BUSINESS_DAYS = 10

SECTOR = {
    "NVDA": "Information Technology", "AMD": "Information Technology", "AVGO": "Information Technology",
    "TSM": "Information Technology", "MSFT": "Information Technology", "AAPL": "Information Technology",
    "META": "Communication Services", "GOOGL": "Communication Services", "NFLX": "Communication Services",
    "TCEHY": "Communication Services", "0700.HK": "Communication Services",
    "TSLA": "Consumer Discretionary", "AMZN": "Consumer Discretionary", "BABA": "Consumer Discretionary",
    "JPM": "Financials", "GS": "Financials",
}
DISTRICT_DIGIBANK = "Digital"


# --- calendar -------------------------------------------------------------------------------------

def is_business(d):
    return d.weekday() < 5 and d not in HOLIDAYS


def add_business(d, n):
    step = 1 if n >= 0 else -1
    while n:
        d += timedelta(days=step)
        if is_business(d):
            n -= step
    return d


def previous_business(d):
    return add_business(d, -1)


def add_months(d, months):
    y, m = divmod(d.month - 1 + months, 12)
    y += d.year
    m += 1
    day = min(d.day, [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


def roll_back_to_business(d):
    while not is_business(d):
        d -= timedelta(days=1)
    return d


AS_OF = previous_business(TODAY)                       # data date, 2026-11-02
WINDOW_END = add_business(TODAY, WINDOW_BUSINESS_DAYS)  # last day of the maturing window
MONTH_START = AS_OF.replace(day=1)
PREV_MONTH_START = add_months(MONTH_START, -1)
ACTIVE_FROM = TODAY - timedelta(days=ACTIVE_DAYS - 1)  # traded on or after this date = active


def in_window(d):
    return d is not None and TODAY < d <= WINDOW_END


def biz(n):
    """n business days after today."""
    return add_business(TODAY, n)


def days_ago(n):
    return TODAY - timedelta(days=n)


# --- seed -----------------------------------------------------------------------------------------

def load_seed(seed_dir=SEED_DIR):
    return {name: json.loads((seed_dir / f"{name}.json").read_text()) for name in ("today", "business", "ideas")}


def group_key(branch, segment):
    """Business-update rows are keyed by branch and segment; Digibank is one row whatever the segment."""
    return ("Digibank", "Self-directed") if branch == "Digibank" else (branch, segment)


# --- the 12 named clients ---------------------------------------------------------------------------
# Hand-written so each client's story in today.json (leads, moments, RFQs) holds. Amounts are USD.
# "listed" exposures come from the seed (eliOutstandingUsd x sharePct). "others" share the rest
# equally, each smaller than the smallest listed share. A leg amount of "all" takes what is left of
# that underlying's budget. Anything still left becomes a single-underlying deal.

NAMED = {
    "c-4821": dict(
        others=["META", "MSFT", "GOOGL", "AAPL", "AVGO", "AMZN", "TSM"],
        deals=[
            # Matures in 3 business days, USD 420k back as cash (lead). Opened by the May roll.
            dict(key="D1", legs={"NVDA": 246_400, "AMD": "all"}, trade=date(2026, 5, 6), tenor=6, maturity=biz(3),
                 ki=65, strike=85, ko=100, coupon=16.8, rollover="contacted"),
            # Last trade, 22 days ago: the October roll that added more NVDA.
            dict(key="D2", legs={"NVDA": "all"}, trade=days_ago(22), tenor=6, ki=65, strike=88, ko=100, coupon=17.6,
                 last=True),
        ],
        # "Rolled over 2 of the last 3 maturities"; both rolls added NVDA (lead).
        history=[
            dict(opened=date(2025, 11, 6), matured=date(2026, 5, 6), notional=400_000, basket="NVDA|AMD", tenor=6,
                 status="rolled", new="D1"),
            dict(opened=date(2026, 1, 20), matured=date(2026, 7, 20), notional=250_000, basket="TSLA", tenor=6,
                 status="cashed"),
            dict(opened=date(2026, 4, 13), matured=days_ago(22), notional=100_000, basket="MSFT|GOOGL", tenor=6,
                 status="rolled", new="D2"),
        ],
    ),
    "c-1093": dict(
        others=["NVDA", "AMD", "MSFT", "GOOGL", "AVGO", "AMZN", "TSM", "NFLX", "JPM", "0700.HK"],
        deals=[
            # TSLA closed 1.8% below the knock-out barrier; USD 260k back early if it knocks out (lead).
            dict(key="K1", legs={"TSLA": 260_000}, trade=date(2026, 8, 4), tenor=6, ki=65, strike=85, ko=100,
                 coupon=19.5, ko_flag=1, next_ko=biz(1), last_vs_ko=-1.8),
            dict(key="K2", legs={"TSLA": "all", "META": "all"}, trade=days_ago(41), tenor=9, ki=68, strike=88, ko=103,
                 coupon=15.4, last=True),
        ],
    ),
    "c-7720": dict(
        others=["NVDA", "META", "GOOGL", "AAPL", "AVGO", "AMZN", "TSM"],
        deals=[
            # AMD stock expected to be delivered below strike: 3,000 shares (lead). Not cash, so not "maturing".
            dict(key="E1", legs={"AMD": "all"}, trade=date(2026, 5, 8), tenor=6, maturity=biz(4), ki=65, strike=85,
                 ko=100, coupon=18.0, ki_flag=1, settlement="physical", shares=3000),
        ],
    ),
    "c-3310": dict(
        others=[], deals=[],
        # "No ELI trade for 94 days after three trades a quarter last year"; nothing outstanding (lead).
        history=[dict(opened=date(2025, m, d), matured=add_months(date(2025, m, d), 6), notional=150_000,
                      basket=b, tenor=6, status="cashed")
                 for (m, d), b in zip([(1, 15), (2, 12), (3, 18), (4, 9), (5, 14), (6, 17), (7, 10), (8, 13), (9, 16),
                                       (10, 14), (11, 12), (12, 9)],
                                      ["AAPL", "MSFT", "GOOGL", "AAPL", "META", "MSFT", "AAPL", "GOOGL", "MSFT",
                                       "AAPL", "META", "GOOGL"])]
        + [dict(opened=days_ago(94), matured=add_months(days_ago(94), 2), notional=120_000, basket="AAPL", tenor=2,
                status="cashed")],
    ),
    "c-5502": dict(
        others=["NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META"],
        deals=[dict(key="F1", legs={"AAPL": "all"}, trade=days_ago(9), tenor=3, ki=72, strike=90, ko=100, coupon=12.0,
                    last=True)],
    ),
    "c-6618": dict(
        others=["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN"],
        deals=[dict(key="G1", legs={"META": 300_000}, trade=date(2026, 8, 6), tenor=3, maturity=biz(3), ki=68,
                    strike=88, ko=100, coupon=14.2, rollover="not_contacted")],
    ),
    "c-2045": dict(
        others=["NVDA", "MSFT", "AAPL", "AMZN", "META", "AVGO", "TSM"],
        deals=[dict(key="H1", legs={"GOOGL": "all", "MSFT": 60_300}, trade=date(2026, 8, 10), tenor=3,
                    maturity=biz(5), ki=70, strike=90, ko=100, coupon=12.6, rollover="not_contacted")],
    ),
    "c-8890": dict(
        others=["NVDA", "AMD", "META", "AAPL"],
        deals=[dict(key="L1", legs={"TSLA": 200_000}, trade=date(2026, 7, 14), tenor=6, ki=65, strike=85, ko=100,
                    coupon=21.0, ko_flag=1, next_ko=biz(7), last_vs_ko=-2.6)],
    ),
    "c-1177": dict(
        others=["NVDA", "AMD", "MSFT", "GOOGL", "AVGO", "AMZN", "TSM", "META", "TSLA", "NFLX"],
        deals=[dict(key="M1", legs={"AAPL": "all", "MSFT": "all", "GOOGL": "all", "AVGO": "all", "AMZN": 28_300},
                    trade=date(2026, 5, 12), tenor=6, maturity=biz(7), ki=70, strike=90, ko=100, coupon=11.8,
                    rollover="not_contacted")],
    ),
    "c-4402": dict(
        others=["NVDA", "AMD", "MSFT", "GOOGL", "AAPL", "AMZN", "META", "TSLA", "AVGO", "TSM", "NFLX"],
        deals=[],
    ),
    "c-9034": dict(
        others=["AMD", "MSFT", "GOOGL", "AAPL", "META"],
        deals=[dict(key="N1", legs={"NVDA": "all", "AMD": 89_280}, trade=date(2026, 5, 12), tenor=6, maturity=biz(7),
                    ki=65, strike=85, ko=100, coupon=16.2, rollover="not_contacted")],
    ),
    "c-3356": dict(
        others=["NVDA", "MSFT", "GOOGL", "AAPL", "META", "TSLA", "AVGO", "AMZN"],
        deals=[dict(key="P1", legs={"AMD": "all", "NVDA": 45_200, "MSFT": 45_200}, trade=date(2026, 5, 13), tenor=6,
                    maturity=biz(8), ki=65, strike=85, ko=100, coupon=15.9, rollover="not_contacted")],
    ),
}


def parse_rfq(description):
    """'NVDA / AMD · 6M · KI 65% · coupon 18.2%' -> basket, tenor, ki, coupon."""
    parts = [p.strip() for p in description.split("·")]
    basket = "|".join(u.strip() for u in parts[0].split("/"))
    tenor = int(parts[1].rstrip("M"))
    ki = float(parts[2].replace("KI", "").replace("%", ""))
    coupon = float(parts[3].replace("coupon", "").replace("%", ""))
    return basket, tenor, ki, coupon


RFQ_STATUS = {"quoted": "open", "open": "open", "not-traded": "lost", "traded": "won"}


# --- builder --------------------------------------------------------------------------------------

class Builder:
    def __init__(self, seed):
        self.seed = seed
        self.rng = random.Random(20261102)
        self.tickers = list(seed["ideas"]["tickers"])
        for row in seed["business"]["bookConcentration"]:
            if row["underlying"] not in self.tickers:
                self.tickers.append(row["underlying"])
        self.district = dict(seed["business"]["districtOfBranch"])
        self.customers = {}       # id -> dict
        self.positions = []       # leg rows
        self.sales = []
        self.rfqs = []
        self.rollovers = []
        self.deal_seq = 0
        self.sale_seq = 0
        self.rfq_seq = 0
        self.deal_ids = {}        # named deal key -> id
        # remaining book budget per underlying, after named clients are placed
        self.book_left = self.book_targets()

    # targets ---------------------------------------------------------------------------------------
    def book_targets(self):
        targets = {}
        listed = self.seed["business"]["bookConcentration"]
        for row in listed:
            targets[row["underlying"]] = round(BOOK_TOTAL * row["sharePct"] / 100)
        rest = [u for u in self.tickers if u not in targets]
        remaining = BOOK_TOTAL - sum(targets.values())
        base = remaining // len(rest)
        for i, u in enumerate(rest):
            targets[u] = base + (remaining - base * len(rest) if i == len(rest) - 1 else 0)
        return targets

    # ids -------------------------------------------------------------------------------------------
    def new_deal_id(self):
        self.deal_seq += 1
        return f"P{self.deal_seq:05d}"

    def new_sale_id(self):
        self.sale_seq += 1
        return f"T{self.sale_seq:05d}"

    def new_rfq_id(self):
        self.rfq_seq += 1
        return f"R{self.rfq_seq:05d}"

    def district_of(self, branch):
        return self.district.get(branch, DISTRICT_DIGIBANK)

    # primitives ------------------------------------------------------------------------------------
    def add_customer(self, cid, name, short, cif, risk, segment, branch, rm, channel):
        self.customers[cid] = dict(id=cid, country=COUNTRY, segment=segment, branch=branch, name=name,
                                   short_name=short, cif_masked=cif, risk_profile=risk, rm_name=rm, channel=channel,
                                   last_trade_date=None)

    def add_sale(self, client, trade_date, amount, position_id, basket, tenor):
        c = self.customers[client]
        self.sales.append(dict(id=self.new_sale_id(), client=client, branch=c["branch"], country=COUNTRY,
                               currency=CCY, amount=amount, revenue=None, trade_date=trade_date.isoformat(),
                               channel=c["channel"], segment=c["segment"], position_id=position_id, basket=basket,
                               tenor_months=tenor))

    def add_deal(self, client, legs, trade, tenor, maturity=None, ki=65, strike=88, ko=100, coupon=14.0,
                 ko_flag=0, ki_flag=0, next_ko=None, last_vs_ko=None, settlement="cash", shares=None,
                 rollover=None, book=True):
        """legs: {underlying: amount}. Adds the position legs, the opening sale and any rollover row."""
        c = self.customers[client]
        maturity = maturity or add_months(trade, tenor)
        assert maturity > AS_OF, (client, legs, maturity)
        total = sum(legs.values())
        pid = self.new_deal_id()
        basket = "|".join(legs)
        for u, amount in legs.items():
            assert amount > 0, (client, u, amount)
            if book:
                self.book_left[u] -= amount
                assert self.book_left[u] >= 0, ("book overdrawn", u)
            self.positions.append(dict(
                id=pid, client=client, branch=c["branch"], district=self.district_of(c["branch"]), country=COUNTRY,
                product="ELI worst-of" if len(legs) > 1 else "ELI", underlying=u, sector=SECTOR.get(u, "Other"),
                currency=CCY, notional=amount, coupon=coupon, maturity=maturity.isoformat(), snapshot=AS_OF.isoformat(),
                worst_of=1 if len(legs) > 1 else 0, ki_flag=ki_flag, ko_flag=ko_flag, basket=basket,
                leg_weight=round(amount / total, 6), tenor_months=tenor, strike_pct=strike, ki_pct=ki, ko_pct=ko,
                trade_date=trade.isoformat(), settlement=settlement,
                next_ko_observation=next_ko.isoformat() if next_ko else None, last_vs_ko_pct=last_vs_ko,
                shares_deliverable=shares))
        self.add_sale(client, trade, total, pid, basket, tenor)
        if rollover:
            self.add_rollover(pid, client, rollover, maturity, total)
        return pid

    def add_rollover(self, position_id, client, status, maturity, notional, new_position_id=None, eligible=1):
        c = self.customers[client]
        self.rollovers.append(dict(position_id=position_id, country=COUNTRY, eligible=eligible, status=status,
                                   client=client, branch=c["branch"], segment=c["segment"],
                                   maturity=maturity.isoformat(), notional=notional, new_position_id=new_position_id))

    def add_matured(self, client, opened, matured, notional, basket, tenor, status, new_position_id=None):
        """A deal that has already matured: its opening sale and its rollover outcome. Not in positions."""
        pid = self.new_deal_id()
        self.add_sale(client, opened, notional, None, basket, tenor)
        self.add_rollover(pid, client, status, matured, notional, new_position_id)
        return pid

    def add_rfq(self, client, created, status, basket, tenor, ki, coupon):
        c = self.customers[client]
        self.rfqs.append(dict(id=self.new_rfq_id(), client=client, country=COUNTRY, status=status,
                              created=created.isoformat(), branch=c["branch"], segment=c["segment"],
                              channel=c["channel"], underlying=basket.split("|")[0], basket=basket,
                              tenor_months=tenor, ki_pct=ki, coupon_pct=coupon))

    # named clients ---------------------------------------------------------------------------------
    def build_named(self):
        today = self.seed["today"]
        owners = {o["clientId"]: o for o in today["owners"]}
        for client in today["clients"]:
            cid = client["id"]
            owner = owners[cid]
            self.add_customer(cid, client["name"], client["shortName"], client["cifMasked"], client["riskProfile"],
                              client["segment"], owner["branch"], owner["rmName"], owner["channel"])
        for client in today["clients"]:
            self.build_named_client(client)

    def build_named_client(self, client):
        cid = client["id"]
        spec = NAMED[cid]
        outstanding = client["eliOutstandingUsd"]
        budget = {}
        for item in client["concentration"]:
            budget[item["underlying"]] = round(outstanding * item["sharePct"] / 100)
        rest = outstanding - sum(budget.values())
        others = spec["others"]
        if rest:
            base = rest // len(others)
            for i, u in enumerate(others):
                budget[u] = base + (rest - base * len(others) if i == len(others) - 1 else 0)
        last_trade = days_ago(client["lastTradeDaysAgo"]) if client["lastTradeDaysAgo"] is not None else None

        for h in spec.get("history", []):
            pid = self.add_matured(cid, h["opened"], h["matured"], h["notional"], h["basket"], h["tenor"], h["status"])
            if h.get("new"):
                self.pending_links.append((pid, h["new"]))

        has_last = False
        for d in spec["deals"]:
            legs = {}
            for u, amount in d["legs"].items():
                amount = budget[u] if amount == "all" else amount
                budget[u] -= amount
                assert budget[u] >= 0, (cid, u)
                legs[u] = amount
            trade = d["trade"]
            pid = self.add_deal(cid, legs, trade, d["tenor"], maturity=d.get("maturity"), ki=d["ki"],
                                strike=d["strike"], ko=d["ko"], coupon=d["coupon"], ko_flag=d.get("ko_flag", 0),
                                ki_flag=d.get("ki_flag", 0), next_ko=d.get("next_ko"),
                                last_vs_ko=d.get("last_vs_ko"), settlement=d.get("settlement", "cash"),
                                shares=d.get("shares"), rollover=d.get("rollover"))
            self.deal_ids[d["key"]] = pid
            has_last = has_last or d.get("last", False)

        # What is left of each underlying's budget becomes single-underlying deals. The largest is the
        # last trade unless an explicit deal already is; the others are older.
        left = sorted(((u, a) for u, a in budget.items() if a > 0), key=lambda x: -x[1])
        older = 0
        for i, (u, amount) in enumerate(left):
            if i == 0 and not has_last and last_trade:
                trade, tenor = last_trade, 6
            else:
                older += 1
                trade, tenor = roll_back_to_business((last_trade or TODAY) - timedelta(days=21 * older)), 12
            self.add_deal(cid, {u: amount}, trade, tenor, ki=self.rng.choice([60, 65, 70]),
                          strike=self.rng.choice([85, 88, 90]), ko=100, coupon=round(self.rng.uniform(9, 19), 1))

        for r in client["rfqs"]:
            basket, tenor, ki, coupon = parse_rfq(r["description"])
            self.add_rfq(cid, days_ago(r["daysAgo"]), RFQ_STATUS[r["status"]], basket, tenor, ki, coupon)

    def link_named_rolls(self):
        for old_pid, key in self.pending_links:
            for r in self.rollovers:
                if r["position_id"] == old_pid:
                    r["new_position_id"] = self.deal_ids[key]

    # background clients ----------------------------------------------------------------------------
    def pick_legs(self, amount, allow_basket=True):
        """Split an amount over one or two underlyings that still have book budget."""
        candidates = [u for u, left in self.book_left.items() if left >= amount * 1.2 + 1_000_000]
        weights = [self.book_left[u] for u in candidates]
        first = self.rng.choices(candidates, weights)[0]
        if allow_basket and self.rng.random() < 0.35:
            second = self.rng.choices(candidates, weights)[0]
            if second != first:
                a = (amount // 2 // 1000) * 1000
                return {first: amount - a, second: a}
        return {first: amount}

    def split(self, total, count, low, high, step=1000):
        """count amounts in [low, high] (multiples of step) summing exactly to total."""
        assert count > 0
        raw = [self.rng.uniform(low, high) for _ in range(count)]
        scale = total / sum(raw)
        amounts = [max(step, int(r * scale // step) * step) for r in raw]
        amounts[-1] += total - sum(amounts)
        assert amounts[-1] > 0, (total, count)
        return amounts

    def random_terms(self):
        return dict(ki=self.rng.choice([60, 65, 70, 75]), strike=self.rng.choice([85, 88, 90]),
                    ko=self.rng.choice([100, 103]), coupon=round(self.rng.uniform(8, 22), 1))

    def business_days_between(self, start, end):
        days = []
        d = start
        while d <= end:
            if is_business(d):
                days.append(d)
            d += timedelta(days=1)
        return days

    def build_background(self):
        business = self.seed["business"]
        pockets = {(p["branch"], p["segment"]): p for p in business["pockets"]}
        named_by_group = defaultdict(list)
        for c in list(self.customers.values()):
            named_by_group[group_key(c["branch"], c["segment"])].append(c["id"])
        named_last = self.last_trade_dates()

        seq = 0
        month_days = self.business_days_between(MONTH_START, AS_OF)
        prev_days = self.business_days_between(PREV_MONTH_START, MONTH_START - timedelta(days=1))
        anchor_days = self.business_days_between(ACTIVE_FROM, date(2026, 9, 30))
        filler_days = self.business_days_between(date(2025, 12, 1), date(2026, 7, 31))
        self.group_plan = {}

        for row in business["rows"]:
            g = (row["branch"], row["segment"])
            named = named_by_group.get(g, [])
            named_active = sum(1 for c in named if named_last.get(c) and named_last[c] >= ACTIVE_FROM)
            named_idle = len(named) - named_active
            active_n = row["activeClients"] - named_active
            idle_n = row["idleClients"] - named_idle
            prefix = "".join(w[0] for w in row["branch"].split()).upper()
            rms = ["Digibank"] if row["branch"] == "Digibank" else [f"{row['branch']} RM {i:02d}" for i in range(1, 9)]

            active, idle = [], []
            for i in range(active_n + idle_n):
                seq += 1
                cid = f"c-{prefix}{seq:05d}"
                self.add_customer(cid, f"Client {prefix}{seq:05d}", f"{prefix}{seq:05d}", f"••{seq % 10000:04d}",
                                  self.rng.choice([3, 4, 4, 5]), row["segment"], row["branch"],
                                  rms[i % len(rms)], row["channel"])
                (active if i < active_n else idle).append(cid)
            self.rng.shuffle(active)
            pool = iter(active)

            # 1. Deals that matured this month, and which of them rolled.
            matured_clients = [next(pool) for _ in range(row["matured"])]
            matured = []
            for i, cid in enumerate(matured_clients):
                tenor = self.rng.choice([3, 6])
                matured_on = self.rng.choice(month_days)
                notional = self.rng.randrange(100, 500) * 1000
                legs = self.pick_legs(notional)
                pid = self.add_matured(cid, add_months(matured_on, -tenor), matured_on, notional, "|".join(legs),
                                       tenor, "rolled" if i < row["rolled"] else "cashed")
                matured.append((pid, cid, matured_on))

            # 2. This month's trades: the rolls first, then new trades. They sum to notionalMtdUsd.
            amounts = self.split(row["notionalMtdUsd"], row["trades"], 80_000, 600_000)
            for i, amount in enumerate(amounts):
                if i < row["rolled"]:
                    old_pid, cid, trade = matured[i]
                else:
                    cid, trade = next(pool), self.rng.choice(month_days)
                tenor = self.rng.choice([3, 6, 9, 12])
                pid = self.add_deal(cid, self.pick_legs(amount), trade, tenor, **self.random_terms())
                if i < row["rolled"]:
                    for r in self.rollovers:
                        if r["position_id"] == old_pid:
                            r["new_position_id"] = pid

            # 3. Last month's trades: sum to notionalPrevUsd, after the named clients' own trades.
            named_prev = sum(s["amount"] for s in self.sales if s["client"] in named
                             and PREV_MONTH_START.isoformat() <= s["trade_date"] < MONTH_START.isoformat())
            prev_total = row["notionalPrevUsd"] - named_prev
            for amount in self.split(prev_total, max(1, row["trades"]), 80_000, 600_000):
                self.add_deal(next(pool), self.pick_legs(amount), self.rng.choice(prev_days),
                              self.rng.choice([3, 6, 9, 12]), **self.random_terms())

            # 4. Deals maturing in the window, cash settled: sum to the pocket's maturingUsd.
            named_maturing = sum(self.maturing_cash(c) for c in named)
            maturing_total = pockets[g]["maturingUsd"] - named_maturing
            count = max(1, maturing_total // 250_000)
            remaining = list(pool)
            pool = iter(remaining)
            for amount in self.split(maturing_total, count, 100_000, 400_000):
                tenor = self.rng.choice([3, 6])
                maturity = biz(self.rng.randint(1, WINDOW_BUSINESS_DAYS))
                cid = self.rng.choice(active)
                pid = self.add_deal(cid, self.pick_legs(amount, allow_basket=False), add_months(maturity, -tenor),
                                    tenor, maturity=maturity, rollover=self.rng.choice(["not_contacted", "contacted"]),
                                    **self.random_terms())

            # 5. Every other active client traded at least once in the last 90 days.
            traded_recently = {s["client"] for s in self.sales if s["trade_date"] >= ACTIVE_FROM.isoformat()}
            for cid in active:
                if cid not in traded_recently:
                    self.add_deal(cid, self.pick_legs(self.rng.randrange(80, 400) * 1000), self.rng.choice(anchor_days),
                                  self.rng.choice([6, 9, 12]), **self.random_terms())

            # 6. Idle clients: last trade 120 to 400 days ago, matured before last month.
            for cid in idle:
                opened = roll_back_to_business(TODAY - timedelta(days=self.rng.randint(120, 400)))
                self.add_matured(cid, opened, add_months(opened, 3), self.rng.randrange(80, 300) * 1000,
                                 self.rng.choice(self.tickers), 3, "cashed")

            self.group_plan[g] = dict(active=active, filler_days=filler_days)

        # 7. Older deals fill each underlying's book exactly. Traded Dec 2025 to Jul 2026, 12-month tenor,
        #    so none fall in this month, last month or the maturing window.
        holders = [c for plan in self.group_plan.values() for c in plan["active"]]
        for u in list(self.book_left):
            left = self.book_left[u]
            while left > 0:
                amount = min(left, self.rng.randrange(200, 900) * 1000)
                if 0 < left - amount < 50_000:
                    amount = left
                trade = self.rng.choice(filler_days)
                self.add_deal(self.rng.choice(holders), {u: amount}, trade, 12, **self.random_terms())
                left -= amount
        assert all(v == 0 for v in self.book_left.values()), self.book_left

    def maturing_cash(self, client):
        """Cash expected back in the window: cash maturities, plus likely knock-outs observed in the window."""
        total = 0
        for deal_id, legs in self.deals_of(client).items():
            first = legs[0]
            notional = sum(l["notional"] for l in legs)
            maturity = date.fromisoformat(first["maturity"])
            ko = date.fromisoformat(first["next_ko_observation"]) if first["next_ko_observation"] else None
            if first["ko_flag"] and in_window(ko):
                total += notional
            elif first["settlement"] == "cash" and in_window(maturity):
                total += notional
        return total

    def deals_of(self, client):
        deals = defaultdict(list)
        for p in self.positions:
            if p["client"] == client:
                deals[p["id"]].append(p)
        return deals

    def last_trade_dates(self):
        last = {}
        for s in self.sales:
            d = date.fromisoformat(s["trade_date"])
            if s["client"] not in last or d > last[s["client"]]:
                last[s["client"]] = d
        return last

    # unmet demand: this month's RFQs -----------------------------------------------------------------
    def build_rfqs(self):
        business = self.seed["business"]
        month_days = self.business_days_between(MONTH_START, AS_OF)
        rows_by_channel = defaultdict(list)
        for row in business["rows"]:
            rows_by_channel[row["channel"]].append(row)
        listed_by_channel = defaultdict(list)
        for item in business["unmetDemand"]:
            listed_by_channel[item["channel"]].append(item)

        for channel, rows in rows_by_channel.items():
            listed = listed_by_channel.get(channel, [])
            # The named clients' RFQs this month already count towards their row's totals.
            named_month = [r for r in self.rfqs if r["channel"] == channel and r["created"] >= MONTH_START.isoformat()]
            total_quotes = sum(r["rfqs"] for r in rows) - len(named_month)
            total_won = sum(r["rfqsTraded"] for r in rows) - sum(1 for r in named_month if r["status"] == "won")
            tokens = []  # (underlying, won, terms)
            for item in listed:
                ask = self.parse_ask(item["topAsk"])
                named_here = [r for r in named_month if r["underlying"] == item["underlying"]]
                quotes = item["quotes"] - len(named_here)
                won = item["traded"] - sum(1 for r in named_here if r["status"] == "won")
                for i in range(quotes):
                    terms = ask() if i < quotes * 0.6 else self.random_rfq_terms(item["underlying"])
                    tokens.append((item["underlying"], i < won, terms))
            listed_names = {i["underlying"] for i in listed}
            rest = [u for u in self.tickers if u not in listed_names]
            rest_quotes = total_quotes - sum(1 for t in tokens)
            rest_won = total_won - sum(1 for t in tokens if t[1])
            assert rest_quotes >= 0 and 0 <= rest_won <= rest_quotes, (channel, rest_quotes, rest_won)
            # Spread the rest evenly so no other underlying outranks the listed ones.
            named_rest = defaultdict(int)
            for r in named_month:
                if r["underlying"] not in listed_names:
                    named_rest[r["underlying"]] += 1
            order = sorted(rest, key=lambda u: named_rest[u])
            for i in range(rest_quotes):
                u = order[i % len(order)]
                tokens.append((u, i < rest_won, self.random_rfq_terms(u)))

            # Deal the tokens to rows: each row gets exactly its RFQ count and traded count.
            won_tokens = [t for t in tokens if t[1]]
            lost_tokens = [t for t in tokens if not t[1]]
            self.rng.shuffle(won_tokens)
            self.rng.shuffle(lost_tokens)
            for row in rows:
                g = (row["branch"], row["segment"])
                named_row = [r for r in named_month if group_key(r["branch"], r["segment"]) == g]
                n_won = row["rfqsTraded"] - sum(1 for r in named_row if r["status"] == "won")
                n_all = row["rfqs"] - len(named_row)
                mine = [won_tokens.pop() for _ in range(n_won)] + [lost_tokens.pop() for _ in range(n_all - n_won)]
                clients = self.group_plan[g]["active"]
                for u, won, (basket, tenor, ki, coupon) in mine:
                    basket = basket or u
                    created = self.rng.choice(month_days)
                    status = "won" if won else ("open" if created == AS_OF and self.rng.random() < 0.5 else "lost")
                    self.add_rfq(self.rng.choice(clients), created, status, basket, tenor, ki, coupon)
            assert not won_tokens and not lost_tokens, channel

    def parse_ask(self, text):
        """'3M · KI 70% · coupon 20%+' -> a function giving terms that match it."""
        parts = [p.strip() for p in text.split("·")]
        tenor = int(parts[0].rstrip("M"))
        ki = float(parts[1].replace("KI", "").replace("%", ""))
        coupon_text = parts[2].replace("coupon", "").strip()
        plus = coupon_text.endswith("+")
        coupon = float(coupon_text.rstrip("+").rstrip("%"))
        return lambda: ("", tenor, ki, round(coupon + self.rng.uniform(0, 2.5), 1) if plus else coupon)

    def random_rfq_terms(self, underlying):
        return ("", self.rng.choice([3, 6, 9, 12]), float(self.rng.choice([60, 65, 72, 78])),
                round(self.rng.uniform(8, 19.9), 1))

    # write -----------------------------------------------------------------------------------------
    def build(self):
        self.pending_links = []
        self.build_named()
        self.link_named_rolls()
        self.build_background()
        self.build_rfqs()
        for cid, d in self.last_trade_dates().items():
            self.customers[cid]["last_trade_date"] = d.isoformat()
        return self

    def write(self, out):
        out = Path(out)
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            out.unlink()
        db = sqlite3.connect(out)
        db.executescript((HERE / "schema.sql").read_text())
        ins = lambda table, rows: rows and db.executemany(
            f"INSERT INTO {table} ({','.join(rows[0])}) VALUES ({','.join('?' * len(rows[0]))})",
            [tuple(r.values()) for r in rows])

        db.execute("INSERT INTO metadata VALUES (?,?)", (VERSION, AS_OF.isoformat()))
        ins("customers", list(self.customers.values()))
        ins("positions", self.positions)
        ins("sales", self.sales)
        ins("rfqs", self.rfqs)
        ins("rollovers", self.rollovers)
        seen = set()
        maturities = []
        for p in self.positions:
            if p["id"] not in seen:
                seen.add(p["id"])
                maturities.append(dict(position_id=p["id"], maturity=p["maturity"], country=COUNTRY))
        ins("maturities", maturities)
        branches = sorted({c["branch"] for c in self.customers.values()})
        ins("branches", [dict(id=b, district=self.district_of(b), valid_from="2020-01-01", valid_to="2099-12-31")
                         for b in branches])
        engagement = [dict(id=f"EV-{s['id']}", client=s["client"], country=COUNTRY, kind="trade",
                           event_date=s["trade_date"]) for s in self.sales if s["trade_date"] >= ACTIVE_FROM.isoformat()]
        engagement += [dict(id=f"EV-{r['id']}", client=r["client"], country=COUNTRY, kind="rfq",
                            event_date=r["created"]) for r in self.rfqs if r["created"] >= ACTIVE_FROM.isoformat()]
        ins("engagement", engagement)
        month = MONTH_START.isoformat()
        events = [dict(id=f"CE-{r['id']}", client=r["client"], country=COUNTRY, stage="quote", event_date=r["created"])
                  for r in self.rfqs if r["channel"] == "digibank" and r["created"] >= month]
        events += [dict(id=f"CE-{s['id']}", client=s["client"], country=COUNTRY, stage="trade",
                        event_date=s["trade_date"]) for s in self.sales if s["channel"] == "digibank"
                   and s["trade_date"] >= month]
        ins("channel_events", events)
        vol = self.seed["ideas"]["tickerVol"]
        ins("market", [dict(symbol=u, price=None, observed=AS_OF.isoformat(),
                            currency="HKD" if u.endswith(".HK") else "USD", vol=vol.get(u)) for u in self.tickers])
        warehouse = self.seed["ideas"]["warehouse"]
        ins("idea_warehouse", [dict(id=w["id"], basket="|".join(w["underlyings"]), tenor_months=w["tenorMonths"],
                                    coupon_pct=w["couponPct"], ki_pct=w["kiPct"], strike_pct=w["strikePct"],
                                    coupon_change_bp=w["couponChangeBp"], vol_rank=w["volRank"],
                                    rm_trades=w["rmTrades"], rfqs_5d=w["rfqs5d"], fill_rate_pct=w["fillRatePct"],
                                    correlation=w["correlation"], earnings_in_days=w.get("earningsInDays"))
                               for w in warehouse])
        ins("products", [dict(id=w["id"], name=" / ".join(w["underlyings"])
                              + (" worst-of" if len(w["underlyings"]) > 1 else "") + f" · {w['tenorMonths']}M",
                              basket="|".join(w["underlyings"])) for w in warehouse])
        business = self.seed["business"]
        limit = self.seed["ideas"]["concentrationLimitPct"]
        ins("thresholds", [
            dict(metric="concentration_share", limit_value=business["bookConcentration"][0]["limitPct"] / 100,
                 version=VERSION),
            dict(metric="client_concentration_share", limit_value=limit / 100, version=VERSION),
            dict(metric="rollover_baseline", limit_value=business["rolloverBaselinePct"] / 100, version=VERSION),
            dict(metric="idle_days", limit_value=ACTIVE_DAYS, version=VERSION),
            dict(metric="maturing_window_business_days", limit_value=WINDOW_BUSINESS_DAYS, version=VERSION)])
        ins("underlying_limits", [dict(underlying=r["underlying"], scope="book", limit_pct=r["limitPct"])
                                  for r in business["bookConcentration"]]
            + [dict(underlying="*", scope="client", limit_pct=limit)])
        ins("fx_rates", [dict(currency="USD", usd_per_unit=1.0, as_of=AS_OF.isoformat()),
                         dict(currency="HKD", usd_per_unit=round(1 / 7.8, 6), as_of=AS_OF.isoformat())])
        ins("source_loads", [
            dict(source="eqd_master_outstanding", business_date=AS_OF.isoformat(),
                 loaded_at=f"{TODAY.isoformat()}T05:40:00+08:00", status="ready"),
            dict(source="morning_pricing", business_date=TODAY.isoformat(),
                 loaded_at=f"{TODAY.isoformat()}T09:05:00+08:00", status="ready")])
        db.commit()
        db.close()
        return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=str(HERE / "out" / "business.sqlite"))
    args = parser.parse_args()
    out = Builder(load_seed()).build().write(args.out)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
