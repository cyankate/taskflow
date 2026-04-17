import { computed, ref, watch } from "vue";

function groupTasksByParentChain(list) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return [];

  const byId = new Map(items.map((item) => [item.id, item]));
  const childrenMap = new Map();
  const orderIndex = new Map(items.map((item, index) => [item.id, index]));

  for (const item of items) {
    const parentId = item?.parent_task_id;
    if (!parentId || !byId.has(parentId)) continue;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId).push(item);
  }

  for (const [, children] of childrenMap) {
    children.sort((a, b) => (orderIndex.get(a.id) || 0) - (orderIndex.get(b.id) || 0));
  }

  const roots = items
    .filter((item) => {
      const parentId = item?.parent_task_id;
      return !parentId || !byId.has(parentId);
    })
    .sort((a, b) => (orderIndex.get(a.id) || 0) - (orderIndex.get(b.id) || 0));

  const result = [];
  const visited = new Set();

  function appendNode(node) {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);
    result.push(node);
    const children = childrenMap.get(node.id) || [];
    for (const child of children) appendNode(child);
  }

  for (const root of roots) appendNode(root);
  for (const item of items) appendNode(item);

  return result;
}

export function usePaginationState({ dashboard, dashboardViewMode, projectHubTickets, projectHub, wikiArticles }) {
  const dashboardTaskPage = ref(1);
  const dashboardTaskPageSize = 8;
  const dashboardBugPage = ref(1);
  const dashboardBugPageSize = 12;
  const dashboardTasks = computed(() => {
    const list =
      dashboardViewMode.value === "created"
        ? dashboard.my_created_tasks || []
        : dashboardViewMode.value === "related"
          ? dashboard.my_related_tasks || []
          : dashboard.my_current_tasks || [];
    return groupTasksByParentChain(list);
  });
  const dashboardBugs = computed(() => {
    if (dashboardViewMode.value === "created") return dashboard.my_created_bugs || [];
    if (dashboardViewMode.value === "related") return dashboard.my_related_bugs || [];
    return dashboard.my_current_bugs || [];
  });

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
    const list = projectHubTickets.value || [];
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
    () => dashboardViewMode.value,
    () => {
      dashboardTaskPage.value = 1;
      dashboardBugPage.value = 1;
    },
  );

  watch(
    () => projectHubTickets.value.length,
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
