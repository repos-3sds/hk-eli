"""Choose the model client from ELI_MODEL_PROVIDER (one setting for every role)."""
from __future__ import annotations

import os

from .. import settings
from .base import ModelTurn, Provider, ProviderError, ToolCall
from .gemini import GeminiProvider
from .offline import OfflineProvider
from .ollama import OllamaProvider, reachable

__all__ = ["ModelTurn", "Provider", "ProviderError", "ToolCall", "build", "choices"]


def build(name: str | None = None) -> Provider:
    name = (name or settings.PROVIDER or "auto").lower()
    if name == "auto":
        if os.environ.get("GEMINI_API_KEY"):
            name = "gemini"
        elif reachable():
            name = "ollama"
        else:
            name = "offline"
    if name in ("gemini", "stork"):
        return GeminiProvider(name)
    if name == "ollama":
        return OllamaProvider()
    if name == "offline":
        return OfflineProvider()
    raise ValueError(f"Unknown ELI_MODEL_PROVIDER {name!r}: use gemini, stork, ollama, offline or auto.")


def choices() -> list[dict[str, object]]:
    """What the page's model menu offers, with whether each can run on this machine."""
    return [
        {"id": "gemini", "label": f"Gemini ({settings.GEMINI_MODEL})", "ready": bool(os.environ.get("GEMINI_API_KEY"))},
        {"id": "ollama", "label": f"Local Ollama ({settings.OLLAMA_MODEL})", "ready": reachable()},
        {"id": "stork", "label": f"Stork ({settings.STORK_MODEL})", "ready": _stork_ready()},
        {"id": "offline", "label": "No model (code answers)", "ready": True},
    ]


def _stork_ready() -> bool:
    try:
        import importlib.util
        return importlib.util.find_spec("ada_genai") is not None and bool(os.environ.get("ONE_BANK_PASSWORD"))
    except (ImportError, ValueError):
        return False
