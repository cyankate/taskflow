from flask import Flask

from taskflow.routes.api_routes import api_bp


def register_routes(app: Flask) -> None:
    app.register_blueprint(api_bp)
