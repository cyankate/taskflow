from __future__ import annotations

from typing import Any

from taskflow.constants import BUG_SUB_TYPES, DEMAND_SUB_TYPES, PRIORITIES, TICKET_STATUS, TICKET_TYPES
from taskflow.extensions import db
from taskflow.models import Ticket, TicketHistory


def create_history(ticket: Ticket, user_id: int, summary: str) -> None:
    history = TicketHistory(ticket_id=ticket.id, editor_id=user_id, summary=summary)
    db.session.add(history)


def validate_ticket_payload(payload: dict[str, Any]) -> tuple[bool, str]:
    required = ["title", "module", "ticket_type", "priority", "project_id", "version_id"]
    for key in required:
        if key not in payload or payload[key] in (None, ""):
            return False, f"{key} 不能为空"
    if payload["ticket_type"] not in TICKET_TYPES:
        return False, "ticket_type 不合法"
    if payload["priority"] not in PRIORITIES:
        return False, "priority 不合法"
    sub_type = str(payload.get("sub_type") or "").strip()
    if payload["ticket_type"] == "需求单":
        if sub_type not in DEMAND_SUB_TYPES:
            return False, "需求单子类型不合法"
    elif payload["ticket_type"] == "BUG单":
        if sub_type not in BUG_SUB_TYPES:
            return False, "BUG单子类型不合法"
    role_valid, role_error = validate_ticket_role_payload(payload)
    if not role_valid:
        return False, role_error
    return True, ""


