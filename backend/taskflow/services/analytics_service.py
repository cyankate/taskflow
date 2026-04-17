from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from taskflow.constants import POSITIONS
from taskflow.models import Ticket, User
from taskflow.utils.datetime_utils import now_utc

IN_PROGRESS_STATUS = {"待处理", "待验收", "待测试"}
RISK_SOON_HOURS = 48
RISK_STALLED_HOURS = 72
PRIORITY_WEIGHT = {"低": 1.0, "中": 1.5, "高": 2.0, "紧急": 3.0}


@dataclass
class AnalyticsScope:
    project_id: int | None
    version_id: int | None
    from_time: datetime
    to_time: datetime
    days: int
    now: datetime


def _to_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def resolve_scope(
    *,
    project_id: int | None,
    version_id: int | None,
    days: int | None = None,
    from_time: datetime | None = None,
    to_time: datetime | None = None,
) -> AnalyticsScope:
    safe_days = min(max(int(days or 14), 1), 180)
    current = _to_naive_utc(now_utc()) or datetime.utcnow()
    resolved_to = _to_naive_utc(to_time) or current
    resolved_from = _to_naive_utc(from_time) or (resolved_to - timedelta(days=safe_days))
    if resolved_from > resolved_to:
        resolved_from, resolved_to = resolved_to - timedelta(days=safe_days), resolved_to
    return AnalyticsScope(
        project_id=project_id,
        version_id=version_id,
        from_time=resolved_from,
        to_time=resolved_to,
        days=safe_days,
        now=current,
    )


def get_filtered_tickets(scope: AnalyticsScope) -> list[Ticket]:
    query = Ticket.query
    if scope.project_id:
        query = query.filter(Ticket.project_id == scope.project_id)
    if scope.version_id:
        query = query.filter(Ticket.version_id == scope.version_id)
    return query.all()


def _ticket_overlaps_scope(ticket: Ticket, scope: AnalyticsScope) -> bool:
    start_time = _to_naive_utc(ticket.start_time) or _to_naive_utc(ticket.created_at) or scope.from_time
    end_time = _to_naive_utc(ticket.end_time) or scope.to_time
    if end_time < start_time:
        start_time, end_time = end_time, start_time
    return start_time <= scope.to_time and end_time >= scope.from_time


def build_progress_overview(scope: AnalyticsScope, tickets: list[Ticket]) -> dict[str, Any]:
    scoped_tickets = [ticket for ticket in tickets if _ticket_overlaps_scope(ticket, scope)]
    total = len(scoped_tickets)
    in_progress = [t for t in scoped_tickets if t.status in IN_PROGRESS_STATUS]
    done = [t for t in scoped_tickets if t.status == "已完成"]
    overdue = [t for t in in_progress if _to_naive_utc(t.end_time) and _to_naive_utc(t.end_time) < scope.now]
    due_soon = [
        t
        for t in in_progress
        if _to_naive_utc(t.end_time)
        and scope.now <= _to_naive_utc(t.end_time) <= scope.now + timedelta(hours=RISK_SOON_HOURS)
    ]

    by_status: dict[str, int] = defaultdict(int)
    flow_stage: dict[str, int] = defaultdict(int)
    for ticket in scoped_tickets:
        by_status[ticket.status] += 1
        flow_stage[ticket.flow_stage] += 1

    return {
        "scope": {
            "project_id": scope.project_id,
            "version_id": scope.version_id,
            "from": scope.from_time.isoformat(),
            "to": scope.to_time.isoformat(),
            "days": scope.days,
        },
        "summary": {
            "total": total,
            "in_progress": len(in_progress),
            "done": len(done),
            "overdue": len(overdue),
            "due_soon": len(due_soon),
            "completion_rate": round((len(done) / total) * 100, 2) if total else 0,
            "overdue_rate": round((len(overdue) / len(in_progress)) * 100, 2) if in_progress else 0,
        },
        "by_status": dict(by_status),
        "flow_stage": dict(flow_stage),
    }


