import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import api, { getErrorMessage } from "../api";
import {
  formatDynamicTime,
  isImageAttachment,
  isVideoAttachment,
  normalizeAttachments,
  toDateInputFormat,
} from "./taskflow/fileUtils";
import { useProjectModule } from "./taskflow/useProjectModule";
import { useTicketModule } from "./taskflow/useTicketModule";
import { useWikiModule } from "./taskflow/useWikiModule";
import { useAuthState } from "./taskflow/useAuthState";
import { usePaginationState } from "./taskflow/usePaginationState";

export function useTaskflowApp() {
  let bootstrapRunner = async () => {};
  const { token, user, loginForm, saveAuth, clearAuth, doLogin, logout, handleUserMenuCommand } = useAuthState({
    api,
    ElMessage,
    getErrorMessage,
    runBootstrap: (...args) => bootstrapRunner(...args),
  });
  const activeTab = ref("dashboard");
  const currentProjectId = ref(null);
  const currentVersionId = ref(null);
  const globalSearchKeyword = ref("");

  const users = ref([]);
  const projects = ref([]);
  const versions = ref([]);
  const tickets = ref([]);
  const dashboard = reactive({});
  const stats = reactive({});
  const notification = reactive({ new_ticket_count: 0, overdue_count: 0, soon_due_count: 0 });
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
    ticket_status: ["待处理", "处理中", "待验收", "已完成", "已拒绝", "已延期"],
    priorities: ["低", "中", "高", "紧急"],
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
      sub_type: "",
      project_id: null,
      version_id: null,
      status: "待处理",
      priority: "中",
      assignee_ids: [],
      start_time: "",
      end_time: "",
    },
  });

  const ticketDetail = reactive({
    visible: false,
    editing: false,
    ticket: {},
    editForm: {
      id: null,
      title: "",
      description: "",
      module: "",
      ticket_type: "需求单",
      sub_type: "",
      project_id: null,
      version_id: null,
      status: "待处理",
      priority: "中",
      assignee_ids: [],
      start_time: "",
      end_time: "",
      attachments: [],
    },
    comments: [],
    histories: [],
    newComment: "",
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

  const workloadRows = computed(() =>
    Object.entries(stats.workload_by_position || {}).map(([position, count]) => ({ position, count })),
  );
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
    tickets,
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
    onDetailProjectChange,
    onDetailAttachmentChange,
    removeDetailAttachment,
    persistTicketAttachments,
    addComment,
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
    loadNotifications,
    onGlobalProjectChange,
    onGlobalVersionChange,
    selectVersionByButton,
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

  async function refreshAllData() {
    ticketFilter.project_id = currentProjectId.value;
    await Promise.all([
      loadTickets(),
      loadDashboard(currentProjectId.value),
      loadStats(currentProjectId.value),
      loadNotifications(currentProjectId.value),
      loadProjectHub(currentProjectId.value),
    ]);
  }

  onMounted(async () => {
    if (token.value) {
      try {
        await bootstrap();
      } catch {
        clearAuth();
      }
    }
  });

  return {
    token,
    user,
    activeTab,
    currentProjectId,
    currentVersionId,
    globalSearchKeyword,
    loginForm,
    users,
    projects,
    versions,
    tickets,
    dashboard,
    stats,
    notification,
    projectHub,
    versionForm,
    showVersionCreateForm,
    meta,
    ticketFilter,
    userDialog,
    projectDialog,
    ticketDialog,
    ticketDetail,
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
    userInitial,
    MAX_ATTACHMENT_SIZE_MB,
    MAX_ATTACHMENT_SIZE_BYTES,
    ticketDetailAttachments,
    detailCreatorName,
    detailAssigneeGroups,
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
    loadDashboard,
    loadStats,
    loadNotifications,
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
    onDetailProjectChange,
    onDetailAttachmentChange,
    removeDetailAttachment,
    persistTicketAttachments,
    addComment,
    refreshAllData,
  };
}
