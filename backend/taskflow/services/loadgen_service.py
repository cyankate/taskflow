"""Taskflow -> skynet-loadgen agent 代理。"""

from __future__ import annotations

from typing import Any

import requests

from taskflow.config.loadgen_settings import loadgen_agent_url

_TIMEOUT_SEC = 15.0


def _base_url() -> str | None:
    url = loadgen_agent_url()
    return url.rstrip("/") if url else None


def agent_configured() -> bool:
    return bool(_base_url())


def _request(method: str, path: str, *, json_body: dict[str, Any] | None = None) -> Any:
    base = _base_url()
    if not base:
        return None
    url = f"{base}{path}"
    r = requests.request(method, url, json=json_body, timeout=_TIMEOUT_SEC)
    if r.content:
        try:
            data = r.json()
        except ValueError:
            data = {"ok": False, "error": r.text or "invalid json"}
    else:
        data = {}
    if not r.ok and isinstance(data, dict) and not data.get("error"):
        data["error"] = r.text or f"HTTP {r.status_code}"
    return data


def fetch_health() -> tuple[bool, str]:
    raw = _request("GET", "/health")
    if raw is None:
        return False, "未配置 loadgen agent_url"
    if isinstance(raw, dict) and raw.get("ok"):
        return True, ""
    err = ""
    if isinstance(raw, dict):
        err = str(raw.get("error") or "")
    return False, err or "agent 不可用"


def fetch_presets() -> tuple[list[dict[str, Any]], str]:
    raw = _request("GET", "/presets")
    if raw is None:
        return [], "未配置 loadgen agent_url"
    if not isinstance(raw, dict):
        return [], "响应格式无效"
    if raw.get("error"):
        return [], str(raw.get("error"))
    presets = raw.get("presets")
    if not isinstance(presets, list):
        presets = []
    return presets, ""


def list_runs() -> tuple[list[dict[str, Any]], str]:
    raw = _request("GET", "/runs")
    if raw is None:
        return [], "未配置 loadgen agent_url"
    if not isinstance(raw, dict):
        return [], "响应格式无效"
    if raw.get("error"):
        return [], str(raw.get("error"))
    runs = raw.get("runs")
    if not isinstance(runs, list):
        runs = []
    return runs, ""


def get_run(run_id: str) -> tuple[dict[str, Any] | None, str]:
    rid = str(run_id or "").strip()
    if not rid:
        return None, "缺少 run_id"
    raw = _request("GET", f"/runs/{rid}")
    if raw is None:
        return None, "未配置 loadgen agent_url"
    if not isinstance(raw, dict):
        return None, "响应格式无效"
    if raw.get("error"):
        return None, str(raw.get("error"))
    run = raw.get("run")
    if not isinstance(run, dict):
        return None, "响应格式无效"
    return run, ""


def start_run(body: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    raw = _request("POST", "/runs", json_body=body)
    if raw is None:
        return None, "未配置 loadgen agent_url"
    if not isinstance(raw, dict):
        return None, "响应格式无效"
    if raw.get("error"):
        return None, str(raw.get("error"))
    run = raw.get("run")
    if not isinstance(run, dict):
        return None, "启动失败"
    return run, ""


def stop_run(run_id: str) -> tuple[dict[str, Any] | None, str]:
    rid = str(run_id or "").strip()
    if not rid:
        return None, "缺少 run_id"
    raw = _request("POST", f"/runs/{rid}/stop")
    if raw is None:
        return None, "未配置 loadgen agent_url"
    if not isinstance(raw, dict):
        return None, "响应格式无效"
    if raw.get("error"):
        return None, str(raw.get("error"))
    run = raw.get("run")
    if not isinstance(run, dict):
        return None, "停止失败"
    return run, ""
