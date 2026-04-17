from __future__ import annotations

import base64
import binascii
import json
import os
import re
import time
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from sqlalchemy import and_, func, or_
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from taskflow.constants import BUG_SUB_TYPES, DEMAND_SUB_TYPES, POSITIONS, PRIORITIES, TICKET_STATUS, TICKET_TYPES
from taskflow.extensions import db
from taskflow.models import (
    Comment,
    CommentReply,
    Project,
    ProjectVersion,
    Ticket,
    TicketChecklistItem,
    TicketHistory,
    User,
    UserNotification,
    WikiArticle,
    WikiCategory,
    ticket_assignees,
)
from taskflow.services.auth_service import auth_required, generate_token
from taskflow.services.analytics_service import (
    build_progress_overview,
    build_risk_alerts,
    build_workload,
    build_workload_density,
    get_filtered_tickets,
    resolve_scope,
)
from taskflow.services.ticket_service import (
    apply_flow_action,
    create_history,
    get_available_flow_actions,
    normalize_role_ids,
    resolve_initial_flow,
    validate_ticket_payload,
)
from taskflow.utils.datetime_utils import now_utc, parse_iso

api_bp = Blueprint("api", __name__, url_prefix="/api")

MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024
MAX_ATTACHMENT_COUNT = 50
MEDIA_MIME_PREFIXES = ("image/", "video/")
MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".mp4", ".webm", ".mov", ".m4v"}
DOC_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}
DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"}
RATE_LIMIT_LOGIN_COUNT = 10
RATE_LIMIT_UPLOAD_COUNT = 20
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_STORE: dict[str, list[float]] = {}
UPLOAD_API_PREFIX = "/api/uploads/"


def _log_security_event(event: str, detail: str, level: str = "warning") -> None:
    user_id = getattr(getattr(request, "current_user", None), "id", None)
    log_fn = getattr(current_app.logger, level, current_app.logger.warning)
    log_fn(
        "[SECURITY] %s | user_id=%s | ip=%s | path=%s | detail=%s",
        event,
        user_id if user_id is not None else "anonymous",
        request.remote_addr or "unknown",
        request.path,
        detail,
    )


