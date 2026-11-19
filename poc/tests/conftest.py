"""Test settings: in-memory store, mock Tableau, model off, fixed demo date. Nothing touches the network."""
import os

os.environ.setdefault("DB_PATH", ":memory:")
os.environ.setdefault("TABLEAU_MODE", "mock")
os.environ.setdefault("LLM_MODE", "off")
os.environ.setdefault("DEMO_TODAY", "2026-11-19")
os.environ.pop("TRUST_EDGE_HEADERS", None)

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_settings():
    """Each test sees the environment it sets; the app's Tableau session is rebuilt afterwards."""
    from hkeli_poc import config
    config.reload()
    yield
    from hkeli_poc import app as appmod
    appmod.S.http = None
    config.reload()
