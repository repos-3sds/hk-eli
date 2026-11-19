"""The one surface every model client speaks: `turn(system, messages, tools, on_text) -> ModelTurn`.

Messages are kept in a neutral form so the loop never knows which provider runs:

    {"role": "user", "text": "..."}
    {"role": "assistant", "text": "...", "tool_calls": [ToolCall, ...], "raw": <provider's own turn>}
    {"role": "tool", "results": [{"id": ..., "name": ..., "content": "<json>"}]}

`raw` lets a provider send its own turn back unchanged (Gemini needs its `thought_signature`).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass
class ModelTurn:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: Any = None
    usage: dict[str, Any] = field(default_factory=dict)
    finish: str = ""


TextSink = Callable[[str], None]


class Provider(Protocol):
    name: str          # gemini | stork | ollama | offline
    model: str
    written_by: str    # "model" or "code"

    def turn(self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
             on_text: TextSink | None = None) -> ModelTurn: ...


class ProviderError(RuntimeError):
    """The model could not be reached or refused the request. Said to the user as it is."""
