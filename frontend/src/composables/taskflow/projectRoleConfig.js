/** 项目页侧栏岗位子页签（「程序」合并前端/后端程序岗） */
export const PROJECT_ROLE_TABS = [
  { key: "planning", label: "策划", positions: ["策划"], demandSubTypes: ["策划需求"] },
  { key: "dev", label: "程序", positions: ["前端程序", "后端程序"], demandSubTypes: ["程序需求"] },
  { key: "art", label: "美术", positions: ["美术"], demandSubTypes: ["美术需求"] },
  { key: "qa", label: "测试", positions: ["测试"], demandSubTypes: ["测试需求"] },
];

const IN_PROGRESS_STATUS = new Set(["未开始", "进行中", "待处理", "待验收", "待测试"]);

export function getProjectRoleTab(roleKey) {
  return PROJECT_ROLE_TABS.find((item) => item.key === roleKey) || null;
}

function collectInvolvedPositions(ticket, usersById) {
  const positions = new Set();
  const pushPosition = (pos) => {
    if (pos) positions.add(pos);
  };

  for (const assignee of ticket.assignees || []) {
    pushPosition(assignee.position);
  }

  const userIds = [
    ticket.creator_id,
    ticket.current_owner_id,
    ticket.executor_id,
    ticket.planner_id,
    ticket.tester_id,
  ];
  for (const rawId of userIds) {
    const id = Number(rawId || 0);
    if (!id) continue;
    pushPosition(usersById.get(id)?.position);
  }

  return positions;
}

export function ticketMatchesProjectRole(ticket, roleKey, users = []) {
  const tab = getProjectRoleTab(roleKey);
  if (!tab) return true;

  const usersById = new Map((users || []).map((item) => [Number(item.id), item]));
  const positionSet = new Set(tab.positions);
  const subTypeSet = new Set(tab.demandSubTypes);

  if (ticket.ticket_type === "需求单" && subTypeSet.has(ticket.sub_type)) {
    return true;
  }

  const involved = collectInvolvedPositions(ticket, usersById);
  for (const position of involved) {
    if (positionSet.has(position)) return true;
  }

  return false;
}

function isTicketInProgress(ticket) {
  return IN_PROGRESS_STATUS.has(ticket.status);
}

function isTicketOverdueForStats(ticket) {
  if (!isTicketInProgress(ticket)) return false;
  const end = ticket.end_time ? new Date(ticket.end_time) : null;
  if (!end || Number.isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
}

export function buildProjectRoleStats(tickets) {
  const list = tickets || [];
  const total = list.length;
  const inProgress = list.filter(isTicketInProgress);
  const done = list.filter((item) => item.status === "已完成");
  const overdue = inProgress.filter(isTicketOverdueForStats);

  const byStatus = {};
  for (const ticket of list) {
    const status = ticket.status || "未知";
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  return {
    total,
    in_progress: inProgress.length,
    done: done.length,
    overdue: overdue.length,
    completion_rate: total ? Math.round((done.length / total) * 10000) / 100 : 0,
    by_status: byStatus,
  };
}

export function buildRoleEditorNameSet(users, roleKey) {
  const tab = getProjectRoleTab(roleKey);
  if (!tab) return new Set();
  const positionSet = new Set(tab.positions);
  const names = new Set();
  for (const user of users || []) {
    if (!positionSet.has(user.position)) continue;
    const displayName = String(user.display_name || "").trim();
    const username = String(user.username || "").trim();
    if (displayName) names.add(displayName);
    if (username) names.add(username);
  }
  return names;
}

/** 仅保留该岗位成员产生的项目动态（按 editor_name 匹配） */
export function filterProjectRoleDynamics(dynamics, users, roleKey) {
  const tab = getProjectRoleTab(roleKey);
  if (!tab) return dynamics || [];
  const editorNames = buildRoleEditorNameSet(users, roleKey);
  if (!editorNames.size) return [];
  return (dynamics || []).filter((item) => editorNames.has(String(item.editor_name || "").trim()));
}

export function buildProjectRoleMemberRows(tickets, users, roleKey) {
  const tab = getProjectRoleTab(roleKey);
  if (!tab) return [];

  const positionSet = new Set(tab.positions);
  const members = (users || []).filter((item) => positionSet.has(item.position));
  const ticketIdsByUser = new Map();

  const attachTicket = (userId, ticketId) => {
    const uid = Number(userId || 0);
    const tid = Number(ticketId || 0);
    if (!uid || !tid) return;
    if (!ticketIdsByUser.has(uid)) ticketIdsByUser.set(uid, new Set());
    ticketIdsByUser.get(uid).add(tid);
  };

  for (const ticket of tickets || []) {
    if (!isTicketInProgress(ticket)) continue;
    attachTicket(ticket.current_owner_id, ticket.id);
    attachTicket(ticket.executor_id, ticket.id);
    attachTicket(ticket.planner_id, ticket.id);
    attachTicket(ticket.tester_id, ticket.id);
    for (const assignee of ticket.assignees || []) {
      if (positionSet.has(assignee.position)) {
        attachTicket(assignee.id, ticket.id);
      }
    }
  }

  return members
    .map((member) => ({
      user_id: member.id,
      user_name: member.display_name || member.username,
      position: member.position,
      active_ticket_count: ticketIdsByUser.get(member.id)?.size || 0,
    }))
    .sort((a, b) => b.active_ticket_count - a.active_ticket_count);
}
