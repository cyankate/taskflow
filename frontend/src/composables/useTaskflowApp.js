import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncateText(text, maxLength = 72) {
  const raw = String(text || "").trim();
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 1))}...`;
}

export function commentContentWithMentionsHtml(content, mentionIds, usersList) {
  let s = escapeHtml(content || "");
  const ids = Array.isArray(mentionIds) ? mentionIds : [];
  for (const id of ids) {
    const u = usersList.find((x) => x.id === id);
    if (!u) continue;
    const name = (u.display_name || u.username || "").trim();
    if (!name) continue;
    const re = new RegExp("@" + escapeRegex(name), "g");
    s = s.replace(re, `<span class="mention-highlight">@${escapeHtml(name)}</span>`);
  }
  return s;
}

export function mentionDisplayNames(mentionIds, usersList) {
  const ids = Array.isArray(mentionIds) ? mentionIds : [];
  const names = ids
    .map((id) => usersList.find((x) => x.id === id))
    .filter(Boolean)
    .map((u) => (u.display_name || u.username || "").trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";
import api, { getErrorMessage } from "../api";
import {
  formatDeadlineSlot,
  formatDynamicTime,
  isImageAttachment,
  isVideoAttachment,
  normalizeAttachments,
  toDateInputFormat,
} from "./taskflow/fileUtils";
import { useProjectModule } from "./taskflow/useProjectModule";
import { useTicketModule } from "./taskflow/useTicketModule";
import { useWikiModule } from "./taskflow/useWikiModule";
import { useConsoleModule } from "./taskflow/useConsoleModule";
import { useAuthState } from "./taskflow/useAuthState";
import { usePaginationState } from "./taskflow/usePaginationState";

export function useTaskflowApp() {
  const NOTIFICATION_POLL_MS = 15000;
  let bootstrapRunner = async () => {};
  const { token, user, loginForm, saveAuth, clearAuth, doLogin, logout, handleUserMenuCommand } = useAuthState({
    api,
    ElMessage,
    getErrorMessage,
    runBootstrap: (...args) => bootstrapRunner(...args),
  });
  const activeTab = ref("dashboard");
  const dashboardViewMode = ref("current");
  const currentProjectId = ref(null);
  const currentVersionId = ref(null);
  const globalSearchKeyword = ref("");
  const searchResultTip = ref("");

  const users = ref([]);
  const projects = ref([]);
  const versions = ref([]);
  const tickets = ref([]);
  const dashboard = reactive({});
  const stats = reactive({});
  const analytics = reactive({
    range_days: 14,
    workload_group_by: "position",
    density_bucket_hours: 6,
    selected_density_member_id: null,
    progress: { scope: {}, summary: {}, by_status: {}, flow_stage: {} },
    risk: { items: [], total: 0 },
    workload: { group_by: "position", total_active_tickets: 0, rows: [] },
    density: { scope: {}, members: [], selected_member_id: null, calendar_weeks: [], max_task_count: 0 },
  });
  const notification = reactive({
    new_ticket_count: 0,
    overdue_count: 0,
    soon_due_count: 0,
    unread_notification_count: 0,
  });
  const projectHub = reactive({
    projects: [],
    project_id: null,
    selected_project: null,
    summary: { total_tickets: 0, pending_tickets: 0, completed_tickets: 0, bug_tickets: 0 },
    recent_tickets: [],
    dynamics: [],
  });
  const versionForm = reactive({ name: "", description: "" });
  const showVersionCreateForm = ref(false);
  const meta = reactive({
    positions: ["策划", "美术", "前端程序", "后端程序", "测试"],
    ticket_types: ["需求单", "BUG单"],
    demand_sub_types: ["策划需求", "程序需求", "美术需求", "测试需求"],
    bug_sub_types: ["BUG修复"],
    ticket_status: ["待处理", "待验收", "待测试", "已完成"],
    priorities: ["低", "中", "高", "紧急"],
  });

  const projectHubTicketViewMode = ref("list");
  const projectHubTicketTypeMode = ref("all");
  const notificationDrawerVisible = ref(false);
  const lastPolledUnreadCount = ref(null);
  const notificationPollTimer = ref(null);
  const notificationPolling = ref(false);

  const projectHubFilteredTickets = computed(() => {
    const list = tickets.value || [];
    if (projectHubTicketTypeMode.value === "task") {
      return list.filter((item) => item.ticket_type === "需求单");
    }
    if (projectHubTicketTypeMode.value === "bug") {
      return list.filter((item) => item.ticket_type === "BUG单");
    }
    return list;
  });

  const kanbanColumns = computed(() => {
    const statuses = meta.ticket_status || [];
    const byStatus = {};
    for (const t of projectHubFilteredTickets.value) {
      const st = t.status || "待处理";
      if (!byStatus[st]) byStatus[st] = [];
      byStatus[st].push(t);
    }
    return statuses.map((status) => ({
      status,
      tickets: byStatus[status] || [],
    }));
  });

  const ticketFilter = reactive({ project_id: null, version_id: null });

  const userDialog = reactive({
    visible: false,
    form: { id: null, username: "", display_name: "", password: "", position: "策划", is_admin: false },
  });
  const projectDialog = reactive({ visible: false, form: { id: null, name: "", description: "" } });
  const ticketDialog = reactive({
    visible: false,
    form: {
      id: null,
      title: "",
      description: "",
      module: "",
      ticket_type: "需求单",
      sub_type: "策划需求",
      project_id: null,
      version_id: null,
      priority: "中",
      executor_id: null,
      planner_id: null,
      tester_id: null,
      parent_task_id: null,
      related_task_id: null,
      start_time: "",
      end_time: "",
    },
  });

  const ticketDetail = reactive({
    visible: false,
    editing: false,
    returnContext: {
      activeTab: "dashboard",
      scrollY: 0,
    },
    ticket: {},
    editForm: {
      id: null,
      title: "",
      description: "",
      module: "",
      ticket_type: "需求单",
      sub_type: "策划需求",
      project_id: null,
      version_id: null,
      priority: "中",
      executor_id: null,
      planner_id: null,
      tester_id: null,
      parent_task_id: null,
      related_task_id: null,
      start_time: "",
      end_time: "",
      attachments: [],
    },
    quickForm: {
      priority: "中",
    },
    comments: [],
    commentReplies: [],
    histories: [],
    activityTab: "comments",
    newComment: "",
    commentComposerExpanded: false,
    descriptionEditing: false,
    descriptionDraft: "",
    commentMentionIds: [],
    replyDrafts: {},
    replyMentionIds: {},
    replyEditorOpen: {},
    checklistItems: [],
    newChecklistItem: "",
    childTaskTickets: [],
    relatedBugTickets: [],
    childTaskProgress: { total: 0, done: 0 },
    relatedBugProgress: { total: 0, done: 0 },
  });
  const selectedTicketIds = ref([]);
  const batchEdit = reactive({
    priority: "",
    assignee_ids: [],
  });
  const imagePreview = reactive({
    visible: false,
    url: "",
    name: "",
  });
  const wikiCategories = ref([]);
  const wikiArticles = ref([]);
  const wikiFilter = reactive({ category_id: null });
  const wikiEditorRef = ref(null);
  const wikiDialog = reactive({
    visible: false,
    form: { id: null, title: "", category_name: "", content: "", attachments: [] },
  });
  const wikiAttachmentError = ref("");
  const ticketAttachmentError = ref("");
  const wikiDetail = reactive({
    visible: false,
    article: {},
  });

  const workloadRows = computed(() => analytics.workload?.rows || []);
  const densityCalendarWeeks = computed(() => analytics.density?.calendar_weeks || []);
  const densityMaxOverlap = computed(() => Number(analytics.density?.max_task_count || 0));
  const userInitial = computed(() => {
    const text = (user.display_name || user.username || "U").toString().trim();
    return text ? text[0].toUpperCase() : "U";
  });
  const MAX_ATTACHMENT_SIZE_MB = 20;
  const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
  const ticketDetailAttachments = computed(() => normalizeAttachments(ticketDetail.ticket.attachments));
  const detailCreatorName = computed(() => {
    const creatorId = ticketDetail.ticket?.creator_id;
    if (!creatorId) return "-";
    const matched = users.value.find((item) => item.id === creatorId);
    return matched?.display_name || matched?.username || `用户#${creatorId}`;
  });
  const detailAssigneeGroups = computed(() => {
    const assignees = ticketDetail.ticket?.assignees || [];
    const grouped = assignees.reduce((acc, item) => {
      const key = item.position || "未分组";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item.display_name || item.username || `用户#${item.id}`);
      return acc;
    }, {});
    return Object.entries(grouped).map(([position, members]) => ({ position, members }));
  });
  const taskTicketOptions = computed(() =>
    (tickets.value || []).filter((item) => item.ticket_type !== "BUG单").map((item) => ({ id: item.id, title: item.title })),
  );
  const {
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
  } = usePaginationState({
    dashboard,
    dashboardViewMode,
    projectHubTickets: projectHubFilteredTickets,
    projectHub,
    wikiArticles,
  });

  watch(
    () => [!!user.is_admin, activeTab.value],
    ([isAdmin, tab]) => {
      if (!isAdmin && (tab === "users" || tab === "projects")) {
        activeTab.value = "dashboard";
      }
    },
  );

  function openImagePreview(item) {
    imagePreview.url = item?.url || "";
    imagePreview.name = item?.name || "图片预览";
    imagePreview.visible = !!imagePreview.url;
  }

  const {
    loadWikiCategories,
    loadWikiArticles,
    setWikiCategoryFilter,
    openWikiDialog,
    onWikiEditorInput,
    insertWikiMedia,
    onWikiAttachmentChange,
    removeWikiAttachment,
    saveWikiArticle,
    openWikiDetail,
    openWikiDetailByRow,
    removeWikiArticle,
  } = useWikiModule({
    api,
    ElMessage,
    ElMessageBox,
    getErrorMessage,
    nextTick,
    wikiCategories,
    wikiArticles,
    wikiFilter,
    wikiPage,
    wikiDialog,
    wikiDetail,
    wikiEditorRef,
    wikiAttachmentError,
    MAX_ATTACHMENT_SIZE_BYTES,
    MAX_ATTACHMENT_SIZE_MB,
    normalizeAttachments,
  });

  const {
    consoleStatus,
    consoleForms,
    consoleSubView,
    dbExplorer,
    filterOperators,
    selectedGatewayId,
    currentSkynetGateway,
    loadConsoleStatus,
    openDbExplorer,
    closeDbExplorer,
    selectDbTable,
    addFilterRow,
    removeFilterRow,
    needsFilterValue,
    runDbExplorerQuery,
    clearDbExplorerResult,
    clearDbExplorerSql,
    clearDbExplorerFilters,
    hotReload,
    hotReloadFileInputRef,
    hotReloadDiffers,
    openHotReload,
    closeHotReload,
    selectHotReloadFile,
    selectHotReloadLocalFile,
    loadHotReloadServerFiles,
    triggerHotReloadFilePick,
    onHotReloadLocalFileChange,
    removeHotReloadLocalFile,
    clearHotReloadLocalPick,
    uploadHotReloadLocalToSkynet,
    hotReloadLocalFilesStats,
    hotReloadDiffVisible,
    hotReloadDiffRows,
    openHotReloadDiff,
    closeHotReloadDiff,
    copyAccountInfo,
    sendSkynetCommand,
    dbExplorerTableRows,
    isExpandableDbCellValue,
    formatDbCellPreview,
    formatDbCellExpanded,
  } = useConsoleModule({
    api,
    ElMessage,
    getErrorMessage,
  });

  watch(
    () => activeTab.value,
    (tab) => {
      if (tab === "console") {
        loadConsoleStatus();
      }
    },
  );

  let loadVersionsForTicketModule = async () => {};

  const {
    loadTickets,
    runGlobalSearch,
    onTicketProjectChange,
    openTicketDialog,
    createQuickTicket,
    saveTicket,
    removeTicket,
    handleTicketRowClick,
    openTicketDetail,
    saveTicketDetailEdit,
    saveTicketQuickEdit,
    runTicketFlowAction,
    onDetailProjectChange,
    onDetailAttachmentChange,
    removeDetailAttachment,
    persistTicketAttachments,
    addComment,
    saveTicketDescription,
    toggleTicketFollow,
    addCommentReply,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    batchUpdateTickets,
  } = useTicketModule({
    api,
    ElMessage,
    ElMessageBox,
    getErrorMessage,
    ticketDialog,
    ticketDetail,
    ticketAttachmentError,
    ticketFilter,
    tickets,
    ticketPage,
    globalSearchKeyword,
    currentProjectId,
    currentVersionId,
    activeTab,
    dashboardViewMode,
    selectedTicketIds,
    batchEdit,
    projects,
    versions,
    meta,
    MAX_ATTACHMENT_SIZE_BYTES,
    MAX_ATTACHMENT_SIZE_MB,
    normalizeAttachments,
    toDateInputFormat,
    loadVersions: (...args) => loadVersionsForTicketModule(...args),
    refreshAllData,
  });

  const {
    loadMeta,
    loadUsers,
    loadProjects,
    loadVersions,
    loadProjectHub,
    loadDashboard,
    loadStats,
    loadAnalytics,
    loadNotifications,
    notificationFeed,
    loadNotificationFeed,
    markNotificationRead,
    markAllNotificationsRead,
    onGlobalProjectChange,
    onGlobalVersionChange,
    selectVersionByButton,
    setAnalyticsRangeDays,
    setAnalyticsWorkloadGroup,
    setAnalyticsDensityMember,
    setAnalyticsDensityBucket,
    bootstrap,
    openUserDialog,
    saveUser,
    removeUser,
    openProjectDialog,
    saveProject,
    removeProject,
    setDefaultProject,
    createVersion,
    cancelCreateVersion,
    removeVersion,
  } = useProjectModule({
    api,
    ElMessage,
    ElMessageBox,
    meta,
    users,
    projects,
    versions,
    dashboard,
    stats,
    analytics,
    notification,
    projectHub,
    userDialog,
    projectDialog,
    versionForm,
    showVersionCreateForm,
    currentProjectId,
    currentVersionId,
    ticketFilter,
    ticketPage,
    projectDynamicsPage,
    loadTickets,
    loadWikiCategories,
    loadWikiArticles,
  });

  loadVersionsForTicketModule = loadVersions;
  bootstrapRunner = bootstrap;

  async function openNotificationCenter() {
    notificationDrawerVisible.value = true;
    await loadNotificationFeed(1);
  }

  async function onNotificationItemClick(item) {
    if (!item.read) {
      await markNotificationRead(item.id);
    }
    if (item.ticket_id) {
      notificationDrawerVisible.value = false;
      await openTicketDetail({ id: item.ticket_id });
    }
  }

  function closeTicketDetail() {
    const fallbackTab = ticketDetail.returnContext?.activeTab || "dashboard";
    const fallbackScrollY = Number(ticketDetail.returnContext?.scrollY || 0);
    ticketDetail.visible = false;
    ticketDetail.editing = false;
    if (activeTab.value !== fallbackTab) {
      activeTab.value = fallbackTab;
    }
    nextTick(() => {
      if (typeof window !== "undefined") {
        window.scrollTo({ top: Math.max(0, fallbackScrollY), behavior: "auto" });
      }
    });
  }

  async function onNotificationFeedPageChange(page) {
    await loadNotificationFeed(page);
  }

  function onCommentMentionIdsChange(ids) {
    if (!Array.isArray(ids)) return;
    let nextContent = ticketDetail.newComment || "";
    for (const id of ids) {
      const userItem = users.value.find((item) => item.id === id);
      const name = (userItem?.display_name || userItem?.username || "").trim();
      if (!name) continue;
      const mentionRegex = new RegExp(`(^|\\s)@${escapeRegex(name)}(?=\\s|$)`);
      if (!mentionRegex.test(nextContent)) {
        nextContent = `${nextContent.trimEnd()}${nextContent.trim() ? " " : ""}@${name}`;
      }
    }
    ticketDetail.newComment = nextContent;
  }

  function onReplyMentionIdsChange(commentId, ids) {
    if (!Array.isArray(ids) || !commentId) return;
    const current = ticketDetail.replyDrafts[commentId] || "";
    let nextContent = current;
    for (const id of ids) {
      const userItem = users.value.find((item) => item.id === id);
      const name = (userItem?.display_name || userItem?.username || "").trim();
      if (!name) continue;
      const mentionRegex = new RegExp(`(^|\\s)@${escapeRegex(name)}(?=\\s|$)`);
      if (!mentionRegex.test(nextContent)) {
        nextContent = `${nextContent.trimEnd()}${nextContent.trim() ? " " : ""}@${name}`;
      }
    }
    ticketDetail.replyDrafts[commentId] = nextContent;
  }

  function getCommentReplies(commentId) {
    const all = Array.isArray(ticketDetail.commentReplies) ? ticketDetail.commentReplies : [];
    return all.filter((item) => item.comment_id === commentId);
  }

  function isReplyEditorOpen(commentId) {
    return !!ticketDetail.replyEditorOpen?.[commentId];
  }

  function toggleReplyEditor(commentId) {
    if (!commentId) return;
    ticketDetail.replyEditorOpen = {
      ...(ticketDetail.replyEditorOpen || {}),
      [commentId]: !ticketDetail.replyEditorOpen?.[commentId],
    };
  }

  function expandCommentComposer() {
    ticketDetail.commentComposerExpanded = true;
  }

  function maybeCollapseCommentComposer() {
    setTimeout(() => {
      if (typeof document !== "undefined") {
        const active = document.activeElement;
        if (active?.closest?.(".ticket-comment-composer")) return;
      }
      if (!(ticketDetail.newComment || "").trim()) {
        ticketDetail.commentComposerExpanded = false;
      }
    }, 0);
  }

  function onProjectHubSelectionChange(rows) {
    selectedTicketIds.value = (rows || []).map((row) => row.id);
  }

  async function submitBatchEdit() {
    await batchUpdateTickets();
  }

  async function createSubTaskFromDetail() {
    const parentId = ticketDetail.ticket?.id;
    if (!parentId) return;
    await openTicketDialog();
    ticketDialog.form.ticket_type = "需求单";
    ticketDialog.form.parent_task_id = parentId;
    ticketDialog.form.related_task_id = null;
  }

  async function createBugFromDetail() {
    const relatedId = ticketDetail.ticket?.id;
    if (!relatedId) return;
    await openTicketDialog();
    ticketDialog.form.ticket_type = "BUG单";
    ticketDialog.form.parent_task_id = null;
    ticketDialog.form.related_task_id = relatedId;
  }

  async function runTopbarSearch() {
    if (ticketDetail.visible) {
      ticketDetail.visible = false;
      ticketDetail.editing = false;
      ticketDetail.descriptionEditing = false;
    }
    ticketFilter.project_id = currentProjectId.value;
    ticketFilter.version_id = currentVersionId.value;
    await runGlobalSearch();
    const keyword = globalSearchKeyword.value.trim();
    searchResultTip.value = keyword ? `已搜索到 ${tickets.value.length} 条结果` : "";
    if (activeTab.value !== "project_hub") {
      activeTab.value = "project_hub";
    }
  }

  async function clearTopbarSearch() {
    if (ticketDetail.visible) {
      ticketDetail.visible = false;
      ticketDetail.editing = false;
      ticketDetail.descriptionEditing = false;
    }
    globalSearchKeyword.value = "";
    searchResultTip.value = "";
    ticketFilter.project_id = currentProjectId.value;
    ticketFilter.version_id = currentVersionId.value;
    await runGlobalSearch();
  }

  async function openNotificationFromToast(item) {
    if (!item) return;
    if (!item.read) {
      await markNotificationRead(item.id);
    }
    if (item.ticket_id) {
      notificationDrawerVisible.value = false;
      await openTicketDetail({ id: item.ticket_id });
    }
  }

  function clearNotificationPolling() {
    if (notificationPollTimer.value) {
      clearInterval(notificationPollTimer.value);
      notificationPollTimer.value = null;
    }
    notificationPolling.value = false;
    lastPolledUnreadCount.value = null;
  }

  async function fetchUnreadNotificationCount() {
    const params = {};
    if (currentProjectId.value) params.project_id = currentProjectId.value;
    const { data } = await api.get("/notifications", { params });
    return Number(data?.unread_notification_count || 0);
  }

  async function pollNotificationsAndNotify() {
    if (!token.value || notificationPolling.value) return;
    notificationPolling.value = true;
    try {
      const currentUnread = await fetchUnreadNotificationCount();
      notification.unread_notification_count = currentUnread;
      const prevUnread = lastPolledUnreadCount.value;
      if (typeof prevUnread === "number" && currentUnread > prevUnread) {
        const delta = currentUnread - prevUnread;
        await loadNotificationFeed(1);
        const unreadPreview = (notificationFeed.items || []).filter((item) => !item.read).slice(0, Math.min(delta, 3));
        const previewItems = unreadPreview.length ? unreadPreview : (notificationFeed.items || []).slice(0, 3);
        const previewNode = h(
          "div",
          { class: "notification-toast-preview" },
          previewItems.map((item) =>
            h(
              "div",
              {
                class: "notification-toast-line",
                style: "margin-top: 6px; line-height: 1.45; display: flex; gap: 8px; align-items: baseline;",
              },
              [
                h(
                  "span",
                  { style: "flex: 1; min-width: 0;" },
                  truncateText(`${item.title}${item.body ? `：${item.body}` : ""}`, 88),
                ),
                h(
                  "span",
                  {
                    style: "color: #409eff; cursor: pointer; white-space: nowrap; font-size: 12px;",
                    onClick: (event) => {
                      event.stopPropagation();
                      openNotificationFromToast(item);
                    },
                  },
                  "查看",
                ),
              ],
            ),
          ),
        );
        ElNotification({
          title: "新通知",
          message: previewNode,
          type: "info",
          duration: 7000,
          position: "bottom-right",
          onClick: () => {
            openNotificationCenter();
          },
        });
      }
      lastPolledUnreadCount.value = currentUnread;
    } catch {
      // Ignore polling errors to avoid interrupting user workflow.
    } finally {
      notificationPolling.value = false;
    }
  }

  function startNotificationPolling() {
    if (notificationPollTimer.value) return;
    notificationPollTimer.value = setInterval(() => {
      pollNotificationsAndNotify();
    }, NOTIFICATION_POLL_MS);
  }

  async function refreshAllData() {
    ticketFilter.project_id = currentProjectId.value;
    await Promise.all([
      loadTickets(),
      loadDashboard(currentProjectId.value),
      loadAnalytics(currentProjectId.value),
      loadNotifications(currentProjectId.value),
      loadProjectHub(currentProjectId.value),
    ]);
  }

  onMounted(async () => {
    if (token.value) {
      try {
        await bootstrap();
        lastPolledUnreadCount.value = Number(notification.unread_notification_count || 0);
        startNotificationPolling();
      } catch {
        clearAuth();
      }
    }
  });

  watch(
    token,
    (nextToken) => {
      if (nextToken) {
        lastPolledUnreadCount.value = Number(notification.unread_notification_count || 0);
        startNotificationPolling();
      } else {
        clearNotificationPolling();
      }
    },
    { immediate: false },
  );

  onUnmounted(() => {
    clearNotificationPolling();
  });

  return {
    token,
    user,
    activeTab,
    dashboardViewMode,
    currentProjectId,
    currentVersionId,
    globalSearchKeyword,
    searchResultTip,
    loginForm,
    users,
    projects,
    versions,
    tickets,
    dashboard,
    stats,
    analytics,
    notification,
    notificationDrawerVisible,
    notificationFeed,
    projectHubTicketViewMode,
    projectHubTicketTypeMode,
    projectHubFilteredTickets,
    kanbanColumns,
    projectHub,
    versionForm,
    showVersionCreateForm,
    meta,
    ticketFilter,
    userDialog,
    projectDialog,
    ticketDialog,
    ticketDetail,
    selectedTicketIds,
    batchEdit,
    imagePreview,
    wikiCategories,
    wikiArticles,
    wikiFilter,
    wikiPage,
    wikiPageSize,
    wikiEditorRef,
    wikiDialog,
    wikiAttachmentError,
    ticketAttachmentError,
    wikiDetail,
    workloadRows,
    densityCalendarWeeks,
    densityMaxOverlap,
    userInitial,
    MAX_ATTACHMENT_SIZE_MB,
    MAX_ATTACHMENT_SIZE_BYTES,
    ticketDetailAttachments,
    detailCreatorName,
    detailAssigneeGroups,
    taskTicketOptions,
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
    pagedTickets,
    pagedProjectDynamics,
    pagedWikiArticles,
    formatDynamicTime,
    formatDeadlineSlot,
    toDateInputFormat,
    normalizeAttachments,
    isImageAttachment,
    isVideoAttachment,
    openImagePreview,
    saveAuth,
    clearAuth,
    doLogin,
    logout,
    handleUserMenuCommand,
    bootstrap,
    loadMeta,
    loadUsers,
    loadProjects,
    loadVersions,
    loadProjectHub,
    onGlobalProjectChange,
    onGlobalVersionChange,
    selectVersionByButton,
    loadTickets,
    runGlobalSearch,
    runTopbarSearch,
    clearTopbarSearch,
    loadDashboard,
    loadStats,
    loadAnalytics,
    setAnalyticsRangeDays,
    setAnalyticsWorkloadGroup,
    setAnalyticsDensityMember,
    setAnalyticsDensityBucket,
    loadNotifications,
    loadNotificationFeed,
    markNotificationRead,
    markAllNotificationsRead,
    openNotificationCenter,
    closeTicketDetail,
    onNotificationItemClick,
    onNotificationFeedPageChange,
    loadWikiCategories,
    loadWikiArticles,
    setWikiCategoryFilter,
    openWikiDialog,
    onWikiEditorInput,
    insertWikiMedia,
    onWikiAttachmentChange,
    removeWikiAttachment,
    saveWikiArticle,
    openWikiDetail,
    openWikiDetailByRow,
    removeWikiArticle,
    consoleStatus,
    consoleForms,
    consoleSubView,
    dbExplorer,
    filterOperators,
    selectedGatewayId,
    currentSkynetGateway,
    loadConsoleStatus,
    openDbExplorer,
    closeDbExplorer,
    selectDbTable,
    addFilterRow,
    removeFilterRow,
    needsFilterValue,
    runDbExplorerQuery,
    clearDbExplorerResult,
    clearDbExplorerSql,
    clearDbExplorerFilters,
    hotReload,
    hotReloadFileInputRef,
    hotReloadDiffers,
    openHotReload,
    closeHotReload,
    selectHotReloadFile,
    selectHotReloadLocalFile,
    loadHotReloadServerFiles,
    triggerHotReloadFilePick,
    onHotReloadLocalFileChange,
    removeHotReloadLocalFile,
    clearHotReloadLocalPick,
    uploadHotReloadLocalToSkynet,
    hotReloadLocalFilesStats,
    hotReloadDiffVisible,
    hotReloadDiffRows,
    openHotReloadDiff,
    closeHotReloadDiff,
    copyAccountInfo,
    sendSkynetCommand,
    dbExplorerTableRows,
    isExpandableDbCellValue,
    formatDbCellPreview,
    formatDbCellExpanded,
    openUserDialog,
    saveUser,
    removeUser,
    openProjectDialog,
    saveProject,
    removeProject,
    setDefaultProject,
    createVersion,
    cancelCreateVersion,
    removeVersion,
    onTicketProjectChange,
    openTicketDialog,
    createQuickTicket,
    saveTicket,
    removeTicket,
    handleTicketRowClick,
    openTicketDetail,
    saveTicketDetailEdit,
    saveTicketQuickEdit,
    runTicketFlowAction,
    onDetailProjectChange,
    onDetailAttachmentChange,
    removeDetailAttachment,
    persistTicketAttachments,
    addComment,
    saveTicketDescription,
    toggleTicketFollow,
    addCommentReply,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    onProjectHubSelectionChange,
    submitBatchEdit,
    createSubTaskFromDetail,
    createBugFromDetail,
    onCommentMentionIdsChange,
    onReplyMentionIdsChange,
    getCommentReplies,
    isReplyEditorOpen,
    toggleReplyEditor,
    expandCommentComposer,
    maybeCollapseCommentComposer,
    commentContentWithMentionsHtml,
    mentionDisplayNames,
    refreshAllData,
  };
}
