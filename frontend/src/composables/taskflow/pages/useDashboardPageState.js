import { computed, reactive, ref, watch } from "vue";

const DASHBOARD_STATUS_SORT_ORDER = {
  未开始: 0,
  进行中: 1,
  待处理: 2,
  待验收: 3,
  待测试: 4,
  已完成: 5,
};

const DASHBOARD_PRIORITY_SORT_ORDER = {
  低: 0,
  中: 1,
  高: 2,
  紧急: 3,
};

const DASHBOARD_PENDING_STATUSES = ["未开始", "进行中", "待处理", "待验收", "待测试"];

function parseSortableTime(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
}

function compareDashboardTicketByProp(a, b, prop) {
  if (prop === "id") return Number(a?.id || 0) - Number(b?.id || 0);
  if (prop === "status") {
    const av = DASHBOARD_STATUS_SORT_ORDER[String(a?.status || "")] ?? 999;
    const bv = DASHBOARD_STATUS_SORT_ORDER[String(b?.status || "")] ?? 999;
    if (av !== bv) return av - bv;
    return Number(a?.id || 0) - Number(b?.id || 0);
  }
  if (prop === "priority") {
    const av = DASHBOARD_PRIORITY_SORT_ORDER[String(a?.priority || "")] ?? 999;
    const bv = DASHBOARD_PRIORITY_SORT_ORDER[String(b?.priority || "")] ?? 999;
    if (av !== bv) return av - bv;
    return Number(a?.id || 0) - Number(b?.id || 0);
  }
  if (prop === "end_time") {
    const av = parseSortableTime(a?.end_time);
    const bv = parseSortableTime(b?.end_time);
    if (av !== bv) return av - bv;
    return Number(a?.id || 0) - Number(b?.id || 0);
  }
  return 0;
}

function sortDashboardTickets(list, sortState) {
  const items = Array.isArray(list) ? [...list] : [];
  const prop = sortState?.prop || "";
  const order = sortState?.order || "";
  if (!prop || !order) return items;
  const factor = order === "ascending" ? 1 : -1;
  return items.sort((a, b) => compareDashboardTicketByProp(a, b, prop) * factor);
}

