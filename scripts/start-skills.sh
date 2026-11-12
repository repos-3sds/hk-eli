#!/usr/bin/env bash
# Starts Niharika's HK_ELI service (unchanged, fixture mode) on http://127.0.0.1:8031 (SKILLS_PORT) with our SQLite data.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f var/skills/business.sqlite ] || scripts/build-db.sh
[ -x skills-service/.venv/bin/python ] || {
  uv venv -q --python 3.12 skills-service/.venv
  uv pip install -q --python skills-service/.venv/bin/python -r skills-service/requirements.lock
}
export HKELI_CONFIG="$PWD/config/skills-service.toml"
cd skills-service
exec .venv/bin/waitress-serve --listen=127.0.0.1:${SKILLS_PORT:-8031} --threads=8 --call app:create_app
