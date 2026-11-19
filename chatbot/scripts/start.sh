#!/usr/bin/env bash
# Start the HK ELI Chatbot on http://127.0.0.1:${ELI_PORT:-8040}.
# First run: creates chatbot/.venv, installs the pinned packages, builds the business book if missing.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"
cd "$here"
PY="${PYTHON:-$(command -v python3.12 || command -v python3)}"
if [ ! -x .venv/bin/python ]; then
  "$PY" -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
if [ ! -f "$repo/skills-service/services/analytics/business.py" ] && [ -z "${HKELI_REPO:-}" ]; then
  git -C "$repo" submodule update --init skills-service
fi
if [ ! -f "${ELI_DB:-$repo/business-db/out/business.sqlite}" ]; then
  python3 "$repo/business-db/build.py"
fi
PYTHONPATH="$here" exec .venv/bin/python -m eli_chat.server
