"""Reconciliation tests: the SQLite rows must add back up to every figure in the gateway seed.

Run: python3 -m unittest discover -s business-db -v
Optional: set HKELI_REPO to a clone of Niharika's HK_ELI to also run her business queries on the file
(needs pydantic in the interpreter running the tests).
"""
import os
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402

SEED = build.load_seed()
TODAY = build.TODAY
AS_OF = build.AS_OF.isoformat()
MONTH = build.MONTH_START.isoformat()
PREV = build.PREV_MONTH_START.isoformat()
ACTIVE_FROM = build.ACTIVE_FROM.isoformat()

# Every column in Niharika's layout (HK_ELI mock_data/generate.py, commit e741fd7).
HER_LAYOUT = {
    "metadata": ["version", "as_of"],
    "positions": ["id", "client", "branch", "district", "country", "product", "underlying", "sector", "currency",
                  "notional", "coupon", "maturity", "snapshot", "worst_of", "ki_flag", "ko_flag"],
    "sales": ["id", "client", "branch", "country", "currency", "amount", "revenue", "trade_date", "channel"],
    "rfqs": ["id", "client", "country", "status", "created"],
    "customers": ["id", "country", "segment", "branch"],
    "engagement": ["id", "client", "country", "kind", "event_date"],
    "maturities": ["position_id", "maturity", "country"],
    "rollovers": ["position_id", "country", "eligible", "status"],
    "branches": ["id", "district", "valid_from", "valid_to"],
    "channel_events": ["id", "client", "country", "stage", "event_date"],
    "market": ["symbol", "price", "observed", "currency"],
    "products": ["id", "name", "basket"],
    "thresholds": ["metric", "limit_value", "version"],
}


def group_sql(alias=""):
    p = f"{alias}." if alias else ""
    return f"CASE WHEN {p}branch='Digibank' THEN 'Digibank|Self-directed' ELSE {p}branch||'|'||{p}segment END"


class BusinessDbTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.path = build.Builder(build.load_seed()).build().write(Path(cls.tmp.name) / "business.sqlite")
        cls.db = sqlite3.connect(cls.path)
        cls.db.row_factory = sqlite3.Row

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        cls.tmp.cleanup()

    def q(self, sql, *args):
        return self.db.execute(sql, args).fetchall()

    def one(self, sql, *args):
        return self.db.execute(sql, args).fetchone()[0]

    def maturing_cash(self, where="1=1", *args):
        """Cash back in the window: cash maturities plus likely knock-outs observed in the window."""
        start, end = TODAY.isoformat(), build.WINDOW_END.isoformat()
        return self.one(f"""SELECT coalesce(sum(notional),0) FROM positions p JOIN customers c ON c.id=p.client
            WHERE {where} AND (
              (p.ko_flag=1 AND p.next_ko_observation>? AND p.next_ko_observation<=?)
              OR (NOT (p.ko_flag=1 AND p.next_ko_observation>? AND p.next_ko_observation<=?)
                  AND p.settlement='cash' AND p.maturity>? AND p.maturity<=?))""",
                        *args, start, end, start, end, start, end)

    # layout -----------------------------------------------------------------------------------------
    def test_keeps_every_column_of_her_layout(self):
        for table, columns in HER_LAYOUT.items():
            have = [r[1] for r in self.q(f"PRAGMA table_info({table})")]
            self.assertEqual(have[:len(columns)], columns, table)

    def test_new_tables_exist(self):
        for table in ("idea_warehouse", "underlying_limits", "fx_rates", "source_loads"):
            self.assertGreater(self.one(f"SELECT count(*) FROM {table}"), 0, table)

    def test_one_snapshot_one_currency_one_country(self):
        self.assertEqual(self.one("SELECT as_of FROM metadata"), AS_OF)
        self.assertEqual([r[0] for r in self.q("SELECT DISTINCT snapshot FROM positions")], [AS_OF])
        for table, col in (("positions", "currency"), ("sales", "currency")):
            self.assertEqual([r[0] for r in self.q(f"SELECT DISTINCT {col} FROM {table}")], ["USD"])
        for table in ("positions", "sales", "rfqs", "customers"):
            self.assertEqual([r[0] for r in self.q(f"SELECT DISTINCT country FROM {table}")], ["HK"])

    def test_deal_legs_are_consistent(self):
        bad = self.q("""SELECT id FROM positions GROUP BY id HAVING count(DISTINCT client)>1 OR count(DISTINCT maturity)>1
                        OR abs(sum(leg_weight)-1)>0.0001 OR count(*)<>length(basket)-length(replace(basket,'|',''))+1""")
        self.assertEqual(bad, [])
        self.assertEqual(self.one("SELECT count(*) FROM positions WHERE maturity<=snapshot"), 0)

    def test_every_open_deal_has_its_opening_sale(self):
        missing = self.q("""SELECT p.id, sum(p.notional) n FROM positions p GROUP BY p.id
                            HAVING n <> coalesce((SELECT amount FROM sales s WHERE s.position_id=p.id), -1)""")
        self.assertEqual(missing, [])

    # named clients (Today, client brief) ------------------------------------------------------------
    def test_named_clients_match_today_seed(self):
        owners = {o["clientId"]: o for o in SEED["today"]["owners"]}
        for c in SEED["today"]["clients"]:
            with self.subTest(client=c["id"]):
                row = self.q("SELECT * FROM customers WHERE id=?", c["id"])[0]
                o = owners[c["id"]]
                self.assertEqual((row["name"], row["short_name"], row["cif_masked"], row["risk_profile"],
                                  row["segment"], row["branch"], row["rm_name"], row["channel"]),
                                 (c["name"], c["shortName"], c["cifMasked"], c["riskProfile"], c["segment"],
                                  o["branch"], o["rmName"], o["channel"]))
                out = self.one("SELECT coalesce(sum(notional),0) FROM positions WHERE client=?", c["id"])
                self.assertEqual(out, c["eliOutstandingUsd"])
                self.assertEqual(self.maturing_cash("p.client=?", c["id"]), c["maturingUsd"])
                last = (TODAY - date.fromisoformat(row["last_trade_date"])).days
                self.assertEqual(last, c["lastTradeDaysAgo"])
                shares = {r[0]: r[1] for r in self.q(
                    "SELECT underlying, sum(notional) FROM positions WHERE client=? GROUP BY underlying", c["id"])}
                listed = c["concentration"]
                for item in listed:
                    self.assertAlmostEqual(100 * shares[item["underlying"]] / out, item["sharePct"], places=6)
                if out:
                    floor = min([i["sharePct"] for i in listed], default=10.0)
                    others = [100 * v / out for u, v in shares.items() if u not in {i["underlying"] for i in listed}]
                    self.assertTrue(all(s < floor for s in others), (c["id"], max(others, default=0), floor))

    def test_named_rfqs_match_today_seed(self):
        for c in SEED["today"]["clients"]:
            rows = self.q("SELECT * FROM rfqs WHERE client=? ORDER BY created DESC", c["id"])
            self.assertEqual(len(rows), len(c["rfqs"]), c["id"])
            for want, got in zip(sorted(c["rfqs"], key=lambda r: r["daysAgo"]), rows):
                basket, tenor, ki, coupon = build.parse_rfq(want["description"])
                self.assertEqual((got["basket"], got["tenor_months"], got["ki_pct"], got["coupon_pct"], got["status"],
                                  (TODAY - date.fromisoformat(got["created"])).days),
                                 (basket, tenor, ki, coupon, build.RFQ_STATUS[want["status"]], want["daysAgo"]))

    def test_lead_stories_hold(self):
        # c-4821: USD 420k NVDA/AMD worst-of maturing in 3 business days; rolled 2 of the last 3.
        d = self.q("""SELECT id, basket, maturity, sum(notional) n FROM positions WHERE client='c-4821'
                      AND maturity=? GROUP BY id""", build.biz(3).isoformat())
        self.assertEqual([(r["basket"], r["n"]) for r in d], [("NVDA|AMD", 420_000)])
        last3 = [r[0] for r in self.q("""SELECT status FROM rollovers WHERE client='c-4821' AND status IN ('rolled','cashed')
                                         ORDER BY maturity DESC LIMIT 3""")]
        self.assertEqual(sorted(last3), ["cashed", "rolled", "rolled"])
        self.assertEqual(self.one("""SELECT count(*) FROM rollovers r JOIN positions p ON p.id=r.new_position_id
                                     WHERE r.client='c-4821' AND r.status='rolled' AND p.underlying='NVDA'"""), 2)
        # c-1093: TSLA 1.8% below the barrier, USD 260k back early if it knocks out tomorrow.
        k = self.q("SELECT * FROM positions WHERE client='c-1093' AND ko_flag=1")
        self.assertEqual([(r["underlying"], r["notional"], r["last_vs_ko_pct"], r["next_ko_observation"]) for r in k],
                         [("TSLA", 260_000, -1.8, build.biz(1).isoformat())])
        # c-7720: 3,000 AMD shares to be delivered below strike.
        e = self.q("SELECT * FROM positions WHERE client='c-7720' AND settlement='physical'")
        self.assertEqual([(r["underlying"], r["shares_deliverable"], r["ki_flag"]) for r in e], [("AMD", 3000, 1)])
        # c-3310: three trades a quarter last year, nothing outstanding, last trade 94 days ago.
        self.assertEqual(self.one("SELECT count(*) FROM sales WHERE client='c-3310' AND trade_date LIKE '2025-%'"), 12)
        self.assertEqual(self.one("SELECT count(*) FROM positions WHERE client='c-3310'"), 0)
        # Knock-out moments are exactly the two in the seed.
        self.assertEqual(sorted(r[0] for r in self.q("SELECT DISTINCT client FROM positions WHERE ko_flag=1")),
                         sorted(m["clientId"] for m in SEED["today"]["moments"] if m["type"] == "knockout"))

    # book concentration ---------------------------------------------------------------------------
    def test_book_concentration_matches_seed(self):
        total = self.one("SELECT sum(notional) FROM positions")
        self.assertEqual(total, build.BOOK_TOTAL)
        ranked = self.q("SELECT underlying, sum(notional) n FROM positions GROUP BY underlying ORDER BY n DESC")
        listed = SEED["business"]["bookConcentration"]
        self.assertEqual([r[0] for r in ranked[:len(listed)]], [i["underlying"] for i in listed])
        for item, row in zip(listed, ranked):
            self.assertAlmostEqual(100 * row[1] / total, item["sharePct"], places=6)
        limits = {r[0]: r[1] for r in self.q("SELECT underlying, limit_pct FROM underlying_limits WHERE scope='book'")}
        self.assertEqual(limits, {i["underlying"]: i["limitPct"] for i in listed})
        self.assertEqual(self.one("SELECT limit_value FROM thresholds WHERE metric='concentration_share'"), 0.25)

    # business update ------------------------------------------------------------------------------
    def test_business_rows_match_seed(self):
        g = group_sql()
        for row in SEED["business"]["rows"]:
            key = f"{row['branch']}|{row['segment']}"
            with self.subTest(group=key):
                mtd = self.q(f"SELECT count(*), coalesce(sum(amount),0) FROM sales WHERE {g}=? AND trade_date>=? AND trade_date<=?",
                             key, MONTH, AS_OF)[0]
                self.assertEqual((mtd[0], mtd[1]), (row["trades"], row["notionalMtdUsd"]))
                prev = self.one(f"SELECT coalesce(sum(amount),0) FROM sales WHERE {g}=? AND trade_date>=? AND trade_date<?",
                                key, PREV, MONTH)
                self.assertEqual(prev, row["notionalPrevUsd"])
                rfq = self.q(f"SELECT count(*), sum(status='won') FROM rfqs WHERE {g}=? AND created>=? AND created<=?",
                             key, MONTH, AS_OF)[0]
                self.assertEqual((rfq[0], rfq[1]), (row["rfqs"], row["rfqsTraded"]))
                ro = self.q(f"""SELECT count(*), sum(status='rolled') FROM rollovers WHERE {g}=? AND status IN ('rolled','cashed')
                                AND maturity>=? AND maturity<=?""", key, MONTH, AS_OF)[0]
                self.assertEqual((ro[0], ro[1]), (row["matured"], row["rolled"]))
                active = self.one(f"SELECT count(*) FROM customers WHERE {g}=? AND last_trade_date>=?", key, ACTIVE_FROM)
                idle = self.one(f"SELECT count(*) FROM customers WHERE {g}=? AND (last_trade_date<? OR last_trade_date IS NULL)",
                                key, ACTIVE_FROM)
                self.assertEqual((active, idle), (row["activeClients"], row["idleClients"]))

    def test_rollover_pockets_match_seed(self):
        g = group_sql("c")
        for p in SEED["business"]["pockets"]:
            key = f"{p['branch']}|{p['segment']}"
            with self.subTest(pocket=key):
                self.assertEqual(self.maturing_cash(f"{g}=?", key), p["maturingUsd"])
                matured, rolled = self.q(f"""SELECT count(*), sum(status='rolled') FROM rollovers c WHERE {g}=?
                                             AND status IN ('rolled','cashed') AND maturity>=? AND maturity<=?""",
                                         key, MONTH, AS_OF)[0]
                self.assertEqual((matured, rolled), (p["maturedThisMonth"], p["rolledThisMonth"]))
                self.assertEqual(round(100 * rolled / matured), p["rolloverPct"])
        self.assertEqual(self.one("SELECT limit_value FROM thresholds WHERE metric='rollover_baseline'"),
                         SEED["business"]["rolloverBaselinePct"] / 100)

    def test_rolled_deals_point_at_this_months_trades(self):
        bad = self.q("""SELECT r.position_id FROM rollovers r LEFT JOIN sales s ON s.position_id=r.new_position_id
                        WHERE r.status='rolled' AND r.maturity>=? AND (s.id IS NULL OR s.trade_date<>r.maturity
                        OR s.client<>r.client)""", MONTH)
        self.assertEqual(bad, [])

    def test_unmet_demand_matches_seed(self):
        for item in SEED["business"]["unmetDemand"]:
            with self.subTest(underlying=item["underlying"], channel=item["channel"]):
                rows = self.q("""SELECT tenor_months, ki_pct, coupon_pct, status FROM rfqs WHERE underlying=? AND channel=?
                                 AND created>=? AND created<=?""", item["underlying"], item["channel"], MONTH, AS_OF)
                self.assertEqual((len(rows), sum(r["status"] == "won" for r in rows)), (item["quotes"], item["traded"]))
                parts = [x.strip() for x in item["topAsk"].split("·")]
                tenor, ki = int(parts[0].rstrip("M")), float(parts[1][3:].rstrip("%"))
                coupon = parts[2].replace("coupon", "").strip()
                floor = float(coupon.rstrip("+").rstrip("%"))
                bucket = Counter((r["tenor_months"], r["ki_pct"], r["coupon_pct"] >= floor if coupon.endswith("+")
                                  else r["coupon_pct"] == floor) for r in rows)
                self.assertEqual(bucket.most_common(1)[0][0], (tenor, ki, True))
        for channel in {i["channel"] for i in SEED["business"]["unmetDemand"]}:
            listed = [i for i in SEED["business"]["unmetDemand"] if i["channel"] == channel]
            names = {i["underlying"] for i in listed}
            others = self.q("""SELECT underlying, count(*) n FROM rfqs WHERE channel=? AND created>=? AND created<=?
                               GROUP BY underlying""", channel, MONTH, AS_OF)
            top_other = max([r[1] for r in others if r[0] not in names], default=0)
            self.assertLess(top_other, min(i["quotes"] for i in listed), channel)

    # ideas, limits, freshness ---------------------------------------------------------------------
    def test_idea_warehouse_matches_seed(self):
        rows = {r["id"]: r for r in self.q("SELECT * FROM idea_warehouse")}
        warehouse = SEED["ideas"]["warehouse"]
        self.assertEqual(len(rows), len(warehouse))
        for w in warehouse:
            r = rows[w["id"]]
            self.assertEqual((r["basket"], r["tenor_months"], r["coupon_pct"], r["ki_pct"], r["strike_pct"],
                              r["coupon_change_bp"], r["vol_rank"], r["rm_trades"], r["rfqs_5d"], r["fill_rate_pct"],
                              r["correlation"], r["earnings_in_days"]),
                             ("|".join(w["underlyings"]), w["tenorMonths"], w["couponPct"], w["kiPct"], w["strikePct"],
                              w["couponChangeBp"], w["volRank"], w["rmTrades"], w["rfqs5d"], w["fillRatePct"],
                              w["correlation"], w.get("earningsInDays")))
        self.assertEqual(self.one("SELECT count(*) FROM products"), len(warehouse))

    def test_client_limit_and_freshness(self):
        self.assertEqual(self.one("SELECT limit_pct FROM underlying_limits WHERE scope='client' AND underlying='*'"),
                         SEED["ideas"]["concentrationLimitPct"])
        loads = {r[0]: r for r in self.q("SELECT * FROM source_loads")}
        self.assertEqual(loads["eqd_master_outstanding"]["business_date"], AS_OF)
        self.assertEqual(self.one("SELECT usd_per_unit FROM fx_rates WHERE currency='USD'"), 1.0)

    def test_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            again = build.Builder(build.load_seed()).build().write(Path(tmp) / "b.sqlite")
            dump = lambda p: list(sqlite3.connect(p).iterdump())
            self.assertEqual(dump(again), dump(self.path))


