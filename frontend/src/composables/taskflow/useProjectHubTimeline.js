import { getProjectRoleTab } from "./projectRoleConfig";

const DAY_MS = 24 * 60 * 60 * 1000;
const IN_PROGRESS_STATUS = new Set(["未开始", "进行中", "待处理", "待验收", "待测试"]);

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayIndex(rangeStart, date) {
  return Math.round((startOfDay(date).getTime() - rangeStart.getTime()) / DAY_MS);
}

function formatMd(date) {
  const m = date.getMonth() + 1;
  const day = date.getDate();
  return `${m}/${day}`;
}

function formatRangeLabel(start, endInclusive) {
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} ~ ${formatMd(endInclusive)}`;
}

function formatDurationDaysInclusive(startDay, endDay) {
  const days = Math.max(1, dayIndex(startDay, endDay) + 1);
  return `${days} 天`;
}

function resolveTicketInterval(ticket) {
  let start = parseDate(ticket.start_time) || parseDate(ticket.created_at);
  let end = parseDate(ticket.end_time);

  if (!start && !end) {
    return { kind: "unscheduled" };
  }

  if (!start && end) {
    const endDay = startOfDay(end);
    return {
      kind: "milestone",
      startDay: endDay,
      endDay,
      rangeEndExclusive: addDays(endDay, 1),
    };
  }

  if (!end) {
    const startDay = startOfDay(start);
    const endDay = addDays(startOfDay(new Date()), 7);
    return { kind: "range", startDay, endDay, rangeEndExclusive: addDays(endDay, 1), openEnded: true };
  }

  const startDay = startOfDay(start);
  let endDay = startOfDay(end);
  if (endDay < startDay) {
    const tmp = startDay;
    return {
      kind: "range",
      startDay: startOfDay(end),
      endDay: tmp,
      rangeEndExclusive: addDays(tmp, 1),
      openEnded: false,
    };
  }
  return {
    kind: "range",
    startDay,
    endDay,
    rangeEndExclusive: addDays(endDay, 1),
    openEnded: false,
  };
}

function pickPrimaryMemberId(ticket, positionSet, usersById) {
  const candidates = [ticket.current_owner_id, ticket.executor_id, ticket.planner_id, ticket.tester_id];
  for (const rawId of candidates) {
    const uid = Number(rawId || 0);
    if (!uid) continue;
    if (positionSet.has(usersById.get(uid)?.position)) return uid;
  }
  for (const assignee of ticket.assignees || []) {
    if (positionSet.has(assignee.position)) return Number(assignee.id);
  }
  return null;
}

/** 按自然日列对齐：条带右缘落在「截止日」当日结束线，而非两日刻度中间 */
function buildBarLayout(interval, rangeStart, totalDays, isOverdue) {
  const startIdx = Math.max(0, dayIndex(rangeStart, interval.startDay));
  const endIdx = Math.min(totalDays - 1, dayIndex(rangeStart, interval.endDay));
  const spanDays = Math.max(1, endIdx - startIdx + 1);

  let left = (startIdx / totalDays) * 100;
  let width = (spanDays / totalDays) * 100;
  left = Math.max(0, Math.min(left, 100));
  width = Math.max(width, interval.kind === "milestone" ? (1 / totalDays) * 100 : (1 / totalDays) * 100 * 0.85);
  if (left + width > 100) width = 100 - left;

  let tone = "done";
  const status = String(interval.ticket?.status || "");
  if (status === "已完成") tone = "done";
  else if (IN_PROGRESS_STATUS.has(status)) tone = isOverdue ? "overdue" : "active";
  else tone = "active";

  const sameDay = interval.startDay.getTime() === interval.endDay.getTime();

  return {
    left,
    width,
    tone,
    openEnded: !!interval.openEnded,
    milestone: interval.kind === "milestone",
    startLabel: formatMd(interval.startDay),
    endLabel: formatMd(interval.endDay),
    sameDay,
    showEdgeLabels: width >= 6,
  };
}

function buildAxisTicks(rangeStart, rangeEnd, totalDays) {
  const step = totalDays > 60 ? 7 : totalDays > 31 ? 3 : 1;
  const ticks = [];

  for (let i = 0; ; i += step) {
    const cursor = addDays(rangeStart, i);
    if (cursor >= rangeEnd) break;
    const idx = dayIndex(rangeStart, cursor);
    const left = (idx / totalDays) * 100;
    const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    ticks.push({
      left,
      label: formatMd(cursor),
      weekend,
      date: cursor.toISOString(),
      isMajor: step === 1 || i % (step * 2) === 0,
    });
  }
  return ticks;
}

function buildDayGridLines(rangeStart, rangeEnd, totalDays) {
  const lines = [];
  for (let i = 0; ; i += 1) {
    const cursor = addDays(rangeStart, i);
    if (cursor >= rangeEnd) break;
    lines.push({
      left: (i / totalDays) * 100,
      weekend: cursor.getDay() === 0 || cursor.getDay() === 6,
    });
  }
  return lines;
}

function buildWeekendBands(rangeStart, rangeEnd, totalDays) {
  const bands = [];
  let cursor = startOfDay(rangeStart);
  while (cursor < rangeEnd) {
    const day = cursor.getDay();
    if (day === 0 || day === 6) {
      const idx = dayIndex(rangeStart, cursor);
      bands.push({
        left: (idx / totalDays) * 100,
        width: (1 / totalDays) * 100,
      });
    }
    cursor = addDays(cursor, 1);
  }
  return bands;
}

function buildRow(ticket, rangeStart, rangeEnd, totalDays, isOverdue) {
  const interval = resolveTicketInterval(ticket);
  if (interval.kind === "unscheduled") {
    return { ticket, unscheduled: true };
  }
  interval.ticket = ticket;
  const bar = buildBarLayout(interval, rangeStart, totalDays, isOverdue(ticket));
  const owner =
    (ticket.assignees || []).map((x) => x.display_name).filter(Boolean).join("、") ||
    ticket.executor_name ||
    ticket.current_owner_name ||
    "—";
  const dateRangeText = bar.sameDay ? bar.startLabel : `${bar.startLabel} ~ ${bar.endLabel}`;
  return {
    ticket,
    unscheduled: false,
    bar,
    label: `#${ticket.id} ${ticket.title}`,
    owner,
    status: ticket.status,
    type: ticket.ticket_type,
    dateRangeText,
    tooltip: buildTooltip(ticket, interval, isOverdue(ticket)),
  };
}

