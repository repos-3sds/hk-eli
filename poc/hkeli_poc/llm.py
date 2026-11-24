"""Model adapter: Stork (the office's private Gemini SDK), the approved model gateway (Gemini REST), or off.

Locked decision: the model only (1) interprets the question into the intent contract and (2) words
the answer from numbers the code already validated. Code picks the view, the filters and the numbers.
So every call here is optional: when the model is off, slow, wrong or unreachable, the pipeline falls
back to its deterministic rules and templates and says so in the answer's meta.

Wire format: Gemini `generateContent` (REST), sent to LLM_GATEWAY_URL + LLM_GATEWAY_PATH. The gateway's
exact path and auth header are office settings (.env.example). Structured output uses
`responseMimeType: application/json` + `responseSchema`, kept inside what Gemini accepts (no empty
strings in enums, nullable instead of null types).

LLM_MODE=stork: the office's private SDK, imported only when used:
    from ada_genai.google_genai import VertexClient
    await VertexClient().aio.models.generate_content(model=LLM_MODEL, content=prompt)
Credentials ONE_BANK_ID, ONE_BANK_PASSWORD and SSL_CERT_FILE come from the environment (.env). The SDK is
installed from the office package channel only; it is not on public PyPI and not in requirements.txt.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass

import httpx

from .config import LLMSettings

RETRY_STATUS = {429, 500, 502, 503, 504}


class LLMError(Exception):
    def __init__(self, code: str, msg: str = ""):
        super().__init__(msg or code)
        self.code = code   # TIMEOUT | HTTP_<n> | BAD_RESPONSE | NOT_JSON | OFF


@dataclass
class Call:
    """What gets audited for one call. No prompt text, no answer text, no key."""
    step: str
    prompt_id: str
    prompt_version: str
    prompt_sha256: str
    model: str
    latency_ms: int = 0
    outcome: str = "ok"      # ok | rejected | error | timeout
    detail: str | None = None

    def as_row(self) -> dict:
        return self.__dict__.copy()


class OffClient:
    enabled = False
    model = "off"
    provider = "none"

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        raise LLMError("OFF", "Model calls are off (LLM_MODE=off)")


class GatewayClient:
    enabled = True

    def __init__(self, s: LLMSettings, http: httpx.Client | None = None):
        self.s = s
        self.model = s.model
        self.provider = s.provider
        self.http = http or httpx.Client(timeout=s.timeout_s, verify=s.ca_bundle or True)

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.s.api_key:
            h[self.s.auth_header] = f"{self.s.auth_scheme} {self.s.api_key}".strip() if self.s.auth_scheme else self.s.api_key
        return h

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        url = self.s.gateway_url + self.s.path_template.format(model=self.s.model)
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": self.s.temperature, "responseMimeType": "application/json",
                                 "responseSchema": schema},
        }
        last: LLMError | None = None
        for attempt in range(self.s.max_retries + 1):
            if attempt:
                time.sleep(min(0.5 * 2 ** (attempt - 1), 4.0))
            try:
                r = self.http.post(url, json=body, headers=self._headers(), timeout=self.s.timeout_s)
            except httpx.TimeoutException:
                last = LLMError("TIMEOUT")
                continue
            except httpx.HTTPError as e:
                last = LLMError("CONNECT", type(e).__name__)
                continue
            if r.status_code in RETRY_STATUS:
                last = LLMError(f"HTTP_{r.status_code}")
                continue
            if r.status_code != 200:
                raise LLMError(f"HTTP_{r.status_code}")
            try:
                text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError, TypeError, ValueError):
                raise LLMError("BAD_RESPONSE") from None
            try:
                out = json.loads(text)
            except ValueError:
                raise LLMError("NOT_JSON") from None
            if not isinstance(out, dict):
                raise LLMError("NOT_JSON")
            return out
        raise last or LLMError("UNKNOWN")


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t[3:]
        if t[:4].lower() == "json":
            t = t[4:]
        if t.endswith("```"):
            t = t[:-3]
    return t.strip()


class StorkClient:
    """Gemini through the office's private Stork SDK (ada_genai). Same contract as GatewayClient."""
    enabled = True

    def __init__(self, s: LLMSettings, sdk=None):
        self.s = s
        self.model = s.model
        self.provider = s.provider
        self._sdk = sdk          # tests pass a fake VertexClient class
        self._env_ready = False

    def _vertex(self):
        """A fresh client per call: each call runs in its own event loop (asyncio.run in a worker thread)."""
        if not self._env_ready:
            # The SDK reads its credentials from the environment; provide both spellings it may look for.
            for names, value in ((("ONE_BANK_ID", "One_Bank_ID"), self.s.stork_user),
                                 (("ONE_BANK_PASSWORD", "One_BANK_PASSWORD"), self.s.stork_password),
                                 (("SSL_CERT_FILE",), self.s.ssl_cert_file)):
                for n in names:
                    if value and not os.environ.get(n):
                        os.environ[n] = value
            self._env_ready = True
        cls = self._sdk
        if cls is None:
            try:
                from ada_genai.google_genai import VertexClient as cls  # office-only package
            except ImportError:
                raise LLMError("SDK_MISSING", "ada_genai is not installed (office package channel)") from None
        return cls()

    def generate_json(self, system: str, user: str, schema: dict) -> dict:
        prompt = (f"{system}\n\nReturn only one JSON object that matches this JSON schema, with no other text:\n"
                  f"{json.dumps(schema, ensure_ascii=False)}\n\n{user}")
        last: LLMError | None = None
        for attempt in range(self.s.max_retries + 1):
            if attempt:
                time.sleep(min(0.5 * 2 ** (attempt - 1), 4.0))
            try:
                vc = self._vertex()
                resp = asyncio.run(asyncio.wait_for(
                    vc.aio.models.generate_content(model=self.s.model, content=prompt), self.s.timeout_s))
            except LLMError:
                raise
            except asyncio.TimeoutError:
                last = LLMError("TIMEOUT")
                continue
            except Exception as e:  # SDK errors: name only, never the message (it may echo credentials)
                last = LLMError("SDK_ERROR", type(e).__name__)
                continue
            text = getattr(resp, "text", resp)
            if not isinstance(text, str) or len(text) > 64000:
                raise LLMError("BAD_RESPONSE")
            try:
                out = json.loads(_strip_fences(text))
            except ValueError:
                raise LLMError("NOT_JSON") from None
            if not isinstance(out, dict):
                raise LLMError("NOT_JSON")
            return out
        raise last or LLMError("UNKNOWN")


def client(s: LLMSettings | None, http: httpx.Client | None = None):
    if s is None or not s.enabled:
        return OffClient()
    if s.mode == "stork":
        return StorkClient(s)
    return GatewayClient(s, http)
