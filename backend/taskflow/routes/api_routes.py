from __future__ import annotations

import base64
import binascii
import json
import time
from datetime import timedelta
from typing import Any

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import and_, or_
from werkzeug.security import check_password_hash, generate_password_hash

from taskflow.constants import POSITIONS, PRIORITIES, TICKET_STATUS, TICKET_TYPES
from taskflow.extensions import db
from taskflow.models import (
    Comment,
    Project,
    ProjectVersion,
    Ticket,
    TicketHistory,
    User,
    WikiArticle,
    WikiCategory,
    ticket_assignees,
)
from taskflow.services.auth_service import auth_required, generate_token
from taskflow.services.ticket_service import create_history, validate_ticket_payload
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
        elif not (url.startswith("http://") or url.startswith("https://")):
            _log_security_event("UPLOAD_REJECTED", "attachment_url_scheme_invalid")
            return False, "附件 URL 仅支持 data/http/https"

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
                    [ticket for ticket in project_tickets if ticket.status in {"待处理", "处理中", "待验收"}]
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
                    [ticket for ticket in selected_tickets if ticket.status in {"待处理", "处理中", "待验收"}]
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

    tickets = query.order_by(Ticket.updated_at.desc()).all()
    return jsonify([ticket.to_dict() for ticket in tickets])


