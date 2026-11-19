"""Gemini with tool calling, through a client with the google-genai `Client` surface.

Two clients, one adapter (the "Gemini adapter" in the project decisions):

* **gemini**: Google's public `google.genai.Client(api_key=GEMINI_API_KEY)`, for this Mac.
* **stork**: the bank's `ada_genai.google_genai.VertexClient()`, the same surface behind the
  bank's gateway (login from ONE_BANK_ID / ONE_BANK_PASSWORD, CA from SSL_CERT_FILE). Nothing
  else changes, which is the point: the office build swaps the client, not the agent.

Rules from STORK-SETUP.md that apply to both: tool schemas go through `clean_schema` (no `""`
in an enum, no `const`, no type lists); the model's own function-call parts are sent back
unchanged so their `thought_signature` survives; thinking is set to low so it does not eat the
answer's token budget.
"""
from __future__ import annotations

import os
import uuid
from typing import Any

from .. import settings
from .base import ModelTurn, ProviderError, TextSink, ToolCall

_KEEP = {"type", "description", "enum", "items", "properties", "required", "nullable",
         "format", "minimum", "maximum", "anyOf", "minItems", "maxItems"}


def clean_schema(node: Any) -> Any:
    """A JSON Schema reduced to what Gemini accepts (copied from STORK-SETUP.md section 6)."""
    if isinstance(node, list):
        return [clean_schema(x) for x in node]
    if not isinstance(node, dict):
        return node
    out: dict[str, Any] = {}
    for k, v in node.items():
        if k == "properties" and isinstance(v, dict):
            out[k] = {pk: clean_schema(pv) for pk, pv in v.items()}
        elif k == "const":
            out["enum"] = [v]
        elif k == "type" and isinstance(v, list):
            kinds = [t for t in v if t != "null"]
            out["type"] = kinds[0] if kinds else "string"
            if "null" in v:
                out["nullable"] = True
        elif k == "enum" and isinstance(v, list):
            kept = [x for x in v if x != ""]
            if kept:
                out[k] = kept
        elif k in _KEEP:
            out[k] = clean_schema(v) if k in ("items", "anyOf") else v
    if isinstance(out.get("required"), list) and isinstance(out.get("properties"), dict):
        out["required"] = [r for r in out["required"] if r in out["properties"]]
        if not out["required"]:
            out.pop("required")
    if out.get("type") == "object" and "properties" not in out:
        out["properties"] = {}
    return out


