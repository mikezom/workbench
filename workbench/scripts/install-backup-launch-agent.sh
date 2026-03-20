#!/usr/bin/env bash

set -euo pipefail

PATH="/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-workbench-data.sh"
PLIST_PATH="$HOME/Library/LaunchAgents/com.workbench.database-backup.plist"
LOG_DIR="$PROJECT_ROOT/logs"
HOUR="${1:-3}"
MINUTE="${2:-0}"

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

if [ ! -x "$BACKUP_SCRIPT" ]; then
    echo "Backup script is missing or not executable: $BACKUP_SCRIPT" >&2
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
    <string>com.workbench.database-backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$BACKUP_SCRIPT</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>WorkingDirectory</key>
    <string>$PROJECT_ROOT</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/database-backup.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/database-backup.err.log</string>
</dict>
</plist>
EOF

/bin/launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
/bin/launchctl load "$PLIST_PATH"

echo "Installed com.workbench.database-backup"
echo "Schedule: every day at $(printf '%02d:%02d' "$HOUR" "$MINUTE")"
echo "Plist: $PLIST_PATH"