export function useDashboardPageState({
  dashboard,
  dashboardViewMode,
  dashboardTasks,
  dashboardBugs,
  dashboardTaskPage,
  dashboardTaskPageSize,
  dashboardBugPage,
  dashboardBugPageSize,
  user,
  isTicketOverdue,
  isTicketDueWithin24h,
}) {
  const dashboardTaskSort = reactive({ prop: "", order: "" });
  const dashboardBugSort = reactive({ prop: "", order: "" });
  const dashboardDynamicsOnlyMine = ref(false);
  const dashboardStatusFilter = ref("");
  const dashboardQuickFilterMode = ref("");
  const dashboardRiskFilterMode = ref("");

  const dashboardActiveStatuses = computed(() => {
    const status = String(dashboardStatusFilter.value || "").trim();
    if (status) return new Set([status]);
    if (dashboardQuickFilterMode.value === "pending") return new Set(DASHBOARD_PENDING_STATUSES);
    if (dashboardQuickFilterMode.value === "completed") return new Set(["已完成"]);
    return null;
  });

  const dashboardActiveFilterLabel = computed(() => {
    const status = String(dashboardStatusFilter.value || "").trim();
    if (status) return status;
    if (dashboardQuickFilterMode.value === "pending") return "未完成";
    if (dashboardQuickFilterMode.value === "completed") return "已完成";
    if (dashboardRiskFilterMode.value === "overdue") return "已逾期";
    if (dashboardRiskFilterMode.value === "due_24h") return "24h内到期";
    return "";
  });

  const dashboardAllDynamics = computed(() => dashboard.my_dynamics || []);
  const dashboardVisibleDynamics = computed(() => {
    const list = dashboardAllDynamics.value;
    if (!dashboardDynamicsOnlyMine.value) return list;
    const mineNames = new Set([String(user?.display_name || "").trim(), String(user?.username || "").trim()].filter(Boolean));
    return list.filter((item) => mineNames.has(String(item?.editor_name || "").trim()));
  });

  const dashboardDynamicsEmptyText = computed(() =>
    dashboardDynamicsOnlyMine.value ? "暂无你参与的动态（可切换为“全部”查看）" : "暂无项目动态",
  );

  const filteredDashboardTasks = computed(() => {
    const activeStatuses = dashboardActiveStatuses.value;
    const list = dashboardTasks.value || [];
    const byStatus = !activeStatuses || !activeStatuses.size ? list : list.filter((item) => activeStatuses.has(String(item?.status || "")));
    if (dashboardRiskFilterMode.value === "overdue") return byStatus.filter((item) => isTicketOverdue(item));
    if (dashboardRiskFilterMode.value === "due_24h") return byStatus.filter((item) => isTicketDueWithin24h(item));
    return byStatus;
  });

  const filteredDashboardBugs = computed(() => {
    const activeStatuses = dashboardActiveStatuses.value;
    const list = dashboardBugs.value || [];
    const byStatus = !activeStatuses || !activeStatuses.size ? list : list.filter((item) => activeStatuses.has(String(item?.status || "")));
    if (dashboardRiskFilterMode.value === "overdue") return byStatus.filter((item) => isTicketOverdue(item));
    if (dashboardRiskFilterMode.value === "due_24h") return byStatus.filter((item) => isTicketDueWithin24h(item));
    return byStatus;
  });

  const dashboardTaskIdSet = computed(() => new Set((filteredDashboardTasks.value || []).map((item) => item.id)));
  const sortedDashboardTasks = computed(() => sortDashboardTickets(filteredDashboardTasks.value || [], dashboardTaskSort));
  const sortedDashboardBugs = computed(() => sortDashboardTickets(filteredDashboardBugs.value || [], dashboardBugSort));

  const sortedPagedDashboardTasks = computed(() => {
    const start = (dashboardTaskPage.value - 1) * dashboardTaskPageSize;
    return sortedDashboardTasks.value.slice(start, start + dashboardTaskPageSize);
  });
  const sortedPagedDashboardBugs = computed(() => {
    const start = (dashboardBugPage.value - 1) * dashboardBugPageSize;
    return sortedDashboardBugs.value.slice(start, start + dashboardBugPageSize);
  });

  const hasTaskHierarchyInView = computed(() =>
    (filteredDashboardTasks.value || []).some((item) => {
      const parentId = Number(item?.parent_task_id || 0);
      return parentId > 0 && dashboardTaskIdSet.value.has(parentId);
    }),
  );

  const dashboardScopeLabel = computed(() => {
    if (dashboardViewMode.value === "created") return "统计口径：我创建的单";
    if (dashboardViewMode.value === "related") return "统计口径：和我有关的单";
    return "统计口径：待我处理";
  });
  const dashboardTotalTickets = computed(() => Number(dashboard?.ticket_count || 0));
  const dashboardCompletedCount = computed(() => Number(dashboard?.by_status?.["已完成"] || 0));
  const dashboardPendingCount = computed(() =>
    DASHBOARD_PENDING_STATUSES.reduce((sum, status) => sum + Number(dashboard?.by_status?.[status] || 0), 0),
  );
  const dashboardVisibleTicketCount = computed(() => (dashboardTasks.value || []).length + (dashboardBugs.value || []).length);
  const dashboardVisibleTickets = computed(() => [...(filteredDashboardTasks.value || []), ...(filteredDashboardBugs.value || [])]);
  const dashboardOverdueCount = computed(() =>
    dashboardVisibleTickets.value.reduce((sum, ticket) => (isTicketOverdue(ticket) ? sum + 1 : sum), 0),
  );
  const dashboardDueSoon24hCount = computed(() =>
    dashboardVisibleTickets.value.reduce((sum, ticket) => (isTicketDueWithin24h(ticket) ? sum + 1 : sum), 0),
  );
  const dashboardTaskEmptyText = computed(() => {
    if (!dashboardTasks.value?.length) return "暂无需求数据";
    if (dashboardActiveFilterLabel.value) return `当前筛选“${dashboardActiveFilterLabel.value}”下暂无需求`;
    return "暂无需求数据";
  });
  const dashboardBugEmptyText = computed(() => {
    if (!dashboardBugs.value?.length) return "暂无BUG数据";
    if (dashboardActiveFilterLabel.value) return `当前筛选“${dashboardActiveFilterLabel.value}”下暂无BUG`;
    return "暂无BUG数据";
  });

  const dashboardStatusRows = computed(() => {
    const baseList = [...(dashboardTasks.value || []), ...(dashboardBugs.value || [])];
    const total = baseList.length;
    const counts = {};
    for (const item of baseList) {
      const status = String(item?.status || "").trim() || "未知";
      counts[status] = (counts[status] || 0) + 1;
    }
    const knownStatuses = Object.keys(DASHBOARD_STATUS_SORT_ORDER);
    const extraStatuses = Object.keys(counts).filter((status) => !knownStatuses.includes(status)).sort((a, b) => a.localeCompare(b));
    const orderedStatuses = [...knownStatuses, ...extraStatuses];
    return orderedStatuses
      .map((status) => {
        const count = Number(counts[status] || 0);
        const ratio = total > 0 ? (count / total) * 100 : 0;
        return {
          status,
          count,
          ratioLabel: `${ratio.toFixed(1)}%`,
        };
      })
      .filter((row) => row.count > 0);
  });

  watch(
    () => filteredDashboardTasks.value.length,
    (len) => {
      const totalPages = Math.max(1, Math.ceil(len / dashboardTaskPageSize));
      if (dashboardTaskPage.value > totalPages) dashboardTaskPage.value = totalPages;
    },
  );
  watch(
    () => filteredDashboardBugs.value.length,
    (len) => {
      const totalPages = Math.max(1, Math.ceil(len / dashboardBugPageSize));
      if (dashboardBugPage.value > totalPages) dashboardBugPage.value = totalPages;
    },
  );

  function onDashboardTaskSortChange({ prop, order }) {
    dashboardTaskSort.prop = prop || "";
    dashboardTaskSort.order = order || "";
    dashboardTaskPage.value = 1;
  }

  function onDashboardBugSortChange({ prop, order }) {
    dashboardBugSort.prop = prop || "";
    dashboardBugSort.order = order || "";
    dashboardBugPage.value = 1;
  }

  function onDashboardStatusRowClick(row) {
    const status = String(row?.status || "").trim();
    if (!status) return;
    dashboardQuickFilterMode.value = "";
    dashboardRiskFilterMode.value = "";
    dashboardStatusFilter.value = dashboardStatusFilter.value === status ? "" : status;
    dashboardTaskPage.value = 1;
    dashboardBugPage.value = 1;
  }

  function clearDashboardStatusFilter() {
    dashboardStatusFilter.value = "";
    dashboardQuickFilterMode.value = "";
    dashboardRiskFilterMode.value = "";
    dashboardTaskPage.value = 1;
    dashboardBugPage.value = 1;
  }

  function onDashboardKpiFilterClick(nextMode) {
    if (nextMode === "all") {
      clearDashboardStatusFilter();
      return;
    }
    if (dashboardQuickFilterMode.value === nextMode) {
      clearDashboardStatusFilter();
      return;
    }
    dashboardStatusFilter.value = "";
    dashboardRiskFilterMode.value = "";
    dashboardQuickFilterMode.value = nextMode;
    dashboardTaskPage.value = 1;
    dashboardBugPage.value = 1;
  }

  function onDashboardRiskFilterClick(nextMode) {
    if (dashboardRiskFilterMode.value === nextMode) {
      clearDashboardStatusFilter();
      return;
    }
    dashboardStatusFilter.value = "";
    dashboardQuickFilterMode.value = "";
    dashboardRiskFilterMode.value = nextMode;
    dashboardTaskPage.value = 1;
    dashboardBugPage.value = 1;
  }

  function onDashboardVisibleKpiClick() {
    if (!dashboardActiveFilterLabel.value) return;
    clearDashboardStatusFilter();
  }

  function dashboardStatusRowClassName({ row }) {
    const status = String(row?.status || "");
    const activeStatuses = dashboardActiveStatuses.value;
    return activeStatuses?.has(status) ? "dashboard-status-row-active" : "";
  }

  function hasLinkedParentInView(ticket) {
    const parentId = Number(ticket?.parent_task_id || 0);
    return parentId > 0 && dashboardTaskIdSet.value.has(parentId);
  }

  function isChildTask(ticket) {
    return hasTaskHierarchyInView.value && hasLinkedParentInView(ticket);
  }

  function hasChildTasks(ticket) {
    if (!hasTaskHierarchyInView.value) return false;
    return (dashboardTasks.value || []).some(
      (item) => Number(item?.parent_task_id || 0) === Number(ticket?.id || 0) && hasLinkedParentInView(item),
    );
  }

  function getTaskRelationRole(ticket) {
    if (isChildTask(ticket)) return "child";
    if (hasChildTasks(ticket)) return "parent";
    return "";
  }

  function getTaskRelationText(ticket) {
    if (!hasTaskHierarchyInView.value) return "";
    const parentId = Number(ticket?.parent_task_id || 0);
    if (hasLinkedParentInView(ticket)) return `父 #${parentId}`;
    const childCount = (dashboardTasks.value || []).filter(
      (item) => Number(item?.parent_task_id || 0) === Number(ticket?.id || 0) && hasLinkedParentInView(item),
    ).length;
    if (childCount > 0) return `${childCount} 个子任务`;
    return "";
  }

  function resetDashboardFiltersAndSort() {
    dashboardStatusFilter.value = "";
    dashboardQuickFilterMode.value = "";
    dashboardRiskFilterMode.value = "";
    dashboardTaskSort.prop = "";
    dashboardTaskSort.order = "";
    dashboardBugSort.prop = "";
    dashboardBugSort.order = "";
    dashboardTaskPage.value = 1;
    dashboardBugPage.value = 1;
  }

  function onDashboardViewModeChange(nextMode) {
    dashboardViewMode.value = nextMode || "current";
    resetDashboardFiltersAndSort();
  }

  function getDashboardStatusTagType(status) {
    const map = {
      未开始: "info",
      进行中: "warning",
      待处理: "info",
      待验收: "warning",
      待测试: "primary",
      已完成: "success",
    };
    return map[status] || "info";
  }

  function getDashboardPriorityDotClass(priority) {
    const map = {
      低: "is-low",
      中: "is-mid",
      高: "is-high",
      紧急: "is-urgent",
    };
    return map[priority] || "is-mid";
  }

  function getDashboardOwnerName(ticket) {
    return ticket?.current_owner_name || ticket?.executor_name || ticket?.creator_name || "未分配";
  }

  return {
    dashboardDynamicsOnlyMine,
    dashboardQuickFilterMode,
    dashboardRiskFilterMode,
    dashboardActiveFilterLabel,
    dashboardVisibleDynamics,
    dashboardDynamicsEmptyText,
    filteredDashboardTasks,
    filteredDashboardBugs,
    sortedPagedDashboardTasks,
    sortedPagedDashboardBugs,
    dashboardScopeLabel,
    dashboardTotalTickets,
    dashboardPendingCount,
    dashboardCompletedCount,
    dashboardVisibleTicketCount,
    dashboardOverdueCount,
    dashboardDueSoon24hCount,
    dashboardTaskEmptyText,
    dashboardBugEmptyText,
    dashboardStatusRows,
    onDashboardTaskSortChange,
    onDashboardBugSortChange,
    onDashboardStatusRowClick,
    clearDashboardStatusFilter,
    onDashboardKpiFilterClick,
    onDashboardRiskFilterClick,
    onDashboardVisibleKpiClick,
    dashboardStatusRowClassName,
    isChildTask,
    getTaskRelationRole,
    getTaskRelationText,
    getDashboardStatusTagType,
    getDashboardPriorityDotClass,
    getDashboardOwnerName,
    onDashboardViewModeChange,
    resetDashboardFiltersAndSort,
  };
}
