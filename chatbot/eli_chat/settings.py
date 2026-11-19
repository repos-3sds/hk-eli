"""Every setting in one place, read from the environment (and `chatbot/.env`, which git ignores).

| Variable | Default | Meaning |
|---|---|---|
| `ELI_MODEL_PROVIDER` | `auto` | `gemini`, `stork`, `ollama`, `offline`, or `auto` (Gemini when a key is set, else Ollama when it answers, else offline) |
| `ELI_GEMINI_MODEL` | `gemini-3.5-flash` | Model id on Google's public Gemini API |
| `ELI_STORK_MODEL` | `gemini-4-argon` | Gateway id on Stork, the bank's Gemini gateway |
| `ELI_OLLAMA_MODEL` | `qwen3:8b` | Local Ollama model (must support tools) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server |
| `GEMINI_API_KEY` | none | Google AI Studio key, only for `gemini` |
| `ELI_DB` | `../business-db/out/business.sqlite` | The SQLite business book |
| `HKELI_REPO` | `../skills-service` | Niharika's HK_ELI clone (the skills' reviewed queries) |
| `ELI_PORT` | `8040` | HTTP port |
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # chatbot/
REPO = ROOT.parent                                      # hk-eli/


def _load_dotenv() -> None:
    """Read chatbot/.env. A variable already set in the real environment wins."""
    path = ROOT / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and not os.environ.get(key):
            os.environ[key] = value


_load_dotenv()


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default


APP_NAME = "HK ELI Chatbot"
APP_NOTE = "*Will be part of Ask-MIRA in future"

DB_PATH = Path(env("ELI_DB", str(REPO / "business-db" / "out" / "business.sqlite")))
HKELI_REPO = Path(env("HKELI_REPO", str(REPO / "skills-service")))
WEB_DIR = ROOT / "web"
HOST = env("ELI_HOST", "127.0.0.1")
PORT = int(env("ELI_PORT", "8040"))

PROVIDER = env("ELI_MODEL_PROVIDER", "auto").lower()
GEMINI_MODEL = env("ELI_GEMINI_MODEL", "gemini-3.5-flash")
STORK_MODEL = env("ELI_STORK_MODEL", "gemini-4-argon")
OLLAMA_MODEL = env("ELI_OLLAMA_MODEL", "qwen3:8b")
OLLAMA_HOST = env("OLLAMA_HOST", "http://localhost:11434").rstrip("/")

MAX_TOOL_ROUNDS = int(env("ELI_MAX_TOOL_ROUNDS", "6"))
MAX_HISTORY_TURNS = 6
MODEL_TIMEOUT_S = int(env("ELI_MODEL_TIMEOUT_S", "180"))
