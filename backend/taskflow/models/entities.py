from __future__ import annotations

import json
from typing import Any

from taskflow.extensions import db
from taskflow.utils.datetime_utils import now_utc


ticket_assignees = db.Table(
    "ticket_assignees",
    db.Column("ticket_id", db.Integer, db.ForeignKey("ticket.id"), primary_key=True),
    db.Column("user_id", db.Integer, db.ForeignKey("user.id"), primary_key=True),
)

ticket_watchers = db.Table(
    "ticket_watchers",
    db.Column("ticket_id", db.Integer, db.ForeignKey("ticket.id"), primary_key=True),
    db.Column("user_id", db.Integer, db.ForeignKey("user.id"), primary_key=True),
)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(60), unique=True, nullable=False)
    display_name = db.Column(db.String(80), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    position = db.Column(db.String(40), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    comments = db.relationship("Comment", backref="author", lazy=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "position": self.position,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat(),
        }


class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.Text, default="", nullable=False)
    is_default = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    tickets = db.relationship("Ticket", backref="project", lazy=True)
    versions = db.relationship("ProjectVersion", backref="project", lazy=True, cascade="all, delete-orphan")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "is_default": self.is_default,
            "created_at": self.created_at.isoformat(),
        }


class Ticket(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default="", nullable=False)
    module = db.Column(db.String(120), nullable=False)
    ticket_type = db.Column(db.String(20), nullable=False)
    sub_type = db.Column(db.String(80), default="", nullable=False)
    status = db.Column(db.String(20), default="待处理", nullable=False)
    flow_stage = db.Column(db.String(20), default="execute", nullable=False)
    priority = db.Column(db.String(20), default="中", nullable=False)
    attachments = db.Column(db.Text, default="[]", nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    version_id = db.Column(db.Integer, db.ForeignKey("project_version.id"), nullable=True)
    parent_task_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=True)
    related_task_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=True)
    current_owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    executor_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    planner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    tester_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    reject_reason = db.Column(db.String(255), default="", nullable=False)
    creator_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)
    updated_at = db.Column(db.DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    assignees = db.relationship("User", secondary=ticket_assignees, lazy="subquery")
    watchers = db.relationship("User", secondary=ticket_watchers, lazy="subquery")
    comments = db.relationship("Comment", backref="ticket", lazy=True, cascade="all, delete-orphan")
    histories = db.relationship("TicketHistory", backref="ticket", lazy=True, cascade="all, delete-orphan")
    checklist_items = db.relationship("TicketChecklistItem", backref="ticket", lazy=True, cascade="all, delete-orphan")
    version = db.relationship("ProjectVersion", backref="tickets", lazy=True)
    parent_task = db.relationship("Ticket", foreign_keys=[parent_task_id], remote_side=[id], post_update=True)
    related_task = db.relationship("Ticket", foreign_keys=[related_task_id], remote_side=[id], post_update=True)
    current_owner = db.relationship("User", foreign_keys=[current_owner_id])
    executor = db.relationship("User", foreign_keys=[executor_id])
    planner = db.relationship("User", foreign_keys=[planner_id])
    tester = db.relationship("User", foreign_keys=[tester_id])
    creator = db.relationship("User", foreign_keys=[creator_id])

    def to_dict(self, current_user_id: int | None = None) -> dict[str, Any]:
        watcher_ids = [user.id for user in self.watchers]
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "module": self.module,
            "ticket_type": self.ticket_type,
            "sub_type": self.sub_type,
            "status": self.status,
            "flow_stage": self.flow_stage,
            "priority": self.priority,
            "attachments": json.loads(self.attachments or "[]"),
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat(),
            "project_id": self.project_id,
            "project_name": self.project.name if self.project else "",
            "version_id": self.version_id,
            "version_name": self.version.name if self.version else "",
            "parent_task_id": self.parent_task_id,
            "parent_task_title": self.parent_task.title if self.parent_task else "",
            "related_task_id": self.related_task_id,
            "related_task_title": self.related_task.title if self.related_task else "",
            "related_task_type": self.related_task.ticket_type if self.related_task else "",
            "related_task_sub_type": self.related_task.sub_type if self.related_task else "",
            "current_owner_id": self.current_owner_id,
            "current_owner_name": self.current_owner.display_name if self.current_owner else "",
            "executor_id": self.executor_id,
            "executor_name": self.executor.display_name if self.executor else "",
            "planner_id": self.planner_id,
            "planner_name": self.planner.display_name if self.planner else "",
            "tester_id": self.tester_id,
            "tester_name": self.tester.display_name if self.tester else "",
            "reject_reason": self.reject_reason or "",
            "creator_id": self.creator_id,
            "creator_name": self.creator.display_name if self.creator else "",
            "assignees": [user.to_dict() for user in self.assignees],
            "watchers": [user.to_dict() for user in self.watchers],
            "watcher_count": len(watcher_ids),
            "is_following": current_user_id in watcher_ids if current_user_id else False,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class ProjectVersion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text, default="", nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    __table_args__ = (db.UniqueConstraint("project_id", "name", name="uq_project_version_name"),)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
        }


