"""A local Ollama model with native tool calling (`/api/chat`), standard library only.

The same backend the local-llm-fintech-eval harness runs offline. Use a model that supports
tools (qwen3:8b on this Mac; mistral and deepseek-r1 do not). qwen3's thinking is switched off
(`think: false`): at ~10 tokens a second, a reasoning trace costs minutes per turn.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid
from typing import Any

from .. import settings
from .base import ModelTurn, ProviderError, TextSink, ToolCall


def reachable(timeout: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(f"{settings.OLLAMA_HOST}/api/tags", timeout=timeout) as r:
            return r.status == 200
    except (urllib.error.URLError, OSError, ValueError):
        return False


class OllamaProvider:
    name = "ollama"
    written_by = "model"

    def __init__(self, model: str | None = None):
        self.model = model or settings.OLLAMA_MODEL

    @staticmethod
    def to_messages(system: str, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = [{"role": "system", "content": system}]
        for m in messages:
            if m["role"] == "user":
                out.append({"role": "user", "content": m["text"]})
            elif m["role"] == "assistant":
                msg: dict[str, Any] = {"role": "assistant", "content": m.get("text", "")}
                if m.get("tool_calls"):
                    msg["tool_calls"] = [{"function": {"name": c.name, "arguments": c.args}} for c in m["tool_calls"]]
                out.append(msg)
            elif m["role"] == "tool":
                for r in m["results"]:
                    out.append({"role": "tool", "content": r["content"], "tool_name": r["name"]})
        return out

    def turn(self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
             on_text: TextSink | None = None) -> ModelTurn:
        body = {
            "model": self.model, "stream": True, "think": False,
            "messages": self.to_messages(system, messages),
            "tools": [{"type": "function", "function": t} for t in tools],
            "options": {"temperature": 0, "num_ctx": 16384},
        }
        req = urllib.request.Request(f"{settings.OLLAMA_HOST}/api/chat", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        text: list[str] = []
        calls: list[ToolCall] = []
        usage: dict[str, Any] = {}
        try:
            with urllib.request.urlopen(req, timeout=settings.MODEL_TIMEOUT_S) as resp:
                for line in resp:
                    if not line.strip():
                        continue
                    chunk = json.loads(line)
                    if chunk.get("error"):
                        raise ProviderError(f"ollama: {chunk['error']}")
                    msg = chunk.get("message") or {}
                    if msg.get("content"):
                        text.append(msg["content"])
                        if on_text:
                            on_text(msg["content"])
                    for c in msg.get("tool_calls") or []:
                        fn = c.get("function", {})
                        args = fn.get("arguments") or {}
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except json.JSONDecodeError:
                                args = {}
                        calls.append(ToolCall(id=uuid.uuid4().hex[:12], name=fn.get("name", ""), args=args))
                    if chunk.get("done"):
                        usage = {"input_tokens": chunk.get("prompt_eval_count"),
                                 "output_tokens": chunk.get("eval_count")}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            raise ProviderError(f"ollama HTTP {exc.code}: {detail}") from None
        except (urllib.error.URLError, OSError) as exc:
            raise ProviderError(f"ollama not reachable at {settings.OLLAMA_HOST}: {exc}") from None
        return ModelTurn(text="".join(text), tool_calls=calls, usage=usage, finish="stop")
