#!/usr/bin/env bash

set -euo pipefail

PATH="/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UPDATE_SCRIPT="$SCRIPT_DIR/update-tushare-data.sh"
PLIST_PATH="$HOME/Library/LaunchAgents/com.workbench.tushare-update.plist"
LOG_DIR="$APP_ROOT/logs"
HOUR="${1:-18}"
MINUTE="${2:-0}"
ENV_FILE="${3:-$APP_ROOT/data/tushare.env}"

validate_number() {
    local value="$1"
    local name="$2"
    local min="$3"
    local max="$4"

    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
        echo "$name must be numeric" >&2
        exit 1
    fi

    if [ "$value" -lt "$min" ] || [ "$value" -gt "$max" ]; then
        echo "$name must be between $min and $max" >&2
        exit 1
    fi
}

if [ ! -x "$UPDATE_SCRIPT" ]; then
    echo "Update script is missing or not executable: $UPDATE_SCRIPT" >&2
    exit 1
fi

validate_number "$HOUR" "Hour" 0 23
validate_number "$MINUTE" "Minute" 0 59

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.workbench.tushare-update</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$UPDATE_SCRIPT</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TUSHARE_ENV_FILE</key>
        <string>$ENV_FILE</string>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>WorkingDirectory</key>
    <string>$APP_ROOT</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/tushare-update.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/tushare-update.err.log</string>
</dict>
</plist>
EOF

/bin/launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
/bin/launchctl load "$PLIST_PATH"

echo "Installed com.workbench.tushare-update"
echo "Schedule: every day at $(printf '%02d:%02d' "$HOUR" "$MINUTE")"
echo "Env file: $ENV_FILE"
echo "Plist: $PLIST_PATH"

if [ ! -f "$ENV_FILE" ]; then
    echo "Warning: env file does not exist yet. Create it with: TUSHARE_TOKEN=your_token" >&2
fi