def _to_utc_naive(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(now_utc().tzinfo).replace(tzinfo=None)


def _push_user_notification(user_id: int, kind: str, title: str, body: str, ticket_id: int | None) -> None:
    note = UserNotification(
        user_id=user_id,
        kind=kind,
        title=title[:255],
        body=body or "",
        ticket_id=ticket_id,
    )
    db.session.add(note)


def _notify_ticket_watchers(ticket: Ticket, actor_user_id: int, kind: str, title: str, body: str = "") -> None:
    for watcher in ticket.watchers:
        if watcher.id == actor_user_id:
            continue
        _push_user_notification(watcher.id, kind, title, body or ticket.title[:200], ticket.id)


def _resolve_mention_user_ids(raw_mentions: Any) -> set[int]:
    mention_raw = raw_mentions if isinstance(raw_mentions, list) else []
    mention_ids: set[int] = set()
    for item in mention_raw:
        try:
            mention_ids.add(int(item))
        except (TypeError, ValueError):
            continue
    if not mention_ids:
        return set()
    valid_users = User.query.filter(User.id.in_(mention_ids)).all()
    return {u.id for u in valid_users}


def _resolve_ticket_links(
    ticket_type: str,
    parent_task_id_raw: Any,
    related_task_id_raw: Any,
    current_ticket_id: int | None = None,
) -> tuple[int | None, int | None, str | None]:
    def _to_int_or_none(value: Any) -> int | None:
        if value in (None, "", 0, "0"):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    parent_task_id = _to_int_or_none(parent_task_id_raw)
    related_task_id = _to_int_or_none(related_task_id_raw)

    if ticket_type == "BUG单" and parent_task_id is not None:
        return None, None, "BUG单不能设置父任务"
    if ticket_type != "BUG单" and related_task_id is not None:
        return None, None, "仅BUG单可设置关联任务单"

    if parent_task_id is not None:
        parent_ticket = db.session.get(Ticket, parent_task_id)
        if not parent_ticket:
            return None, None, "父任务不存在"
        if parent_ticket.ticket_type == "BUG单":
            return None, None, "父任务必须是任务单"
        if current_ticket_id and parent_ticket.id == current_ticket_id:
            return None, None, "父任务不能是自己"

    if related_task_id is not None:
        related_ticket = db.session.get(Ticket, related_task_id)
        if not related_ticket:
            return None, None, "关联任务单不存在"
        if related_ticket.ticket_type == "BUG单":
            return None, None, "关联对象必须是任务单"
        if current_ticket_id and related_ticket.id == current_ticket_id:
            return None, None, "关联任务单不能是自己"

    return parent_task_id, related_task_id, None


def _validate_flow_role_users(ticket_type: str, sub_type: str, role_ids: dict[str, int | None]) -> str | None:
    executor_id = role_ids.get("executor_id")
    planner_id = role_ids.get("planner_id")
    tester_id = role_ids.get("tester_id")

    role_user_ids = [uid for uid in {executor_id, planner_id, tester_id} if uid]
    users_by_id = {user.id: user for user in User.query.filter(User.id.in_(role_user_ids)).all()} if role_user_ids else {}
    if executor_id and executor_id not in users_by_id:
        return "执行负责人不存在"
    if planner_id and planner_id not in users_by_id:
        return "策划负责人不存在"
    if tester_id and tester_id not in users_by_id:
        return "测试负责人不存在"

    planner_user = users_by_id.get(planner_id) if planner_id else None
    tester_user = users_by_id.get(tester_id) if tester_id else None
    executor_user = users_by_id.get(executor_id) if executor_id else None

    if planner_user and planner_user.position != "策划":
        return "策划负责人必须是策划岗位"
    if tester_user and tester_user.position != "测试":
        return "测试负责人必须是测试岗位"
    if ticket_type == "需求单" and sub_type == "程序需求":
        if executor_user and executor_user.position not in {"前端程序", "后端程序"}:
            return "程序需求的执行负责人必须是程序岗位"
    if ticket_type == "需求单" and sub_type == "美术需求":
        if executor_user and executor_user.position != "美术":
            return "美术需求的执行负责人必须是美术岗位"
    if ticket_type == "需求单" and sub_type == "策划需求":
        if executor_user and executor_user.position != "策划":
            return "策划需求的执行负责人必须是策划岗位"
    return None


def _resolve_wiki_category(category_name: str | None) -> WikiCategory | None:
    name = (category_name or "").strip()
    if not name:
        return None
    category = WikiCategory.query.filter_by(name=name).first()
    if category:
        return category
    category = WikiCategory(name=name)
    db.session.add(category)
    db.session.flush()
    return category


def _estimate_data_url_size(data_url: str) -> int:
    if not data_url.startswith("data:"):
        return 0
    comma_index = data_url.find(",")
    if comma_index < 0:
        return 0
    base64_data = data_url[comma_index + 1 :]
    if not base64_data:
        return 0
    padding = 0
    if base64_data.endswith("=="):
        padding = 2
    elif base64_data.endswith("="):
        padding = 1
    return max(0, (len(base64_data) * 3) // 4 - padding)


def _decode_data_url(data_url: str) -> tuple[str, bytes] | tuple[None, None]:
    if not data_url.startswith("data:"):
        return None, None
    comma_index = data_url.find(",")
    if comma_index < 0:
        return None, None
    meta = data_url[5:comma_index]
    mime_type = meta.split(";")[0].strip().lower()
    if ";base64" not in meta.lower():
        return None, None
    payload = data_url[comma_index + 1 :]
    if not payload:
        return mime_type, b""
    try:
        return mime_type, base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        return None, None


def _is_ascii_text(data: bytes) -> bool:
    if not data:
        return True
    if b"\x00" in data:
        return False
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def _is_magic_signature_valid(mime_type: str, data: bytes) -> bool:
    mime_type = (mime_type or "").strip().lower()
    if not data:
        return False
    signature_checks = {
        "image/jpeg": lambda raw: raw.startswith(b"\xff\xd8\xff"),
        "image/png": lambda raw: raw.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/gif": lambda raw: raw.startswith((b"GIF87a", b"GIF89a")),
        "image/webp": lambda raw: raw.startswith(b"RIFF") and raw[8:12] == b"WEBP",
        "image/bmp": lambda raw: raw.startswith(b"BM"),
        "video/webm": lambda raw: raw.startswith(b"\x1a\x45\xdf\xa3"),
        "video/mp4": lambda raw: len(raw) > 12 and raw[4:8] == b"ftyp",
        "video/quicktime": lambda raw: len(raw) > 12 and raw[4:8] == b"ftyp",
        "application/pdf": lambda raw: raw.startswith(b"%PDF-"),
        "application/msword": lambda raw: raw.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        "application/vnd.ms-excel": lambda raw: raw.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": lambda raw: raw.startswith(
            b"PK\x03\x04"
        ),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": lambda raw: raw.startswith(b"PK\x03\x04"),
        "text/plain": _is_ascii_text,
    }
    checker = signature_checks.get(mime_type)
    if checker:
        return checker(data)
    if mime_type.startswith("image/"):
        return any(
            checks(data)
            for checks in (
                signature_checks["image/jpeg"],
                signature_checks["image/png"],
                signature_checks["image/gif"],
                signature_checks["image/webp"],
                signature_checks["image/bmp"],
            )
        )
    if mime_type.startswith("video/"):
        return signature_checks["video/webm"](data) or signature_checks["video/mp4"](data)
    return False


def _is_rate_limited(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    now_ts = time.time()
    valid_after = now_ts - window_seconds
    records = RATE_LIMIT_STORE.get(key, [])
    records = [value for value in records if value > valid_after]
    if len(records) >= limit:
        retry_after = int(records[0] + window_seconds - now_ts) + 1
        RATE_LIMIT_STORE[key] = records
        return True, max(retry_after, 1)
    records.append(now_ts)
    RATE_LIMIT_STORE[key] = records
    return False, 0


def _enforce_rate_limit(scope: str, limit: int) -> tuple[bool, tuple[Any, int] | None]:
    identity = str(getattr(getattr(request, "current_user", None), "id", "") or request.remote_addr or "unknown")
    rate_key = f"{scope}:{identity}"
    limited, retry_after = _is_rate_limited(rate_key, limit=limit, window_seconds=RATE_LIMIT_WINDOW_SECONDS)
    if limited:
        _log_security_event("RATE_LIMIT_BLOCKED", f"scope={scope}, limit={limit}, retry_after={retry_after}s")
        return False, (
            jsonify({"message": f"请求过于频繁，请 {retry_after} 秒后重试"}),
            429,
        )
    return True, None


def _upload_root_path() -> Path:
    upload_dir = Path(current_app.instance_path) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def _is_internal_upload_url(url: str) -> bool:
    return isinstance(url, str) and url.startswith(UPLOAD_API_PREFIX)


def _resolve_internal_upload_path(url: str) -> Path | None:
    if not _is_internal_upload_url(url):
        return None
    relative = url[len(UPLOAD_API_PREFIX) :].strip("/")
    if not relative:
        return None
    target = (_upload_root_path() / relative).resolve()
    root = _upload_root_path().resolve()
    if os.path.commonpath([str(root), str(target)]) != str(root):
        return None
    return target


def _guess_extension(mime_type: str, file_name: str) -> str:
    lowered_name = (file_name or "").strip().lower()
    if "." in lowered_name:
        ext = "." + lowered_name.rsplit(".", 1)[1]
        if ext:
            return ext
    mime_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "application/pdf": ".pdf",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.ms-excel": ".xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "text/plain": ".txt",
    }
    return mime_map.get((mime_type or "").strip().lower(), ".bin")


def _store_upload_bytes(
    *,
    payload_bytes: bytes,
    mime_type: str,
    file_name: str,
    upload_scope: str,
) -> dict[str, Any]:
    safe_scope = secure_filename(upload_scope or "general") or "general"
    safe_name = secure_filename(file_name or "") or "file"
    ext = _guess_extension(mime_type, safe_name)
    if "." not in safe_name:
        safe_name = f"{safe_name}{ext}"
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    folder = _upload_root_path() / safe_scope
    folder.mkdir(parents=True, exist_ok=True)
    target_path = folder / unique_name
    target_path.write_bytes(payload_bytes)
    relative = f"{safe_scope}/{unique_name}"
    return {
        "name": file_name or safe_name,
        "type": mime_type,
        "url": f"{UPLOAD_API_PREFIX}{relative}",
        "size": len(payload_bytes),
    }


def _normalize_and_persist_attachments(
    attachments: Any,
    *,
    allow_documents: bool,
    upload_scope: str,
) -> tuple[list[dict[str, Any]], str]:
    is_valid_attachment, attachment_message = _validate_attachments_payload(attachments, allow_documents=allow_documents)
    if not is_valid_attachment:
        return [], attachment_message
    normalized: list[dict[str, Any]] = []
    for item in attachments or []:
        name = str(item.get("name", "")).strip()
        attachment_type = str(item.get("type", "")).strip().lower()
        url = str(item.get("url", "")).strip()
        if url.startswith("data:"):
            parsed_type, payload_bytes = _decode_data_url(url)
            if parsed_type is None:
                return [], "附件编码无效"
            upload_item = _store_upload_bytes(
                payload_bytes=payload_bytes,
                mime_type=attachment_type or parsed_type,
                file_name=name,
                upload_scope=upload_scope,
            )
            normalized.append(upload_item)
            continue
        if _is_internal_upload_url(url):
            existing = _resolve_internal_upload_path(url)
            if not existing or not existing.exists():
                return [], "附件资源不存在，请重新上传"
            normalized.append({"name": name, "type": attachment_type, "url": url})
            continue
        normalized.append({"name": name, "type": attachment_type, "url": url})
    return normalized, ""


def _persist_inline_media_in_html(content: str, *, upload_scope: str) -> tuple[str, str]:
    html = str(content or "")
    if not html:
        return "", ""

    def _replace(match: re.Match[str]) -> str:
        quote = match.group("quote")
        data_url = match.group("data")
        if _estimate_data_url_size(data_url) > MAX_ATTACHMENT_SIZE_BYTES:
            raise ValueError("单个附件不能超过 20MB")
        parsed_type, payload_bytes = _decode_data_url(data_url)
        if parsed_type is None:
            raise ValueError("媒体编码无效")
        if not any(parsed_type.startswith(prefix) for prefix in MEDIA_MIME_PREFIXES):
            raise ValueError("Wiki 内嵌媒体仅支持图片和视频")
        if not _is_magic_signature_valid(parsed_type, payload_bytes):
            raise ValueError("媒体内容与类型不匹配")
        stored = _store_upload_bytes(
            payload_bytes=payload_bytes,
            mime_type=parsed_type,
            file_name=f"inline{_guess_extension(parsed_type, '')}",
            upload_scope=upload_scope,
        )
        return f'src={quote}{stored["url"]}{quote}'

    try:
        updated = re.sub(r"src=(?P<quote>[\"'])(?P<data>data:[^\"']+)(?P=quote)", _replace, html)
    except ValueError as exc:
        return html, str(exc)
    return updated, ""


def _validate_attachments_payload(attachments: Any, allow_documents: bool = False) -> tuple[bool, str]:
    if attachments is None:
        return True, ""
    if not isinstance(attachments, list):
        _log_security_event("UPLOAD_REJECTED", "attachments_not_list")
        return False, "附件格式不合法"
    if len(attachments) > MAX_ATTACHMENT_COUNT:
        _log_security_event("UPLOAD_REJECTED", f"attachments_count_exceeded count={len(attachments)}")
        return False, f"附件数量不能超过 {MAX_ATTACHMENT_COUNT} 个"

    for item in attachments:
        if not isinstance(item, dict):
            _log_security_event("UPLOAD_REJECTED", "attachment_item_not_object")
            return False, "附件项格式不合法"

        url = str(item.get("url", "")).strip()
        if not url:
            _log_security_event("UPLOAD_REJECTED", "attachment_url_missing")
            return False, "附件缺少 URL"

        attachment_type = str(item.get("type", "")).strip().lower()
        file_name = str(item.get("name", "")).strip().lower()

        if url.startswith("data:"):
            mime_end = url.find(";")
            if mime_end > 5:
                inferred_type = url[5:mime_end].strip().lower()
                if not attachment_type:
                    attachment_type = inferred_type
            if _estimate_data_url_size(url) > MAX_ATTACHMENT_SIZE_BYTES:
                _log_security_event("UPLOAD_REJECTED", f"attachment_oversize name={file_name or 'unknown'}")
                return False, "单个附件不能超过 20MB"
            parsed_type, payload_bytes = _decode_data_url(url)
            if parsed_type is None:
                _log_security_event("UPLOAD_REJECTED", "attachment_data_url_decode_failed")
                return False, "附件编码无效"
            # Trust explicit attachment type first; fallback to parsed MIME type.
            check_type = attachment_type or parsed_type
            if not _is_magic_signature_valid(check_type, payload_bytes):
                _log_security_event(
                    "UPLOAD_REJECTED",
                    f"attachment_magic_mismatch type={check_type or 'unknown'}, name={file_name or 'unknown'}",
                )
                return False, "附件内容与类型不匹配"
        elif _is_internal_upload_url(url):
            internal_path = _resolve_internal_upload_path(url)
            if not internal_path or not internal_path.exists():
                _log_security_event("UPLOAD_REJECTED", "attachment_internal_url_missing")
                return False, "附件资源不存在，请重新上传"
        elif not (url.startswith("http://") or url.startswith("https://")):
            _log_security_event("UPLOAD_REJECTED", "attachment_url_scheme_invalid")
            return False, "附件 URL 仅支持 data/http/https 或系统上传地址"

        is_media = any(attachment_type.startswith(prefix) for prefix in MEDIA_MIME_PREFIXES)
        is_doc = allow_documents and attachment_type in DOC_MIME_TYPES
        if not (is_media or is_doc):
            _log_security_event(
                "UPLOAD_REJECTED",
                f"attachment_type_invalid type={attachment_type or 'unknown'}, allow_documents={allow_documents}",
            )
            return False, "附件类型仅支持图片、视频" if not allow_documents else "附件类型不在允许范围内"

        if file_name and "." in file_name:
            ext = "." + file_name.rsplit(".", 1)[1]
            if is_media and ext not in MEDIA_EXTENSIONS:
                _log_security_event("UPLOAD_REJECTED", f"attachment_ext_invalid ext={ext}, media=true")
                return False, "附件扩展名不在允许范围内"
            if is_doc and ext not in DOC_EXTENSIONS:
                _log_security_event("UPLOAD_REJECTED", f"attachment_ext_invalid ext={ext}, document=true")
                return False, "附件扩展名不在允许范围内"

    return True, ""


@api_bp.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@api_bp.get("/uploads/<path:file_path>")
def serve_upload(file_path: str) -> Any:
    safe_path = file_path.strip("/").replace("\\", "/")
    target = (_upload_root_path() / safe_path).resolve()
    root = _upload_root_path().resolve()
    if os.path.commonpath([str(root), str(target)]) != str(root) or not target.exists():
        return jsonify({"message": "文件不存在"}), 404
    return send_from_directory(root, safe_path)


@api_bp.post("/uploads")
@auth_required()
def upload_attachment() -> Any:
    passed, limited_response = _enforce_rate_limit("direct_upload", RATE_LIMIT_UPLOAD_COUNT)
    if not passed:
        return limited_response

    file = request.files.get("file")
    if not file:
        return jsonify({"message": "缺少上传文件"}), 400
    raw_name = (file.filename or "").strip() or "file"
    mime_type = (file.mimetype or "").strip().lower()
    payload_bytes = file.read()
    if not payload_bytes:
        return jsonify({"message": "上传文件为空"}), 400
    if len(payload_bytes) > MAX_ATTACHMENT_SIZE_BYTES:
        return jsonify({"message": "单个附件不能超过 20MB"}), 400

    allow_documents = str(request.args.get("allow_documents", "0")).strip() == "1"
    is_media = any(mime_type.startswith(prefix) for prefix in MEDIA_MIME_PREFIXES)
    is_doc = allow_documents and mime_type in DOC_MIME_TYPES
    if not (is_media or is_doc):
        return jsonify({"message": "附件类型不在允许范围内"}), 400
    if not _is_magic_signature_valid(mime_type, payload_bytes):
        return jsonify({"message": "附件内容与类型不匹配"}), 400

    upload_scope = str(request.args.get("scope", "general")).strip() or "general"
    stored = _store_upload_bytes(
        payload_bytes=payload_bytes,
        mime_type=mime_type,
        file_name=raw_name,
        upload_scope=upload_scope,
    )
    return jsonify(stored), 201


@api_bp.post("/auth/login")
def login() -> Any:
    passed, limited_response = _enforce_rate_limit("login", RATE_LIMIT_LOGIN_COUNT)
    if not passed:
        return limited_response
    payload = request.get_json(silent=True) or {}
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password):
        _log_security_event("LOGIN_FAILED", f"username={username or 'empty'}")
        return jsonify({"message": "用户名或密码错误"}), 400
    _log_security_event("LOGIN_SUCCESS", f"user_id={user.id}", level="info")
    return jsonify({"token": generate_token(user), "user": user.to_dict()})


