from sqlalchemy import text
from werkzeug.security import generate_password_hash

from taskflow.extensions import db
from taskflow.models import Project, ProjectVersion, Ticket, User


def _ensure_ticket_version_column() -> None:
    columns = db.session.execute(text("PRAGMA table_info(ticket)")).fetchall()
    column_names = {row[1] for row in columns}
    if "version_id" not in column_names:
        db.session.execute(text("ALTER TABLE ticket ADD COLUMN version_id INTEGER"))
        db.session.commit()


def _ensure_default_versions() -> None:
    projects = Project.query.all()
    for project in projects:
        version = ProjectVersion.query.filter_by(project_id=project.id, name="v1.0.0").first()
        if not version:
            version = ProjectVersion(project_id=project.id, name="v1.0.0", description="默认版本")
            db.session.add(version)
            db.session.flush()
        Ticket.query.filter(Ticket.project_id == project.id, Ticket.version_id.is_(None)).update(
            {"version_id": version.id}, synchronize_session=False
        )
    db.session.commit()


def bootstrap_data() -> None:
    db.create_all()
    _ensure_ticket_version_column()
    if not User.query.filter_by(username="admin").first():
        admin = User(
            username="admin",
            display_name="系统管理员",
            password_hash=generate_password_hash("admin123"),
            position="后端程序",
            is_admin=True,
        )
        db.session.add(admin)
    if Project.query.count() == 0:
        db.session.add(Project(name="默认项目", description="系统初始化项目", is_default=True))
    db.session.commit()
    _ensure_default_versions()
