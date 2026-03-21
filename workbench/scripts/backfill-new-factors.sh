#!/usr/bin/env bash

set -euo pipefail

PATH="/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FETCHER_SCRIPT="$SCRIPT_DIR/tushare_fetcher.py"
DEFAULT_ENV_FILE="$APP_ROOT/data/tushare.env"
ENV_FILE="${TUSHARE_ENV_FILE:-$DEFAULT_ENV_FILE}"
START_DATE="${TUSHARE_BACKFILL_START:-20210104}"
END_DATE="${TUSHARE_BACKFILL_END:-$(date '+%Y%m%d')}"
TOP10_LIMIT="${TUSHARE_TOP10_LIMIT:-0}"

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

run_mode() {
    local mode="$1"
    shift
    echo
    echo "==> Running $mode ($START_DATE-$END_DATE)"
    "$PYTHON_BIN" "$FETCHER_SCRIPT" --mode "$mode" --start "$START_DATE" --end "$END_DATE" "$@"
}

cd "$APP_ROOT"

echo "Starting new-factor Tushare backfill ($START_DATE-$END_DATE)"

run_mode moneyflow
run_mode margin-detail
run_mode adj-factor
run_mode hk-hold
run_mode top-list
run_mode holder-trade

if [ "$TOP10_LIMIT" -gt 0 ]; then
    run_mode top10-floatholders --limit "$TOP10_LIMIT"
else
    run_mode top10-floatholders
fi

echo
echo "Backfill complete."
