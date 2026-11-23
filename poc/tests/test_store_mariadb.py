"""The store behaves the same on SQLite and MariaDB.

The SQLite runs always. The MariaDB runs only when TEST_MARIADB_URL points at a database the test may
empty, e.g. TEST_MARIADB_URL=mariadb://hkeli:local-test@127.0.0.1:3306/hkeli_test (office check C7).
"""
from __future__ import annotations

import os

import pytest

from hkeli_poc import db

MARIA = os.environ.get("TEST_MARIADB_URL")
BACKENDS = ["sqlite"] + (["mariadb"] if MARIA else [])


@pytest.fixture(params=BACKENDS)
def store(request, tmp_path):
    if request.param == "sqlite":
        s = db.open_store(None, tmp_path / "x.sqlite")
    else:
        pytest.importorskip("pymysql")
        s = db.MariaDBStore(MARIA)
        s.drop_all()
        s = db.MariaDBStore(MARIA)
    yield s
    if request.param == "mariadb":
        s.drop_all()
    s.close()


def _answer(q="How much TRE matures?", status="OK"):
    return {"question": q, "status": status, "intent": "maturity_branch", "headline": "h",
            "evidence": [{"record_id": "VIEW_X"}], "meta": {"understanding": "rules", "insight": "template"},
            "numbers": [{"id": "n1", "value": 25.2, "measure": "HKD"}], "reasons": [], "embed": {"filters": {"a": ["b"]}}}


def test_schema_and_reopen(store):
    assert store.version() == 2
    assert store.ping()
    assert store.migrate() == 2          # running again changes nothing
    assert store.counts() == {"conversation": 0, "turn": 0, "llm_call": 0, "feedback": 0}


def test_round_trip(store):
    c = store.conversation("u1", None)
    assert store.conversation("u1", c) == c                 # same user continues
    assert store.conversation("u2", c) != c                 # another user can't join it
    t1 = store.record_turn(conversation_id=c, request_id="r1", user_id="u1", answer=_answer("first"), latency_ms=12)
    t2 = store.record_turn(conversation_id=c, request_id="r2", user_id="u1", answer=_answer("second"), latency_ms=9)
    store.record_turn(conversation_id=c, request_id="r3", user_id="u1", answer=_answer("bg"), latency_ms=5, channel="insights")
    store.record_llm_calls(t1, "r1", [{"step": "understand", "prompt_id": "p", "prompt_version": "1", "prompt_sha256": "0" * 64,
                                       "model": "m", "latency_ms": 3, "outcome": "ok"}])
    assert store.add_feedback(t2, "u1", 1, "good") is not None
    assert store.add_feedback(t2, "u2", -1, None) is None   # not their turn
    rows = store.turns("u1")
    assert [r["question"] for r in rows] == ["second", "first"]   # newest first, insights kept out
    assert set(rows[0]) == {"id", "conversation_id", "created_at", "question", "status", "headline", "intent", "view_record_id", "channel"}
    assert [r["question"] for r in store.turns("u1", channel="insights")] == ["bg"]
    assert store.turns("u1", conversation_id=c, limit=1)[0]["id"] == t2
    assert store.counts() == {"conversation": 2, "turn": 3, "llm_call": 1, "feedback": 1}


def test_open_store_picks_backend(tmp_path):
    assert db.open_store(None, tmp_path / "a.sqlite").backend == "sqlite"
    assert db.open_store("sqlite:///ignored", tmp_path / "b.sqlite").backend == "sqlite"
    with pytest.raises(ValueError):
        db.MariaDBStore("postgres://u@h/db")


@pytest.mark.skipif(not MARIA, reason="needs TEST_MARIADB_URL")
def test_mariadb_reconnects_after_drop():
    s = db.MariaDBStore(MARIA)
    s._con.close()                      # as if the server timed the connection out
    assert s.ping() and s.version() == 2
    s.drop_all()
    s.close()
