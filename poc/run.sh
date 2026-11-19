#!/usr/bin/env bash
# Start the HK ELI Chatbot in this terminal (Ctrl+C stops it). Settings come from .env (see .env.example).
# Needs the project's own .venv, installed by hand from the hashed lock (README "Office install").
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "No .venv yet. Install first:"
  echo "  python3.12 -m venv .venv && .venv/bin/python -m pip install --require-hashes -r requirements.txt"
  exit 1
fi
exec .venv/bin/python -m hkeli_poc
