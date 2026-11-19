"""SQLite store (locked decision: SQLite for now; MariaDB later behind the same functions).

Standard library only. The file lives under var/ (never shipped, created on first start).
Schema changes are numbered migrations applied in order and recorded in schema_version, so an
office copy upgrades in place and a MariaDB port has the same steps to follow.

Tables
  conversation   one chat session per user (carry-forward scope lives here later)
  turn           one question and its answer: intent, view, filters, status, numbers, timings
  llm_call       every model call: prompt id + version + sha256, model, latency, outcome (no raw text by default)
  feedback       thumbs up/down and a comment on a turn

What is stored: the question text and the computed answer. In the office that is internal data and
stays on the laptop; nothing here is sent anywhere.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

MIGRATIONS: list[tuple[int, str]] = [
    (1, """
    CREATE TABLE conversation (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE INDEX ix_conversation_user ON conversation(user_id, updated_at);

    CREATE TABLE turn (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversation(id),
        request_id      TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        question        TEXT NOT NULL,
        site            TEXT,
        intent          TEXT,
        understanding   TEXT,          -- rules | gateway | gateway->rules (fallback)
        insight         TEXT,          -- template | gateway | gateway->template (fallback)
        view_record_id  TEXT,
        filters_json    TEXT,
        status          TEXT NOT NULL,
        reasons_json    TEXT,
        headline        TEXT,
        numbers_json    TEXT,
        latency_ms      INTEGER
    );
    CREATE INDEX ix_turn_conv ON turn(conversation_id, created_at);
    CREATE INDEX ix_turn_user ON turn(user_id, created_at);
    CREATE INDEX ix_turn_status ON turn(status);

    CREATE TABLE llm_call (
        id              TEXT PRIMARY KEY,
        turn_id         TEXT,
        request_id      TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        step            TEXT NOT NULL,  -- understand | write_answer
        prompt_id       TEXT NOT NULL,
        prompt_version  TEXT NOT NULL,
        prompt_sha256   TEXT NOT NULL,
        model           TEXT NOT NULL,
        latency_ms      INTEGER,
        outcome         TEXT NOT NULL,  -- ok | rejected | error | timeout
        detail          TEXT            -- short reason code, never secrets
    );
    CREATE INDEX ix_llm_turn ON llm_call(turn_id);

    CREATE TABLE feedback (
        id          TEXT PRIMARY KEY,
        turn_id     TEXT NOT NULL REFERENCES turn(id),
        user_id     TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        rating      INTEGER NOT NULL CHECK (rating IN (-1, 1)),
        comment     TEXT
    );
    """),
    (2, """
    ALTER TABLE turn ADD COLUMN channel TEXT NOT NULL DEFAULT 'chat';
    CREATE INDEX ix_turn_user_channel ON turn(user_id, channel, created_at);
    """),
]

CHANNELS = ("chat", "insights")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def new_id() -> str:
    return uuid.uuid4().hex


class Store:
    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._con = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self._con.row_factory = sqlite3.Row
        self._con.execute("PRAGMA foreign_keys = ON")
        if self.path != ":memory:":
            self._con.execute("PRAGMA journal_mode = WAL")
        self._con.execute("PRAGMA busy_timeout = 5000")
        self.migrate()

    # --- schema
    def migrate(self) -> int:
        with self._lock:
            self._con.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
            have = {r[0] for r in self._con.execute("SELECT version FROM schema_version")}
            for v, sql in MIGRATIONS:
                if v in have:
                    continue
                self._con.execute("BEGIN")
                try:
                    for stmt in [s for s in sql.split(";") if s.strip()]:
                        self._con.execute(stmt)
                    self._con.execute("INSERT INTO schema_version VALUES (?, ?)", (v, _now()))
                    self._con.execute("COMMIT")
                except Exception:
                    self._con.execute("ROLLBACK")
                    raise
            return self.version()

    def version(self) -> int:
        r = self._con.execute("SELECT COALESCE(MAX(version), 0) FROM schema_version").fetchone()
        return int(r[0])

    def ping(self) -> bool:
        self._con.execute("SELECT 1").fetchone()
        return True

    # --- writes
    def conversation(self, user_id: str, conversation_id: str | None) -> str:
        with self._lock:
            if conversation_id:
                r = self._con.execute("SELECT user_id FROM conversation WHERE id = ?", (conversation_id,)).fetchone()
                if r and r["user_id"] == user_id:
                    self._con.execute("UPDATE conversation SET updated_at = ? WHERE id = ?", (_now(), conversation_id))
                    return conversation_id
            cid = new_id()
            now = _now()
            self._con.execute("INSERT INTO conversation VALUES (?, ?, ?, ?)", (cid, user_id, now, now))
            return cid

    def record_turn(self, *, conversation_id: str, request_id: str, user_id: str, answer: dict, latency_ms: int,
                    channel: str = "chat") -> str:
        tid = new_id()
        ev = (answer.get("evidence") or [{}])[0]
        meta = answer.get("meta") or {}
        with self._lock:
            self._con.execute(
                "INSERT INTO turn (id, conversation_id, request_id, user_id, created_at, question, site, intent, understanding,"
                " insight, view_record_id, filters_json, status, reasons_json, headline, numbers_json, latency_ms, channel)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (tid, conversation_id, request_id, user_id, _now(), answer.get("question", ""), answer.get("site"),
                 answer.get("intent"), meta.get("understanding"), meta.get("insight"), ev.get("record_id"),
                 json.dumps((answer.get("embed") or {}).get("filters") or {}), answer.get("status", "SYSTEM_ERROR"),
                 json.dumps(answer.get("reasons") or []), answer.get("headline", ""),
                 json.dumps([{k: n[k] for k in ("id", "value", "measure")} for n in answer.get("numbers") or []]),
                 latency_ms, channel))
        return tid

    def record_llm_calls(self, turn_id: str | None, request_id: str, calls: list[dict]) -> None:
        with self._lock:
            for c in calls:
                self._con.execute(
                    "INSERT INTO llm_call VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (new_id(), turn_id, request_id, _now(), c["step"], c["prompt_id"], c["prompt_version"],
                     c["prompt_sha256"], c["model"], c.get("latency_ms"), c["outcome"], c.get("detail")))

    def add_feedback(self, turn_id: str, user_id: str, rating: int, comment: str | None) -> str | None:
        with self._lock:
            r = self._con.execute("SELECT user_id FROM turn WHERE id = ?", (turn_id,)).fetchone()
            if not r or r["user_id"] != user_id:
                return None
            fid = new_id()
            self._con.execute("INSERT INTO feedback VALUES (?,?,?,?,?,?)", (fid, turn_id, user_id, _now(), rating, comment))
            return fid

    # --- reads
    def turns(self, user_id: str, conversation_id: str | None = None, limit: int = 50, channel: str = "chat") -> list[dict]:
        """A user's turns in one channel. Background widget questions ('insights') are kept for audit, not shown as history."""
        q = ("SELECT id, conversation_id, created_at, question, status, headline, intent, view_record_id, channel"
             " FROM turn WHERE user_id = ? AND channel = ?")
        args: list = [user_id, channel]
        if conversation_id:
            q += " AND conversation_id = ?"
            args.append(conversation_id)
        q += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)
        return [dict(r) for r in self._con.execute(q, args)]

    def counts(self) -> dict:
        return {t: self._con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]  # noqa: S608 - fixed table names
                for t in ("conversation", "turn", "llm_call", "feedback")}

    def close(self) -> None:
        self._con.close()