@api_bp.get("/meta")
@auth_required()
def meta() -> Any:
    return jsonify(
        {
            "positions": POSITIONS,
            "ticket_types": TICKET_TYPES,
            "demand_sub_types": DEMAND_SUB_TYPES,
            "bug_sub_types": BUG_SUB_TYPES,
            "ticket_status": TICKET_STATUS,
            "priorities": PRIORITIES,
        }
    )


@api_bp.get("/users")
@auth_required()
def list_users() -> Any:
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([user.to_dict() for user in users])


@api_bp.post("/users")
@auth_required(admin_only=True)
def create_user() -> Any:
    payload = request.get_json(silent=True) or {}
    username = payload.get("username", "").strip()
    display_name = payload.get("display_name", "").strip() or username
    password = payload.get("password", "")
    position = payload.get("position", "")
    is_admin = bool(payload.get("is_admin", False))

    if not username or not password:
        return jsonify({"message": "用户名和密码不能为空"}), 400
    if position not in POSITIONS:
        return jsonify({"message": "岗位不合法"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"message": "用户名已存在"}), 400

    user = User(
        username=username,
        display_name=display_name,
        password_hash=generate_password_hash(password),
        position=position,
        is_admin=is_admin,
    )
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201


@api_bp.put("/users/<int:user_id>")
@auth_required(admin_only=True)
def update_user(user_id: int) -> Any:
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "用户不存在"}), 404

    payload = request.get_json(silent=True) or {}
    position = payload.get("position", user.position)
    if position not in POSITIONS:
        return jsonify({"message": "岗位不合法"}), 400

    user.display_name = payload.get("display_name", user.display_name).strip() or user.display_name
    user.position = position
    user.is_admin = bool(payload.get("is_admin", user.is_admin))

    password = payload.get("password", "").strip()
    if password:
        user.password_hash = generate_password_hash(password)
    db.session.commit()
    return jsonify(user.to_dict())


@api_bp.delete("/users/<int:user_id>")
@auth_required(admin_only=True)
def delete_user(user_id: int) -> Any:
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "用户不存在"}), 404
    if user.username == "admin":
        return jsonify({"message": "默认管理员不可删除"}), 400
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "删除成功"})


@api_bp.get("/projects")
@auth_required()
def list_projects() -> Any:
    projects = Project.query.order_by(Project.created_at.desc()).all()
    return jsonify([project.to_dict() for project in projects])


@api_bp.post("/projects")
@auth_required(admin_only=True)
def create_project() -> Any:
    payload = request.get_json(silent=True) or {}
    name = payload.get("name", "").strip()
    description = payload.get("description", "").strip()
    if not name:
        return jsonify({"message": "项目名称不能为空"}), 400
    if Project.query.filter_by(name=name).first():
        return jsonify({"message": "项目名称重复"}), 400

    project = Project(name=name, description=description)
    db.session.add(project)
    db.session.commit()
    return jsonify(project.to_dict()), 201


@api_bp.put("/projects/<int:project_id>")
@auth_required(admin_only=True)
def update_project(project_id: int) -> Any:
    project = db.session.get(Project, project_id)
    if not project:
        return jsonify({"message": "项目不存在"}), 404

    payload = request.get_json(silent=True) or {}
    name = payload.get("name", project.name).strip()
    if not name:
        return jsonify({"message": "项目名称不能为空"}), 400
    existing = Project.query.filter(and_(Project.id != project.id, Project.name == name)).first()
    if existing:
        return jsonify({"message": "项目名称重复"}), 400

    project.name = name
    project.description = payload.get("description", project.description).strip()
    db.session.commit()
    return jsonify(project.to_dict())


@api_bp.delete("/projects/<int:project_id>")
@auth_required(admin_only=True)
def delete_project(project_id: int) -> Any:
    project = db.session.get(Project, project_id)
    if not project:
        return jsonify({"message": "项目不存在"}), 404
    if project.tickets:
        return jsonify({"message": "项目下存在工单，无法删除"}), 400
    db.session.delete(project)
    db.session.commit()
    return jsonify({"message": "删除成功"})


@api_bp.post("/projects/<int:project_id>/set-default")
@auth_required(admin_only=True)
def set_default_project(project_id: int) -> Any:
    project = db.session.get(Project, project_id)
    if not project:
        return jsonify({"message": "项目不存在"}), 404
    Project.query.update({"is_default": False})
    project.is_default = True
    db.session.commit()
    return jsonify(project.to_dict())


@api_bp.get("/projects/<int:project_id>/versions")
@auth_required()
def list_project_versions(project_id: int) -> Any:
    project = db.session.get(Project, project_id)
    if not project:
        return jsonify({"message": "项目不存在"}), 404
    versions = ProjectVersion.query.filter_by(project_id=project_id).order_by(ProjectVersion.created_at.desc()).all()
    return jsonify([version.to_dict() for version in versions])


@api_bp.post("/projects/<int:project_id>/versions")
@auth_required(admin_only=True)
def create_project_version(project_id: int) -> Any:
    project = db.session.get(Project, project_id)
    if not project:
        return jsonify({"message": "项目不存在"}), 404
    payload = request.get_json(silent=True) or {}
    name = payload.get("name", "").strip()
    description = payload.get("description", "").strip()
    if not name:
        return jsonify({"message": "版本名称不能为空"}), 400
    exists = ProjectVersion.query.filter_by(project_id=project_id, name=name).first()
    if exists:
        return jsonify({"message": "版本名称重复"}), 400
    version = ProjectVersion(project_id=project_id, name=name, description=description)
    db.session.add(version)
    db.session.commit()
    return jsonify(version.to_dict()), 201