function buildTooltip(ticket, interval, overdue) {
  const startText = ticket.start_time || ticket.created_at || "未设置";
  const endText = ticket.end_time || (interval.openEnded ? "未设置（示意至今日+7天）" : "未设置");
  const lines = [
    `#${ticket.id} ${ticket.title}`,
    `类型：${ticket.ticket_type}${ticket.sub_type ? ` / ${ticket.sub_type}` : ""}`,
    `状态：${ticket.status}${overdue ? "（已逾期）" : ""}`,
    `开始：${startText}`,
    `截止：${endText}`,
  ];
  if (interval.kind === "range" || interval.kind === "milestone") {
    lines.push(`日历：${formatMd(interval.startDay)}${interval.startDay.getTime() === interval.endDay.getTime() ? "" : ` ~ ${formatMd(interval.endDay)}`}（按自然日）`);
    if (interval.kind === "range") {
      lines.push(`跨度：${formatDurationDaysInclusive(interval.startDay, interval.endDay)}`);
    } else {
      lines.push("仅截止日");
    }
  }
  return lines.join("\n");
}

function computeRange(scheduledRows) {
  const today = startOfDay(new Date());
  if (!scheduledRows.length) {
    const rangeStart = addDays(today, -14);
    const rangeEnd = addDays(today, 28);
    return { rangeStart, rangeEnd, endInclusive: addDays(rangeEnd, -1) };
  }
  let minDay = scheduledRows[0].interval.startDay;
  let maxExclusive = scheduledRows[0].interval.rangeEndExclusive;
  for (const item of scheduledRows) {
    if (item.interval.startDay < minDay) minDay = item.interval.startDay;
    if (item.interval.rangeEndExclusive > maxExclusive) maxExclusive = item.interval.rangeEndExclusive;
  }
  const rangeStart = addDays(startOfDay(minDay), -3);
  const rangeEnd = addDays(startOfDay(maxExclusive), 7);
  return { rangeStart, rangeEnd, endInclusive: addDays(rangeEnd, -1) };
}

