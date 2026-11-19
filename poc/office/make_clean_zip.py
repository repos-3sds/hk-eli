"""Build a clean, complete, reproducible zip of a project for the office.

Standard library only (git optional). From anywhere:

    python3 make_clean_zip.py --src path/to/project --out project-clean-18nov.zip
    python3 make_clean_zip.py --src . --out x.zip --name my-project --dry-run   # list, write nothing

What it does, in order:
  1. Lists the files. With a git checkout it takes `git ls-files` (tracked files only, so
     nothing git ignores can slip in) plus nothing else; without git it walks the folder.
  2. Drops everything in EXCLUDE (git metadata and history, secrets, installed dependencies,
     caches, build output, local data, editor and OS litter), whatever git says.
  3. Refuses to build when a file looks like a secret: a .env, a key or certificate, a filled
     .npmrc or pip.conf, or a line that carries a token, a private key or a password value.
  4. Checks the install files: a package.json needs its package-lock.json beside it and the
     lock's top-level dependencies must match package.json; a requirements.txt must pin
     every line with ==.
  5. Writes the zip with one top folder, sorted entries, a fixed timestamp and fixed
     permissions, so the same tree always gives the same sha256. Adds MANIFEST.sha256
     (one line per file) at the top of the zip, and writes <zip>.sha256 beside it.

Exit code 0 when the zip was written, 1 when a check refused it (nothing is written then).
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

# Path patterns never packed. A pattern ending in "/" matches a folder at any depth; one that also
# starts with "/" matches only a folder at the project's top (src/app/data/ is code, /data/ is data).
EXCLUDE = [
    # git: no history, no metadata
    ".git/", ".gitmodules", ".git-blame-ignore-revs",
    # secrets and local configuration (examples are kept: see KEEP)
    ".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "*.crt", "*.cer", "id_rsa*", "id_ed25519*",
    ".npmrc", "pip.conf", "pip.ini", ".pypirc", ".netrc", "secrets.*", "*.secret", "credentials*.json",
    ".claude/settings.local.json",
    # installed dependencies and virtual environments
    "node_modules/", ".venv/", "venv/", "/env/", ".tox/", ".nox/", "site-packages/",
    # caches and build output
    "__pycache__/", "*.pyc", "*.pyo", ".pytest_cache/", ".mypy_cache/", ".ruff_cache/", ".cache/",
    ".angular/", "/dist/", "/build/", "coverage/", ".nyc_output/", "*.egg-info/", ".parcel-cache/",
    "/target/", ".gradle/", ".next/", ".turbo/",
    # local data, results and anything real
    "/data/", "/results/", "/private/", "/reference/", "/logs/", "*.log", "*.sqlite", "*.sqlite3", "*.db",
    "*.db-journal", "*.db-wal", "*.db-shm",
    # editor and OS litter
    ".DS_Store", "Thumbs.db", "._*", ".idea/", ".vscode/", "*.swp", "*~",
    # earlier zips
    "*.zip", "*.tgz", "*.tar.gz",
]
# Kept even when an EXCLUDE pattern matches: the templates a reader needs.
KEEP = [".env.example", "*.env.example", ".npmrc.example", "npmrc.example", "pip.conf.example"]

# Content that must never ship. Each is (label, regex). A line ending in "it-audit: allow" is skipped.
SECRET_LINES = [
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("Anthropic key", re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}")),
    ("OpenAI-style key", re.compile(r"\bsk-[A-Za-z0-9]{32,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}")),
    ("GitHub token", re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("AWS key id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("JFrog token", re.compile(r"\bAKCp[0-9A-Za-z]{60,}|cmVmdGtu[0-9A-Za-z]{40,}")),
    ("npm auth token value", re.compile(r"_authToken\s*=\s*(?!\$\{)[^\s<]{8,}")),
    ("credentials in a URL", re.compile(r"https?://[^/\s:@<>]+:[^/\s@<>${}]{6,}@")),
]
# Weaker signals: printed for a person to read, never a refusal on their own.
REVIEW_LINES = [
    ("password-like literal", re.compile(r"(?i)\b\w*(password|passwd|secret|api_?key|token)\w*\b\s*[:=]\s*['\"]([^'\"\s<>${}]{8,})['\"]")),
    ("password-like setting", re.compile(r"(?i)^\s*(export\s+)?\w*(PASSWORD|PASSWD|SECRET|API_?KEY|TOKEN)\w*\s*=\s*(?![<$\{])([^\s#'\"]{8,})\s*$")),
]
def CONFIG_LIKE(f: Path) -> bool:
    return ".env" in f.name or f.suffix.lower() in {".sh", ".ini", ".cfg", ".conf", ".properties", ".example", ".yml", ".yaml"}


TEXT_SUFFIX = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md", ".txt", ".toml", ".yaml", ".yml",
               ".ini", ".cfg", ".conf", ".sh", ".html", ".css", ".scss", ".env", ".example", ".xml", ".properties"}
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def matches(path: str, pattern: str) -> bool:
    parts = path.split("/")
    if pattern.startswith("/") and pattern.endswith("/"):
        return len(parts) > 1 and fnmatch.fnmatch(parts[0], pattern[1:-1])
    if pattern.endswith("/"):
        name = pattern[:-1]
        return any(fnmatch.fnmatch(p, name) for p in parts[:-1])
    return fnmatch.fnmatch(parts[-1], pattern) or fnmatch.fnmatch(path, pattern)


def excluded(path: str) -> str | None:
    if any(matches(path, k) for k in KEEP) and not any(matches(path, p) for p in EXCLUDE if p.endswith("/")):
        return None
    for p in EXCLUDE:
        if matches(path, p):
            return p
    return None


def list_files(src: Path) -> tuple[list[str], str]:
    if (src / ".git").exists():
        out = subprocess.run(["git", "-C", str(src), "ls-files", "-z", "--cached"], capture_output=True, check=True)
        files = [p for p in out.stdout.decode("utf-8").split("\0") if p]
        return [p for p in files if (src / p).is_file()], "git ls-files"
    files = []
    for root, dirs, names in os.walk(src):
        rel = Path(root).relative_to(src).as_posix()
        rel = "" if rel == "." else rel + "/"
        for d in [d for d in dirs if excluded(rel + d + "/x")]:
            PRUNED.append(rel + d + "/")
        dirs[:] = [d for d in dirs if not excluded(rel + d + "/x")]
        files += [rel + n for n in names]
    return files, "folder walk"


PRUNED: list[str] = []


def secret_hits(src: Path, files: list[str]) -> tuple[list[str], list[str]]:
    hits, review = [], []
    for p in files:
        f = src / p
        if f.suffix.lower() not in TEXT_SUFFIX and f.name not in ("Dockerfile", "Makefile") or f.stat().st_size > 5_000_000:
            continue
        if f.name in ("package-lock.json", "yarn.lock", "pnpm-lock.yaml"):
            continue  # integrity hashes are base64 and are not secrets
        try:
            lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        for n, line in enumerate(lines, 1):
            if line.rstrip().endswith("it-audit: allow"):
                continue
            for label, rx in SECRET_LINES:
                if rx.search(line):
                    hits.append(f"{p}:{n}  {label}")  # the value itself is never printed
                    break
            else:
                for label, rx in REVIEW_LINES:
                    m = rx.search(line)
                    if not m:
                        continue
                    if label.endswith("setting") and not CONFIG_LIKE(f):
                        continue  # in code, NAME = expr is an assignment, not a stored value
                    if re.fullmatch(r"[A-Z][A-Z0-9_]+", m.group(m.lastindex)):
                        continue  # the NAME of an environment variable, not its value
                    review.append(f"{p}:{n}  {label}")
                    break
    return hits, review


def install_checks(src: Path, files: list[str]) -> list[str]:
    problems = []
    fs = set(files)
    for p in files:
        if Path(p).name == "package.json" and "/node_modules/" not in "/" + p:
            lock = str(Path(p).with_name("package-lock.json")) if "/" in p else "package-lock.json"
            if lock not in fs:
                problems.append(f"{p}: no package-lock.json beside it (npm ci needs one)")
                continue
            pkg = json.loads((src / p).read_text(encoding="utf-8"))
            lk = json.loads((src / lock).read_text(encoding="utf-8"))
            root = lk.get("packages", {}).get("", {})
            for key in ("dependencies", "devDependencies", "optionalDependencies"):
                if (pkg.get(key) or {}) != (root.get(key) or {}):
                    problems.append(f"{lock}: {key} differ from {p}; run npm install, then re-check (npm ci would refuse)")
            if (lk.get("lockfileVersion") or 0) < 3:
                problems.append(f"{lock}: lockfileVersion {lk.get('lockfileVersion')}; regenerate with npm 9+")
        if Path(p).name == "requirements.txt":
            text = (src / p).read_text(encoding="utf-8").replace("\\\n", " ")
            for raw in text.splitlines():
                line = raw.split(" #", 1)[0].strip()
                if not line or line.startswith("#") or line.startswith("-"):
                    continue
                req = re.sub(r"--hash=\S+", "", line).split(";", 1)[0].strip()
                if "==" not in req or re.search(r"[<>~!]=?|\*", req.split("==", 1)[1]):
                    problems.append(f"{p}: not an exact == pin: {req}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--name", help="the zip's top folder (default: the source folder's name)")
    ap.add_argument("--exclude", action="append", default=[], help="another pattern to leave out (repeatable)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    src = args.src.resolve()
    top = args.name or src.name
    EXCLUDE.extend(args.exclude)

    files, how = list_files(src)
    dropped: dict[str, int] = {}
    kept = []
    for p in sorted(files):
        why = excluded(p)
        if why:
            dropped[why] = dropped.get(why, 0) + 1
        else:
            kept.append(p)
    print(f"{len(files)} files by {how}; {len(kept)} kept, {len(files) - len(kept)} left out")
    for pat, n in sorted(dropped.items(), key=lambda x: -x[1]):
        print(f"  left out {n:>5}  {pat}")
    for d in PRUNED:
        print(f"  left out folder  {d}")

    big = [(p, (src / p).stat().st_size) for p in kept if (src / p).stat().st_size > 20_000_000]
    for p, size in big:
        print(f"warn  large file kept: {p} ({size / 1e6:.0f} MB)")

    refused, review = secret_hits(src, kept)
    for h in review:
        print(f"read  {h}  (a test value or a real one? a real one must come out before shipping)")
    for h in refused:
        print(f"FAIL  looks like a secret: {h}")
    problems = install_checks(src, kept)
    for pr in problems:
        print(f"FAIL  {pr}")
    if refused or problems:
        print("\nNothing written. Fix the lines above (or mark a false alarm with 'it-audit: allow') and run again.")
        return 1
    if args.dry_run:
        for p in kept:
            print(f"  {p}")
        return 0

    manifest = []
    with zipfile.ZipFile(args.out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in kept:
            data = (src / p).read_bytes()
            manifest.append(f"{hashlib.sha256(data).hexdigest()}  {p}")
            info = zipfile.ZipInfo(f"{top}/{p}", FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            mode = 0o755 if os.access(src / p, os.X_OK) else 0o644
            info.external_attr = (0o100000 | mode) << 16
            z.writestr(info, data)
        info = zipfile.ZipInfo(f"{top}/MANIFEST.sha256", FIXED_TIME)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o100644) << 16
        z.writestr(info, "\n".join(manifest) + "\n")
    digest = hashlib.sha256(args.out.read_bytes()).hexdigest()
    Path(str(args.out) + ".sha256").write_text(f"{digest}  {args.out.name}\n")
    print(f"\n{args.out}: {len(kept)} files, {args.out.stat().st_size / 1e6:.1f} MB")
    print(f"sha256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