class WikiCategory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    articles = db.relationship("WikiArticle", backref="category", lazy=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
        }


class WikiArticle(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default="", nullable=False)
    attachments = db.Column(db.Text, default="[]", nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("wiki_category.id"), nullable=True)
    creator_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    updater_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)
    updated_at = db.Column(db.DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    creator = db.relationship("User", foreign_keys=[creator_id])
    updater = db.relationship("User", foreign_keys=[updater_id])

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "attachments": json.loads(self.attachments or "[]"),
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else "",
            "creator_id": self.creator_id,
            "creator_name": self.creator.display_name if self.creator else "",
            "updater_id": self.updater_id,
            "updater_name": self.updater.display_name if self.updater else "",
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    mentions = db.Column(db.Text, default="[]", nullable=False)
    screenshot = db.Column(db.String(255), default="", nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "user": self.author.to_dict() if self.author else None,
            "content": self.content,
            "mentions": json.loads(self.mentions or "[]"),
            "screenshot": self.screenshot,
            "created_at": self.created_at.isoformat(),
        }


class CommentReply(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=False, index=True)
    comment_id = db.Column(db.Integer, db.ForeignKey("comment.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    mentions = db.Column(db.Text, default="[]", nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    author = db.relationship("User", foreign_keys=[user_id])
    comment = db.relationship("Comment", foreign_keys=[comment_id])

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "comment_id": self.comment_id,
            "user": self.author.to_dict() if self.author else None,
            "content": self.content,
            "mentions": json.loads(self.mentions or "[]"),
            "created_at": self.created_at.isoformat(),
        }


class TicketChecklistItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=False, index=True)
    content = db.Column(db.String(255), nullable=False)
    is_done = db.Column(db.Boolean, default=False, nullable=False)
    position = db.Column(db.Integer, default=0, nullable=False)
    creator_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)
    updated_at = db.Column(db.DateTime, default=now_utc, onupdate=now_utc, nullable=False)

    creator = db.relationship("User", foreign_keys=[creator_id])

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "content": self.content,
            "is_done": self.is_done,
            "position": self.position,
            "creator_id": self.creator_id,
            "creator_name": self.creator.display_name if self.creator else "",
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class UserNotification(db.Model):
    """站内通知（@提及、工单指派等）。"""

    __tablename__ = "user_notification"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    kind = db.Column(db.String(32), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, default="", nullable=False)
    ticket_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=True)
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    user = db.relationship("User", foreign_keys=[user_id])
    ticket = db.relationship("Ticket", foreign_keys=[ticket_id])

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "body": self.body,
            "ticket_id": self.ticket_id,
            "read": self.read_at is not None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat(),
        }


class TicketHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=False)
    editor_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    summary = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=now_utc, nullable=False)

    editor = db.relationship("User")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "summary": self.summary,
            "editor": self.editor.to_dict() if self.editor else None,
            "created_at": self.created_at.isoformat(),
        }
