#!/usr/bin/env bash
# Builds the SQLite business database from the gateway seed and puts it where the skills service reads it.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 business-db/build.py --out var/skills/business.sqlite
