#!/usr/bin/env bash
#
# Start the agent daemon, ensuring only one instance runs.
# Also kills stale Claude Code CLI processes spawned by previous daemon runs.
#
# Usage: ./scripts/start-daemon.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/agent-daemon.py"
LOG_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")/logs"

mkdir -p "$LOG_DIR"

# --- Kill existing agent-daemon processes -----------------------------------

existing_pids=$(pgrep -f "agent-daemon\.py" 2>/dev/null || true)
if [ -n "$existing_pids" ]; then
    for pid in $existing_pids; do
        echo "  Killing agent-daemon PID $pid"
        kill "$pid" 2>/dev/null || true
    done
    sleep 2
    # Force kill any survivors
    remaining=$(pgrep -f "agent-daemon\.py" 2>/dev/null || true)
    if [ -n "$remaining" ]; then
        for pid in $remaining; do
            echo "  Force killing agent-daemon PID $pid"
            kill -9 "$pid" 2>/dev/null || true
        done
    fi
fi

# --- Kill stale daemon-spawned Claude Code CLI processes --------------------
# The daemon invokes `claude -p ... --output-format stream-json`.
# Interactive (human-opened) claude sessions do NOT have `-p`, so we only
# target processes whose command line contains both `-p` and `stream-json`.
#
# On macOS, `ps` doesn't support `etimes`. Use `etime` (HH:MM:SS or MM:SS)
# and convert to seconds with awk.

STALE_THRESHOLD=60  # minutes

stale_claude_pids=$(ps -eo pid,etime,command | \
    grep -- "claude" | \
    grep -- " -p " | \
    grep -- "stream-json" | \
    grep -v grep | \
    awk -v threshold="$((STALE_THRESHOLD * 60))" '
    {
        # Parse etime: formats are [[DD-]HH:]MM:SS
        n = split($2, parts, "[-:]")
        if (n == 2)      secs = parts[1]*60 + parts[2]
        else if (n == 3) secs = parts[1]*3600 + parts[2]*60 + parts[3]
        else if (n == 4) secs = parts[1]*86400 + parts[2]*3600 + parts[3]*60 + parts[4]
        if (secs > threshold) print $1
    }' || true)

if [ -n "$stale_claude_pids" ]; then
    for pid in $stale_claude_pids; do
        echo "  Killing stale daemon-spawned Claude PID $pid"
        kill "$pid" 2>/dev/null || true
    done
    sleep 1
    for pid in $stale_claude_pids; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "  Force killing stale Claude PID $pid"
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
fi

# --- Start the daemon -------------------------------------------------------

echo "Starting agent-daemon.py (logs: $LOG_DIR/agent-daemon.log)"
cd "$SCRIPT_DIR"
nohup python3 "$DAEMON_SCRIPT" >> "$LOG_DIR/agent-daemon.log" 2>&1 &
NEW_PID=$!
echo "Agent daemon started with PID $NEW_PID"