/**
 * @param {object} options
 * @param {Array} options.tickets
 * @param {Array} options.users
 * @param {string|null} options.roleKey
 * @param {(ticket: object) => boolean} options.isOverdue
 */
export function buildProjectHubTimelineModel({ tickets, users, roleKey, isOverdue }) {
  const list = tickets || [];
  const scheduled = [];
  const unscheduled = [];

  for (const ticket of list) {
    const interval = resolveTicketInterval(ticket);
    if (interval.kind === "unscheduled") {
      unscheduled.push(ticket);
      continue;
    }
    interval.ticket = ticket;
    scheduled.push({ ticket, interval });
  }

  const { rangeStart, rangeEnd, endInclusive } = computeRange(scheduled);
  const totalDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS));
  const today = startOfDay(new Date());
  const todayIdx = dayIndex(rangeStart, today);
  const todayPct = Math.max(0, Math.min((todayIdx / totalDays) * 100, 100));

  const ticks = buildAxisTicks(rangeStart, rangeEnd, totalDays);
  const dayGridLines = buildDayGridLines(rangeStart, rangeEnd, totalDays);
  const weekendBands = buildWeekendBands(rangeStart, rangeEnd, totalDays);
  const pixelsPerDay = totalDays > 60 ? 22 : totalDays > 31 ? 28 : 34;
  const axisMinWidth = Math.max(640, totalDays * pixelsPerDay);

  const roleTab = getProjectRoleTab(roleKey);
  const usersById = new Map((users || []).map((item) => [Number(item.id), item]));
  const positionSet = roleTab ? new Set(roleTab.positions) : null;

  const sections = [];

  if (roleTab && positionSet) {
    const members = (users || [])
      .filter((item) => positionSet.has(item.position))
      .sort((a, b) => (a.display_name || a.username || "").localeCompare(b.display_name || b.username || ""));

    const buckets = new Map(members.map((m) => [m.id, []]));
    const orphan = [];

    for (const item of scheduled) {
      const memberId = pickPrimaryMemberId(item.ticket, positionSet, usersById);
      if (memberId && buckets.has(memberId)) {
        buckets.get(memberId).push(item.ticket);
      } else {
        orphan.push(item.ticket);
      }
    }

    for (const member of members) {
      const memberTickets = buckets.get(member.id) || [];
      if (!memberTickets.length) continue;
      memberTickets.sort((a, b) => {
        const ia = resolveTicketInterval(a);
        const ib = resolveTicketInterval(b);
        return ia.startDay.getTime() - ib.startDay.getTime();
      });
      sections.push({
        type: "group",
        label: `${member.display_name || member.username} · ${member.position}`,
        rows: memberTickets.map((ticket) => buildRow(ticket, rangeStart, rangeEnd, totalDays, isOverdue)),
      });
    }

    if (orphan.length) {
      sections.push({
        type: "group",
        label: "未匹配成员",
        rows: orphan.map((ticket) => buildRow(ticket, rangeStart, rangeEnd, totalDays, isOverdue)),
      });
    }
  } else {
    const sorted = [...scheduled]
      .map((item) => item.ticket)
      .sort((a, b) => {
        const ia = resolveTicketInterval(a);
        const ib = resolveTicketInterval(b);
        return ia.startDay.getTime() - ib.startDay.getTime();
      });
    sections.push({
      type: "flat",
      rows: sorted.map((ticket) => buildRow(ticket, rangeStart, rangeEnd, totalDays, isOverdue)),
    });
  }

  const spanningToday = scheduled.filter(
    ({ interval }) => interval.startDay <= today && interval.endDay >= today,
  ).length;

  return {
    rangeStart,
    rangeEnd,
    totalDays,
    axisMinWidth,
    rangeLabel: formatRangeLabel(rangeStart, endInclusive),
    todayPct,
    ticks,
    dayGridLines,
    weekendBands,
    sections,
    unscheduled,
    summary: {
      total: list.length,
      scheduled: scheduled.length,
      unscheduled: unscheduled.length,
      spanningToday,
    },
  };
}
