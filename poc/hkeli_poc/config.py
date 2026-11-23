"""One place for every setting the service reads.

Rules (office standard, see OFFICE.md):
  * Every setting comes from the environment. `.env.example` lists them all with placeholders.
  * Secrets are never in code or in the zip. A secret is read from `<NAME>` or, preferably, from the
    file named by `<NAME>_FILE` (the file a Vault agent renders, e.g. /vault/secrets/tableau_secret).
    The file wins when both are set.
  * Defaults are safe for a laptop: bind 127.0.0.1, mock Tableau, model calls off, SQLite under var/.

Read once per process with `get()`. Tests call `reload()` after changing the environment.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PKG = Path(__file__).resolve().parent
ROOT = PKG.parent


class ConfigError(RuntimeError):
    """A setting is missing or invalid. The message names the setting, never its value."""


def _env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name)
    return default if v is None or v == "" else v


def secret(name: str) -> str | None:
    """`<NAME>_FILE` (Vault-rendered file) first, then `<NAME>`. Never logged."""
    path = _env(f"{name}_FILE")
    if path:
        p = Path(path)
        if not p.is_file():
            raise ConfigError(f"{name}_FILE points to a file that does not exist")
        return p.read_text(encoding="utf-8").strip() or None
    return _env(name)


def _bool(name: str, default: bool) -> bool:
    v = _env(name)
    if v is None:
        return default
    if v.lower() in ("1", "true", "yes", "on"):
        return True
    if v.lower() in ("0", "false", "no", "off"):
        return False
    raise ConfigError(f"{name} must be true or false")


def _int(name: str, default: int, lo: int, hi: int) -> int:
    v = _env(name)
    try:
        n = int(v) if v is not None else default
    except ValueError:
        raise ConfigError(f"{name} must be a whole number") from None
    if not lo <= n <= hi:
        raise ConfigError(f"{name} must be between {lo} and {hi}")
    return n


def _float(name: str, default: float, lo: float, hi: float) -> float:
    v = _env(name)
    try:
        n = float(v) if v is not None else default
    except ValueError:
        raise ConfigError(f"{name} must be a number") from None
    if not lo <= n <= hi:
        raise ConfigError(f"{name} must be between {lo} and {hi}")
    return n


def _choice(name: str, default: str, allowed: tuple[str, ...]) -> str:
    v = (_env(name, default) or default).lower()
    if v not in allowed:
        raise ConfigError(f"{name} must be one of: {', '.join(allowed)}")
    return v


def _path(name: str, default: Path) -> Path:
    v = _env(name)
    if v == ":memory:":
        return Path(v)
    p = Path(v) if v else default
    return p if p.is_absolute() else (ROOT / p)


@dataclass(frozen=True)
class LLMSettings:
    mode: str                   # off | gateway
    gateway_url: str | None     # base URL of the approved model gateway (placeholder in .env.example)
    path_template: str          # appended to gateway_url; {model} is replaced
    model: str
    api_key: str | None = field(repr=False, default=None)
    auth_header: str = "Authorization"
    auth_scheme: str = "Bearer"
    timeout_s: float = 20.0
    max_retries: int = 2
    temperature: float = 0.0
    ca_bundle: str | None = None
    provider: str = "Gemini"    # label shown in answers (meta.provider)

    @property
    def enabled(self) -> bool:
        return self.mode == "gateway"


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    log_level: str
    timezone: str
    demo_today: date | None
    db_path: Path
    knowledge_dir: Path
    prompts_dir: Path
    tableau_mode: str           # mock | real
    tableau_embed: str          # embed | link | off   (open decision: own charts + link, or live embed)
    tableau_timeout_s: float
    trust_edge_headers: bool    # true only behind the Java edge, which authenticates the user
    edge_token: str | None = field(repr=False, default=None)
    default_user: str = "demo.user"
    llm: LLMSettings | None = None
    catalog_path: Path | None = None   # office: the merged real catalog (office/import_catalog.py); None = packaged synthetic one
    concept_matcher: bool = True        # catalog concept matcher and value translation (logical-query-mcp rules)

    def today(self) -> date:
        if self.demo_today:
            return self.demo_today
        return datetime.now(ZoneInfo(self.timezone)).date()


def allow_public_bind() -> bool:
    """True only in a container (OpenShift), where the pod must listen on 0.0.0.0 for its Service."""
    return _bool("ALLOW_PUBLIC_BIND", False)


# Mock data is built around this business day; real mode uses the clock.
MOCK_DEMO_TODAY = "2026-11-19"


def load() -> Settings:
    tableau_mode = _choice("TABLEAU_MODE", "mock", ("mock", "real"))
    demo = _env("DEMO_TODAY", MOCK_DEMO_TODAY if tableau_mode == "mock" else None)
    try:
        demo_today = date.fromisoformat(demo) if demo else None
    except ValueError:
        raise ConfigError("DEMO_TODAY must be a date like 2026-11-19") from None
    tz = _env("APP_TIMEZONE", "Asia/Hong_Kong")
    try:
        ZoneInfo(tz)
    except Exception:
        raise ConfigError("APP_TIMEZONE is not a known time zone") from None

    llm_mode = _choice("LLM_MODE", "off", ("off", "gateway"))
    llm = LLMSettings(
        mode=llm_mode,
        gateway_url=(_env("LLM_GATEWAY_URL") or "").rstrip("/") or None,
        path_template=_env("LLM_GATEWAY_PATH", "/v1/models/{model}:generateContent"),
        model=_env("LLM_MODEL", "gemini-2.5-flash"),
        api_key=secret("LLM_API_KEY"),
        auth_header=_env("LLM_AUTH_HEADER", "Authorization"),
        # Set but empty means "no scheme": the key is sent alone (e.g. LLM_AUTH_HEADER=x-goog-api-key).
        auth_scheme=os.environ.get("LLM_AUTH_SCHEME", "Bearer").strip(),
        timeout_s=_float("LLM_TIMEOUT_S", 20.0, 1, 120),
        max_retries=_int("LLM_MAX_RETRIES", 2, 0, 5),
        temperature=_float("LLM_TEMPERATURE", 0.0, 0, 1),
        ca_bundle=_env("LLM_CA_BUNDLE"),
        provider=_env("LLM_PROVIDER_LABEL", "Gemini"),
    )
    if llm.enabled and not llm.gateway_url:
        raise ConfigError("LLM_MODE=gateway needs LLM_GATEWAY_URL")
    if llm.enabled and not llm.gateway_url.startswith("https://") and not llm.gateway_url.startswith("http://127.0.0.1"):
        raise ConfigError("LLM_GATEWAY_URL must use https (TLS verification stays on)")

    trust = _bool("TRUST_EDGE_HEADERS", False)
    edge_token = secret("EDGE_SHARED_TOKEN")
    if trust and not edge_token:
        raise ConfigError("TRUST_EDGE_HEADERS=true needs EDGE_SHARED_TOKEN (or EDGE_SHARED_TOKEN_FILE)")

    return Settings(
        host=_env("HOST", "127.0.0.1"),
        port=_int("PORT", 8050, 1024, 65535),
        log_level=_choice("LOG_LEVEL", "info", ("debug", "info", "warning", "error")),
        timezone=tz,
        demo_today=demo_today,
        db_path=_path("DB_PATH", Path("var/hkeli.sqlite")),
        knowledge_dir=_path("KNOWLEDGE_DIR", PKG / "knowledge"),
        prompts_dir=_path("PROMPTS_DIR", PKG / "prompts"),
        tableau_mode=tableau_mode,
        tableau_embed=_choice("TABLEAU_EMBED", "embed", ("embed", "link", "off")),
        tableau_timeout_s=_float("TABLEAU_TIMEOUT_S", 30.0, 1, 300),
        trust_edge_headers=trust,
        edge_token=edge_token,
        default_user=_env("DEFAULT_USER", "demo.user"),
        llm=llm,
        catalog_path=_path("CATALOG_PATH", Path("")) if _env("CATALOG_PATH") else None,
        concept_matcher=_bool("CONCEPT_MATCHER", True),
    )


def load_env_file(path: Path | str = ROOT / ".env") -> int:
    """Read KEY=VALUE lines from .env into the environment (existing variables win). Returns the count.

    Tiny on purpose (no extra package): '#' comments, blank lines, optional quotes, no expansion.
    """
    p = Path(path)
    if not p.is_file():
        return 0
    n = 0
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        if k and k not in os.environ:
            os.environ[k] = v
            n += 1
    return n


_settings: Settings | None = None


def get() -> Settings:
    global _settings
    if _settings is None:
        _settings = load()
    return _settings


def reload() -> Settings:
    global _settings
    _settings = None
    return get()
