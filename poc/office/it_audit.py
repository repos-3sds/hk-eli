"""Scan a project (a folder or a zip) for anything the office's IT could flag.

Standard library only. Read-only.

    python3 it_audit.py path/to/project            # a folder
    python3 it_audit.py project-clean-18nov.zip    # the zip you are about to hand over

Three levels:
  BLOCK   must not ship: keep-awake and power commands, sudo, daemons and scheduled jobs,
          Gatekeeper or network-settings changes, piping a download into a shell, global or
          out-of-registry installs, tunnels.
  REVIEW  allowed only when a person has read it and it is needed: background processes,
          other installers, remote shells, AppleScript, system defaults.
  HOSTS   every host named in a URL that is not localhost, so the network the project could
          reach is a list someone has read. Documentation links are fine; a host the RUNNING
          code calls must be the model gateway or the package registry.

A line that ends in "it-audit: allow" is skipped (for this file's own patterns and for docs
that describe what not to do). Exit code 1 when anything BLOCKs, else 0.
"""
from __future__ import annotations

import io
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

BLOCK = [
    ("keep-awake", r"\bcaffeinate\b|\bpmset\b|\bsystemsetup\b|\bsetsleep|\bdisablesleep\b|\bSetThreadExecutionState\b|\bpowercfg\b|\bsystemd-inhibit\b|\bwakelock\b"),  # it-audit: allow
    ("sudo / admin rights", r"(^|[\s;&|`(])sudo\s|\bsu\s+-\b|\bdoas\s|runas\s+/user|Start-Process[^\n]*-Verb\s+RunAs"),  # it-audit: allow
    ("daemon / launch agent", r"\blaunchctl\b|LaunchAgents|LaunchDaemons|\bsystemctl\s+(enable|start)|\.service\b\s*$|\bsc(\.exe)?\s+create\b|\bNew-Service\b"),  # it-audit: allow
    ("scheduled job", r"\bcrontab\b|/etc/cron|\bschtasks\b|Register-ScheduledTask|\bat\s+now\b"),  # it-audit: allow
    ("Gatekeeper / quarantine", r"xattr\s+-[a-z]*d[a-z]*\s+com\.apple\.quarantine|\bspctl\b|\bcsrutil\b"),  # it-audit: allow
    ("network or system settings", r"\bnetworksetup\b|/etc/hosts\b|\bscutil\b|\broute\s+add\b|\biptables\b|\bpfctl\b|netsh\s"),  # it-audit: allow
    ("download piped to a shell", r"(curl|wget)[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b|iex\s*\(\s*(iwr|Invoke-WebRequest)|Invoke-Expression[^\n]*DownloadString"),  # it-audit: allow
    ("global / out-of-registry install", r"npm\s+(i|install)\s+(-g|--global)\b|\bbrew\s+(install|tap)\b|\bport\s+install\b|\bchoco\s+install\b|\bwinget\s+install\b|\bget-pip\.py\b|\buv\s+python\s+install\b|\bpyenv\s+install\b|\bnvm\s+install\b|pip3?\s+install\s+[^\n]*(--index-url|-i)\s+https?://(?!<)[^\s]*pypi\.org|--extra-index-url|--trusted-host"),  # it-audit: allow
    ("TLS verification off", r"strict-ssl\s*=\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['\"]?0|verify\s*=\s*False|PYTHONHTTPSVERIFY\s*=\s*0|--insecure\b|\bcurl\s+[^\n]*\s-k\b"),  # it-audit: allow
    ("tunnel / remote access", r"\bngrok\b|\bcloudflared\b|\blocaltunnel\b|\bteleport\b|\btailscale\b|\bfrpc\b"),  # it-audit: allow
]
REVIEW = [
    ("background process", r"\bnohup\b|\bdisown\b|\bsetsid\b|\bscreen\s+-d|\btmux\s+new|start\s+/b\b|(?<![&|])&\s*$"),  # it-audit: allow
    ("other installer", r"\bpip3?\s+install\b(?![^\n]*-r\s)|\bnpx\s+(-y|--yes)\b|\bpipx\b|\buv\s+(pip|sync|tool|run)\b|\bconda\s+install\b|\bdocker\s+(pull|run)\b|\bollama\s+pull\b"),  # it-audit: allow
    ("remote shell / copy", r"(^|\s)(ssh|scp|sftp|rsync)\s+[^\n]*@"),  # it-audit: allow
    ("AppleScript / system defaults", r"\bosascript\b|\bdefaults\s+write\b|\bautomator\b"),  # it-audit: allow
    ("process kill", r"\bpkill\b|\bkillall\b|\bkill\s+-9\b"),  # it-audit: allow
]
URL = re.compile(r"\bhttps?://([A-Za-z0-9.-]+)")
LOCAL = re.compile(r"^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|example\.(com|org)|.*\.example(\.com)?|.*\.local|.*\.localhost)$")
TEXT = {".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".json", ".toml",
        ".yaml", ".yml", ".ini", ".cfg", ".conf", ".md", ".txt", ".env", ".example", ".html", ".plist", ".service",
        ".xml", ".properties"}
