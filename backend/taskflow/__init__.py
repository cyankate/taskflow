import os

from flask import Flask
from flask_cors import CORS

from taskflow.extensions import db
from taskflow.routes import register_routes
from taskflow.services.bootstrap_service import bootstrap_data


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///taskflow.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = "taskflow-dev-secret"
    app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
    app.config["CORS_ALLOWED_ORIGINS"] = os.getenv("TASKFLOW_CORS_ALLOWED_ORIGINS", "*")

    cors_origins = [item.strip() for item in app.config["CORS_ALLOWED_ORIGINS"].split(",") if item.strip()]
    CORS(app, resources={r"/api/*": {"origins": cors_origins or "*"}})
    db.init_app(app)

    @app.after_request
    def apply_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
        )
        return response

    # Ensure models are imported before create_all.
    from taskflow import models as _models  # noqa: F401

    register_routes(app)

    with app.app_context():
        bootstrap_data()

    return app