@unittest.skipUnless(os.environ.get("HKELI_REPO"), "set HKELI_REPO to run Niharika's queries on the file")
class HerQueriesTest(unittest.TestCase):
    """Runs her BusinessAnalytics (all 13 operations) on our file, unchanged."""

    def test_her_operations_run_and_agree(self):
        sys.path.insert(0, os.environ["HKELI_REPO"])
        from hk_platform.contracts.models import Identity
        from services.analytics.business import BusinessAnalytics
        with tempfile.TemporaryDirectory() as tmp:
            path = build.Builder(build.load_seed()).build().write(Path(tmp) / "business.sqlite")
            analytics = BusinessAnalytics(path)
            who = Identity(id="test", country="HK", line_of_business="Wealth", resources=["mock:business"])
            ops = ["concentration", "sales", "rfq", "engagement", "maturity", "rollover", "client", "branch",
                   "regional", "digital", "yield", "risk", "trend"]
            for op in ops:
                with self.subTest(op=op):
                    out = analytics.run(op, who, days=15, currency="USD")
                    self.assertTrue(out.data["rows"], op)
            conc = analytics.run("concentration", who, currency="USD").data["rows"]
            for item, row in zip(SEED["business"]["bookConcentration"], conc):
                self.assertEqual(row["underlying"], item["underlying"])
                self.assertAlmostEqual(float(row["share"]) * 100, item["sharePct"], places=6)
                self.assertFalse(row["review_flag"])


if __name__ == "__main__":
    unittest.main()
