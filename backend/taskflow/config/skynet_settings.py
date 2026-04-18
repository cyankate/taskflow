"""从 taskflow/config/skynet.json 读取服务器相关配置。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_PATH = Path(__file__).resolve().parent / "skynet.json"
_API_PREFIX = "/api/web/"
_DB_QUERY_PATH = "db/query"
_DB_ACTION_FIELD = "action"
_HOTRELOAD_API_PATH = "hotreload"
_HOTRELOAD_ACTION_FIELD = "action"
_HTTP_VERIFY_SSL = True
_HTTP_TIMEOUT_SEC = 30.0

_cache: dict[str, Any] | None = None


def load_skynet_config() -> dict[str, Any]:
    """读取 skynet.json；不做默认值合并。"""
    global _cache
    if _cache is not None:
        return _cache
    if not _CONFIG_PATH.is_file():
        raise RuntimeError(f"服务器配置文件不存在: {_CONFIG_PATH}")
    try:
        raw = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"服务器配置文件读取失败: {_CONFIG_PATH}") from exc
    if not isinstance(raw, dict):
        raise RuntimeError(f"服务器配置格式错误: {_CONFIG_PATH}")
    _cache = raw
    return _cache


def reload_skynet_config() -> None:
    """测试或热读时可调用（生产一般进程级缓存即可）。"""
    global _cache
    _cache = None


def skynet_http_base() -> str:
    cfg = load_skynet_config()
    servers = cfg.get("servers")
    if isinstance(servers, list):
        for s in servers:
            if not isinstance(s, dict):
                continue
            url = str(s.get("url") or "").strip()
            if url:
                return url
    return str(cfg.get("http_base") or "").strip()


def skynet_api_prefix() -> str:
    p = _API_PREFIX
    if not p.startswith("/"):
        p = "/" + p
    return p if p.endswith("/") else p + "/"


def skynet_db_api_path() -> str:
    """服务器侧统一 DB 入口相对路径。"""
    return _DB_QUERY_PATH


def skynet_db_action_field() -> str:
    """请求 JSON 里区分操作的字段名。"""
    return _DB_ACTION_FIELD


def skynet_http_bearer() -> str:
    return str(load_skynet_config().get("http_bearer") or "").strip()


def skynet_http_api_key() -> str:
    return str(load_skynet_config().get("http_api_key") or "").strip()


def skynet_http_api_key_header() -> str:
    return str(load_skynet_config().get("http_api_key_header") or "").strip()


def skynet_http_verify_ssl() -> bool:
    return _HTTP_VERIFY_SSL


def skynet_http_timeout_sec() -> float:
    return _HTTP_TIMEOUT_SEC


def skynet_hotreload_api_path() -> str:
    return _HOTRELOAD_API_PATH


def skynet_hotreload_action_field() -> str:
    return _HOTRELOAD_ACTION_FIELD


def console_gateways_from_config() -> list[dict[str, str]]:
    """控制台「当前服务器」下拉：优先读取 servers（label/url）。"""
    cfg = load_skynet_config()
    servers = cfg.get("servers")
    if isinstance(servers, list):
        out: list[dict[str, str]] = []
        for i, s in enumerate(servers):
            if not isinstance(s, dict):
                continue
            url = str(s.get("url") or "").strip()
            if not url:
                continue
            label = str(s.get("label") or "").strip() or url
            sid = s.get("id")
            gid = str(sid).strip() if sid is not None and str(sid).strip() != "" else str(i)
            out.append({"id": gid, "label": label, "url": url})
        if out:
            return out
    base = str(cfg.get("http_base") or "").strip()
    if base:
        return [{"id": "0", "label": "默认服务器", "url": base}]
    return []