@api_bp.post("/tickets")
@auth_required()
def create_ticket() -> Any:
    payload = request.get_json(silent=True) or {}
    valid, message = validate_ticket_payload(payload)
    if not valid:
        return jsonify({"message": message}), 400

    project = db.session.get(Project, int(payload["project_id"]))
    if not project:
        return jsonify({"message": "项目不存在"}), 404
    version = db.session.get(ProjectVersion, int(payload["version_id"]))
    if not version or version.project_id != project.id:
        return jsonify({"message": "版本不存在或不属于该项目"}), 400

    attachments = payload.get("attachments", [])
    if attachments:
        passed, limited_response = _enforce_rate_limit("ticket_upload", RATE_LIMIT_UPLOAD_COUNT)
        if not passed:
            return limited_response
    is_valid_attachment, attachment_message = _validate_attachments_payload(attachments, allow_documents=False)
    if not is_valid_attachment:
        return jsonify({"message": attachment_message}), 400

    ticket = Ticket(
        title=payload["title"].strip(),
        description=payload.get("description", "").strip(),
        module=payload["module"].strip(),
        ticket_type=payload["ticket_type"],
        sub_type=payload.get("sub_type", "").strip(),
        status=payload["status"],
        priority=payload["priority"],
        attachments=json.dumps(attachments, ensure_ascii=False),
        start_time=parse_iso(payload["start_time"]),
        end_time=parse_iso(payload["end_time"]),
        project_id=project.id,
        version_id=version.id,
        creator_id=request.current_user.id,
    )
    assignee_ids = payload.get("assignee_ids", [])
    if assignee_ids:
        ticket.assignees = User.query.filter(User.id.in_(assignee_ids)).all()
    else:
        # Fallback: ensure creator can see newly created tickets in "我的工作台".
        ticket.assignees = [request.current_user]

    db.session.add(ticket)
    db.session.flush()
    create_history(ticket, request.current_user.id, "创建工单")
    db.session.commit()
    return jsonify(ticket.to_dict()), 201


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
    merged_payload = {
        "title": payload.get("title", ticket.title),
        "module": payload.get("module", ticket.module),
        "ticket_type": payload.get("ticket_type", ticket.ticket_type),
        "status": payload.get("status", ticket.status),
        "priority": payload.get("priority", ticket.priority),
        "project_id": payload.get("project_id", ticket.project_id),
        "version_id": payload.get("version_id", ticket.version_id),
        "start_time": payload.get("start_time", ticket.start_time.isoformat()),
        "end_time": payload.get("end_time", ticket.end_time.isoformat()),
    }
    valid, message = validate_ticket_payload(merged_payload)
    if not valid:
        return jsonify({"message": message}), 400
    merged_project_id = int(merged_payload["project_id"])
    merged_version_id = int(merged_payload["version_id"])
    merged_version = db.session.get(ProjectVersion, merged_version_id)
    if not merged_version or merged_version.project_id != merged_project_id:
        return jsonify({"message": "版本不存在或不属于该项目"}), 400

    field_labels = {
        "title": "标题",
        "description": "描述",
        "module": "模块",
        "ticket_type": "类型",
        "sub_type": "子类型",
        "status": "状态",
        "priority": "优先级",
    }
    changes: list[str] = []
    for field in ["title", "description", "module", "ticket_type", "sub_type", "status", "priority"]:
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
    if "start_time" in payload:
        ticket.start_time = parse_iso(payload["start_time"])
    if "end_time" in payload:
        ticket.end_time = parse_iso(payload["end_time"])
    if "attachments" in payload:
        is_valid_attachment, attachment_message = _validate_attachments_payload(payload["attachments"], allow_documents=False)
        if not is_valid_attachment:
            return jsonify({"message": attachment_message}), 400
        ticket.attachments = json.dumps(payload["attachments"], ensure_ascii=False)
    if "assignee_ids" in payload:
        old_names = "、".join([user.display_name for user in ticket.assignees]) or "无"
        ticket.assignees = User.query.filter(User.id.in_(payload["assignee_ids"])).all()
        new_names = "、".join([user.display_name for user in ticket.assignees]) or "无"
        if old_names != new_names:
            changes.append(f"负责人: {old_names} -> {new_names}")

    if changes:
        create_history(ticket, request.current_user.id, "；".join(changes)[:255])

    db.session.commit()
    return jsonify(ticket.to_dict())


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
    return jsonify(
        {
            "ticket": ticket.to_dict(),
            "histories": [item.to_dict() for item in sorted(ticket.histories, key=lambda row: row.created_at, reverse=True)],
            "comments": [item.to_dict() for item in sorted(ticket.comments, key=lambda row: row.created_at, reverse=True)],
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

    comment = Comment(
        ticket_id=ticket_id,
        user_id=request.current_user.id,
        content=content,
        mentions=json.dumps(payload.get("mentions", []), ensure_ascii=False),
        screenshot=payload.get("screenshot", "").strip(),
    )
    db.session.add(comment)
    create_history(ticket, request.current_user.id, "新增评论")
    db.session.commit()
    return jsonify(comment.to_dict()), 201


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
    attachments = payload.get("attachments") or []
    if attachments:
        passed, limited_response = _enforce_rate_limit("wiki_upload", RATE_LIMIT_UPLOAD_COUNT)
        if not passed:
            return limited_response
    is_valid_attachment, attachment_message = _validate_attachments_payload(attachments, allow_documents=True)
    if not is_valid_attachment:
        return jsonify({"message": attachment_message}), 400
    category = _resolve_wiki_category(payload.get("category_name"))
    article = WikiArticle(
        title=title,
        content=content,
        attachments=json.dumps(attachments, ensure_ascii=False),
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
    article.content = payload.get("content", article.content) or ""
    if "attachments" in payload:
        attachments = payload.get("attachments") or []
        is_valid_attachment, attachment_message = _validate_attachments_payload(attachments, allow_documents=True)
        if not is_valid_attachment:
            return jsonify({"message": attachment_message}), 400
        article.attachments = json.dumps(attachments, ensure_ascii=False)
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
    my_tickets_query = Ticket.query.join(ticket_assignees).filter(ticket_assignees.c.user_id == user.id)
    all_tickets_query = Ticket.query
    if project_id:
        my_tickets_query = my_tickets_query.filter(Ticket.project_id == project_id)
        all_tickets_query = all_tickets_query.filter(Ticket.project_id == project_id)
    if version_id:
        my_tickets_query = my_tickets_query.filter(Ticket.version_id == version_id)
        all_tickets_query = all_tickets_query.filter(Ticket.version_id == version_id)
    my_tickets = my_tickets_query.order_by(Ticket.end_time.asc()).all()
    pending_status = {"待处理", "处理中", "待验收"}
    my_pending = [ticket.to_dict() for ticket in my_tickets if ticket.status in pending_status]
    my_pending_tasks = [ticket for ticket in my_pending if ticket.get("ticket_type") == "需求单"]
    my_pending_bugs = [ticket for ticket in my_pending if ticket.get("ticket_type") == "BUG单"]
    my_overdue = [
        ticket.to_dict()
        for ticket in my_tickets
        if ticket.status in pending_status and _to_utc_naive(ticket.end_time) < now
    ]

    by_status = {status: 0 for status in TICKET_STATUS}
    for row in all_tickets_query.all():
        by_status[row.status] += 1

    my_ticket_ids = [ticket.id for ticket in my_tickets]
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
            "my_pending": my_pending,
            "my_pending_tasks": my_pending_tasks,
            "my_pending_bugs": my_pending_bugs,
            "my_overdue": my_overdue,
            "current_task_count": len(my_pending_tasks),
            "current_bug_count": len(my_pending_bugs),
            "ticket_count": all_tickets_query.count(),
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
            if ticket.status in {"待处理", "处理中", "待验收"} and _to_utc_naive(ticket.end_time) < now
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


@api_bp.get("/notifications")
@auth_required()
def notifications() -> Any:
    user: User = request.current_user
    project_id = request.args.get("project_id", type=int)
    now = _to_utc_naive(now_utc())
    soon = now + timedelta(days=2)
    tickets_query = Ticket.query.join(ticket_assignees).filter(ticket_assignees.c.user_id == user.id)
    if project_id:
        tickets_query = tickets_query.filter(Ticket.project_id == project_id)
    tickets = tickets_query.all()

    new_items = [ticket for ticket in tickets if _to_utc_naive(ticket.created_at) >= now - timedelta(days=1)]
    overdue_items = [
        ticket
        for ticket in tickets
        if ticket.status in {"待处理", "处理中", "待验收"} and _to_utc_naive(ticket.end_time) < now
    ]
    soon_due_items = [
        ticket
        for ticket in tickets
        if ticket.status in {"待处理", "处理中", "待验收"} and now <= _to_utc_naive(ticket.end_time) <= soon
    ]

    return jsonify(
        {
            "new_ticket_count": len(new_items),
            "overdue_count": len(overdue_items),
            "soon_due_count": len(soon_due_items),
            "new_tickets": [ticket.to_dict() for ticket in new_items[:5]],
            "overdue_tickets": [ticket.to_dict() for ticket in overdue_items[:5]],
            "soon_due_tickets": [ticket.to_dict() for ticket in soon_due_items[:5]],
        }
    )
