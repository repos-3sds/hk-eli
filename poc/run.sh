#!/usr/bin/env bash
# Start the HK ELI Chatbot POC (mock Tableau + Stork pipeline + demo pages).
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
PORT="${PORT:-8050}"
echo "HK ELI Chatbot POC on http://localhost:${PORT}  (side-by-side demos: /compare)"
exec .venv/bin/uvicorn hkeli_poc.app:app --host 0.0.0.0 --port "${PORT}"