def _attr(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


class GeminiProvider:
    written_by = "model"

    def __init__(self, name: str = "gemini", model: str | None = None, client: Any = None,
                 stream: bool | None = None):
        self.name = name
        self.model = model or (settings.STORK_MODEL if name == "stork" else settings.GEMINI_MODEL)
        self._client = client
        self.stream = (name == "gemini") if stream is None else stream
        self._thinking: dict[str, Any] | None = {"thinking_level": "low"}

    # -- client ---------------------------------------------------------------------------
    def client(self) -> Any:
        if self._client is not None:
            return self._client
        if self.name == "stork":
            if os.environ.get("STORK_CA_FILE") and not os.environ.get("SSL_CERT_FILE"):
                os.environ["SSL_CERT_FILE"] = os.environ["STORK_CA_FILE"]
            try:
                from ada_genai.google_genai import VertexClient  # type: ignore
            except ImportError as exc:
                raise ProviderError("Stork SDK (ada_genai[google-genai]) is not installed here. "
                                    "It is only on the bank's network.") from exc
            self._client = VertexClient()
        else:
            key = os.environ.get("GEMINI_API_KEY", "")
            if not key:
                raise ProviderError("GEMINI_API_KEY is not set (chatbot/.env or the environment).")
            from google import genai
            self._client = genai.Client(api_key=key)
        return self._client

    # -- conversation -----------------------------------------------------------------------
    @staticmethod
    def contents(messages: list[dict[str, Any]]) -> list[Any]:
        out: list[Any] = []
        for m in messages:
            role = m["role"]
            if role == "user":
                out.append({"role": "user", "parts": [{"text": m["text"]}]})
            elif role == "assistant":
                if m.get("raw") is not None:
                    out.append(m["raw"])            # the model's own turn, signatures intact
                else:
                    parts: list[dict[str, Any]] = []
                    if m.get("text"):
                        parts.append({"text": m["text"]})
                    for c in m.get("tool_calls", []):
                        parts.append({"function_call": {"name": c.name, "args": c.args}})
                    out.append({"role": "model", "parts": parts or [{"text": ""}]})
            elif role == "tool":
                out.append({"role": "user", "parts": [
                    {"function_response": {"name": r["name"], "response": {"result": r["content"]}}}
                    for r in m["results"]]})
        return out

    def _config(self, system: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
        cfg: dict[str, Any] = {"system_instruction": system, "max_output_tokens": 8192}
        if tools:
            cfg["tools"] = [{"function_declarations": [
                {"name": t["name"], "description": t["description"], "parameters": clean_schema(t["parameters"])}
                for t in tools]}]
            cfg["tool_config"] = {"function_calling_config": {"mode": "AUTO"}}
        if self._thinking:
            cfg["thinking_config"] = self._thinking
        return cfg

    # -- one turn -------------------------------------------------------------------------
    def turn(self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
             on_text: TextSink | None = None) -> ModelTurn:
        contents = self.contents(messages)
        try:
            return self._call(contents, self._config(system, tools), on_text)
        except ProviderError:
            raise
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if self._thinking and "thinking" in msg.lower():
                # Pitfall 4: an older model refuses thinking_level. Ask once with a token budget.
                self._thinking = {"thinking_budget": 1024}
                try:
                    return self._call(contents, self._config(system, tools), on_text)
                except Exception as exc2:  # noqa: BLE001
                    msg = str(exc2)
            raise ProviderError(f"{self.name} call failed: {msg[:400]}") from None

    def _call(self, contents: list[Any], config: dict[str, Any], on_text: TextSink | None) -> ModelTurn:
        client = self.client()
        text_parts: list[str] = []
        calls: list[Any] = []
        text_sig: Any = None
        usage: Any = None
        finish = ""
        responses = (client.models.generate_content_stream(model=self.model, contents=contents, config=config)
                     if self.stream else [client.models.generate_content(model=self.model, contents=contents,
                                                                         config=config)])
        for resp in responses:
            usage = _attr(resp, "usage_metadata") or usage
            for cand in (_attr(resp, "candidates") or [])[:1]:
                finish = str(_attr(cand, "finish_reason") or finish)
                content = _attr(cand, "content")
                for part in (_attr(content, "parts") or []) if content is not None else []:
                    if _attr(part, "function_call"):
                        calls.append(part)
                    elif _attr(part, "thought"):
                        continue                       # thought summaries are never the answer
                    elif _attr(part, "text"):
                        text_parts.append(part.text if not isinstance(part, dict) else part["text"])
                        if on_text:
                            on_text(text_parts[-1])
                        text_sig = _attr(part, "thought_signature") or text_sig
                    elif _attr(part, "thought_signature"):
                        text_sig = _attr(part, "thought_signature")
        text = "".join(text_parts)
        raw_parts: list[Any] = []
        if text:
            p: dict[str, Any] = {"text": text}
            if text_sig:
                p["thought_signature"] = text_sig
            raw_parts.append(p)
        tool_calls: list[ToolCall] = []
        for part in calls:
            fc = _attr(part, "function_call")
            args = _attr(fc, "args") or {}
            tool_calls.append(ToolCall(id=_attr(fc, "id") or uuid.uuid4().hex[:12], name=_attr(fc, "name"),
                                       args=dict(args)))
            raw_parts.append(part)
        u = {}
        if usage is not None:
            u = {"input_tokens": _attr(usage, "prompt_token_count"), "output_tokens": _attr(usage, "candidates_token_count"),
                 "thinking_tokens": _attr(usage, "thoughts_token_count")}
        return ModelTurn(text=text, tool_calls=tool_calls, raw={"role": "model", "parts": raw_parts or [{"text": ""}]},
                         usage=u, finish=finish)
