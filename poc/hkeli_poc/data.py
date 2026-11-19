"""Synthetic ELI position dataset for the mock HK_ELI workbook.

Everything here is invented. Field names follow the discovery transcripts
(semantic-and-tableau-views.md, what-is-hk-eli.md, eli-data-lineage.md) so the
POC exercises the same contracts as the real workbook. No real client, RM,
branch code or figure is used.

predict_result logic follows "What is HK ELI" section 5.2:
  KO                 wps_mtm >= ko%
  EXP                strike% <= wps_mtm < ko%
  EXP(Below Strike)  ki% <= wps_mtm < strike% and not knocked in
  EX                 otherwise (physical delivery)
predict_maturity follows section 5.3: next observation date if KO, else the
contractual maturity date.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import lru_cache

SEGMENTS = [("Treasures(HK)", 0.55), ("PB", 0.35), ("Treasures(TPC)", 0.10)]

# Synthetic TRE network: district value as stored in Tableau, and branches.
DISTRICTS = {
    "TRE-D1": ["Central", "Admiralty", "Wan Chai", "Causeway Bay"],
    "TRE-D2": ["Tsim Sha Tsui", "Mong Kok", "Kowloon Bay", "Kwun Tong"],
    "TRE-D3": ["Sha Tin", "Tsuen Wan", "Tuen Mun", "Yuen Long"],
}

# Ticker -> overall drift since trade, so some stocks are clearly weak.
TICKERS = {
    "9988 HK": 0.92, "700 HK": 1.03, "3690 HK": 0.86, "1810 HK": 1.07,
    "1211 HK": 0.95, "NVDA UW": 1.09, "INTC UW": 0.97, "TSLA UW": 0.90,
    "AAPL UW": 1.02, "AMD UW": 0.99,
}
CCY = [("HKD", 1.0, 0.50), ("USD", 7.8, 0.35), ("CNH", 1.08, 0.10), ("JPY", 0.052, 0.05)]

NORMAL_BUSINESS_DATE = date(2026, 11, 18)
STALE_BUSINESS_DATE = date(2026, 11, 15)  # "refresh failed for three nights" scenario


@dataclass(frozen=True)
class Dataset:
    business_date: date
    last_refresh: datetime
    rows: tuple  # tuple of dicts (treat as read-only)


def _pick(rng: random.Random, weighted):
    r = rng.random()
    acc = 0.0
    for item in weighted:
        acc += item[-1]
        if r <= acc:
            return item
    return weighted[-1]


def _generate(business_date: date, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    bd = business_date

    # Customers (cif) with segment and, for TRE, district / branch / RM.
    customers = []
    for i in range(560):
        seg = _pick(rng, SEGMENTS)[0]
        cust = {"cif_id": f"C{100000 + i * 7}", "bp_div_type": seg,
                "cust_district": None, "cust_branch": None,
                "rm_name": None, "reg_mgr": None}
        if seg == "Treasures(HK)":
            dist = rng.choice(list(DISTRICTS))
            branch = rng.choice(DISTRICTS[dist])
            code = "".join(w[0] for w in branch.split()).upper() + branch[1:3].upper()
            cust.update(cust_district=dist, cust_branch=branch,
                        rm_name=f"RM {code}-{rng.randint(1, 3)}", reg_mgr=f"TL {code}")
        else:
            cust.update(rm_name=f"RM {seg[:2].upper()}-{rng.randint(1, 6)}")
        customers.append(cust)

    rows = []
    pos_n = 0
    start = bd - timedelta(days=330)
    for deal_n in range(1250):
        trade_date = start + timedelta(days=rng.randint(0, 330))
        tenor_m = rng.choices([1, 2, 3, 6, 9, 12], weights=[8, 10, 20, 35, 15, 12])[0]
        maturity = trade_date + timedelta(days=int(tenor_m * 30.4))
        n_under = rng.choices([1, 2], weights=[55, 45])[0]
        unders = rng.sample(list(TICKERS), n_under)
        perf = {t: TICKERS[t] * rng.gauss(1.0, 0.07) * 100 for t in unders}
        wps = min(perf, key=perf.get)
        wps_mtm = round(perf[wps], 1)
        strike = rng.choice([75, 78, 80, 82, 85, 88, 90])
        ko = rng.choice([98, 100, 102, 103, 105])
        ki = rng.choice([60, 62, 65, 68, 70])
        knocked_in = wps_mtm < ki or (wps_mtm < strike and rng.random() < 0.15)
        if wps_mtm >= ko:
            result = "KO"
        elif wps_mtm >= strike:
            result = "EXP"
        elif wps_mtm >= ki and not knocked_in:
            result = "EXP(Below Strike)"
        else:
            result = "EX"
        status = "LIVE" if maturity > bd else "MATURED"
        if status == "LIVE" and result == "KO":
            pred_mat = min(maturity, bd + timedelta(days=rng.randint(1, 21)))
        else:
            pred_mat = maturity
        for _ in range(rng.choices([1, 2, 3], weights=[70, 22, 8])[0]):
            cust = rng.choice(customers)
            ccy, fx, _w = _pick(rng, CCY)
            hkd = rng.choice([0.4, 0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) * 1_000_000
            volume = round(hkd / fx, -3)
            pos_n += 1
            rows.append({
                "pos_id": f"P{700000 + pos_n}",
                "asset_id": f"ELI{50000 + deal_n}",
                "deal_status": status,
                "trade_date": trade_date,
                "maturity_date": maturity,
                "predict_maturity": pred_mat,
                "predict_result": result,
                "trade_currency": ccy,
                "volume": volume,
                "volume_bu": round(volume * fx, 2),
                "asset_tks": unders[0],
                "asset_tks_2": unders[1] if n_under > 1 else "",
                "strike_percentage": strike,
                "ko_percentage": ko,
                "ki_percentage": ki,
                "wps": wps,
                "wps_mtm": wps_mtm,
                **cust,
            })
    return rows


@lru_cache(maxsize=4)
def dataset(stale: bool = False) -> Dataset:
    """The same book; in the stale scenario the overnight refresh stopped 3 nights ago."""
    bd = STALE_BUSINESS_DATE if stale else NORMAL_BUSINESS_DATE
    refresh = datetime.combine(bd + timedelta(days=1), datetime.min.time()).replace(hour=6, minute=12)
    rows = _generate(bd)
    for r in rows:
        r["business_date"] = bd
        r["days_to_pred_maturity"] = (r["predict_maturity"] - bd).days
    return Dataset(business_date=bd, last_refresh=refresh, rows=tuple(rows))
