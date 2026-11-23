"""Several stocks in one question, exchange codes, and the stocks added to the fictional book (2026-11-23)."""
from collections import Counter
from datetime import date

from hkeli_poc import data
from hkeli_poc.mock_tableau import InProcessMock
from hkeli_poc.stork.pipeline import answer
from hkeli_poc.stork.understand import preparse

TODAY = date(2026, 11, 19)
FIVE = "Show me the overview of NVDA UW, AMD UQ, GOOGL UW, APP UW, SNDK UW"


def test_every_stock_is_read_in_the_order_asked():
    h = preparse(FIVE, TODAY)
    assert h["wps_list"] == ["NVDA UW", "AMD UW", "GOOGL UW", "APP UW", "SNDK UW"]
    assert h["wps"] == "NVDA UW"                                   # single-stock readers get the first, not the last
    assert h["ticker_swaps"] == [{"from": "AMD UQ", "to": "AMD UW"}]
    assert "tickers_unknown" not in h


def test_names_codes_and_words_that_are_not_tickers():
    assert preparse("google and sandisk exposure", TODAY)["wps_list"] == ["GOOGL UW", "SNDK UW"]
    assert preparse("Show me the distribution on 9988.HK", TODAY)["wps"] == "9988 HK"
    h = preparse("Show WPS for MSFT UW and Tesla", TODAY)
    assert h["wps_list"] == ["MSFT UW", "TSLA UW"] and h["tickers_unknown"] == ["MSFT UW"]
    for q in ["How many TRE customers in HK are KO?", "tell us about the book"]:     # "in HK", "us": not tickers
        h = preparse(q, TODAY)
        assert not h.get("wps") and not h.get("tickers_unknown"), q


def test_overview_of_five_stocks_has_one_row_each_and_notes():
    a = answer(FIVE, InProcessMock(), "proposed")
    assert a["status"] == "OK" and a["intent"] == "wps_exposure"
    rows = a["table"]["rows"]
    assert [r[0] for r in rows] == ["NVDA UW", "AMD UW", "GOOGL UW", "APP UW", "SNDK UW"]
    assert a["table"]["columns"] == ["Stock", "Outstanding as WPS", "Share", "Rank", "KO", "Expiry", "Below strike", "Exercised"]
    assert all(r[1] != "HKD 0" for r in rows)                       # all five are in the book now
    assert any(c["code"] == "TICKER_READ_AS" and "AMD UQ read as AMD UW" in c["text"] for c in a["caveats"])
    assert set(a["chart"]["highlight"]) == {"NVDA UW", "AMD UW", "GOOGL UW", "APP UW", "SNDK UW"}
    assert [f for f in a["followups"] if f.startswith("What if")] == [f"What if {r[0]} falls 10%?" for r in rows]
    assert a["embeds"][0]["highlight"] == [r[0] for r in rows]


def test_overview_figures_match_plain_python_over_the_rows():
    a = answer(FIVE, InProcessMock(), "proposed")
    live = [r for r in data.dataset().rows if r["deal_status"] == "LIVE"]
    by = Counter()
    for r in live:
        by[r["wps"]] += r["volume_bu"]
    from hkeli_poc.svg import money
    for row in a["table"]["rows"]:
        assert row[1] == money(by[row[0]]), row


def test_one_stock_answer_never_hides_the_others():
    a = answer("What if NVDA and AMD fall 10%?", InProcessMock(), "proposed")
    note = [c for c in a["caveats"] if c["code"] == "ONE_OF_SEVERAL"]
    assert note and "covers NVDA UW only" in note[0]["text"] and a["status"] == "OK_WITH_WARNING"
    assert a["followups"][0] == "What if AMD UW falls 10%?"
    assert "WPS" not in a["scope"]                                   # a what-if's stock is not a WPS filter


def test_added_stocks_leave_the_original_book_untouched():
    rows = data.dataset().rows
    orig = [r for r in rows if int(r["asset_id"][3:]) < 51250]
    new = [r for r in rows if int(r["asset_id"][3:]) >= 51250]
    assert len(orig) == 1727                                         # the book before 2026-11-23
    assert {t for r in new for t in (r["asset_tks"], r["asset_tks_2"]) if t} <= set(data.NEW_TICKERS)
    live_new = [r for r in new if r["deal_status"] == "LIVE"]
    assert {r["wps"] for r in live_new} == set(data.NEW_TICKERS)
    assert {r["bp_div_type"] for r in live_new} == {"Treasures(HK)", "PB", "Treasures(TPC)"}
    # an original stock's what-if is unchanged: NVDA -10% still moves 30 of 101 positions
    a = answer("If NVDA falls below 10%, what happens?", InProcessMock(), "proposed")
    assert "30 of the 101" in a["headline"]