@api_bp.delete("/versions/<int:version_id>")
@auth_required(admin_only=True)
def delete_project_version(version_id: int) -> Any:
    version = db.session.get(ProjectVersion, version_id)
    if not version:
        return jsonify({"message": "版本不存在"}), 404
    ticket_count = Ticket.query.filter_by(version_id=version_id).count()
    if ticket_count > 0:
        return jsonify({"message": "版本下存在工单，无法删除"}), 400
    db.session.delete(version)
    db.session.commit()
    return jsonify({"message": "删除成功"})


@api_bp.get("/project-hub")
@auth_required()
def project_hub() -> Any:
    project_id = request.args.get("project_id", type=int)
    all_projects = Project.query.order_by(Project.created_at.desc()).all()
    project_cards = []

    for project in all_projects:
        project_tickets = Ticket.query.filter(Ticket.project_id == project.id).all()
        project_cards.append(
            {
                **project.to_dict(),
                "total_tickets": len(project_tickets),
                "pending_tickets": len(
                    [ticket for ticket in project_tickets if ticket.status in {"待处理", "待验收", "待测试"}]
                ),
                "completed_tickets": len([ticket for ticket in project_tickets if ticket.status == "已完成"]),
                "bug_tickets": len([ticket for ticket in project_tickets if ticket.ticket_type == "BUG单"]),
            }
        )

    selected_project = None
    if project_id:
        selected_project = db.session.get(Project, project_id)
        if not selected_project:
            return jsonify({"message": "项目不存在"}), 404
    elif all_projects:
        selected_project = next((item for item in all_projects if item.is_default), all_projects[0])

    if not selected_project:
        return jsonify(
            {
                "projects": [],
                "selected_project": None,
                "summary": {"total_tickets": 0, "pending_tickets": 0, "completed_tickets": 0, "bug_tickets": 0},
                "recent_tickets": [],
                "dynamics": [],
            }
        )

    selected_tickets = (
        Ticket.query.filter(Ticket.project_id == selected_project.id).order_by(Ticket.updated_at.desc()).all()
    )
    selected_versions = (
        ProjectVersion.query.filter(ProjectVersion.project_id == selected_project.id)
        .order_by(ProjectVersion.created_at.desc())
        .all()
    )
    selected_histories = (
        TicketHistory.query.join(Ticket, TicketHistory.ticket_id == Ticket.id)
        .filter(Ticket.project_id == selected_project.id)
        .order_by(TicketHistory.created_at.desc())
        .limit(20)
        .all()
    )

    return jsonify(
        {
            "projects": project_cards,
            "selected_project": selected_project.to_dict(),
            "summary": {
                "total_tickets": len(selected_tickets),
                "pending_tickets": len(
                    [ticket for ticket in selected_tickets if ticket.status in {"待处理", "待验收", "待测试"}]
                ),
                "completed_tickets": len([ticket for ticket in selected_tickets if ticket.status == "已完成"]),
                "bug_tickets": len([ticket for ticket in selected_tickets if ticket.ticket_type == "BUG单"]),
            },
            "versions": [version.to_dict() for version in selected_versions],
            "recent_tickets": [ticket.to_dict() for ticket in selected_tickets[:10]],
            "dynamics": [
                {
                    "id": history.id,
                    "ticket_id": history.ticket_id,
                    "ticket_title": history.ticket.title if history.ticket else "未知工单",
                    "summary": history.summary,
                    "editor_name": history.editor.display_name if history.editor else "系统",
                    "created_at": history.created_at.isoformat(),
                }
                for history in selected_histories
            ],
        }
    )


@api_bp.get("/tickets")
@auth_required()
def list_tickets() -> Any:
    query = Ticket.query
    project_id = request.args.get("project_id")
    status = request.args.get("status")
    ticket_type = request.args.get("ticket_type")
    priority = request.args.get("priority")
    version_id = request.args.get("version_id")
    assignee_id = request.args.get("assignee_id")
    start_from = request.args.get("start_from")
    end_to = request.args.get("end_to")
    keyword = (request.args.get("keyword") or "").strip()

    if project_id:
        query = query.filter(Ticket.project_id == int(project_id))
    if status:
        query = query.filter(Ticket.status == status)
    if ticket_type:
        query = query.filter(Ticket.ticket_type == ticket_type)
    if priority:
        query = query.filter(Ticket.priority == priority)
    if version_id:
        query = query.filter(Ticket.version_id == int(version_id))
    if assignee_id:
        query = query.join(ticket_assignees).filter(ticket_assignees.c.user_id == int(assignee_id))
    if start_from:
        query = query.filter(Ticket.start_time >= parse_iso(start_from))
    if end_to:
        query = query.filter(Ticket.end_time <= parse_iso(end_to))
    if keyword:
        like_keyword = f"%{keyword}%"
        query = query.filter(
            or_(
                Ticket.title.ilike(like_keyword),
                Ticket.description.ilike(like_keyword),
                Ticket.module.ilike(like_keyword),
                Ticket.sub_type.ilike(like_keyword),
                Ticket.ticket_type.ilike(like_keyword),
            )
        )

    view_mode = (request.args.get("view_mode") or "").strip()
    if view_mode == "current":
        query = query.filter(Ticket.current_owner_id == request.current_user.id)
    elif view_mode == "created":
        query = query.filter(Ticket.creator_id == request.current_user.id)
    tickets = query.order_by(Ticket.updated_at.desc()).all()
    result = []
    for ticket in tickets:
        item = ticket.to_dict(current_user_id=request.current_user.id)
        item["available_actions"] = get_available_flow_actions(ticket, request.current_user.id)
        result.append(item)
    return jsonify(result)


@api_bp.post("/tickets")
@auth_required()
def create_ticket() -> Any:
    payload = request.get_json(silent=True) or {}
    valid, message = validate_ticket_payload(payload)
    if not valid:
        return jsonify({"message": message}), 400

    start_time_raw = payload.get("start_time")
    end_time_raw = payload.get("end_time")
    start_time = parse_iso(start_time_raw) if start_time_raw not in (None, "") else now_utc()
    end_time = parse_iso(end_time_raw) if end_time_raw not in (None, "") else start_time + timedelta(days=7)
    if end_time < start_time:
        return jsonify({"message": "结束时间不能早于开始时间"}), 400

    project = db.session.get(Project, int(payload["project_id"]))
    if not project:
        return jsonify({"message": "项目不存在"}), 404
    version = db.session.get(ProjectVersion, int(payload["version_id"]))
    if not version or version.project_id != project.id:
        return jsonify({"message": "版本不存在或不属于该项目"}), 400
    parent_task_id, related_task_id, link_error = _resolve_ticket_links(
        payload["ticket_type"],
        payload.get("parent_task_id"),
        payload.get("related_task_id"),
    )
    if link_error:
        return jsonify({"message": link_error}), 400
    if parent_task_id:
        parent_ticket = db.session.get(Ticket, parent_task_id)
        if parent_ticket and parent_ticket.project_id != project.id:
            return jsonify({"message": "父任务必须属于同一项目"}), 400
    if related_task_id:
        related_ticket = db.session.get(Ticket, related_task_id)
        if related_ticket and related_ticket.project_id != project.id:
            return jsonify({"message": "关联任务单必须属于同一项目"}), 400

    attachments = payload.get("attachments", [])
    if attachments:
        passed, limited_response = _enforce_rate_limit("ticket_upload", RATE_LIMIT_UPLOAD_COUNT)
        if not passed:
            return limited_response
    normalized_attachments, attachment_message = _normalize_and_persist_attachments(
        attachments,
        allow_documents=False,
        upload_scope="ticket",
    )
    if attachment_message:
        return jsonify({"message": attachment_message}), 400

    role_ids = normalize_role_ids(payload)
    role_error = _validate_flow_role_users(payload["ticket_type"], payload.get("sub_type", ""), role_ids)
    if role_error:
        return jsonify({"message": role_error}), 400
    initial_flow = resolve_initial_flow(payload["ticket_type"], payload.get("sub_type", ""), role_ids)
    if not initial_flow.get("current_owner_id"):
        return jsonify({"message": "流转负责人配置不完整"}), 400

    ticket = Ticket(
        title=payload["title"].strip(),
        description=payload.get("description", "").strip(),
        module=payload["module"].strip(),
        ticket_type=payload["ticket_type"],
        sub_type=payload.get("sub_type", "").strip(),
        status=initial_flow["status"],
        flow_stage=initial_flow["flow_stage"],
        priority=payload["priority"],
        attachments=json.dumps(normalized_attachments, ensure_ascii=False),
        start_time=start_time,
        end_time=end_time,
        project_id=project.id,
        version_id=version.id,
        parent_task_id=parent_task_id,
        related_task_id=related_task_id,
        current_owner_id=initial_flow["current_owner_id"],
        executor_id=role_ids.get("executor_id"),
        planner_id=role_ids.get("planner_id"),
        tester_id=role_ids.get("tester_id"),
        creator_id=request.current_user.id,
    )
    role_user_ids = [uid for uid in {role_ids.get("executor_id"), role_ids.get("planner_id"), role_ids.get("tester_id")} if uid]
    if role_user_ids:
        ticket.assignees = User.query.filter(User.id.in_(role_user_ids)).all()
    else:
        ticket.assignees = [request.current_user]
    ticket.watchers = list({user.id: user for user in [request.current_user, *ticket.assignees]}.values())

    db.session.add(ticket)
    db.session.flush()
    create_history(ticket, request.current_user.id, f"创建工单，当前处理人：{ticket.current_owner.display_name if ticket.current_owner else '-'}")
    for assignee in ticket.assignees:
        if assignee.id != request.current_user.id:
            _push_user_notification(
                assignee.id,
                "assign",
                "你被指派为工单负责人",
                ticket.title[:200],
                ticket.id,
            )
    db.session.commit()
    return jsonify(ticket.to_dict(current_user_id=request.current_user.id)), 201


