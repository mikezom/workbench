#!/usr/bin/env bash

set -euo pipefail

PATH="/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FETCHER_SCRIPT="$SCRIPT_DIR/tushare_fetcher.py"
DEFAULT_ENV_FILE="$APP_ROOT/data/tushare.env"
ENV_FILE="${TUSHARE_ENV_FILE:-$DEFAULT_ENV_FILE}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

if [ -z "${TUSHARE_TOKEN:-}" ]; then
    echo "TUSHARE_TOKEN is not set. Export it or add it to $ENV_FILE" >&2
    exit 1
fi

if [ -x "$APP_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$APP_ROOT/.venv/bin/python"
else
    require_cmd python3
    PYTHON_BIN="$(command -v python3)"
fi

if [ ! -f "$FETCHER_SCRIPT" ]; then
    echo "Fetcher script not found: $FETCHER_SCRIPT" >&2
    exit 1
fi

TODAY="$(date '+%Y%m%d')"

cd "$APP_ROOT"

echo "Starting Tushare incremental update through $TODAY"
"$PYTHON_BIN" "$FETCHER_SCRIPT" --mode incremental --end "$TODAY" "$@"
