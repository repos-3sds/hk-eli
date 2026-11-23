"""Container (OpenShift UAT) start rules: loopback by default, 0.0.0.0 only with ALLOW_PUBLIC_BIND=true."""
from __future__ import annotations

import sys
import types

from hkeli_poc import __main__ as entry
from hkeli_poc import config


def _run(monkeypatch, **env):
    for k in ("HOST", "PORT", "ALLOW_PUBLIC_BIND"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(config, "load_env_file", lambda *a, **k: 0)
    calls = []
    monkeypatch.setitem(sys.modules, "uvicorn", types.SimpleNamespace(run=lambda *a, **k: calls.append(k)))
    config.reload()
    try:
        return entry.main(), calls
    finally:
        for k in env:
            monkeypatch.delenv(k, raising=False)
        config.reload()


def test_public_bind_refused_without_flag(monkeypatch):
    code, calls = _run(monkeypatch, HOST="0.0.0.0")
    assert code == 2 and calls == []


def test_public_bind_allowed_in_container(monkeypatch):
    code, calls = _run(monkeypatch, HOST="0.0.0.0", PORT="8080", ALLOW_PUBLIC_BIND="true")
    assert code == 0 and calls[0]["host"] == "0.0.0.0" and calls[0]["port"] == 8080


def test_loopback_still_default(monkeypatch):
    code, calls = _run(monkeypatch)
    assert code == 0 and calls[0]["host"] == "127.0.0.1"