@api_bp.put("/tickets/<int:ticket_id>")
@auth_required()
def update_ticket(ticket_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404

    payload = request.get_json(silent=True) or {}
    if payload.get("attachments"):
        passed, limited_response = _enforce_rate_limit("ticket_upload", RATE_LIMIT_UPLOAD_COUNT)
        if not passed:
            return limited_response
    fallback_sub_type = ticket.sub_type
    if not fallback_sub_type:
        fallback_sub_type = "BUG修复" if ticket.ticket_type == "BUG单" else "程序需求"
    merged_payload = {
        "title": payload.get("title", ticket.title),
        "module": payload.get("module", ticket.module),
        "ticket_type": payload.get("ticket_type", ticket.ticket_type),
        "sub_type": payload.get("sub_type", fallback_sub_type),
        "priority": payload.get("priority", ticket.priority),
        "project_id": payload.get("project_id", ticket.project_id),
        "version_id": payload.get("version_id", ticket.version_id),
        "parent_task_id": payload.get("parent_task_id", ticket.parent_task_id),
        "related_task_id": payload.get("related_task_id", ticket.related_task_id),
        "executor_id": payload.get("executor_id", ticket.executor_id),
        "planner_id": payload.get("planner_id", ticket.planner_id),
        "tester_id": payload.get("tester_id", ticket.tester_id),
        "start_time": (
            payload.get("start_time")
            if payload.get("start_time") not in (None, "")
            else ticket.start_time.isoformat()
        ),
        "end_time": (
            payload.get("end_time")
            if payload.get("end_time") not in (None, "")
            else ticket.end_time.isoformat()
        ),
    }
    valid, message = validate_ticket_payload(merged_payload)
    if not valid:
        return jsonify({"message": message}), 400
    merged_role_ids = normalize_role_ids(merged_payload)
    role_error = _validate_flow_role_users(merged_payload["ticket_type"], merged_payload.get("sub_type", ""), merged_role_ids)
    if role_error:
        return jsonify({"message": role_error}), 400
    merged_start_time = parse_iso(merged_payload["start_time"])
    merged_end_time = parse_iso(merged_payload["end_time"])
    if merged_end_time < merged_start_time:
        return jsonify({"message": "结束时间不能早于开始时间"}), 400
    merged_project_id = int(merged_payload["project_id"])
    merged_version_id = int(merged_payload["version_id"])
    merged_version = db.session.get(ProjectVersion, merged_version_id)
    if not merged_version or merged_version.project_id != merged_project_id:
        return jsonify({"message": "版本不存在或不属于该项目"}), 400
    resolved_parent_task_id, resolved_related_task_id, link_error = _resolve_ticket_links(
        merged_payload["ticket_type"],
        merged_payload.get("parent_task_id"),
        merged_payload.get("related_task_id"),
        current_ticket_id=ticket.id,
    )
    if link_error:
        return jsonify({"message": link_error}), 400
    if resolved_parent_task_id:
        parent_ticket = db.session.get(Ticket, resolved_parent_task_id)
        if parent_ticket and parent_ticket.project_id != merged_project_id:
            return jsonify({"message": "父任务必须属于同一项目"}), 400
    if resolved_related_task_id:
        related_ticket = db.session.get(Ticket, resolved_related_task_id)
        if related_ticket and related_ticket.project_id != merged_project_id:
            return jsonify({"message": "关联任务单必须属于同一项目"}), 400

    field_labels = {
        "title": "标题",
        "description": "描述",
        "module": "模块",
        "ticket_type": "类型",
        "sub_type": "子类型",
        "priority": "优先级",
        "parent_task_id": "父任务",
        "related_task_id": "关联任务单",
    }
    changes: list[str] = []
    for field in ["title", "description", "module", "ticket_type", "sub_type", "priority"]:
        if field in payload:
            old_value = getattr(ticket, field)
            new_value = payload[field]
            if old_value != new_value:
                setattr(ticket, field, new_value)
                changes.append(f"{field_labels.get(field, field)}: {old_value} -> {new_value}")

    if "project_id" in payload and ticket.project_id != int(payload["project_id"]):
        ticket.project_id = int(payload["project_id"])
        changes.append("所属项目 已更新")
    if ticket.version_id != merged_version_id:
        ticket.version_id = merged_version_id
        changes.append("所属版本 已更新")
    if ticket.parent_task_id != resolved_parent_task_id:
        old_label = ticket.parent_task.title if ticket.parent_task else "无"
        new_ticket = db.session.get(Ticket, resolved_parent_task_id) if resolved_parent_task_id else None
        new_label = new_ticket.title if new_ticket else "无"
        ticket.parent_task_id = resolved_parent_task_id
        changes.append(f"父任务: {old_label} -> {new_label}")
    if ticket.related_task_id != resolved_related_task_id:
        old_label = ticket.related_task.title if ticket.related_task else "无"
        new_ticket = db.session.get(Ticket, resolved_related_task_id) if resolved_related_task_id else None
        new_label = new_ticket.title if new_ticket else "无"
        ticket.related_task_id = resolved_related_task_id
        changes.append(f"关联任务单: {old_label} -> {new_label}")
    if "start_time" in payload and payload["start_time"] not in (None, ""):
        ticket.start_time = parse_iso(payload["start_time"])
    if "end_time" in payload and payload["end_time"] not in (None, ""):
        ticket.end_time = parse_iso(payload["end_time"])
    if "attachments" in payload:
        normalized_attachments, attachment_message = _normalize_and_persist_attachments(
            payload["attachments"],
            allow_documents=False,
            upload_scope="ticket",
        )
        if attachment_message:
            return jsonify({"message": attachment_message}), 400
        ticket.attachments = json.dumps(normalized_attachments, ensure_ascii=False)
    role_changed = any(field in payload for field in ["executor_id", "planner_id", "tester_id", "ticket_type", "sub_type"])
    if role_changed:
        old_owner_id = ticket.current_owner_id
        ticket.executor_id = merged_role_ids.get("executor_id")
        ticket.planner_id = merged_role_ids.get("planner_id")
        ticket.tester_id = merged_role_ids.get("tester_id")
        if ticket.flow_stage == "execute":
            if ticket.ticket_type == "需求单" and ticket.sub_type == "策划需求":
                ticket.current_owner_id = ticket.planner_id
            elif ticket.ticket_type == "需求单" and ticket.sub_type == "测试需求":
                ticket.current_owner_id = ticket.tester_id
            else:
                ticket.current_owner_id = ticket.executor_id
        elif ticket.flow_stage == "accept":
            ticket.current_owner_id = ticket.planner_id
        elif ticket.flow_stage == "test":
            ticket.current_owner_id = ticket.tester_id
        role_user_ids = [uid for uid in {ticket.executor_id, ticket.planner_id, ticket.tester_id} if uid]
        ticket.assignees = User.query.filter(User.id.in_(role_user_ids)).all() if role_user_ids else []
        for assignee in ticket.assignees:
            if assignee.id not in {u.id for u in ticket.watchers}:
                ticket.watchers.append(assignee)
        if old_owner_id != ticket.current_owner_id:
            old_name = (db.session.get(User, old_owner_id).display_name if old_owner_id else "无")
            new_name = (db.session.get(User, ticket.current_owner_id).display_name if ticket.current_owner_id else "无")
            changes.append(f"当前处理人: {old_name} -> {new_name}")

    if changes:
        create_history(ticket, request.current_user.id, "；".join(changes)[:255])
        _notify_ticket_watchers(ticket, request.current_user.id, "ticket_update", "你关注的工单有更新", "；".join(changes)[:180])

    db.session.commit()
    return jsonify(ticket.to_dict(current_user_id=request.current_user.id))


@api_bp.post("/tickets/batch-update")
@auth_required()
def batch_update_tickets() -> Any:
    payload = request.get_json(silent=True) or {}
    ticket_ids_raw = payload.get("ticket_ids", [])
    if not isinstance(ticket_ids_raw, list) or not ticket_ids_raw:
        return jsonify({"message": "请选择至少一个工单"}), 400
    ticket_ids: list[int] = []
    for item in ticket_ids_raw:
        try:
            ticket_ids.append(int(item))
        except (TypeError, ValueError):
            continue
    if not ticket_ids:
        return jsonify({"message": "工单ID无效"}), 400

    tickets = Ticket.query.filter(Ticket.id.in_(ticket_ids)).all()
    if not tickets:
        return jsonify({"message": "未找到可更新工单"}), 404

    has_change = any(field in payload for field in ["priority", "assignee_ids"])
    if not has_change:
        return jsonify({"message": "请至少提供一项批量更新字段"}), 400

    assignees = None
    if "assignee_ids" in payload:
        assignee_ids = payload.get("assignee_ids") or []
        assignees = User.query.filter(User.id.in_(assignee_ids)).all() if assignee_ids else []

    updated: list[dict[str, Any]] = []
    for ticket in tickets:
        change_parts: list[str] = []
        if "priority" in payload and payload["priority"] and ticket.priority != payload["priority"]:
            change_parts.append(f"优先级: {ticket.priority} -> {payload['priority']}")
            ticket.priority = payload["priority"]
        if assignees is not None:
            old_names = "、".join([user.display_name for user in ticket.assignees]) or "无"
            ticket.assignees = assignees
            for assignee in assignees:
                if assignee.id not in {u.id for u in ticket.watchers}:
                    ticket.watchers.append(assignee)
            new_names = "、".join([user.display_name for user in ticket.assignees]) or "无"
            if old_names != new_names:
                change_parts.append(f"负责人: {old_names} -> {new_names}")
        if change_parts:
            summary = "批量更新：" + "；".join(change_parts)
            create_history(ticket, request.current_user.id, summary[:255])
            _notify_ticket_watchers(ticket, request.current_user.id, "ticket_batch", "你关注的工单被批量更新", summary[:180])
            updated.append(ticket.to_dict(current_user_id=request.current_user.id))

    db.session.commit()
    return jsonify({"updated_count": len(updated), "items": updated})


@api_bp.delete("/tickets/<int:ticket_id>")
@auth_required()
def delete_ticket(ticket_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    db.session.delete(ticket)
    db.session.commit()
    return jsonify({"message": "删除成功"})


@api_bp.get("/tickets/<int:ticket_id>")
@auth_required()
def get_ticket_detail(ticket_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    child_task_tickets = (
        Ticket.query.filter(Ticket.parent_task_id == ticket.id).order_by(Ticket.updated_at.desc()).all()
    )
    related_bug_tickets = (
        Ticket.query.filter(Ticket.related_task_id == ticket.id, Ticket.ticket_type == "BUG单")
        .order_by(Ticket.updated_at.desc())
        .all()
    )

    return jsonify(
        {
            "ticket": {
                **ticket.to_dict(current_user_id=request.current_user.id),
                "available_actions": get_available_flow_actions(ticket, request.current_user.id),
            },
            "histories": [item.to_dict() for item in sorted(ticket.histories, key=lambda row: row.created_at, reverse=True)],
            "comments": [item.to_dict() for item in sorted(ticket.comments, key=lambda row: row.created_at, reverse=True)],
            "comment_replies": [
                item.to_dict()
                for item in CommentReply.query.filter_by(ticket_id=ticket.id).order_by(CommentReply.created_at.asc()).all()
            ],
            "checklist_items": [
                item.to_dict()
                for item in TicketChecklistItem.query.filter_by(ticket_id=ticket.id)
                .order_by(TicketChecklistItem.position.asc(), TicketChecklistItem.id.asc())
                .all()
            ],
            "child_task_tickets": [item.to_dict(current_user_id=request.current_user.id) for item in child_task_tickets],
            "related_bug_tickets": [item.to_dict(current_user_id=request.current_user.id) for item in related_bug_tickets],
            "child_task_progress": {
                "total": len(child_task_tickets),
                "done": len([item for item in child_task_tickets if item.status == "已完成"]),
            },
            "related_bug_progress": {
                "total": len(related_bug_tickets),
                "done": len([item for item in related_bug_tickets if item.status == "已完成"]),
            },
        }
    )


@api_bp.post("/tickets/<int:ticket_id>/flow/submit")
@auth_required()
def submit_ticket_flow(ticket_id: int) -> Any:
    return _handle_ticket_flow_action(ticket_id, "submit")


@api_bp.post("/tickets/<int:ticket_id>/flow/approve")
@auth_required()
def approve_ticket_flow(ticket_id: int) -> Any:
    return _handle_ticket_flow_action(ticket_id, "approve")


@api_bp.post("/tickets/<int:ticket_id>/flow/reject")
@auth_required()
def reject_ticket_flow(ticket_id: int) -> Any:
    payload = request.get_json(silent=True) or {}
    return _handle_ticket_flow_action(ticket_id, "reject", payload.get("reason", ""))


def _handle_ticket_flow_action(ticket_id: int, action: str, reject_reason: str = "") -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    if ticket.current_owner_id != request.current_user.id:
        return jsonify({"message": "当前工单不在你的处理节点"}), 403
    ok, message = apply_flow_action(ticket, action, reject_reason=reject_reason)
    if not ok:
        return jsonify({"message": message}), 400
    action_text = {"submit": "提交", "approve": "通过", "reject": "驳回"}.get(action, action)
    summary = f"{action_text}工单，状态变更为{ticket.status}"
    if action == "reject" and ticket.reject_reason:
        summary += f"（原因：{ticket.reject_reason}）"
    create_history(ticket, request.current_user.id, summary[:255])
    if ticket.current_owner_id and ticket.current_owner_id != request.current_user.id:
        _push_user_notification(
            ticket.current_owner_id,
            "flow",
            "你有新的工单待处理",
            f"#{ticket.id} {ticket.title[:120]}",
            ticket.id,
        )
    _notify_ticket_watchers(ticket, request.current_user.id, "flow", "你关注的工单发生流转", summary[:180])
    db.session.commit()
    return jsonify(
        {
            "ticket": {
                **ticket.to_dict(current_user_id=request.current_user.id),
                "available_actions": get_available_flow_actions(ticket, request.current_user.id),
            }
        }
    )


@api_bp.post("/tickets/<int:ticket_id>/comments")
@auth_required()
def add_comment(ticket_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    payload = request.get_json(silent=True) or {}
    content = payload.get("content", "").strip()
    if not content:
        return jsonify({"message": "评论内容不能为空"}), 400

    valid_ids = _resolve_mention_user_ids(payload.get("mentions", []))

    comment = Comment(
        ticket_id=ticket_id,
        user_id=request.current_user.id,
        content=content,
        mentions=json.dumps(sorted(valid_ids), ensure_ascii=False),
        screenshot=payload.get("screenshot", "").strip(),
    )
    db.session.add(comment)
    editor_name = request.current_user.display_name or request.current_user.username
    for uid in valid_ids:
        if uid == request.current_user.id:
            continue
        _push_user_notification(
            uid,
            "mention",
            f"{editor_name} 在工单评论中@了你",
            ticket.title[:200],
            ticket.id,
        )
    _notify_ticket_watchers(ticket, request.current_user.id, "ticket_comment", f"{editor_name} 评论了你关注的工单")
    create_history(ticket, request.current_user.id, "新增评论")
    db.session.commit()
    return jsonify(comment.to_dict()), 201


@api_bp.post("/tickets/<int:ticket_id>/watch")
@auth_required()
def watch_ticket(ticket_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    if request.current_user.id not in {u.id for u in ticket.watchers}:
        ticket.watchers.append(request.current_user)
        db.session.commit()
    return jsonify(ticket.to_dict(current_user_id=request.current_user.id))


@api_bp.delete("/tickets/<int:ticket_id>/watch")
@auth_required()
def unwatch_ticket(ticket_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    ticket.watchers = [u for u in ticket.watchers if u.id != request.current_user.id]
    db.session.commit()
    return jsonify(ticket.to_dict(current_user_id=request.current_user.id))


@api_bp.post("/tickets/<int:ticket_id>/comments/<int:comment_id>/replies")
@auth_required()
def add_comment_reply(ticket_id: int, comment_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    comment = db.session.get(Comment, comment_id)
    if not comment or comment.ticket_id != ticket_id:
        return jsonify({"message": "评论不存在"}), 404
    payload = request.get_json(silent=True) or {}
    content = (payload.get("content") or "").strip()
    if not content:
        return jsonify({"message": "回复内容不能为空"}), 400

    valid_ids = _resolve_mention_user_ids(payload.get("mentions", []))
    reply = CommentReply(
        ticket_id=ticket_id,
        comment_id=comment_id,
        user_id=request.current_user.id,
        content=content,
        mentions=json.dumps(sorted(valid_ids), ensure_ascii=False),
    )
    db.session.add(reply)
    editor_name = request.current_user.display_name or request.current_user.username
    for uid in valid_ids:
        if uid == request.current_user.id:
            continue
        _push_user_notification(
            uid,
            "mention",
            f"{editor_name} 在评论回复中@了你",
            ticket.title[:200],
            ticket.id,
        )
    _notify_ticket_watchers(ticket, request.current_user.id, "ticket_reply", f"{editor_name} 回复了评论")
    create_history(ticket, request.current_user.id, "新增评论回复")
    db.session.commit()
    return jsonify(reply.to_dict()), 201


@api_bp.post("/tickets/<int:ticket_id>/checklist")
@auth_required()
def add_ticket_checklist_item(ticket_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    payload = request.get_json(silent=True) or {}
    content = (payload.get("content") or "").strip()
    if not content:
        return jsonify({"message": "清单内容不能为空"}), 400
    max_position = (
        db.session.query(func.max(TicketChecklistItem.position)).filter(TicketChecklistItem.ticket_id == ticket_id).scalar()
        or 0
    )
    item = TicketChecklistItem(
        ticket_id=ticket_id,
        content=content[:255],
        is_done=False,
        position=max_position + 1,
        creator_id=request.current_user.id,
    )
    db.session.add(item)
    create_history(ticket, request.current_user.id, "新增子任务清单")
    _notify_ticket_watchers(ticket, request.current_user.id, "ticket_checklist", "你关注的工单新增了子任务")
    db.session.commit()
    return jsonify(item.to_dict()), 201


@api_bp.patch("/tickets/<int:ticket_id>/checklist/<int:item_id>")
@auth_required()
def update_ticket_checklist_item(ticket_id: int, item_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    item = db.session.get(TicketChecklistItem, item_id)
    if not item or item.ticket_id != ticket_id:
        return jsonify({"message": "清单项不存在"}), 404
    payload = request.get_json(silent=True) or {}
    if "content" in payload:
        content = (payload.get("content") or "").strip()
        if not content:
            return jsonify({"message": "清单内容不能为空"}), 400
        item.content = content[:255]
    if "is_done" in payload:
        item.is_done = bool(payload.get("is_done"))
    if "position" in payload:
        try:
            item.position = int(payload.get("position"))
        except (TypeError, ValueError):
            pass
    create_history(ticket, request.current_user.id, "更新子任务清单")
    _notify_ticket_watchers(ticket, request.current_user.id, "ticket_checklist", "你关注的工单子任务有更新")
    db.session.commit()
    return jsonify(item.to_dict())


@api_bp.delete("/tickets/<int:ticket_id>/checklist/<int:item_id>")
@auth_required()
def delete_ticket_checklist_item(ticket_id: int, item_id: int) -> Any:
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        return jsonify({"message": "工单不存在"}), 404
    item = db.session.get(TicketChecklistItem, item_id)
    if not item or item.ticket_id != ticket_id:
        return jsonify({"message": "清单项不存在"}), 404
    db.session.delete(item)
    create_history(ticket, request.current_user.id, "删除子任务清单")
    _notify_ticket_watchers(ticket, request.current_user.id, "ticket_checklist", "你关注的工单子任务有更新")
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.get("/wiki/categories")
@auth_required()
def list_wiki_categories() -> Any:
    categories = WikiCategory.query.order_by(WikiCategory.name.asc()).all()
    return jsonify([category.to_dict() for category in categories])


@api_bp.get("/wiki/articles")
@auth_required()
def list_wiki_articles() -> Any:
    query = WikiArticle.query
    category_id = request.args.get("category_id", type=int)
    keyword = (request.args.get("keyword") or "").strip()
    if category_id:
        query = query.filter(WikiArticle.category_id == category_id)
    if keyword:
        like_keyword = f"%{keyword}%"
        query = query.filter(or_(WikiArticle.title.ilike(like_keyword), WikiArticle.content.ilike(like_keyword)))
    articles = query.order_by(WikiArticle.updated_at.desc()).all()
    return jsonify([article.to_dict() for article in articles])


@api_bp.get("/wiki/articles/<int:article_id>")
@auth_required()
def get_wiki_article(article_id: int) -> Any:
    article = db.session.get(WikiArticle, article_id)
    if not article:
        return jsonify({"message": "文章不存在"}), 404
    return jsonify(article.to_dict())


@api_bp.post("/wiki/articles")
@auth_required()
def create_wiki_article() -> Any:
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    if not title:
        return jsonify({"message": "标题不能为空"}), 400
    content = payload.get("content") or ""
    normalized_content, content_error = _persist_inline_media_in_html(content, upload_scope="wiki-inline")
    if content_error:
        return jsonify({"message": content_error}), 400
    attachments = payload.get("attachments") or []
    if attachments:
        passed, limited_response = _enforce_rate_limit("wiki_upload", RATE_LIMIT_UPLOAD_COUNT)
        if not passed:
            return limited_response
    normalized_attachments, attachment_message = _normalize_and_persist_attachments(
        attachments,
        allow_documents=True,
        upload_scope="wiki",
    )
    if attachment_message:
        return jsonify({"message": attachment_message}), 400
    category = _resolve_wiki_category(payload.get("category_name"))
    article = WikiArticle(
        title=title,
        content=normalized_content,
        attachments=json.dumps(normalized_attachments, ensure_ascii=False),
        category_id=category.id if category else None,
        creator_id=request.current_user.id,
        updater_id=request.current_user.id,
    )
    db.session.add(article)
    db.session.commit()
    return jsonify(article.to_dict()), 201


@api_bp.put("/wiki/articles/<int:article_id>")
@auth_required()
def update_wiki_article(article_id: int) -> Any:
    article = db.session.get(WikiArticle, article_id)
    if not article:
        return jsonify({"message": "文章不存在"}), 404
    payload = request.get_json(silent=True) or {}
    if payload.get("attachments"):
        passed, limited_response = _enforce_rate_limit("wiki_upload", RATE_LIMIT_UPLOAD_COUNT)
        if not passed:
            return limited_response
    title = (payload.get("title", article.title) or "").strip()
    if not title:
        return jsonify({"message": "标题不能为空"}), 400
    article.title = title
    if "content" in payload:
        normalized_content, content_error = _persist_inline_media_in_html(payload.get("content", ""), upload_scope="wiki-inline")
        if content_error:
            return jsonify({"message": content_error}), 400
        article.content = normalized_content
    if "attachments" in payload:
        attachments = payload.get("attachments") or []
        normalized_attachments, attachment_message = _normalize_and_persist_attachments(
            attachments,
            allow_documents=True,
            upload_scope="wiki",
        )
        if attachment_message:
            return jsonify({"message": attachment_message}), 400
        article.attachments = json.dumps(normalized_attachments, ensure_ascii=False)
    if "category_name" in payload:
        category = _resolve_wiki_category(payload.get("category_name"))
        article.category_id = category.id if category else None
    article.updater_id = request.current_user.id
    db.session.commit()
    return jsonify(article.to_dict())


@api_bp.delete("/wiki/articles/<int:article_id>")
@auth_required()
def delete_wiki_article(article_id: int) -> Any:
    article = db.session.get(WikiArticle, article_id)
    if not article:
        return jsonify({"message": "文章不存在"}), 404
    if not request.current_user.is_admin and article.creator_id != request.current_user.id:
        _log_security_event(
            "PERMISSION_DENIED",
            f"wiki_delete_forbidden article_id={article_id}, owner_id={article.creator_id}",
        )
        return jsonify({"message": "仅管理员或创建人可删除"}), 403
    db.session.delete(article)
    db.session.commit()
    return jsonify({"message": "删除成功"})


@api_bp.get("/dashboard")
@auth_required()
def dashboard() -> Any:
    user: User = request.current_user
    project_id = request.args.get("project_id", type=int)
    version_id = request.args.get("version_id", type=int)
    now = _to_utc_naive(now_utc())
    all_tickets_query = Ticket.query
    if project_id:
        all_tickets_query = all_tickets_query.filter(Ticket.project_id == project_id)
    if version_id:
        all_tickets_query = all_tickets_query.filter(Ticket.version_id == version_id)
    all_tickets = all_tickets_query.order_by(Ticket.end_time.asc()).all()
    my_tickets = [ticket for ticket in all_tickets if ticket.current_owner_id == user.id or ticket.creator_id == user.id]
    my_related_tickets: list[Ticket] = []
    for ticket in all_tickets:
        if (
            ticket.current_owner_id == user.id
            or ticket.creator_id == user.id
            or ticket.executor_id == user.id
            or ticket.planner_id == user.id
            or ticket.tester_id == user.id
            or any(assignee.id == user.id for assignee in ticket.assignees)
        ):
            my_related_tickets.append(ticket)
    pending_status = {"待处理", "待验收", "待测试"}
    my_current = [ticket.to_dict() for ticket in my_tickets if ticket.current_owner_id == user.id and ticket.status in pending_status]
    my_created = [ticket.to_dict() for ticket in my_tickets if ticket.creator_id == user.id and ticket.status in pending_status]
    my_related = [ticket.to_dict() for ticket in my_related_tickets]
    my_current_tasks = [ticket for ticket in my_current if ticket.get("ticket_type") == "需求单"]
    my_current_bugs = [ticket for ticket in my_current if ticket.get("ticket_type") == "BUG单"]
    my_created_tasks = [ticket for ticket in my_created if ticket.get("ticket_type") == "需求单"]
    my_created_bugs = [ticket for ticket in my_created if ticket.get("ticket_type") == "BUG单"]
    my_related_tasks = [ticket for ticket in my_related if ticket.get("ticket_type") == "需求单"]
    my_related_bugs = [ticket for ticket in my_related if ticket.get("ticket_type") == "BUG单"]

    my_overdue = [
        ticket.to_dict()
        for ticket in my_tickets
        if ticket.status in pending_status and _to_utc_naive(ticket.end_time) < now
    ]

    by_status = {status: 0 for status in TICKET_STATUS}
    for row in all_tickets:
        if row.status not in by_status:
            by_status[row.status] = 0
        by_status[row.status] += 1

    my_ticket_ids = [ticket.id for ticket in my_related_tickets]
    recent_histories_query = TicketHistory.query.join(Ticket, TicketHistory.ticket_id == Ticket.id).join(
        Project, Ticket.project_id == Project.id
    )
    if my_ticket_ids:
        recent_histories_query = recent_histories_query.filter(TicketHistory.ticket_id.in_(my_ticket_ids))
        recent_histories = recent_histories_query.order_by(TicketHistory.created_at.desc()).limit(15).all()
    else:
        recent_histories = []
    my_dynamics = [
        {
            "id": history.id,
            "project_id": history.ticket.project_id if history.ticket else None,
            "project_name": history.ticket.project.name if history.ticket and history.ticket.project else "未知项目",
            "ticket_id": history.ticket_id,
            "ticket_title": history.ticket.title if history.ticket else "未知工单",
            "summary": history.summary,
            "editor_name": history.editor.display_name if history.editor else "系统",
            "created_at": history.created_at.isoformat(),
        }
        for history in recent_histories
    ]

    return jsonify(
        {
            "my_current": my_current,
            "my_current_tasks": my_current_tasks,
            "my_current_bugs": my_current_bugs,
            "my_created": my_created,
            "my_created_tasks": my_created_tasks,
            "my_created_bugs": my_created_bugs,
            "my_related": my_related,
            "my_related_tasks": my_related_tasks,
            "my_related_bugs": my_related_bugs,
            "my_overdue": my_overdue,
            "ticket_count": len(all_tickets),
            "by_status": by_status,
            "my_dynamics": my_dynamics,
        }
    )


@api_bp.get("/statistics")
@auth_required()
def statistics() -> Any:
    project_id = request.args.get("project_id", type=int)
    query = Ticket.query
    if project_id:
        query = query.filter(Ticket.project_id == project_id)
    all_tickets = query.all()
    total = len(all_tickets)
    done = len([ticket for ticket in all_tickets if ticket.status == "已完成"])
    now = _to_utc_naive(now_utc())
    overdue = len(
        [
            ticket
            for ticket in all_tickets
            if ticket.status in {"待处理", "待验收", "待测试"} and _to_utc_naive(ticket.end_time) < now
        ]
    )

    workload: dict[str, int] = {position: 0 for position in POSITIONS}
    for ticket in all_tickets:
        for assignee in ticket.assignees:
            workload[assignee.position] = workload.get(assignee.position, 0) + 1

    trend: list[dict[str, Any]] = []
    today = now_utc().date()
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_count = len([ticket for ticket in all_tickets if ticket.updated_at.date() == day])
        trend.append({"date": day.isoformat(), "updated_tickets": day_count})

    return jsonify(
        {
            "total_tickets": total,
            "completion_rate": round((done / total) * 100, 2) if total else 0,
            "overdue_count": overdue,
            "workload_by_position": workload,
            "trend": trend,
        }
    )


@api_bp.get("/analytics/progress-overview")
@auth_required()
def analytics_progress_overview() -> Any:
    project_id = request.args.get("project_id", type=int)
    version_id = request.args.get("version_id", type=int)
    days = request.args.get("days", default=14, type=int)
    from_raw = request.args.get("from")
    to_raw = request.args.get("to")
    scope = resolve_scope(
        project_id=project_id,
        version_id=version_id,
        days=days,
        from_time=parse_iso(from_raw) if from_raw else None,
        to_time=parse_iso(to_raw) if to_raw else None,
    )
    tickets = get_filtered_tickets(scope)
    return jsonify(build_progress_overview(scope, tickets))


@api_bp.get("/analytics/risk-alerts")
@auth_required()
def analytics_risk_alerts() -> Any:
    project_id = request.args.get("project_id", type=int)
    version_id = request.args.get("version_id", type=int)
    days = request.args.get("days", default=14, type=int)
    limit = request.args.get("limit", default=20, type=int)
    from_raw = request.args.get("from")
    to_raw = request.args.get("to")
    scope = resolve_scope(
        project_id=project_id,
        version_id=version_id,
        days=days,
        from_time=parse_iso(from_raw) if from_raw else None,
        to_time=parse_iso(to_raw) if to_raw else None,
    )
    tickets = get_filtered_tickets(scope)
    return jsonify(build_risk_alerts(scope, tickets, limit=limit))


@api_bp.get("/analytics/workload")
@auth_required()
def analytics_workload() -> Any:
    project_id = request.args.get("project_id", type=int)
    version_id = request.args.get("version_id", type=int)
    days = request.args.get("days", default=14, type=int)
    group_by = (request.args.get("group_by") or "position").strip().lower()
    from_raw = request.args.get("from")
    to_raw = request.args.get("to")
    scope = resolve_scope(
        project_id=project_id,
        version_id=version_id,
        days=days,
        from_time=parse_iso(from_raw) if from_raw else None,
        to_time=parse_iso(to_raw) if to_raw else None,
    )
    tickets = get_filtered_tickets(scope)
    return jsonify(build_workload(scope, tickets, group_by=group_by))


@api_bp.get("/analytics/workload-density")
@auth_required()
def analytics_workload_density() -> Any:
    project_id = request.args.get("project_id", type=int)
    version_id = request.args.get("version_id", type=int)
    days = request.args.get("days", default=14, type=int)
    member_id = request.args.get("member_id", type=int)
    bucket_hours = request.args.get("bucket_hours", default=6, type=int)
    from_raw = request.args.get("from")
    to_raw = request.args.get("to")
    scope = resolve_scope(
        project_id=project_id,
        version_id=version_id,
        days=days,
        from_time=parse_iso(from_raw) if from_raw else None,
        to_time=parse_iso(to_raw) if to_raw else None,
    )
    tickets = get_filtered_tickets(scope)
    return jsonify(build_workload_density(scope, tickets, member_id=member_id, bucket_hours=bucket_hours))


@api_bp.get("/notifications")
@auth_required()
def notifications() -> Any:
    user: User = request.current_user
    project_id = request.args.get("project_id", type=int)
    now = _to_utc_naive(now_utc())
    soon = now + timedelta(days=2)
    tickets_query = Ticket.query.filter(or_(Ticket.current_owner_id == user.id, Ticket.creator_id == user.id))
    if project_id:
        tickets_query = tickets_query.filter(Ticket.project_id == project_id)
    tickets = tickets_query.all()

    new_items = [ticket for ticket in tickets if _to_utc_naive(ticket.created_at) >= now - timedelta(days=1)]
    overdue_items = [
        ticket
        for ticket in tickets
        if ticket.status in {"待处理", "待验收", "待测试"} and _to_utc_naive(ticket.end_time) < now
    ]
    soon_due_items = [
        ticket
        for ticket in tickets
        if ticket.status in {"待处理", "待验收", "待测试"} and now <= _to_utc_naive(ticket.end_time) <= soon
    ]

    unread_notification_count = (
        db.session.query(func.count(UserNotification.id))
        .filter(
            UserNotification.user_id == user.id,
            UserNotification.read_at.is_(None),
        )
        .scalar()
        or 0
    )

    return jsonify(
        {
            "new_ticket_count": len(new_items),
            "overdue_count": len(overdue_items),
            "soon_due_count": len(soon_due_items),
            "new_tickets": [ticket.to_dict() for ticket in new_items[:5]],
            "overdue_tickets": [ticket.to_dict() for ticket in overdue_items[:5]],
            "soon_due_tickets": [ticket.to_dict() for ticket in soon_due_items[:5]],
            "unread_notification_count": unread_notification_count,
        }
    )


@api_bp.get("/notification-feed")
@auth_required()
def notification_feed() -> Any:
    user: User = request.current_user
    page = max(1, request.args.get("page", 1, type=int) or 1)
    per_page = min(max(1, request.args.get("per_page", 20, type=int) or 20), 100)

    base_q = UserNotification.query.filter(UserNotification.user_id == user.id)
    total = base_q.count()
    items = (
        base_q.order_by(UserNotification.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return jsonify(
        {
            "items": [n.to_dict() for n in items],
            "total": total,
            "page": page,
            "per_page": per_page,
        }
    )


@api_bp.post("/notifications/<int:notification_id>/read")
@auth_required()
def mark_notification_read(notification_id: int) -> Any:
    user: User = request.current_user
    note = UserNotification.query.filter_by(id=notification_id, user_id=user.id).first()
    if not note:
        return jsonify({"message": "通知不存在"}), 404
    if note.read_at is None:
        note.read_at = now_utc()
        db.session.commit()
    return jsonify(note.to_dict())


@api_bp.post("/notifications/read-all")
@auth_required()
def mark_all_notifications_read() -> Any:
    user: User = request.current_user
    now = now_utc()
    UserNotification.query.filter(UserNotification.user_id == user.id, UserNotification.read_at.is_(None)).update(
        {"read_at": now},
        synchronize_session=False,
    )
    db.session.commit()
    return jsonify({"ok": True})
