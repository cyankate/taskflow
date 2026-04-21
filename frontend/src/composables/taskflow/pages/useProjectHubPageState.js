import { computed } from "vue";

export function useProjectHubPageState({
  projectHubTicketViewMode,
  projectHubFilterExpanded,
  projectHubTicketFilters,
  projectHubTicketTypeMode,
  ticketPage,
  openTicketDialog,
  openTicketDetail,
  removeTicket,
  setAnalyticsRangeDays,
  setAnalyticsWorkloadGroup,
  setAnalyticsDensityMember,
  densityMaxOverlap,
}) {
  function onProjectHubViewModeChange(nextMode) {
    projectHubTicketViewMode.value = nextMode || "list";
  }

  function onProjectHubFilterChange() {
    ticketPage.value = 1;
  }

  function toggleProjectHubFilters() {
    projectHubFilterExpanded.value = !projectHubFilterExpanded.value;
  }

  function resetProjectHubFilters() {
    projectHubTicketFilters.keyword_field = "title";
    projectHubTicketFilters.keyword = "";
    projectHubTicketFilters.status = "";
    projectHubTicketFilters.related_user_id = null;
    projectHubTicketFilters.executor_id = null;
    projectHubTicketTypeMode.value = "all";
    onProjectHubFilterChange();
  }

  function onProjectHubRowAction(command, row) {
    if (!row?.id) return;
    if (command === "edit") {
      openTicketDialog(row);
      return;
    }
    if (command === "detail") {
      openTicketDetail(row);
      return;
    }
    if (command === "delete") {
      removeTicket(row);
    }
  }

  const projectHubFiltersActive = computed(() => {
    if ((projectHubTicketFilters.keyword || "").trim()) return true;
    if (projectHubTicketFilters.status) return true;
    if (Number(projectHubTicketFilters.related_user_id || 0) > 0) return true;
    if (Number(projectHubTicketFilters.executor_id || 0) > 0) return true;
    return projectHubTicketTypeMode.value !== "all";
  });

  async function onAnalyticsRangeChange(days) {
    await setAnalyticsRangeDays(Number(days || 14));
  }

  async function onAnalyticsWorkloadGroupChange(groupBy) {
    await setAnalyticsWorkloadGroup(groupBy || "position");
  }

  async function onAnalyticsDensityMemberChange(memberId) {
    await setAnalyticsDensityMember(memberId || null);
  }

  function getRiskTagType(riskType) {
    if (riskType === "overdue") return "danger";
    if (riskType === "due_soon") return "warning";
    if (riskType === "stalled") return "info";
    return "";
  }

  function getDensityCellStyle(taskCount, isWeekend = false) {
    if (isWeekend) {
      return {
        background: "#f5f7fa",
        borderColor: "#ebeef5",
      };
    }
    const max = Math.max(Number(densityMaxOverlap.value || 0), 1);
    const value = Number(taskCount || 0);
    if (value <= 0) {
      return {
        background: "#ffffff",
        borderColor: "#ebeef5",
      };
    }
    if (value === 1) {
      return {
        background: "rgba(64, 158, 255, 0.4)",
        borderColor: "rgba(64, 158, 255, 0.5)",
      };
    }
    const maxOverlap = Math.max(max - 1, 1);
    const normalized = Math.min((value - 1) / maxOverlap, 1);
    const alpha = Math.min(0.35 + normalized * 0.55, 0.92);
    return {
      background: `rgba(64, 158, 255, ${alpha.toFixed(3)})`,
      borderColor: "rgba(64, 158, 255, 0.45)",
    };
  }

  function getDensityTooltip(day) {
    if (day?.is_weekend) return "周末留空";
    const tasks = day?.tasks || [];
    if (!tasks.length) return "当天无需求单安排";
    const summary = tasks.map((item) => `#${item.ticket_id} ${item.title}`).join("；");
    return `当天安排 ${tasks.length} 个需求单：${summary}`;
  }

  return {
    onProjectHubViewModeChange,
    onProjectHubFilterChange,
    toggleProjectHubFilters,
    resetProjectHubFilters,
    onProjectHubRowAction,
    projectHubFiltersActive,
    onAnalyticsRangeChange,
    onAnalyticsWorkloadGroupChange,
    onAnalyticsDensityMemberChange,
    getRiskTagType,
    getDensityCellStyle,
    getDensityTooltip,
  };
}
