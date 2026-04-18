"""Skynet HTTP 网关：DB 相关请求统一 POST 到单一入口（默认 /api/web/db/query）。

请求体用配置项 db_action_field（默认 action）区分：tables | columns | query。
"""

from __future__ import annotations

from typing import Any

import requests

from taskflow.config.skynet_settings import (
    skynet_api_prefix,
    skynet_db_action_field,
    skynet_db_api_path,
    skynet_hotreload_api_path,
    skynet_http_api_key,
    skynet_http_api_key_header,
    skynet_http_base,
    skynet_http_bearer,
    skynet_http_timeout_sec,
    skynet_http_verify_ssl,
)


def effective_skynet_base_url(gateway: dict[str, Any] | None) -> str | None:
    """优先使用网关自己的 url；否则使用配置文件中的 http_base（taskflow/config/skynet.json）。"""
    if not gateway:
        return None
    u = str(gateway.get("url") or "").strip()
    if u:
        return u.rstrip("/")
    base = skynet_http_base()
    return base.rstrip("/") if base else None


def _api_prefix() -> str:
    return skynet_api_prefix()


def build_skynet_web_url(base: str, *path_segments: str) -> str:
    """拼接为 {base}/{api_prefix 去斜杠}/{path_segments...}，例如 .../api/web/db/query。"""
    root = base.rstrip("/")
    prefix = _api_prefix().strip("/")
    tail = "/".join(s.strip("/") for s in path_segments if s)
    if tail:
        return f"{root}/{prefix}/{tail}"
    return f"{root}/{prefix}"


def _request_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/json", "Content-Type": "application/json"}
    bearer = skynet_http_bearer()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    key = skynet_http_api_key()
    key_header = skynet_http_api_key_header()
    if key and key_header:
        headers[key_header] = key
    return headers


def _verify_ssl() -> bool:
    return skynet_http_verify_ssl()


def _timeout_sec() -> float:
    return skynet_http_timeout_sec()


def skynet_post_json(url: str, *, json_body: dict[str, Any] | None = None) -> Any:
    r = requests.post(
        url,
        json=json_body or {},
        headers=_request_headers(),
        timeout=_timeout_sec(),
        verify=_verify_ssl(),
    )
    r.raise_for_status()
    if not r.content:
        return {}
    return r.json()


def _db_unified_url(base: str) -> str:
    path = skynet_db_api_path()
    parts = [p for p in path.split("/") if p]
    return build_skynet_web_url(base, *parts)


def _hotreload_unified_url(base: str) -> str:
    path = skynet_hotreload_api_path()
    parts = [p for p in path.split("/") if p]
    return build_skynet_web_url(base, *parts)


def post_hotreload(gateway: dict[str, Any], body: dict[str, Any]) -> Any:
    """热更新统一入口 POST，body 由调用方按 Skynet 约定组装（含 action）。"""
    base = effective_skynet_base_url(gateway)
    if not base:
        return None
    url = _hotreload_unified_url(base)
    return skynet_post_json(url, json_body=body)


def normalize_tables_response(raw: Any) -> tuple[list[dict[str, str]], str]:
    """统一为 [{name, comment}, ...]，message 为提示文案。"""
    message = ""
    tables_raw: Any = None
    if isinstance(raw, dict):
        message = str(raw.get("message") or raw.get("msg") or "")
        tables_raw = raw.get("tables") or raw.get("data") or raw.get("list") or raw.get("items")
    elif isinstance(raw, list):
        tables_raw = raw
    if tables_raw is None:
        return [], message or "服务器返回中未找到表列表字段"
    if not isinstance(tables_raw, list):
        return [], message or "表列表格式无效"

    out: list[dict[str, str]] = []
    for t in tables_raw:
        if isinstance(t, str):
            out.append({"name": t, "comment": ""})
            continue
        if isinstance(t, dict):
            name = t.get("name") or t.get("table") or t.get("Table") or t.get("tablename")
            if name:
                cmt = t.get("comment") or t.get("Comment") or t.get("remark") or ""
                out.append({"name": str(name), "comment": str(cmt) if cmt is not None else ""})
    return out, message


