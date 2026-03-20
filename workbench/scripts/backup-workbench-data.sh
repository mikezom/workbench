#!/usr/bin/env bash

set -euo pipefail

# launchd runs with a minimal PATH, so use system binaries explicitly.
PATH="/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEVELOPMENT_ROOT="$(cd "$PROJECT_ROOT/../.." && pwd)"

BACKUP_ROOT="${BACKUP_ROOT:-$DEVELOPMENT_ROOT/backup/workbench-project}"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
BACKUP_NAME="daily-$TIMESTAMP"
FINAL_DIR="$BACKUP_ROOT/$BACKUP_NAME"
TEMP_DIR=""

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

cleanup_temp_dir() {
    local exit_code="$?"
    if [ "$exit_code" -ne 0 ] && [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

backup_directory() {
    local source_dir="$1"
    local destination_dir="$2"

    mkdir -p "$destination_dir"

    /usr/bin/rsync -a \
        --exclude='*.db' \
        --exclude='*.db-wal' \
        --exclude='*.db-shm' \
        --exclude='*.db-journal' \
        "$source_dir"/ "$destination_dir"/

    while IFS= read -r -d '' db_file; do
        local relative_path destination_db
        relative_path="${db_file#$source_dir/}"
        destination_db="$destination_dir/$relative_path"
        mkdir -p "$(dirname "$destination_db")"
        /usr/bin/sqlite3 "$db_file" ".backup '$destination_db'"
    done < <(/usr/bin/find "$source_dir" -type f -name '*.db' -print0)
}

write_manifest() {
    local manifest_path="$1"
    cat > "$manifest_path" <<EOF
created_at=$(date '+%Y-%m-%d %H:%M:%S %z')
backup_name=$BACKUP_NAME
backup_root=$BACKUP_ROOT
sources=/Users/ccnas/DEVELOPMENT/shared-data,/Users/ccnas/DEVELOPMENT/workbench/workbench/data
retention_policy=keep_latest_3_days_plus_1_week_old_copy
EOF
}

extract_backup_date() {
    local backup_name="$1"
    echo "$backup_name" | /usr/bin/sed -E 's/^daily-([0-9]{4}-[0-9]{2}-[0-9]{2})_.*/\1/'
}

array_contains() {
    local needle="$1"
    shift

    local item
    for item in "$@"; do
        if [ "$item" = "$needle" ]; then
            return 0
        fi
    done

    return 1
}

path_in_array() {
    local backup_path="$1"
    shift

    local item
    for item in "$@"; do
        if [ "$item" = "$backup_path" ]; then
            return 0
        fi
    done

    return 1
}

prune_old_backups() {
    local backup_dirs=()
    local backup_dir

    while IFS= read -r backup_dir; do
        backup_dirs+=("$backup_dir")
    done < <(
        /usr/bin/find "$BACKUP_ROOT" \
            -mindepth 1 \
            -maxdepth 1 \
            -type d \
            -name 'daily-*' \
            | /usr/bin/sort -r
    )

    if [ "${#backup_dirs[@]}" -le 1 ]; then
        return
    fi

    local recent_dates=()
    local kept_backups=()
    local kept_dates=()
    local latest_backup_name latest_backup_date weekly_target_date
    local backup_name backup_date

    latest_backup_name="$(basename "${backup_dirs[0]}")"
    latest_backup_date="$(extract_backup_date "$latest_backup_name")"
    weekly_target_date="$(/bin/date -j -v-7d -f '%Y-%m-%d' "$latest_backup_date" '+%Y-%m-%d')"

    for backup_dir in "${backup_dirs[@]}"; do
        backup_name="$(basename "$backup_dir")"
        backup_date="$(extract_backup_date "$backup_name")"
        if [ "${#recent_dates[@]}" -eq 0 ] || ! array_contains "$backup_date" "${recent_dates[@]}"; then
            recent_dates+=("$backup_date")
        fi
        if [ "${#recent_dates[@]}" -ge 3 ]; then
            break
        fi
    done

    for backup_dir in "${backup_dirs[@]}"; do
        backup_name="$(basename "$backup_dir")"
        backup_date="$(extract_backup_date "$backup_name")"
        if [ "${#recent_dates[@]}" -eq 0 ] || ! array_contains "$backup_date" "${recent_dates[@]}"; then
            continue
        fi
        if [ "${#kept_dates[@]}" -gt 0 ] && array_contains "$backup_date" "${kept_dates[@]}"; then
            continue
        fi
        kept_backups+=("$backup_dir")
        kept_dates+=("$backup_date")
    done

    for backup_dir in "${backup_dirs[@]}"; do
        backup_name="$(basename "$backup_dir")"
        backup_date="$(extract_backup_date "$backup_name")"
        if [ "${#recent_dates[@]}" -gt 0 ] && array_contains "$backup_date" "${recent_dates[@]}"; then
            continue
        fi
        if [[ "$backup_date" > "$weekly_target_date" ]]; then
            continue
        fi
        kept_backups+=("$backup_dir")
        break
    done

    for backup_dir in "${backup_dirs[@]}"; do
        if [ "${#kept_backups[@]}" -gt 0 ] && path_in_array "$backup_dir" "${kept_backups[@]}"; then
            continue
        fi
        rm -rf "$backup_dir"
    done
}

trap cleanup_temp_dir EXIT

require_cmd /usr/bin/rsync
require_cmd /usr/bin/sqlite3
require_cmd /usr/bin/find

for required_dir in \
    "$DEVELOPMENT_ROOT/shared-data" \
    "$PROJECT_ROOT/data"
do
    if [ ! -d "$required_dir" ]; then
        echo "Missing source directory: $required_dir" >&2
        exit 1
    fi
done

mkdir -p "$BACKUP_ROOT"
TEMP_DIR="$(/usr/bin/mktemp -d "$BACKUP_ROOT/.${BACKUP_NAME}.tmp.XXXXXX")"

echo "Creating backup at $FINAL_DIR"

backup_directory "$DEVELOPMENT_ROOT/shared-data" "$TEMP_DIR/shared-data"
backup_directory "$PROJECT_ROOT/data" "$TEMP_DIR/workbench-data"
write_manifest "$TEMP_DIR/backup-info.txt"

/bin/mv "$TEMP_DIR" "$FINAL_DIR"
TEMP_DIR=""
/bin/ln -sfn "$FINAL_DIR" "$BACKUP_ROOT/latest"

prune_old_backups

echo "Backup completed: $FINAL_DIR"
