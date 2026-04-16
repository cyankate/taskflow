from __future__ import annotations

from typing import Any

from taskflow.constants import PRIORITIES, TICKET_STATUS, TICKET_TYPES
from taskflow.extensions import db
from taskflow.models import Ticket, TicketHistory


def create_history(ticket: Ticket, user_id: int, summary: str) -> None:
    history = TicketHistory(ticket_id=ticket.id, editor_id=user_id, summary=summary)
    db.session.add(history)


def validate_ticket_payload(payload: dict[str, Any]) -> tuple[bool, str]:
    required = ["title", "module", "ticket_type", "status", "priority", "project_id", "version_id", "start_time", "end_time"]
    for key in required:
        if key not in payload or payload[key] in (None, ""):
            return False, f"{key} 不能为空"
    if payload["ticket_type"] not in TICKET_TYPES:
        return False, "ticket_type 不合法"
    if payload["status"] not in TICKET_STATUS:
        return False, "status 不合法"
    if payload["priority"] not in PRIORITIES:
        return False, "priority 不合法"
    return True, ""
