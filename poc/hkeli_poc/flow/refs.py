"""Per-request state that Dify refers to by request id. Rows and the full answer stay here, never in Dify."""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Turn:
    request_id: str
    user: str
    question: str
    site: str
    scenario: str | None
    needs_model: bool
    understand: tuple[str, str, dict] | None
    created: float = field(default_factory=time.monotonic)
    draft: dict | None = None          # the answer object from the `answer` tool (template wording)
    calls: list = field(default_factory=list)
    word: tuple[str, str, dict] | None = None
    problems: list[str] = field(default_factory=list)   # set by the grade when a rewrite is asked
    extra: dict[str, Any] = field(default_factory=dict)


class Refs:
    """A small TTL map. One replica only (like the SQLite store); a shared cache comes with several replicas."""

    def __init__(self, ttl_s: float = 300.0, max_items: int = 2000):
        self.ttl, self.max = ttl_s, max_items
        self._d: dict[str, Turn] = {}
        self._lock = threading.Lock()

    def put(self, t: Turn) -> None:
        with self._lock:
            self._sweep()
            self._d[t.request_id] = t

    def get(self, request_id: str) -> Turn | None:
        with self._lock:
            t = self._d.get(request_id)
            if t and time.monotonic() - t.created > self.ttl:
                self._d.pop(request_id, None)
                return None
            return t

    def drop(self, request_id: str) -> None:
        with self._lock:
            self._d.pop(request_id, None)

    def _sweep(self) -> None:
        now = time.monotonic()
        for k in [k for k, t in self._d.items() if now - t.created > self.ttl]:
            self._d.pop(k, None)
        while len(self._d) >= self.max:
            self._d.pop(next(iter(self._d)))


REFS = Refs()
