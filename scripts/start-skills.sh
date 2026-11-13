#!/usr/bin/env bash
# Starts Niharika's HK_ELI service (unchanged, fixture mode) on http://127.0.0.1:8031 (SKILLS_PORT) with our SQLite data.
# SKILLS_DIR is where her code lives: skills-service/ (the submodule) here, or .. when this folder sits inside her repo.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${SKILLS_DIR:-}" ]; then [ -f skills-service/run.py ] && SKILLS_DIR=skills-service || SKILLS_DIR=..; fi
SKILLS_DIR="$(cd "$SKILLS_DIR" && pwd)"
[ -f var/skills/business.sqlite ] || scripts/build-db.sh
[ -x "$SKILLS_DIR/.venv/bin/python" ] || {
  uv venv -q --python 3.12 "$SKILLS_DIR/.venv"
  uv pip install -q --python "$SKILLS_DIR/.venv/bin/python" -r "$SKILLS_DIR/requirements.lock"
}
# Her config resolves relative paths against her folder, so point state_dir at our var/ with an absolute path.
sed "s|^state_dir = .*|state_dir = \"$PWD/var/skills\"|" config/skills-service.toml > var/skills-service.toml
export HKELI_CONFIG="$PWD/var/skills-service.toml"
cd "$SKILLS_DIR"
exec .venv/bin/waitress-serve --listen=127.0.0.1:${SKILLS_PORT:-8031} --threads=8 --call app:create_app
