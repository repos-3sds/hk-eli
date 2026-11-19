"""Check this machine can install the Python requirements before `pip install` is run.

Standard library only, so it runs on a bare Python. From the project folder:

    python3.12 path/to/preflight.py                         # reads ./requirements.txt
    python3.12 path/to/preflight.py --lock requirements.txt --python 3.12

It checks the Python version, says which package index pip will use, opens that
index once to test the network and TLS, then DOWNLOADS every package in the
requirements file that applies to this machine, one file each, eight at a time,
with pip's cache off. A version the index lists is not proof: the office JFrog
has listed versions it then refused to serve, so only a download counts. A file
compiled with --generate-hashes is read too, and each download is checked against
the file's hashes, so a hash that the office's copy does not match shows up here
and not halfway through the install.

For each package that fails, it prints the versions the index does offer in the
same major version, so the lock can be pinned to one of them. Exit code 0 when
every package downloads, 1 otherwise.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

LOCK = Path("requirements.txt")
PYPI = "https://pypi.org/simple"


def say(tag: str, msg: str) -> None:
    print(f"{tag:<5}{msg}", flush=True)


def pip(*args: str, timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", "pip", *args, "--disable-pip-version-check"],
                          capture_output=True, text=True, timeout=timeout)


def index_url() -> str:
    """The index pip will use: the environment first, then pip's own configuration, then PyPI."""
    if os.environ.get("PIP_INDEX_URL"):
        return os.environ["PIP_INDEX_URL"]
    out = pip("config", "list").stdout
    for line in out.splitlines():
        key, _, value = line.partition("=")
        if key.strip().endswith(".index-url"):
            return value.strip().strip("'\"")
    return PYPI


def masked(url: str) -> str:
    return re.sub(r"//[^/@]+@", "//***@", url)


HASHES: dict[str, set[str]] = {}


def lock_entries(path: Path) -> list[tuple[str, str, str]]:
    """(name, version, marker) for every pinned line; --hash values are kept in HASHES by name."""
    out, unpinned = [], []
    text = path.read_text(encoding="utf-8").replace("\\\n", " ")  # join backslash continuations
    for raw in text.splitlines():
        line = raw.split(" #", 1)[0].strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        hashes = re.findall(r"--hash=sha256:([0-9a-f]{64})", line)
        line = re.sub(r"--hash=\S+", "", line).strip()
        req, _, marker = line.partition(";")
        name, _, version = req.strip().partition("==")
        name = name.split("[", 1)[0].strip()
        if name and version:
            out.append((name, version.strip(), marker.strip()))
            if hashes:
                HASHES[name.lower()] = set(hashes)
        elif name:
            unpinned.append(req.strip())
    for u in unpinned:
        say("FAIL", f"not pinned with ==: {u}")
    if unpinned:
        sys.exit(1)
    return out


def applies(marker: str) -> bool:
    if not marker:
        return True
    try:
        from pip._vendor.packaging.markers import Marker
    except ImportError:  # an old pip: check everything rather than skip silently
        return True
    return Marker(marker).evaluate()


def try_download(name: str, version: str) -> tuple[bool, str]:
    """Download one pinned package with no dependencies and no cache; True and the file name on success."""
    dest = tempfile.mkdtemp(prefix="preflight-")
    try:
        last = ""
        for _ in range(2):  # a first fetch through JFrog can fail once and pass on the retry
            r = pip("download", "--no-deps", "--no-cache-dir", "--prefer-binary", "--dest", dest, f"{name}=={version}")
            files = os.listdir(dest)
            if r.returncode == 0 and files:
                want = HASHES.get(name.lower())
                if want:
                    import hashlib
                    got = hashlib.sha256(Path(dest, files[0]).read_bytes()).hexdigest()
                    if got not in want:
                        return False, f"downloaded {files[0]} but its sha256 {got[:16]}... is not in the file's hashes"
                return True, files[0]
            last = (r.stderr or r.stdout).strip().splitlines()[-1:] or ["no file downloaded"]
            last = last[0]
        return False, last
    finally:
        shutil.rmtree(dest, ignore_errors=True)


