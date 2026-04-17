import { computed, ref, watch } from "vue";

export function usePaginationState({ dashboard, dashboardViewMode, tickets, projectHub, wikiArticles }) {
  const dashboardTaskPage = ref(1);
  const dashboardTaskPageSize = 8;
  const dashboardBugPage = ref(1);
  const dashboardBugPageSize = 12;
  const dashboardTasks = computed(() =>
    dashboardViewMode.value === "created" ? dashboard.my_created_tasks || [] : dashboard.my_current_tasks || [],
  );
  const dashboardBugs = computed(() =>
    dashboardViewMode.value === "created" ? dashboard.my_created_bugs || [] : dashboard.my_current_bugs || [],
  );

  const pagedDashboardTasks = computed(() => {
    const start = (dashboardTaskPage.value - 1) * dashboardTaskPageSize;
    return dashboardTasks.value.slice(start, start + dashboardTaskPageSize);
  });

  const pagedDashboardBugs = computed(() => {
    const start = (dashboardBugPage.value - 1) * dashboardBugPageSize;
    return dashboardBugs.value.slice(start, start + dashboardBugPageSize);
  });

  const ticketPage = ref(1);
  const ticketPageSize = ref(20);
  const projectDynamicsPage = ref(1);
  const projectDynamicsPageSize = 12;
  const wikiPage = ref(1);
  const wikiPageSize = 10;

  const pagedTickets = computed(() => {
    const list = tickets.value || [];
    const start = (ticketPage.value - 1) * ticketPageSize.value;
    return list.slice(start, start + ticketPageSize.value);
  });

  const pagedProjectDynamics = computed(() => {
    const list = projectHub.dynamics || [];
    const start = (projectDynamicsPage.value - 1) * projectDynamicsPageSize;
    return list.slice(start, start + projectDynamicsPageSize);
  });

  const pagedWikiArticles = computed(() => {
    const list = wikiArticles.value || [];
    const start = (wikiPage.value - 1) * wikiPageSize;
    return list.slice(start, start + wikiPageSize);
  });

  watch(
    () => dashboardTasks.value.length,
    (len) => {
      const totalPages = Math.max(1, Math.ceil(len / dashboardTaskPageSize));
      if (dashboardTaskPage.value > totalPages) dashboardTaskPage.value = totalPages;
    },
  );

  watch(
    () => dashboardBugs.value.length,
    (len) => {
      const totalPages = Math.max(1, Math.ceil(len / dashboardBugPageSize));
      if (dashboardBugPage.value > totalPages) dashboardBugPage.value = totalPages;
    },
  );

  watch(
    () => tickets.value.length,
    (len) => {
      const totalPages = Math.max(1, Math.ceil(len / ticketPageSize.value) || 1);
      if (ticketPage.value > totalPages) ticketPage.value = totalPages;
    },
  );

  watch(
    () => (projectHub.dynamics || []).length,
    (len) => {
      const totalPages = Math.max(1, Math.ceil(len / projectDynamicsPageSize));
      if (projectDynamicsPage.value > totalPages) projectDynamicsPage.value = totalPages;
    },
  );

  watch(
    () => wikiArticles.value.length,
    (len) => {
      const totalPages = Math.max(1, Math.ceil(len / wikiPageSize));
      if (wikiPage.value > totalPages) wikiPage.value = totalPages;
    },
  );

  return {
    dashboardTaskPage,
    dashboardTaskPageSize,
    dashboardBugPage,
    dashboardBugPageSize,
    dashboardTasks,
    dashboardBugs,
    pagedDashboardTasks,
    pagedDashboardBugs,
    ticketPage,
    ticketPageSize,
    projectDynamicsPage,
    projectDynamicsPageSize,
    wikiPage,
    wikiPageSize,
    pagedTickets,
    pagedProjectDynamics,
    pagedWikiArticles,
  };
}
