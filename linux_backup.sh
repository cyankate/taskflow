#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TEMP_DIR="${TEMP_DIR:-$BACKUP_DIR/.tmp}"
DB_FILE="${DB_FILE:-$ROOT_DIR/backend/instance/taskflow.db}"
UPLOAD_DIR="${UPLOAD_DIR:-$ROOT_DIR/backend/instance/uploads}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
KEEP_COUNT="${KEEP_COUNT:-20}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WORK_DIR="$TEMP_DIR/taskflow_backup_$TIMESTAMP"
ARCHIVE_FILE="$BACKUP_DIR/taskflow_backup_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR" "$TEMP_DIR" "$WORK_DIR"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

copy_database() {
  if [[ ! -f "$DB_FILE" ]]; then
    echo "[warn] database not found: $DB_FILE"
    return 0
  fi
  mkdir -p "$WORK_DIR/db"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_FILE" ".backup '$WORK_DIR/db/taskflow.db'"
  else
    cp "$DB_FILE" "$WORK_DIR/db/taskflow.db"
  fi
  echo "[ok] database snapshot done"
}

copy_optional_dir() {
  local source_dir="$1"
  local target_name="$2"
  if [[ -d "$source_dir" ]]; then
    mkdir -p "$WORK_DIR/$target_name"
    cp -a "$source_dir/." "$WORK_DIR/$target_name/"
    echo "[ok] copied $target_name"
  else
    echo "[warn] directory not found: $source_dir"
  fi
}

write_manifest() {
  cat >"$WORK_DIR/manifest.txt" <<EOF
timestamp=$TIMESTAMP
host=$(hostname)
db_file=$DB_FILE
upload_dir=$UPLOAD_DIR
log_dir=$LOG_DIR
retention_days=$RETENTION_DAYS
keep_count=$KEEP_COUNT
EOF
}

prune_old_backups() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "taskflow_backup_*.tar.gz" -mtime "+$RETENTION_DAYS" -delete

  mapfile -t archives < <(ls -1t "$BACKUP_DIR"/taskflow_backup_*.tar.gz 2>/dev/null || true)
  local total="${#archives[@]}"
  if (( total > KEEP_COUNT )); then
    for ((i = KEEP_COUNT; i < total; i++)); do
      rm -f "${archives[$i]}"
    done
  fi
}

copy_database
copy_optional_dir "$UPLOAD_DIR" "uploads"
copy_optional_dir "$LOG_DIR" "logs"
write_manifest

tar -czf "$ARCHIVE_FILE" -C "$WORK_DIR" .
echo "[ok] backup archive created: $ARCHIVE_FILE"

prune_old_backups
echo "[ok] backup retention applied"
