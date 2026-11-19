#!/usr/bin/env bash
# Prove a clean zip installs and runs from nothing, the way the office will use it.
# Runs in the foreground, writes only inside a new empty folder, installs nothing system-wide,
# and reaches only the package registries npm and pip are configured for.
#
#   bash verify_zip.sh project-clean-18nov.zip                       # checks, npm ci, pip install
#   bash verify_zip.sh project-clean-18nov.zip --sha <expected>      # also compare the sha256
#   bash verify_zip.sh project-clean-18nov.zip --test "python -m pytest -q"   # also run the tests
#   bash verify_zip.sh project-clean-18nov.zip --python python3.12 --keep
#
# Works with the bash macOS ships (3.2). Exit code 0 only when every step passed.
set -u

ZIP=""; SHA=""; TEST=""; PY="python3.12"; KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) SHA="$2"; shift 2 ;;
    --test) TEST="$2"; shift 2 ;;
    --python) PY="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) ZIP="$1"; shift ;;
  esac
done
[ -f "$ZIP" ] || { echo "FAIL no zip: $ZIP"; exit 1; }
ZIP="$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")"
FAILED=0
ok()   { echo "ok    $*"; }
bad()  { echo "FAIL  $*"; FAILED=$((FAILED + 1)); }
step() { echo; echo "== $*"; }

sha() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }

step "1. sha256"
GOT="$(sha "$ZIP")"
echo "      $GOT  $(basename "$ZIP")"
if [ -n "$SHA" ]; then
  [ "$GOT" = "$SHA" ] && ok "matches the expected sha256" || bad "expected $SHA"
elif [ -f "$ZIP.sha256" ]; then
  [ "$GOT" = "$(cut -d' ' -f1 "$ZIP.sha256")" ] && ok "matches $(basename "$ZIP").sha256" || bad "does not match $(basename "$ZIP").sha256"
else
  echo "      (no expected value given: send this line back with the result)"
fi

step "2. unzip into a new empty folder"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/zipcheck.XXXXXX")"
cd "$WORK" || exit 1
unzip -q "$ZIP" || { bad "unzip failed"; exit 1; }
TOPS="$(ls -A | wc -l | tr -d ' ')"
[ "$TOPS" = "1" ] && ok "one top folder: $(ls -A)" || bad "$TOPS entries at the top; expected one folder"
ROOT="$WORK/$(ls -A | head -1)"
cd "$ROOT" || exit 1

step "3. nothing that must not ship"
LEAK="$(find . \( -name .git -o -name node_modules -o -name .venv -o -name venv -o -name __pycache__ \
  -o -name '.DS_Store' -o -name '*.pyc' -o -name '.env' -o -name '.env.local' -o -name '.npmrc' \
  -o -name 'pip.conf' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' \) -print 2>/dev/null | head -20)"
[ -z "$LEAK" ] && ok "no git, dependencies, caches, .env, filled .npmrc/pip.conf or keys" || { bad "found:"; echo "$LEAK" | sed 's/^/        /'; }
if [ -f MANIFEST.sha256 ]; then
  MISMATCH=0
  while read -r want path; do
    [ -f "$path" ] || { MISMATCH=$((MISMATCH + 1)); continue; }
    [ "$(sha "$path")" = "$want" ] || MISMATCH=$((MISMATCH + 1))
  done < MANIFEST.sha256
  [ "$MISMATCH" = "0" ] && ok "every file matches MANIFEST.sha256 ($(wc -l < MANIFEST.sha256 | tr -d ' ') files)" || bad "$MISMATCH files differ from MANIFEST.sha256"
fi

step "4. npm ci (every package-lock.json)"
LOCKS="$(find . -name package-lock.json -not -path '*/node_modules/*' | sort)"
if [ -z "$LOCKS" ]; then echo "      no package-lock.json: skipped"; fi
for LOCK in $LOCKS; do
  D="$(dirname "$LOCK")"
  echo "      $D: node $(node -v 2>/dev/null), npm $(npm -v 2>/dev/null), registry $(cd "$D" && npm config get registry)"
  if (cd "$D" && npm ci --no-audit --no-fund > "$WORK/npm-ci.log" 2>&1); then
    ok "$D: npm ci"
    if (cd "$D" && npm pkg get scripts.build | grep -q '"'); then
      (cd "$D" && npm run build > "$WORK/npm-build.log" 2>&1) && ok "$D: npm run build" || { bad "$D: npm run build (last lines below)"; tail -15 "$WORK/npm-build.log"; }
    fi
  else
    bad "$D: npm ci (first error below)"; grep -m 8 -E 'npm (ERR|error)' "$WORK/npm-ci.log"
  fi
done

step "5. pip install (every requirements.txt) into a fresh virtual environment"
REQS="$(find . -name requirements.txt -not -path '*/node_modules/*' -not -path '*/.venv/*' | sort)"
if [ -z "$REQS" ]; then echo "      no requirements.txt: skipped"; fi
if [ -n "$REQS" ]; then
  if ! command -v "$PY" >/dev/null 2>&1; then
    bad "$PY not found (use --python with the interpreter the project is compiled for)"
  else
    "$PY" -m venv .venv && ok "venv with $($PY -V)"
    for REQ in $REQS; do
      FLAGS="--no-cache-dir --disable-pip-version-check"
      grep -q -- '--hash=' "$REQ" && FLAGS="$FLAGS --require-hashes"
      if .venv/bin/python -m pip install $FLAGS -r "$REQ" > "$WORK/pip.log" 2>&1; then
        ok "$REQ installed ($FLAGS)"
      else
        bad "$REQ (last lines below)"; tail -12 "$WORK/pip.log"
      fi
    done
    .venv/bin/python -m pip check > "$WORK/pip-check.log" 2>&1 && ok "pip check: no broken requirements" || { bad "pip check"; cat "$WORK/pip-check.log"; }
    SDIST="$(grep -c -E 'Building wheel|setup.py install' "$WORK/pip.log" 2>/dev/null || true)"
    [ "${SDIST:-0}" = "0" ] || echo "warn  $SDIST package(s) were built from source: needs a compiler in the office; pin a version with a wheel"
  fi
fi

step "6. tests"
if [ -n "$TEST" ]; then
  if [ -d .venv ]; then PATH="$ROOT/.venv/bin:$PATH"; export PATH; fi
  if bash -c "$TEST" > "$WORK/tests.log" 2>&1; then ok "tests: $TEST"; tail -3 "$WORK/tests.log"; else bad "tests: $TEST (last lines below)"; tail -25 "$WORK/tests.log"; fi
else
  echo "      no --test command given: skipped"
fi

step "Result"
if [ "$KEEP" = "1" ]; then echo "      kept: $WORK"; else cd / && rm -rf "$WORK"; fi
if [ "$FAILED" = "0" ]; then echo "READY: every step passed. sha256 $GOT"; exit 0; fi
echo "NOT READY: $FAILED step(s) failed. Send back this output (it holds no file contents)."
exit 1
