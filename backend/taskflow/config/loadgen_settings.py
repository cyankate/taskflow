"""Loadgen agent 配置（taskflow/config/loadgen.json）。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_PATH = Path(__file__).resolve().parent / "loadgen.json"
_cache: dict[str, Any] | None = None


def load_loadgen_config() -> dict[str, Any]:
    global _cache
    if _cache is not None:
        return _cache
    if not _CONFIG_PATH.is_file():
        _cache = {}
        return _cache
    try:
        raw = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        _cache = {}
        return _cache
    _cache = raw if isinstance(raw, dict) else {}
    return _cache


def loadgen_agent_url() -> str:
    return str(load_loadgen_config().get("agent_url") or "").strip()
