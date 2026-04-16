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

    CORS(app)
    db.init_app(app)

    # Ensure models are imported before create_all.
    from taskflow import models as _models  # noqa: F401

    register_routes(app)

    with app.app_context():
        bootstrap_data()

    return app
