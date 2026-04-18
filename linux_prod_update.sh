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
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-0}"

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
  if [[ "$SKIP_FRONTEND_BUILD" != "1" ]]; then
    command -v "$NPM_BIN" >/dev/null 2>&1 || {
      echo "[error] npm not found (or set SKIP_FRONTEND_BUILD=1 to use prebuilt frontend/dist)"
      exit 1
    }
  fi
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

ensure_frontend_dist() {
  if [[ ! -f "$FRONTEND_DIR/dist/index.html" ]]; then
    echo "[error] SKIP_FRONTEND_BUILD=1 but frontend/dist is missing or incomplete (expected $FRONTEND_DIR/dist/index.html)"
    echo "        On dev machine: cd frontend && npm ci && npm run build, then commit and push frontend/dist"
    exit 1
  fi
  echo "[frontend] using prebuilt dist at $FRONTEND_DIR/dist (SKIP_FRONTEND_BUILD=1)"
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

maybe_build_frontend() {
  if [[ "$SKIP_FRONTEND_BUILD" = "1" ]]; then
    ensure_frontend_dist
  else
    build_frontend
  fi
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
  SKIP_FRONTEND_BUILD=0   set to 1 to skip npm/vite on server; require committed frontend/dist
EOF
}

main() {
  local cmd="${1:-update}"
  ensure_prerequisites
  ensure_env_file

  case "$cmd" in
    update)
      sync_backend_deps
      maybe_build_frontend
      reload_services
      show_status
      ;;
    deps)
      sync_backend_deps
      if [[ "$SKIP_FRONTEND_BUILD" = "1" ]]; then
        echo "[frontend] skipping npm (SKIP_FRONTEND_BUILD=1)"
      else
        if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
          (cd "$FRONTEND_DIR" && "$NPM_BIN" ci)
        else
          (cd "$FRONTEND_DIR" && "$NPM_BIN" install)
        fi
      fi
      ;;
    build)
      maybe_build_frontend
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
