#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(dirname "$SCRIPT_DIR")
PYTHON="$ROOT/.venv/bin/python"

if [ ! -x "$PYTHON" ]; then
    echo "Virtual environment not found. Run ./scripts/setup.sh first." >&2
    exit 1
fi

cd "$ROOT"
echo "Vao2 is starting at http://127.0.0.1:8000"
exec "$PYTHON" backend/main.py