def normalize_columns_response(raw: Any) -> tuple[list[dict[str, str]], str]:
    message = ""
    cols_raw: Any = None
    if isinstance(raw, dict):
        message = str(raw.get("message") or raw.get("msg") or "")
        cols_raw = raw.get("columns") or raw.get("data") or raw.get("fields") or raw.get("list")
    elif isinstance(raw, list):
        cols_raw = raw
    if cols_raw is None:
        return [], message or "服务器返回中未找到字段列表"
    if not isinstance(cols_raw, list):
        return [], message or "字段列表格式无效"

    out: list[dict[str, str]] = []
    for c in cols_raw:
        if isinstance(c, str):
            out.append({"name": c, "type": ""})
        elif isinstance(c, dict):
            name = c.get("name") or c.get("field") or c.get("Field") or c.get("column")
            if name:
                typ = c.get("type") or c.get("Type") or c.get("data_type") or ""
                out.append({"name": str(name), "type": str(typ) if typ is not None else ""})
    return out, message


def normalize_query_response(raw: Any) -> tuple[list[str], list[list[Any]], str]:
    """columns: 列名列表；rows: 行数据（与前端一致为二维数组）。"""
    message = ""
    if not isinstance(raw, dict):
        return [], [], "查询返回格式无效"

    message = str(raw.get("message") or raw.get("msg") or "")
    if "error" in raw and raw.get("error"):
        return [], [], str(raw.get("error"))

    inner = raw
    if "data" in raw and isinstance(raw["data"], dict):
        inner = raw["data"]

    cols = inner.get("columns")
    rows = inner.get("rows")
    if cols is None:
        cols = inner.get("column_names") or inner.get("fields")
    if rows is None:
        rows = inner.get("data") or inner.get("records")

    if cols is not None and not isinstance(cols, list):
        return [], [], message or "columns 格式无效"
    if rows is not None and not isinstance(rows, list):
        return [], [], message or "rows 格式无效"

    col_names: list[str] = []
    if cols:
        for c in cols:
            if isinstance(c, str):
                col_names.append(c)
            elif isinstance(c, dict):
                n = c.get("name") or c.get("field")
                if n:
                    col_names.append(str(n))

    row_matrix: list[list[Any]] = []
    if rows:
        for row in rows:
            if isinstance(row, dict) and not col_names:
                col_names = list(row.keys())
                break
        for row in rows:
            if isinstance(row, dict):
                row_matrix.append([row.get(k) for k in col_names])
            elif isinstance(row, (list, tuple)):
                row_matrix.append(list(row))

    return col_names, row_matrix, message


def fetch_db_tables(gateway: dict[str, Any]) -> tuple[list[dict[str, str]], str]:
    base = effective_skynet_base_url(gateway)
    if not base:
        return [], ""
    url = _db_unified_url(base)
    field = skynet_db_action_field()
    raw = skynet_post_json(url, json_body={field: "tables"})
    return normalize_tables_response(raw)


def fetch_db_columns(gateway: dict[str, Any], table: str) -> tuple[list[dict[str, str]], str]:
    base = effective_skynet_base_url(gateway)
    if not base:
        return [], ""
    url = _db_unified_url(base)
    field = skynet_db_action_field()
    raw = skynet_post_json(url, json_body={field: "columns", "table": table})
    return normalize_columns_response(raw)


def post_db_query(gateway: dict[str, Any], body: dict[str, Any]) -> tuple[list[str], list[list[Any]], str, str | None]:
    """返回 columns, rows, message, error（业务错误时 error 非空）。"""
    base = effective_skynet_base_url(gateway)
    if not base:
        return [], [], "", "未配置服务器 HTTP 地址"
    url = _db_unified_url(base)
    field = skynet_db_action_field()
    raw = skynet_post_json(url, json_body={**body, field: "query"})
    cols, rows, msg = normalize_query_response(raw)
    err = None
    if isinstance(raw, dict) and raw.get("error"):
        err = str(raw.get("error"))
    return cols, rows, msg, err
