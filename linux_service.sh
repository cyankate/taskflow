#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/logs"
PID_DIR="$ROOT_DIR/.run"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"

PYTHON_BIN="${PYTHON_BIN:-python3}"
NPM_BIN="${NPM_BIN:-npm}"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$LOG_DIR" "$PID_DIR"

if [[ "${ALLOW_ROOT_RUN:-0}" != "1" && "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "[security] 请勿使用 root 运行服务脚本，可设置 ALLOW_ROOT_RUN=1 临时放行"
  exit 1
fi

load_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    return
  fi
  echo "[env] loading variables from: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

is_pid_running() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  kill -0 "$pid" >/dev/null 2>&1
}

read_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cat "$file"
  else
    echo ""
  fi
}

ensure_backend_env() {
  if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
    echo "[backend] creating virtualenv..."
    "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
    source "$BACKEND_DIR/.venv/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt"
    deactivate
  fi
}

ensure_frontend_env() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "[frontend] installing npm dependencies..."
    (cd "$FRONTEND_DIR" && "$NPM_BIN" install)
  fi
}

start_backend() {
  local pid
  pid="$(read_pid "$BACKEND_PID_FILE")"
  if is_pid_running "$pid"; then
    echo "[backend] already running (pid: $pid)"
    return
  fi

  ensure_backend_env
  echo "[backend] starting..."
  nohup bash -lc "cd \"$BACKEND_DIR\" && source .venv/bin/activate && python app.py" >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID_FILE"
  echo "[backend] started (pid: $(cat "$BACKEND_PID_FILE"))"
}

start_frontend() {
  local pid
  pid="$(read_pid "$FRONTEND_PID_FILE")"
  if is_pid_running "$pid"; then
    echo "[frontend] already running (pid: $pid)"
    return
  fi

  ensure_frontend_env
  echo "[frontend] starting..."
  nohup bash -lc "cd \"$FRONTEND_DIR\" && $NPM_BIN run dev -- --host 0.0.0.0 --port 5173" >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"
  echo "[frontend] started (pid: $(cat "$FRONTEND_PID_FILE"))"
}

stop_service() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid="$(read_pid "$pid_file")"
  if ! is_pid_running "$pid"; then
    echo "[$name] not running"
    rm -f "$pid_file"
    return
  fi
  echo "[$name] stopping (pid: $pid)..."
  kill "$pid" >/dev/null 2>&1 || true
  sleep 1
  if is_pid_running "$pid"; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
  echo "[$name] stopped"
}

status_service() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid="$(read_pid "$pid_file")"
  if is_pid_running "$pid"; then
    echo "[$name] running (pid: $pid)"
  else
    echo "[$name] stopped"
  fi
}

show_logs() {
  echo "=== backend log: $BACKEND_LOG ==="
  if [[ -f "$BACKEND_LOG" ]]; then
    tail -n 30 "$BACKEND_LOG"
  else
    echo "(no log yet)"
  fi
  echo
  echo "=== frontend log: $FRONTEND_LOG ==="
  if [[ -f "$FRONTEND_LOG" ]]; then
    tail -n 30 "$FRONTEND_LOG"
  else
    echo "(no log yet)"
  fi
}

usage() {
  cat <<'EOF'
Usage: ./linux_service.sh <command>

Commands:
  start      Start backend + frontend
  stop       Stop backend + frontend
  restart    Restart backend + frontend
  status     Show backend + frontend status
  logs       Show latest backend + frontend logs

Notes:
  - Backend listens on 0.0.0.0:5000 (configured in backend/app.py)
  - Frontend listens on 0.0.0.0:5173 (script forces host/port)
  - Auto loads env from ENV_FILE (default: .env.production)
EOF
}

main() {
  load_env_file
  local cmd="${1:-}"
  case "$cmd" in
    start)
      start_backend
      start_frontend
      ;;
    stop)
      stop_service "frontend" "$FRONTEND_PID_FILE"
      stop_service "backend" "$BACKEND_PID_FILE"
      ;;
    restart)
      "$0" stop
      "$0" start
      ;;
    status)
      status_service "backend" "$BACKEND_PID_FILE"
      status_service "frontend" "$FRONTEND_PID_FILE"
      ;;
    logs)
      show_logs
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"