SHELL = {".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ""}
COMMENT = re.compile(r"^\s*(#|//|\*|/\*|<!--|REM\b|::)")
SKIP_NAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "MANIFEST.sha256"}


def files(target: Path):
    if target.suffix == ".zip":
        with zipfile.ZipFile(target) as z:
            for info in z.infolist():
                if not info.is_dir():
                    yield info.filename, io.TextIOWrapper(z.open(info), encoding="utf-8", errors="ignore").read
    else:
        for f in sorted(target.rglob("*")):
            rel = f.relative_to(target).as_posix()
            if f.is_file() and not any(p in ("node_modules", ".git", ".venv", "__pycache__") for p in rel.split("/")):
                yield rel, (lambda f=f: f.read_text(encoding="utf-8", errors="ignore"))


def code_like(name: str) -> bool:
    p = PurePosixPath(name)
    return p.suffix.lower() not in (".md", ".txt", ".html")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    target = Path(sys.argv[1])
    found = {"BLOCK": [], "REVIEW": []}
    hosts, code_hosts = Counter(), Counter()
    scanned = 0
    for name, read in files(target):
        p = PurePosixPath(name)
        if p.name in SKIP_NAMES or (p.suffix.lower() not in TEXT and p.name not in ("Dockerfile", "Makefile", "Procfile")):
            continue
        scanned += 1
        for n, line in enumerate(read().splitlines(), 1):
            if line.rstrip().endswith("it-audit: allow"):
                continue
            prose = not code_like(name) or COMMENT.match(line)
            hit = False
            for level, rules in (("BLOCK", BLOCK), ("REVIEW", REVIEW)):
                for label, rx in rules:
                    if label == "background process" and p.suffix.lower() not in SHELL:
                        continue  # a trailing & means something else in JS, Python, Markdown
                    if re.search(rx, line):
                        if level == "BLOCK" and prose:
                            level, label = "REVIEW", label + " (in a doc or comment: is it a warning or an instruction?)"
                        found[level].append(f"{name}:{n}  {label}: {line.strip()[:120]}")
                        hit = True
                        break
                if hit:
                    break
            for host in URL.findall(line):
                host = host.lower().rstrip(".")
                if not LOCAL.match(host):
                    hosts[host] += 1
                    if code_like(name):
                        code_hosts[host] += 1
    print(f"scanned {scanned} text files in {target}")
    for level in ("BLOCK", "REVIEW"):
        print(f"\n{level}: {len(found[level])}")
        for line in found[level]:
            print(f"  {line}")
    print(f"\nHOSTS named outside localhost: {len(hosts)} (in code or config: {len(code_hosts)})")
    for host, n in hosts.most_common():
        print(f"  {n:>4}  {host}{'   <- in code/config' if host in code_hosts else ''}")
    print("\n" + ("NOT READY: remove every BLOCK line." if found["BLOCK"] else
                  "No BLOCK lines. Read every REVIEW line and every host marked in code/config before handing over."))
    return 1 if found["BLOCK"] else 0


if __name__ == "__main__":
    sys.exit(main())
