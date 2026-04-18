#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
DEPLOY_DIR="$ROOT_DIR/deploy"

APP_NAME="${APP_NAME:-taskflow}"
APP_USER="${APP_USER:-$USER}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
SERVER_NAME="${SERVER_NAME:-_}"
BACKEND_PORT="${BACKEND_PORT:-5000}"
GUNICORN_WORKERS="${GUNICORN_WORKERS:-3}"

SYSTEMD_SERVICE_PATH="/etc/systemd/system/${APP_NAME}-backend.service"
NGINX_SITE_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}.conf"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}.conf"

PYTHON_BIN="${PYTHON_BIN:-python3}"
NPM_BIN="${NPM_BIN:-npm}"
USE_SUDO="${USE_SUDO:-1}"
AUTO_INSTALL_DEPS="${AUTO_INSTALL_DEPS:-0}"
# 设为 1 时不在服务器执行 npm ci / vite build，使用已提交的 frontend/dist（本地构建后推送）
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-0}"

run_as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 || "$USE_SUDO" = "0" ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

ensure_prerequisites() {
  if [[ "$AUTO_INSTALL_DEPS" = "1" ]]; then
    if ! command -v "$PYTHON_BIN" >/dev/null 2>&1 || ! command -v "$NPM_BIN" >/dev/null 2>&1 || ! command -v nginx >/dev/null 2>&1; then
      install_os_dependencies
    fi
  fi
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
  command -v nginx >/dev/null 2>&1 || {
    echo "[error] nginx not found, please install nginx first or set AUTO_INSTALL_DEPS=1"
    exit 1
  }
  command -v systemctl >/dev/null 2>&1 || {
    echo "[error] systemctl not found"
    exit 1
  }
}

install_os_dependencies() {
  echo "[deps] installing OS dependencies..."
  if command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get update
    run_as_root apt-get install -y python3 python3-venv python3-pip nodejs npm nginx
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    run_as_root dnf install -y python3 python3-pip nodejs npm nginx
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    run_as_root yum install -y python3 python3-pip nodejs npm nginx
    return
  fi
  echo "[error] unsupported package manager, install python3/npm/nginx manually"
  exit 1
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "[error] env file not found: $ENV_FILE"
    echo "        copy one first: cp .env.example .env.production"
    exit 1
  fi
}

install_backend_dependencies() {
  if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
    echo "[backend] creating virtualenv..."
    "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
  fi
  echo "[backend] installing dependencies..."
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.venv/bin/activate"
  pip install --upgrade pip
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
  echo "[frontend] installing dependencies..."
  if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
    (cd "$FRONTEND_DIR" && "$NPM_BIN" ci)
  else
    (cd "$FRONTEND_DIR" && "$NPM_BIN" install)
  fi
  echo "[frontend] building production assets..."
  (cd "$FRONTEND_DIR" && "$NPM_BIN" run build)
}

maybe_build_frontend() {
  if [[ "$SKIP_FRONTEND_BUILD" = "1" ]]; then
    ensure_frontend_dist
  else
    build_frontend
  fi
}

render_service_file() {
  local template="$DEPLOY_DIR/taskflow-backend.service.tpl"
  local output
  output="$(mktemp)"
  sed \
    -e "s#__APP_USER__#${APP_USER}#g" \
    -e "s#__APP_GROUP__#${APP_GROUP}#g" \
    -e "s#__BACKEND_DIR__#${BACKEND_DIR}#g" \
    -e "s#__ENV_FILE__#${ENV_FILE}#g" \
    -e "s#__BACKEND_PORT__#${BACKEND_PORT}#g" \
    -e "s#__GUNICORN_WORKERS__#${GUNICORN_WORKERS}#g" \
    "$template" >"$output"

  run_as_root cp "$output" "$SYSTEMD_SERVICE_PATH"
  rm -f "$output"
  echo "[systemd] wrote $SYSTEMD_SERVICE_PATH"
}

render_nginx_file() {
  local template="$DEPLOY_DIR/taskflow-nginx.conf.tpl"
  local output
  output="$(mktemp)"
  sed \
    -e "s#__SERVER_NAME__#${SERVER_NAME}#g" \
    -e "s#__FRONTEND_DIST_DIR__#${FRONTEND_DIR}/dist#g" \
    -e "s#__BACKEND_PORT__#${BACKEND_PORT}#g" \
    "$template" >"$output"

  run_as_root cp "$output" "$NGINX_SITE_AVAILABLE"
  run_as_root ln -sfn "$NGINX_SITE_AVAILABLE" "$NGINX_SITE_ENABLED"
  run_as_root rm -f /etc/nginx/sites-enabled/default
  rm -f "$output"
  echo "[nginx] wrote $NGINX_SITE_AVAILABLE"
}

reload_services() {
  echo "[systemd] reloading daemon..."
  run_as_root systemctl daemon-reload
  run_as_root systemctl enable "${APP_NAME}-backend.service"
  run_as_root systemctl restart "${APP_NAME}-backend.service"
  echo "[nginx] validating configuration..."
  run_as_root nginx -t
  run_as_root systemctl enable nginx
  run_as_root systemctl restart nginx
}

show_status() {
  echo
  echo "[status] ${APP_NAME}-backend.service"
  run_as_root systemctl --no-pager --full status "${APP_NAME}-backend.service" || true
  echo
  echo "[status] nginx.service"
  run_as_root systemctl --no-pager --full status nginx || true
}

usage() {
  cat <<'EOF'
Usage: ./linux_prod_setup.sh [command]

Commands:
  setup      Install deps + build + write systemd/nginx + restart services (default)
  build      Build backend/frontend only
  render     Render systemd/nginx files only
  reload     Reload systemd/nginx only
  status     Show service status

Optional env vars:
  APP_NAME=taskflow
  APP_USER=<linux user>
  APP_GROUP=<linux group>
  ENV_FILE=/abs/path/to/.env.production
  SERVER_NAME=example.com
  BACKEND_PORT=5000
  GUNICORN_WORKERS=3
  USE_SUDO=1
  AUTO_INSTALL_DEPS=0
  SKIP_FRONTEND_BUILD=0   set to 1 to skip npm/vite on server; require committed frontend/dist
EOF
}

main() {
  local cmd="${1:-setup}"
  ensure_prerequisites
  ensure_env_file
  case "$cmd" in
    setup)
      install_backend_dependencies
      maybe_build_frontend
      render_service_file
      render_nginx_file
      reload_services
      show_status
      ;;
    build)
      install_backend_dependencies
      maybe_build_frontend
      ;;
    render)
      render_service_file
      render_nginx_file
      ;;
    reload)
      reload_services
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
