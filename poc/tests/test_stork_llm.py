"""LLM_MODE=stork: the office's private Gemini SDK (ada_genai), tested with a fake client."""
from __future__ import annotations

import asyncio
import json
import types

import pytest

from hkeli_poc import config, llm


def _settings(monkeypatch, **env):
    for k in ("LLM_MODE", "LLM_GATEWAY_URL", "LLM_MODEL", "ONE_BANK_ID", "ONE_BANK_PASSWORD",
              "One_Bank_ID", "One_BANK_PASSWORD", "SSL_CERT_FILE"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return config.load()


def _fake(reply="{\"ok\": true}", calls=None, fail=None):
    class Models:
        async def generate_content(self, model, content):
            if calls is not None:
                calls.append((model, content))
            if fail:
                raise fail
            return types.SimpleNamespace(text=reply)

    class VertexClient:
        def __init__(self):
            self.aio = types.SimpleNamespace(models=Models())
    return VertexClient


def test_stork_needs_credentials(monkeypatch):
    with pytest.raises(config.ConfigError, match="ONE_BANK_ID and ONE_BANK_PASSWORD"):
        _settings(monkeypatch, LLM_MODE="stork")


def test_gateway_error_points_to_stork_and_off(monkeypatch):
    with pytest.raises(config.ConfigError, match="LLM_MODE=stork.*LLM_MODE=off"):
        _settings(monkeypatch, LLM_MODE="gateway")


def test_off_is_a_valid_first_run(monkeypatch):
    s = _settings(monkeypatch, LLM_MODE="off")
    assert not s.llm.enabled and isinstance(llm.client(s.llm), llm.OffClient)


def test_stork_settings_and_client(monkeypatch):
    s = _settings(monkeypatch, LLM_MODE="stork", One_Bank_ID="u", One_BANK_PASSWORD="pw-xyz-123")
    assert s.llm.enabled and s.llm.model == "gemini-3.5-flash"
    assert "pw-xyz-123" not in repr(s.llm)
    assert isinstance(llm.client(s.llm), llm.StorkClient)


def test_stork_call_returns_json_and_strips_fences(monkeypatch):
    s = _settings(monkeypatch, LLM_MODE="stork", ONE_BANK_ID="u", ONE_BANK_PASSWORD="p", LLM_MODEL="m1")
    calls = []
    c = llm.StorkClient(s.llm, sdk=_fake("```json\n{\"intent\": \"maturity\"}\n```", calls))
    assert c.generate_json("system words", "user words", {"type": "object"}) == {"intent": "maturity"}
    model, content = calls[0]
    assert model == "m1" and "system words" in content and "user words" in content
    import os
    assert os.environ["One_Bank_ID"] == "u" and os.environ["ONE_BANK_ID"] == "u"


def test_stork_not_json(monkeypatch):
    s = _settings(monkeypatch, LLM_MODE="stork", ONE_BANK_ID="u", ONE_BANK_PASSWORD="p")
    with pytest.raises(llm.LLMError) as e:
        llm.StorkClient(s.llm, sdk=_fake("not json")).generate_json("s", "u", {})
    assert e.value.code == "NOT_JSON"


def test_stork_sdk_error_is_named_not_echoed(monkeypatch):
    monkeypatch.setenv("LLM_MAX_RETRIES", "0")
    s = _settings(monkeypatch, LLM_MODE="stork", ONE_BANK_ID="u", ONE_BANK_PASSWORD="secret-pw")
    with pytest.raises(llm.LLMError) as e:
        llm.StorkClient(s.llm, sdk=_fake(fail=RuntimeError("bad password secret-pw"))).generate_json("s", "u", {})
    assert e.value.code == "SDK_ERROR" and "secret-pw" not in str(e.value)


def test_stork_without_sdk_falls_back(monkeypatch):
    s = _settings(monkeypatch, LLM_MODE="stork", ONE_BANK_ID="u", ONE_BANK_PASSWORD="p")
    with pytest.raises(llm.LLMError) as e:
        llm.StorkClient(s.llm).generate_json("s", "u", {})
    assert e.value.code == "SDK_MISSING"