def offered(name: str, version: str) -> str:
    """The versions the index lists in the pinned version's major, newest first, or why they could not be read."""
    r = pip("index", "versions", name)
    m = re.search(r"Available versions:\s*(.+)", r.stdout)
    if not m:
        return "the index lists no versions" if r.returncode == 0 else "could not list versions"
    major = version.split(".", 1)[0]
    same = [v.strip() for v in m.group(1).split(",") if v.strip().split(".", 1)[0] == major]
    return ", ".join(same[:8]) if same else "none in this major; newest listed: " + m.group(1).split(",")[0].strip()


def check_python(want: str) -> bool:
    v = sys.version_info
    have = f"{v.major}.{v.minor}"
    if have == want:
        say("ok", f"Python {v.major}.{v.minor}.{v.micro}")
        return True
    say("FAIL", f"Python {v.major}.{v.minor}.{v.micro}: the requirements are compiled for {want}; run with python{want}")
    return False


def check_index(url: str) -> bool:
    probe = url.rstrip("/") + "/pip/"
    try:
        with urllib.request.urlopen(probe, timeout=20, context=ssl.create_default_context()) as r:
            say("ok", f"index answers ({r.status}): {masked(url)}")
            return True
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            say("FAIL", f"index refused the request ({e.code}): sign-in or token needed in pip's index-url")
            return False
        say("warn", f"index answered {e.code} for {masked(probe)}; carrying on, the downloads will tell")
        return True
    except ssl.SSLError as e:
        say("warn", f"Python's own TLS check failed ({e.__class__.__name__}). pip uses the system's certificates "
                    "through truststore and may still work; if the downloads fail with a certificate error, set "
                    "pip's 'cert' to the office's CA bundle")
        return True
    except (urllib.error.URLError, OSError) as e:
        say("FAIL", f"cannot reach {masked(url)}: {getattr(e, 'reason', e)}")
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lock", type=Path, default=LOCK)
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--python", default="3.12", help="the Python minor version the file was compiled for")
    args = ap.parse_args()

    ok = check_python(args.python)
    r = pip("--version")
    if r.returncode != 0:
        say("FAIL", "pip is not installed for this Python: run  python -m ensurepip --upgrade")
        return 1
    say("ok", r.stdout.split(" from ")[0].strip())
    url = index_url()
    if url == PYPI:
        say("warn", "pip is set to public PyPI; in the office, set the JFrog index first (templates/pip.conf.example)")
    if not check_index(url):
        return 1

    entries = [(n, v) for n, v, m in lock_entries(args.lock) if applies(m)]
    say("..", f"downloading {len(entries)} pinned packages from the index, {args.jobs} at a time")
    failed, done, sdists = [], 0, []
    with cf.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(try_download, n, v): (n, v) for n, v in entries}
        for f in cf.as_completed(futures):
            n, v = futures[f]
            good, detail = f.result()
            done += 1
            if not good:
                failed.append((n, v, detail))
                say("FAIL", f"{n}=={v}: {detail}")
            elif not detail.endswith(".whl"):
                sdists.append((n, v, detail))
            if done % 20 == 0:
                say("..", f"{done}/{len(entries)}")

    for n, v, fname in sdists:
        say("warn", f"{n}=={v} came as source ({fname}), not a wheel: it is built on install and may need a compiler")
    if failed:
        print()
        say("..", "what the index offers instead, same major version:")
        for n, v, _ in sorted(failed):
            say("", f"{n}=={v}  ->  {offered(n, v)}")
        print()
        say("FAIL", f"{len(failed)} of {len(entries)} packages did not download. Send this output back.")
        return 1
    say("ok", "every pinned package downloads")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