def build_risk_alerts(scope: AnalyticsScope, tickets: list[Ticket], *, limit: int = 20) -> dict[str, Any]:
    safe_limit = min(max(int(limit or 20), 1), 200)
    items: list[dict[str, Any]] = []
    now_ts = scope.now
    scoped_tickets = [ticket for ticket in tickets if _ticket_overlaps_scope(ticket, scope)]
    for ticket in scoped_tickets:
        if ticket.status not in IN_PROGRESS_STATUS:
            continue
        end_time = _to_naive_utc(ticket.end_time)
        updated_at = _to_naive_utc(ticket.updated_at)
        risk_type = None
        risk_level = "medium"
        detail = ""
        if end_time and end_time < now_ts:
            risk_type = "overdue"
            risk_level = "high"
            detail = f"已逾期 {(now_ts - end_time).days} 天"
        elif end_time and end_time <= now_ts + timedelta(hours=RISK_SOON_HOURS):
            risk_type = "due_soon"
            risk_level = "medium"
            delta = end_time - now_ts
            detail = f"将在 {max(int(delta.total_seconds() // 3600), 0)} 小时内到期"
        elif updated_at and updated_at < now_ts - timedelta(hours=RISK_STALLED_HOURS):
            risk_type = "stalled"
            risk_level = "medium" if ticket.priority in {"低", "中"} else "high"
            delta = now_ts - updated_at
            detail = f"已 {max(int(delta.total_seconds() // 3600), 0)} 小时无更新"

        if not risk_type:
            continue

        items.append(
            {
                "ticket_id": ticket.id,
                "title": ticket.title,
                "risk_type": risk_type,
                "risk_level": risk_level,
                "detail": detail,
                "status": ticket.status,
                "priority": ticket.priority,
                "current_owner_id": ticket.current_owner_id,
                "current_owner_name": ticket.current_owner.display_name if ticket.current_owner else "",
                "end_time": ticket.end_time.isoformat() if ticket.end_time else None,
            }
        )

    def _sort_key(item: dict[str, Any]) -> tuple[int, datetime]:
        level_score = {"high": 0, "medium": 1, "low": 2}.get(item.get("risk_level", "medium"), 1)
        end_time = item.get("end_time")
        parsed = datetime.max
        if end_time:
            try:
                parsed = datetime.fromisoformat(end_time)
            except ValueError:
                parsed = datetime.max
        return level_score, parsed

    items.sort(key=_sort_key)
    return {"items": items[:safe_limit], "total": len(items)}


def build_workload(scope: AnalyticsScope, tickets: list[Ticket], *, group_by: str = "position") -> dict[str, Any]:
    mode = group_by if group_by in {"position", "user"} else "position"
    scoped_tickets = [ticket for ticket in tickets if _ticket_overlaps_scope(ticket, scope)]
    active_tickets = [t for t in scoped_tickets if t.status in IN_PROGRESS_STATUS]
    now_ts = scope.now
    soon_edge = now_ts + timedelta(hours=RISK_SOON_HOURS)

    if mode == "position":
        stats: dict[str, dict[str, Any]] = {
            position: {
                "key": position,
                "label": position,
                "active_ticket_count": 0,
                "weighted_load": 0.0,
                "overdue_in_charge": 0,
                "due_soon_in_charge": 0,
            }
            for position in POSITIONS
        }
        for ticket in active_tickets:
            end_time = _to_naive_utc(ticket.end_time)
            involved = set()
            for assignee in ticket.assignees:
                if assignee.position:
                    involved.add(assignee.position)
            if not involved and ticket.current_owner and ticket.current_owner.position:
                involved.add(ticket.current_owner.position)

            for position in involved:
                if position not in stats:
                    stats[position] = {
                        "key": position,
                        "label": position,
                        "active_ticket_count": 0,
                        "weighted_load": 0.0,
                        "overdue_in_charge": 0,
                        "due_soon_in_charge": 0,
                    }
                row = stats[position]
                row["active_ticket_count"] += 1
                row["weighted_load"] += PRIORITY_WEIGHT.get(ticket.priority, 1.0)
                if end_time and end_time < now_ts:
                    row["overdue_in_charge"] += 1
                elif end_time and now_ts <= end_time <= soon_edge:
                    row["due_soon_in_charge"] += 1
        rows = sorted(stats.values(), key=lambda item: item["weighted_load"], reverse=True)
    else:
        user_stats: dict[int, dict[str, Any]] = {}
        users_by_id: dict[int, User] = {}
        for ticket in active_tickets:
            owner = ticket.current_owner
            if not owner:
                continue
            users_by_id[owner.id] = owner
            if owner.id not in user_stats:
                user_stats[owner.id] = {
                    "user_id": owner.id,
                    "user_name": owner.display_name or owner.username,
                    "position": owner.position,
                    "active_ticket_count": 0,
                    "weighted_load": 0.0,
                    "overdue_in_charge": 0,
                    "due_soon_in_charge": 0,
                }
            row = user_stats[owner.id]
            row["active_ticket_count"] += 1
            row["weighted_load"] += PRIORITY_WEIGHT.get(ticket.priority, 1.0)
            end_time = _to_naive_utc(ticket.end_time)
            if end_time and end_time < now_ts:
                row["overdue_in_charge"] += 1
            elif end_time and now_ts <= end_time <= soon_edge:
                row["due_soon_in_charge"] += 1
        rows = sorted(user_stats.values(), key=lambda item: item["weighted_load"], reverse=True)

    total_active = len(active_tickets)
    return {"group_by": mode, "total_active_tickets": total_active, "rows": rows}


