"""Prompt library: versioned prompt files plus their output schemas.

Each prompt is `<id>.v<major>.md` with a front-matter block (id, version, inputs, output, checks,
banned phrases) and `<system>` / `<user>` sections using {{name}} placeholders. Every model call is
audited with the prompt id, version and sha256, so an answer can always be traced to the exact text.

Changing a prompt: copy to the next version, edit, bump `version`, add a changelog line, run the tests
(they render every prompt and check the schema stays inside what Gemini accepts).
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
_PLACE = re.compile(r"\{\{(\w+)\}\}")


class PromptError(ValueError):
    pass


@dataclass(frozen=True)
class Prompt:
    id: str
    version: str
    meta: dict
    system: str
    user: str
    schema: dict
    sha256: str
    inputs: tuple = field(default_factory=tuple)

    @property
    def banned(self) -> list[str]:
        return [b.strip() for b in self.meta.get("banned", "").split(",") if b.strip()]

    def render(self, **values) -> tuple[str, str]:
        missing = [k for k in self.inputs if k not in values]
        if missing:
            raise PromptError(f"prompt {self.id} needs {', '.join(missing)}")

        def sub(text):
            return _PLACE.sub(lambda m: str(values[m.group(1)]), text)

        return sub(self.system), sub(self.user)


def _parse(path: Path) -> Prompt:
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        raise PromptError(f"{path.name}: no front matter")
    meta = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    body = m.group(2)
    sm = re.search(r"<system>\n(.*?)</system>", body, re.S)
    um = re.search(r"<user>\n(.*?)</user>", body, re.S)
    if not sm or not um:
        raise PromptError(f"{path.name}: needs <system> and <user> sections")
    inputs = tuple(x.strip() for x in meta.get("inputs", "").split(",") if x.strip())
    used = set(_PLACE.findall(sm.group(1) + um.group(1)))
    if used != set(inputs):
        raise PromptError(f"{path.name}: placeholders {sorted(used)} do not match inputs {sorted(inputs)}")
    schema_path = path.parent / meta.get("output", "")
    if not schema_path.is_file():
        raise PromptError(f"{path.name}: output schema {meta.get('output')} not found")
    schema_raw = schema_path.read_bytes()
    sha = hashlib.sha256(raw.encode("utf-8") + schema_raw).hexdigest()
    for key in ("id", "version"):
        if not meta.get(key):
            raise PromptError(f"{path.name}: front matter needs {key}")
    return Prompt(meta["id"], meta["version"], meta, sm.group(1), um.group(1), json.loads(schema_raw), sha, inputs)


@lru_cache(maxsize=4)
def library(directory: str | None = None) -> dict[str, Prompt]:
    """Latest version of each prompt id in the folder."""
    d = Path(directory) if directory else HERE
    out: dict[str, Prompt] = {}
    for p in sorted(d.glob("*.v*.md")):
        pr = _parse(p)
        cur = out.get(pr.id)
        if cur is None or _ver(pr.version) > _ver(cur.version):
            out[pr.id] = pr
    for need in ("understand", "write_answer"):
        if need not in out:
            raise PromptError(f"prompt library has no '{need}' prompt")
    return out


def _ver(v: str) -> tuple:
    return tuple(int(x) for x in v.split("."))


def fill_enums(schema: dict, enums: dict[str, list[str]]) -> dict:
    """Replace "__NAME__" enum placeholders with real value lists (from the knowledge base)."""
    s = json.dumps(schema)
    for name, vals in enums.items():
        s = s.replace(f'["__{name}__"]', json.dumps(vals))
    out = json.loads(s)
    problems = gemini_schema_problems(out)
    if problems:
        raise PromptError("schema outside what Gemini accepts: " + "; ".join(problems))
    return out


GEMINI_TYPES = {"STRING", "INTEGER", "NUMBER", "BOOLEAN", "ARRAY", "OBJECT"}
GEMINI_KEYS = {"type", "properties", "required", "items", "enum", "nullable", "description", "format",
               "maxItems", "minItems", "propertyOrdering"}


def gemini_schema_problems(schema, path="$") -> list[str]:
    """Gemini's responseSchema is an OpenAPI subset: it rejects "" in enums, unknown keys, type lists."""
    out = []
    if not isinstance(schema, dict):
        return [f"{path} is not an object"]
    for k in schema:
        if k not in GEMINI_KEYS:
            out.append(f"{path}.{k} is not allowed")
    t = schema.get("type")
    if not isinstance(t, str) or t not in GEMINI_TYPES:
        out.append(f"{path}.type must be one of {sorted(GEMINI_TYPES)}")
    if "enum" in schema:
        e = schema["enum"]
        if not e or any((not isinstance(x, str)) or x == "" or x.startswith("__") for x in e):
            out.append(f"{path}.enum has an empty, non-string or unfilled value")
        if len(e) != len(set(e)):
            out.append(f"{path}.enum has duplicates")
    for name, sub in (schema.get("properties") or {}).items():
        out += gemini_schema_problems(sub, f"{path}.{name}")
    if "items" in schema:
        out += gemini_schema_problems(schema["items"], f"{path}[]")
    for r in schema.get("required", []):
        if r not in (schema.get("properties") or {}):
            out.append(f"{path}.required names unknown {r}")
    return out