def _to_int_or_none(value: Any) -> int | None:
    if value in (None, "", 0, "0"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def validate_ticket_role_payload(payload: dict[str, Any]) -> tuple[bool, str]:
    ticket_type = payload.get("ticket_type")
    sub_type = str(payload.get("sub_type") or "").strip()
    executor_id = _to_int_or_none(payload.get("executor_id"))
    planner_id = _to_int_or_none(payload.get("planner_id"))
    tester_id = _to_int_or_none(payload.get("tester_id"))

    if ticket_type == "BUG单":
        if executor_id is None:
            return False, "BUG修复负责人不能为空"
        if tester_id is None:
            return False, "测试负责人不能为空"
        return True, ""

    if sub_type == "策划需求":
        if planner_id is None:
            return False, "策划负责人不能为空"
        if tester_id is None:
            return False, "测试负责人不能为空"
        return True, ""
    if sub_type == "程序需求":
        if executor_id is None:
            return False, "程序负责人不能为空"
        if planner_id is None:
            return False, "策划负责人不能为空"
        if tester_id is None:
            return False, "测试负责人不能为空"
        return True, ""
    if sub_type == "美术需求":
        if executor_id is None:
            return False, "美术负责人不能为空"
        if planner_id is None:
            return False, "策划负责人不能为空"
        if tester_id is None:
            return False, "测试负责人不能为空"
        return True, ""
    if sub_type == "测试需求":
        if tester_id is None:
            return False, "测试负责人不能为空"
        return True, ""
    return False, "子类型不合法"


def normalize_role_ids(payload: dict[str, Any]) -> dict[str, int | None]:
    ticket_type = payload.get("ticket_type")
    sub_type = str(payload.get("sub_type") or "").strip()
    executor_id = _to_int_or_none(payload.get("executor_id"))
    planner_id = _to_int_or_none(payload.get("planner_id"))
    tester_id = _to_int_or_none(payload.get("tester_id"))
    if ticket_type == "需求单" and sub_type == "策划需求":
        executor_id = planner_id
    if ticket_type == "需求单" and sub_type == "测试需求":
        executor_id = tester_id
        planner_id = None
    return {
        "executor_id": executor_id,
        "planner_id": planner_id,
        "tester_id": tester_id,
    }


def resolve_initial_flow(ticket_type: str, sub_type: str, role_ids: dict[str, int | None]) -> dict[str, Any]:
    if ticket_type == "BUG单":
        return {"status": "待处理", "flow_stage": "execute", "current_owner_id": role_ids.get("executor_id")}
    if ticket_type == "需求单" and sub_type == "测试需求":
        return {"status": "未开始", "flow_stage": "execute", "current_owner_id": role_ids.get("tester_id")}
    if ticket_type == "需求单" and sub_type == "策划需求":
        return {"status": "未开始", "flow_stage": "execute", "current_owner_id": role_ids.get("planner_id")}
    return {"status": "未开始", "flow_stage": "execute", "current_owner_id": role_ids.get("executor_id")}


def get_available_flow_actions(ticket: Ticket, user_id: int) -> list[str]:
    if ticket.status == "已完成":
        return ["reopen"] if ticket.tester_id == user_id else []
    if ticket.current_owner_id != user_id:
        return []
    if ticket.flow_stage == "execute":
        if ticket.ticket_type == "需求单" and ticket.status in {"未开始", "待处理"}:
            return ["start"]
        return ["submit"]
    if ticket.flow_stage == "accept":
        return ["approve", "reject"]
    if ticket.flow_stage == "test":
        if ticket.ticket_type == "需求单" and ticket.sub_type == "测试需求":
            return ["submit"]
        return ["approve", "reject"]
    return []


def apply_flow_action(ticket: Ticket, action: str, reject_reason: str = "") -> tuple[bool, str]:
    if action not in {"start", "submit", "approve", "reject", "reopen"}:
        return False, "不支持的流转动作"
    if ticket.status == "已完成" and action != "reopen":
        return False, "已完成工单不能再流转"

    executor_id = ticket.executor_id
    planner_id = ticket.planner_id
    tester_id = ticket.tester_id
    ticket_type = ticket.ticket_type
    sub_type = ticket.sub_type

    if action == "start":
        if ticket_type != "需求单":
            return False, "仅需求单支持开始"
        if ticket.flow_stage != "execute":
            return False, "当前阶段不支持开始"
        if ticket.status not in {"未开始", "待处理"}:
            return False, "当前状态不支持开始"
        ticket.status = "进行中"
        ticket.reject_reason = ""
        return True, ""

    if action == "submit":
        if ticket.flow_stage != "execute":
            return False, "当前阶段不支持提交"
        if ticket_type == "需求单" and ticket.status not in {"进行中", "待处理"}:
            return False, "请先开始后再提交"
        if ticket_type == "需求单" and sub_type == "测试需求":
            ticket.status = "已完成"
            ticket.flow_stage = "done"
            ticket.current_owner_id = None
            ticket.reject_reason = ""
            return True, ""
        if ticket_type == "需求单" and sub_type == "策划需求":
            ticket.status = "待测试"
            ticket.flow_stage = "test"
            ticket.current_owner_id = tester_id
            ticket.reject_reason = ""
            return True, ""
        if ticket_type == "BUG单":
            ticket.status = "待测试"
            ticket.flow_stage = "test"
            ticket.current_owner_id = tester_id
            ticket.reject_reason = ""
            return True, ""
        ticket.status = "待验收"
        ticket.flow_stage = "accept"
        ticket.current_owner_id = planner_id
        ticket.reject_reason = ""
        return True, ""

    if action == "approve":
        if ticket.flow_stage == "accept":
            ticket.status = "待测试"
            ticket.flow_stage = "test"
            ticket.current_owner_id = tester_id
            ticket.reject_reason = ""
            return True, ""
        if ticket.flow_stage == "test":
            ticket.status = "已完成"
            ticket.flow_stage = "done"
            ticket.current_owner_id = None
            ticket.reject_reason = ""
            return True, ""
        return False, "当前阶段不支持通过"

    if action == "reopen":
        if ticket.status != "已完成":
            return False, "仅已完成工单支持重开"
        ticket.status = "未开始" if ticket_type == "需求单" else "待处理"
        ticket.flow_stage = "execute"
        if ticket_type == "需求单" and sub_type == "策划需求":
            ticket.current_owner_id = planner_id
        elif ticket_type == "需求单" and sub_type == "测试需求":
            ticket.current_owner_id = tester_id
        else:
            ticket.current_owner_id = executor_id
        ticket.reject_reason = ""
        if not ticket.current_owner_id:
            return False, "流转负责人配置不完整"
        return True, ""

    if action != "reject":
        return False, "不支持的流转动作"
    if ticket.flow_stage not in {"accept", "test"}:
        return False, "当前阶段不支持驳回"
    ticket.status = "未开始" if ticket_type == "需求单" else "待处理"
    ticket.flow_stage = "execute"
    if ticket_type == "需求单" and sub_type == "策划需求":
        ticket.current_owner_id = planner_id
    else:
        ticket.current_owner_id = executor_id
    ticket.reject_reason = reject_reason.strip()[:255]
    return True, ""