def build_workload_density(
    scope: AnalyticsScope,
    tickets: list[Ticket],
    *,
    member_id: int | None = None,
    bucket_hours: int = 6,
) -> dict[str, Any]:
    safe_bucket_hours = min(max(int(bucket_hours or 6), 1), 24)
    active_tickets = [
        t for t in tickets if t.status in IN_PROGRESS_STATUS and t.current_owner and t.ticket_type == "需求单"
    ]
    member_map: dict[int, User] = {}
    for ticket in active_tickets:
        if ticket.current_owner:
            member_map[ticket.current_owner.id] = ticket.current_owner

    sorted_members = sorted(member_map.values(), key=lambda u: (u.display_name or u.username or ""))
    if member_id and member_id in member_map:
        selected_member_id = member_id
    else:
        selected_member_id = sorted_members[0].id if sorted_members else None

    member_ticket_map: dict[int, list[Ticket]] = defaultdict(list)
    for ticket in active_tickets:
        if ticket.current_owner_id:
            member_ticket_map[ticket.current_owner_id].append(ticket)

    selected_member = next((m for m in sorted_members if m.id == selected_member_id), None)
    selected_member_tickets = member_ticket_map.get(selected_member_id, []) if selected_member_id else []

    current_week_start = scope.now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=scope.now.weekday())
    day_start = current_week_start - timedelta(days=7)
    day_end = current_week_start + timedelta(days=21)

    def _day_tasks(target_day: datetime) -> list[dict[str, Any]]:
        if target_day.weekday() >= 5:
            return []
        start = target_day
        end = target_day + timedelta(days=1)
        tasks: list[dict[str, Any]] = []
        for ticket in selected_member_tickets:
            start_time = _to_naive_utc(ticket.start_time) or scope.from_time
            end_time = _to_naive_utc(ticket.end_time) or scope.to_time
            if end_time < start_time:
                start_time, end_time = end_time, start_time
            if start_time < end and end_time > start:
                tasks.append(
                    {
                        "ticket_id": ticket.id,
                        "title": ticket.title,
                        "sub_type": ticket.sub_type,
                        "priority": ticket.priority,
                        "status": ticket.status,
                        "start_time": ticket.start_time.isoformat() if ticket.start_time else None,
                        "end_time": ticket.end_time.isoformat() if ticket.end_time else None,
                    }
                )
        return sorted(tasks, key=lambda item: item["ticket_id"])

    calendar_weeks: list[dict[str, Any]] = []
    cursor = day_start
    max_task_count = 0
    while cursor < day_end:
        week_days = []
        week_start = cursor
        for offset in range(7):
            day = week_start + timedelta(days=offset)
            day_tasks = _day_tasks(day)
            task_count = len(day_tasks)
            max_task_count = max(max_task_count, task_count)
            week_days.append(
                {
                    "date": day.date().isoformat(),
                    "weekday": offset + 1,
                    "is_weekend": day.weekday() >= 5,
                    "task_count": task_count,
                    "tasks": day_tasks,
                }
            )
        calendar_weeks.append(
            {
                "week_start": week_start.date().isoformat(),
                "week_end": (week_start + timedelta(days=6)).date().isoformat(),
                "week_label": f"{week_start.strftime('%m/%d')} - {(week_start + timedelta(days=6)).strftime('%m/%d')}",
                "days": week_days,
            }
        )
        cursor += timedelta(days=7)

    return {
        "scope": {
            "project_id": scope.project_id,
            "version_id": scope.version_id,
            "from": scope.from_time.isoformat(),
            "to": scope.to_time.isoformat(),
            "days": scope.days,
            "bucket_hours": safe_bucket_hours,
        },
        "members": [{"id": m.id, "name": m.display_name or m.username, "position": m.position} for m in sorted_members],
        "selected_member_id": selected_member_id,
        "selected_member_name": selected_member.display_name if selected_member else "",
        "calendar_weeks": calendar_weeks,
        "max_task_count": max_task_count,
    }
