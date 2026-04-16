from __future__ import annotations

from functools import wraps

from flask import current_app, jsonify, request
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from taskflow.extensions import db
from taskflow.models import User


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def generate_token(user: User) -> str:
    return _serializer().dumps({"user_id": user.id})


def get_current_user() -> User | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.replace("Bearer ", "", 1).strip()
    if not token:
        return None
    try:
        payload = _serializer().loads(token, max_age=60 * 60 * 24)
        return db.session.get(User, payload["user_id"])
    except (BadSignature, SignatureExpired):
        return None


def auth_required(admin_only: bool = False):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"message": "未登录或登录已失效"}), 401
            if admin_only and not user.is_admin:
                return jsonify({"message": "权限不足"}), 403
            request.current_user = user
            return func(*args, **kwargs)

        return wrapper

    return decorator
