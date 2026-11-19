"""Read-only queries on our columns of the SQLite book that her skills do not read yet.

Her twelve skills read only her original columns, so client names, RMs, knock-out distance,
RFQ terms and the idea warehouse are not reachable through them (business-db README, Known
gaps). These fixed, parameterised queries cover that until her side adds them. Same rules as
hers: no model-written SQL, every value comes back with the book's as-of date.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from . import settings


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    uri = f"file:{settings.DB_PATH}?mode=ro"
    db = sqlite3.connect(uri, uri=True, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


def rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connect() as db:
        return [dict(r) for r in db.execute(sql, params)]


def one(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    found = rows(sql, params)
    return found[0] if found else None


def as_of() -> str:
    meta = one("SELECT as_of FROM metadata")
    return meta["as_of"] if meta else ""


def freshness() -> dict[str, Any]:
    """When each source last loaded, for the freshness line (data refreshes overnight)."""
    loads = rows("SELECT source, business_date AS data_date, loaded_at, status FROM source_loads ORDER BY source")
    return {"as_of": as_of(), "loads": loads}


def _add_business_days(start: str, days: int) -> str:
    from datetime import date, timedelta
    d = date.fromisoformat(start)
    left = days
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            left -= 1
    return d.isoformat()


def today() -> str:
    """The working day the user is in: the next business day after the overnight data date."""
    return _add_business_days(as_of(), 1)


def window_end(days: int) -> str:
    """`days` business days after today (Mon to Fri, no holiday calendar), the maturing window."""
    return _add_business_days(today(), days)
