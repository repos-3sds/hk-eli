"""Calls Niharika's HK_ELI business skills in process, unchanged.

Her `services.analytics.business.BusinessAnalytics.run(op, identity, days, currency)` holds the
reviewed, fixed SQL templates behind twelve `eli.*` skills (no model-written SQL). We import it
from her clone (`HKELI_REPO`, the `skills-service` submodule) and point it at our SQLite book.
Her code is not copied or edited. The book is in USD, so every call asks for `currency='USD'`
(her default HKD returns nothing on this data).
"""
from __future__ import annotations

import sys
import threading
from functools import lru_cache
from typing import Any

from . import settings

# Skill id -> her operation name (the same mapping as her domains/hk_eli/skills.py).
SKILL_OPERATIONS: dict[str, str] = {
    "eli.sales.performance": "sales",
    "eli.rfq.conversion": "rfq",
    "eli.risk.concentration": "concentration",
    "eli.maturity.analyze": "maturity",
    "eli.rollover.opportunity": "rollover",
    "eli.client.engagement": "engagement",
    "eli.regional.performance": "regional",
    "eli.digibank.journey": "digital",
    "eli.product.yield": "yield",
    "eli.branch.concentration": "branch",
    "eli.client.intelligence": "client",
    "eli.sales.trend": "trend",
}

_lock = threading.Lock()


class SkillsUnavailable(RuntimeError):
    """Her clone or pydantic is missing: the skill tools cannot run."""


@lru_cache(maxsize=1)
def _service() -> tuple[Any, Any]:
    repo = settings.HKELI_REPO
    if not (repo / "services" / "analytics" / "business.py").is_file():
        raise SkillsUnavailable(
            f"HK_ELI skills not found at {repo}. Run `git submodule update --init skills-service` "
            f"or set HKELI_REPO to Niharika's HK_ELI clone.")
    if str(repo) not in sys.path:
        sys.path.insert(0, str(repo))
    try:
        from hk_platform.contracts.models import Identity
        from services.analytics.business import BusinessAnalytics
    except ImportError as exc:  # pragma: no cover - environment problem, reported to the user
        raise SkillsUnavailable(f"HK_ELI skills could not be imported: {exc}") from None
    if not settings.DB_PATH.is_file():
        raise SkillsUnavailable(
            f"Business book not found at {settings.DB_PATH}. Build it with `python3 business-db/build.py`.")
    return BusinessAnalytics(settings.DB_PATH), Identity


def identity_for(persona: str) -> Any:
    """The identity her skills authorise against. Launch users are internal HK staff.

    Every launch persona sees the HK book for now; per-persona entitlements are a known gap
    (see the README).
    """
    _, Identity = _service()
    return Identity(id=f"eli-chatbot:{persona or 'user'}", country="HK", line_of_business="ELI",
                    permissions=["analytics.read"], resources=["mock:business"])


def run_skill(skill_id: str, persona: str = "", days: int = 5) -> dict[str, Any]:
    """Run one `eli.*` business skill. Returns her SkillOutput as a plain dict."""
    if skill_id not in SKILL_OPERATIONS:
        raise KeyError(f"unknown skill {skill_id}")
    service, _ = _service()
    with _lock:   # her connect() is per call; the lock only keeps the import/cache single-file
        out = service.run(SKILL_OPERATIONS[skill_id], identity_for(persona), days=days, currency="USD")
    return out.model_dump(mode="json")


def available() -> tuple[bool, str]:
    try:
        _service()
        return True, "ok"
    except SkillsUnavailable as exc:
        return False, str(exc)
