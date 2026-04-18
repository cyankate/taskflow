"""从 taskflow/config/skynet.json 读取 Skynet 相关配置（网关、HTTP 客户端、演示开关等）。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_PATH = Path(__file__).resolve().parent / "skynet.json"

_DEFAULTS: dict[str, Any] = {
    "http_base": "http://8.163.100.189:8889",
    "server_label": "Skynet",
    "api_prefix": "/api/web/",
    "db_mock": False,
    "http_bearer": "",
    "http_api_key": "",
    "http_api_key_header": "X-API-Key",
    "http_verify_ssl": True,
    "http_timeout_sec": 30,
    "db_action_field": "action",
    "hotreload": {
        "api_path": "hotreload",
        "action_field": "action",
    },
    "paths": {
        "query": "db/query",
    },
}

_cache: dict[str, Any] | None = None


def _deep_merge_paths(base: dict[str, str], override: dict[str, Any]) -> dict[str, str]:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, str):
            out[str(k)] = v
    return out


def load_skynet_config() -> dict[str, Any]:
    """合并默认值与 skynet.json；文件不存在时仅返回默认值。"""
    global _cache
    if _cache is not None:
        return _cache
    data: dict[str, Any] = {}
    if _CONFIG_PATH.is_file():
        try:
            raw = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except (OSError, json.JSONDecodeError):
            data = {}
    merged: dict[str, Any] = {
        **{k: v for k, v in _DEFAULTS.items() if k not in ("paths", "hotreload")},
        **{k: v for k, v in data.items() if k not in ("paths", "hotreload")},
    }
    merged["paths"] = _deep_merge_paths(
        dict(_DEFAULTS["paths"]),
        data["paths"] if isinstance(data.get("paths"), dict) else {},
    )
    hr_def = dict(_DEFAULTS["hotreload"])
    if isinstance(data.get("hotreload"), dict):
        hr_def.update({k: v for k, v in data["hotreload"].items()})
    merged["hotreload"] = hr_def
    _cache = merged
    return _cache


def reload_skynet_config() -> None:
    """测试或热读时可调用（生产一般进程级缓存即可）。"""
    global _cache
    _cache = None


def skynet_http_base() -> str:
    return str(load_skynet_config().get("http_base") or "").strip()


def skynet_api_prefix() -> str:
    p = str(load_skynet_config().get("api_prefix") or _DEFAULTS["api_prefix"]).strip()
    if not p.startswith("/"):
        p = "/" + p
    return p if p.endswith("/") else p + "/"


def skynet_db_api_path() -> str:
    """Skynet 侧统一 DB 入口相对路径（默认 db/query），表/字段/执行查询均 POST 到此路径。"""
    paths = load_skynet_config().get("paths") or {}
    p = paths.get("query") or paths.get("endpoint") or _DEFAULTS["paths"]["query"]
    return str(p).strip() or "db/query"


def skynet_db_action_field() -> str:
    """请求 JSON 里区分操作的字段名，默认 action。"""
    f = str(load_skynet_config().get("db_action_field") or _DEFAULTS["db_action_field"]).strip()
    return f or "action"


def is_skynet_http_base_configured() -> bool:
    """用于判断是否应走演示库：配置文件里写了非空 http_base 即视为已配置。"""
    return bool(skynet_http_base())


def _coerce_bool(v: Any, default: bool = False) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("0", "false", "no", ""):
            return False
        if s in ("1", "true", "yes"):
            return True
    return default


def skynet_db_mock() -> bool:
    """控制台数据库页是否强制使用本地演示数据（不请求 Skynet）。"""
    return _coerce_bool(load_skynet_config().get("db_mock"), False)


def skynet_http_bearer() -> str:
    return str(load_skynet_config().get("http_bearer") or "").strip()


def skynet_http_api_key() -> str:
    return str(load_skynet_config().get("http_api_key") or "").strip()


def skynet_http_api_key_header() -> str:
    h = str(load_skynet_config().get("http_api_key_header") or _DEFAULTS["http_api_key_header"]).strip()
    return h or "X-API-Key"


def skynet_http_verify_ssl() -> bool:
    return _coerce_bool(load_skynet_config().get("http_verify_ssl"), True)


def skynet_http_timeout_sec() -> float:
    try:
        return float(load_skynet_config().get("http_timeout_sec", _DEFAULTS["http_timeout_sec"]))
    except (TypeError, ValueError):
        return float(_DEFAULTS["http_timeout_sec"])


def skynet_hotreload_api_path() -> str:
    hr = load_skynet_config().get("hotreload") or {}
    if isinstance(hr, dict):
        ap = str(hr.get("api_path") or "hotreload").strip()
        return ap or "hotreload"
    return "hotreload"


def skynet_hotreload_action_field() -> str:
    hr = load_skynet_config().get("hotreload") or {}
    if isinstance(hr, dict):
        f = str(hr.get("action_field") or "action").strip()
        return f or "action"
    return "action"


def console_gateways_from_config() -> list[dict[str, str]]:
    """控制台「当前 Skynet 服务器」下拉：优先 servers 列表，否则单条 http_base + server_label。"""
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
            label = str(s.get("label") or "").strip() or f"服务器 {i + 1}"
            sid = s.get("id")
            gid = str(sid).strip() if sid is not None and str(sid).strip() != "" else str(i)
            out.append({"id": gid, "label": label, "url": url})
        if out:
            return out
    base = skynet_http_base()
    if not base:
        return []
    label = str(cfg.get("server_label") or _DEFAULTS.get("server_label") or "Skynet").strip() or "Skynet"
    return [{"id": "0", "label": label, "url": base}]
