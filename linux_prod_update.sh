#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

APP_NAME="${APP_NAME:-taskflow}"
SERVICE_NAME="${SERVICE_NAME:-${APP_NAME}-backend.service}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
NPM_BIN="${NPM_BIN:-npm}"
USE_SUDO="${USE_SUDO:-1}"

run_as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 || "$USE_SUDO" = "0" ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

ensure_prerequisites() {
  command -v "$PYTHON_BIN" >/dev/null 2>&1 || {
    echo "[error] python3 not found"
    exit 1
  }
  command -v "$NPM_BIN" >/dev/null 2>&1 || {
    echo "[error] npm not found"
    exit 1
  }
  command -v systemctl >/dev/null 2>&1 || {
    echo "[error] systemctl not found"
    exit 1
  }
  command -v nginx >/dev/null 2>&1 || {
    echo "[error] nginx not found"
    exit 1
  }
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "[warn] env file not found: $ENV_FILE"
    echo "       continue without explicit env file check"
  fi
}

sync_backend_deps() {
  if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
    echo "[backend] virtualenv missing, creating..."
    "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
  fi
  echo "[backend] syncing dependencies..."
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.venv/bin/activate"
  pip install -r "$BACKEND_DIR/requirements.txt"
  deactivate
}

build_frontend() {
  echo "[frontend] syncing dependencies..."
  if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
    (cd "$FRONTEND_DIR" && "$NPM_BIN" ci)
  else
    (cd "$FRONTEND_DIR" && "$NPM_BIN" install)
  fi
  echo "[frontend] building assets..."
  (cd "$FRONTEND_DIR" && "$NPM_BIN" run build)
}

reload_services() {
  echo "[systemd] restarting $SERVICE_NAME ..."
  run_as_root systemctl daemon-reload
  run_as_root systemctl restart "$SERVICE_NAME"
  echo "[nginx] validating config..."
  run_as_root nginx -t
  run_as_root systemctl reload nginx
}

show_status() {
  echo
  echo "[status] $SERVICE_NAME"
  run_as_root systemctl --no-pager --full status "$SERVICE_NAME" || true
  echo
  echo "[status] nginx.service"
  run_as_root systemctl --no-pager --full status nginx || true
}

usage() {
  cat <<'EOF'
Usage: ./linux_prod_update.sh [command]

Commands:
  update   Sync deps + build + restart backend + reload nginx (default)
  deps     Sync backend/frontend dependencies only
  build    Build frontend assets only
  reload   Restart backend + reload nginx only
  status   Show backend/nginx status

Optional env vars:
  APP_NAME=taskflow
  SERVICE_NAME=taskflow-backend.service
  ENV_FILE=/abs/path/to/.env.production
  PYTHON_BIN=python3
  NPM_BIN=npm
  USE_SUDO=1
EOF
}

main() {
  local cmd="${1:-update}"
  ensure_prerequisites
  ensure_env_file

  case "$cmd" in
    update)
      sync_backend_deps
      build_frontend
      reload_services
      show_status
      ;;
    deps)
      sync_backend_deps
      if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
        (cd "$FRONTEND_DIR" && "$NPM_BIN" ci)
      else
        (cd "$FRONTEND_DIR" && "$NPM_BIN" install)
      fi
      ;;
    build)
      build_frontend
      ;;
    reload)
      reload_services
      show_status
      ;;
    status)
      show_status
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
