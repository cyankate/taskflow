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
import { useWikiModule } from "./taskflow/useWikiModule";

export function useTaskflowApp() {
  const token = ref(localStorage.getItem("taskflow_token") || "");
  const user = reactive(JSON.parse(localStorage.getItem("taskflow_user") || "{}"));
  const activeTab = ref("dashboard");
  const currentProjectId = ref(null);
  const currentVersionId = ref(null);
  const globalSearchKeyword = ref("");

  const loginForm = reactive({ username: "admin", password: "admin123" });
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
  const wikiPage = ref(1);
  const wikiPageSize = 10;
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
  const dashboardTaskPage = ref(1);
  const dashboardTaskPageSize = 8;
  const dashboardBugPage = ref(1);
  const dashboardBugPageSize = 12;
  const dashboardTasks = computed(() => dashboard.my_pending_tasks || []);
  const dashboardBugs = computed(() => dashboard.my_pending_bugs || []);

  const pagedDashboardTasks = computed(() => {
    const start = (dashboardTaskPage.value - 1) * dashboardTaskPageSize;
    return dashboardTasks.value.slice(start, start + dashboardTaskPageSize);
  });

  const pagedDashboardBugs = computed(() => {
    const start = (dashboardBugPage.value - 1) * dashboardBugPageSize;
    return dashboardBugs.value.slice(start, start + dashboardBugPageSize);
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

  const ticketPage = ref(1);
  const ticketPageSize = ref(20);
  const projectDynamicsPage = ref(1);
  const projectDynamicsPageSize = 12;

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

  function saveAuth(loginUser, jwt) {
    token.value = jwt;
    Object.assign(user, loginUser);
    localStorage.setItem("taskflow_token", jwt);
    localStorage.setItem("taskflow_user", JSON.stringify(loginUser));
  }

  function clearAuth() {
    token.value = "";
    Object.keys(user).forEach((k) => delete user[k]);
    localStorage.removeItem("taskflow_token");
    localStorage.removeItem("taskflow_user");
  }

  async function doLogin() {
    try {
      const { data } = await api.post("/auth/login", loginForm);
      saveAuth(data.user, data.token);
      await bootstrap();
      ElMessage.success("登录成功");
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "登录失败"));
    }
  }

  function logout() {
    clearAuth();
  }

  function handleUserMenuCommand(command) {
    if (command === "logout") {
      logout();
    }
  }

  async function bootstrap() {
    await Promise.all([loadMeta(), loadUsers(), loadProjects(), loadWikiCategories()]);
    if (!currentProjectId.value) {
      const defaultProject = projects.value.find((item) => item.is_default) || projects.value[0];
      currentProjectId.value = defaultProject?.id || null;
    }
    await loadVersions(currentProjectId.value);
    ticketFilter.project_id = currentProjectId.value;
    ticketFilter.version_id = currentVersionId.value;
    await Promise.all([
      loadDashboard(currentProjectId.value),
      loadStats(currentProjectId.value),
      loadNotifications(currentProjectId.value),
      loadProjectHub(currentProjectId.value),
      loadTickets(),
      loadWikiArticles(),
    ]);
  }

  async function loadMeta() {
    const { data } = await api.get("/meta");
    Object.assign(meta, data);
  }

  async function loadUsers() {
    const { data } = await api.get("/users");
    users.value = data;
  }

  async function loadProjects() {
    const { data } = await api.get("/projects");
    projects.value = data;
    const exists = projects.value.some((item) => item.id === currentProjectId.value);
    if (!exists) {
      const defaultProject = projects.value.find((item) => item.is_default) || projects.value[0];
      currentProjectId.value = defaultProject?.id || null;
    }
  }

  async function loadVersions(projectId = currentProjectId.value) {
    if (!projectId) {
      versions.value = [];
      currentVersionId.value = null;
      return;
    }
    const { data } = await api.get(`/projects/${projectId}/versions`);
    versions.value = data || [];
    if (currentVersionId.value && !versions.value.some((item) => item.id === currentVersionId.value)) {
      currentVersionId.value = null;
    }
    if (!currentVersionId.value && versions.value.length > 0) {
      currentVersionId.value = versions.value[0].id;
    }
  }

  async function loadProjectHub(projectId = currentProjectId.value) {
    const params = {};
    if (projectId) params.project_id = projectId;
    const { data } = await api.get("/project-hub", { params });
    projectHub.projects = data.projects || [];
    projectHub.selected_project = data.selected_project;
    projectHub.summary = data.summary || { total_tickets: 0, pending_tickets: 0, completed_tickets: 0, bug_tickets: 0 };
    projectHub.recent_tickets = data.recent_tickets || [];
    projectHub.dynamics = data.dynamics || [];
    projectDynamicsPage.value = 1;
    projectHub.project_id = data.selected_project?.id || projectId || null;
    if (projectHub.project_id && projectHub.project_id !== currentProjectId.value) {
      currentProjectId.value = projectHub.project_id;
    }
    if (!ticketFilter.project_id && currentProjectId.value) {
      ticketFilter.project_id = currentProjectId.value;
    }
  }

  async function onGlobalProjectChange(value) {
    currentProjectId.value = value || null;
    projectHub.project_id = currentProjectId.value;
    ticketFilter.project_id = currentProjectId.value;
    await loadVersions(currentProjectId.value);
    ticketFilter.version_id = currentVersionId.value;
    ticketPage.value = 1;
    await Promise.all([
      loadDashboard(currentProjectId.value),
      loadStats(currentProjectId.value),
      loadNotifications(currentProjectId.value),
      loadProjectHub(currentProjectId.value),
      loadTickets(),
    ]);
  }

  async function onGlobalVersionChange(value) {
    currentVersionId.value = value || null;
    ticketFilter.version_id = currentVersionId.value;
    ticketPage.value = 1;
    await Promise.all([loadDashboard(currentProjectId.value), loadTickets()]);
  }

  async function selectVersionByButton(versionId) {
    await onGlobalVersionChange(versionId);
  }

  async function loadTickets() {
    const params = {};
    if (ticketFilter.project_id) params.project_id = ticketFilter.project_id;
    if (ticketFilter.version_id) params.version_id = ticketFilter.version_id;
    if (globalSearchKeyword.value.trim()) params.keyword = globalSearchKeyword.value.trim();
    const { data } = await api.get("/tickets", { params });
    tickets.value = data;
  }

  async function runGlobalSearch() {
    ticketPage.value = 1;
    await loadTickets();
  }

  async function loadDashboard(projectId = currentProjectId.value, versionId = currentVersionId.value) {
    const params = {};
    if (projectId) params.project_id = projectId;
    if (versionId) params.version_id = versionId;
    const { data } = await api.get("/dashboard", { params });
    Object.assign(dashboard, data);
  }

  async function loadStats(projectId = currentProjectId.value) {
    const params = {};
    if (projectId) params.project_id = projectId;
    const { data } = await api.get("/statistics", { params });
    Object.assign(stats, data);
  }

  async function loadNotifications(projectId = currentProjectId.value) {
    const params = {};
    if (projectId) params.project_id = projectId;
    const { data } = await api.get("/notifications", { params });
    Object.assign(notification, data);
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

  function openUserDialog(row) {
    userDialog.form = row
      ? { ...row, password: "" }
      : { id: null, username: "", display_name: "", password: "", position: meta.positions[0], is_admin: false };
    userDialog.visible = true;
  }

  async function saveUser() {
    const payload = { ...userDialog.form };
    if (payload.id) {
      await api.put(`/users/${payload.id}`, payload);
    } else {
      await api.post("/users", payload);
    }
    userDialog.visible = false;
    await loadUsers();
    ElMessage.success("保存成功");
  }

  async function removeUser(row) {
    await ElMessageBox.confirm(`确认删除用户 ${row.display_name} ?`, "提示");
    await api.delete(`/users/${row.id}`);
    await loadUsers();
    ElMessage.success("删除成功");
  }

  function openProjectDialog(row) {
    projectDialog.form = row ? { ...row } : { id: null, name: "", description: "" };
    projectDialog.visible = true;
  }

  async function saveProject() {
    if (projectDialog.form.id) {
      await api.put(`/projects/${projectDialog.form.id}`, projectDialog.form);
    } else {
      await api.post("/projects", projectDialog.form);
    }
    projectDialog.visible = false;
    await loadProjects();
    await onGlobalProjectChange(currentProjectId.value);
    ElMessage.success("保存成功");
  }

  async function removeProject(row) {
    await ElMessageBox.confirm(`确认删除项目 ${row.name} ?`, "提示");
    await api.delete(`/projects/${row.id}`);
    await loadProjects();
    await onGlobalProjectChange(currentProjectId.value);
    ElMessage.success("删除成功");
  }

  async function setDefaultProject(row) {
    await api.post(`/projects/${row.id}/set-default`);
    await loadProjects();
    if (!currentProjectId.value) currentProjectId.value = row.id;
    await onGlobalProjectChange(currentProjectId.value);
    ElMessage.success("已设置默认项目");
  }

  async function createVersion() {
    if (!currentProjectId.value) {
      ElMessage.warning("请先选择项目");
      return;
    }
    if (!versionForm.name.trim()) {
      ElMessage.warning("请输入版本名称");
      return;
    }
    await api.post(`/projects/${currentProjectId.value}/versions`, {
      name: versionForm.name.trim(),
      description: versionForm.description.trim(),
    });
    cancelCreateVersion();
    await Promise.all([loadVersions(currentProjectId.value), loadProjectHub(currentProjectId.value)]);
    ElMessage.success("版本创建成功");
  }

  function cancelCreateVersion() {
    versionForm.name = "";
    versionForm.description = "";
    showVersionCreateForm.value = false;
  }

  async function removeVersion(row) {
    await ElMessageBox.confirm(`确认删除版本 ${row.name} ?`, "提示");
    await api.delete(`/versions/${row.id}`);
    if (currentVersionId.value === row.id) currentVersionId.value = null;
    await Promise.all([loadVersions(currentProjectId.value), loadProjectHub(currentProjectId.value), loadTickets()]);
    ElMessage.success("版本删除成功");
  }

  async function onTicketProjectChange(projectId) {
    await loadVersions(projectId);
    ticketDialog.form.version_id = versions.value[0]?.id || null;
  }

  async function openTicketDialog(row) {
    const targetProjectId =
      row?.project_id ||
      currentProjectId.value ||
      projects.value.find((item) => item.is_default)?.id ||
      projects.value[0]?.id ||
      null;
    if (targetProjectId && targetProjectId !== currentProjectId.value) {
      await loadVersions(targetProjectId);
    }
    ticketDialog.form = row
      ? {
          ...row,
          assignee_ids: row.assignees?.map((item) => item.id) || [],
        }
      : {
          id: null,
          title: "",
          description: "",
          module: "",
          ticket_type: meta.ticket_types[0],
          sub_type: "",
          project_id: targetProjectId,
          version_id: currentVersionId.value || versions.value[0]?.id || null,
          status: "待处理",
          priority: "中",
          assignee_ids: [],
          start_time: "",
          end_time: "",
        };
    ticketDialog.visible = true;
  }

  async function createQuickTicket(ticketType) {
    await openTicketDialog();
    ticketDialog.form.ticket_type = ticketType;
    ticketDialog.form.project_id = currentProjectId.value || ticketDialog.form.project_id;
    ticketDialog.form.version_id = currentVersionId.value || ticketDialog.form.version_id;
  }

  async function saveTicket() {
    if (!ticketDialog.form.version_id) {
      ElMessage.warning("请选择版本");
      return;
    }
    const payload = { ...ticketDialog.form };
    if (payload.id) {
      await api.put(`/tickets/${payload.id}`, payload);
    } else {
      await api.post("/tickets", payload);
    }
    ticketDialog.visible = false;
    await refreshAllData();
    ElMessage.success("保存成功");
  }

  async function removeTicket(row) {
    await ElMessageBox.confirm(`确认删除工单 ${row.title} ?`, "提示");
    await api.delete(`/tickets/${row.id}`);
    await refreshAllData();
    ElMessage.success("删除成功");
  }

  function handleTicketRowClick(row) {
    if (!row?.id) return;
    openTicketDetail(row);
  }

  async function openTicketDetail(row) {
    const { data } = await api.get(`/tickets/${row.id}`);
    const ticket = data.ticket || {};
    const targetProjectId = ticket.project_id || currentProjectId.value;
    if (targetProjectId && targetProjectId !== currentProjectId.value) {
      await loadVersions(targetProjectId);
    }
    ticketDetail.ticket = data.ticket;
    ticketDetail.editing = false;
    ticketDetail.editForm = {
      id: ticket.id || null,
      title: ticket.title || "",
      description: ticket.description || "",
      module: ticket.module || "",
      ticket_type: ticket.ticket_type || meta.ticket_types[0],
      sub_type: ticket.sub_type || "",
      project_id: ticket.project_id || currentProjectId.value || null,
      version_id: ticket.version_id || versions.value[0]?.id || null,
      status: ticket.status || "待处理",
      priority: ticket.priority || "中",
      assignee_ids: (ticket.assignees || []).map((item) => item.id),
      start_time: toDateInputFormat(ticket.start_time),
      end_time: toDateInputFormat(ticket.end_time),
      attachments: normalizeAttachments(ticket.attachments),
    };
    ticketDetail.comments = data.comments;
    ticketDetail.histories = data.histories;
    ticketDetail.newComment = "";
    ticketDetail.visible = true;
  }

  async function saveTicketDetailEdit() {
    if (!ticketDetail.editForm.id) return;
    if (!ticketDetail.editForm.version_id) {
      ElMessage.warning("请选择版本");
      return;
    }
    const payload = { ...ticketDetail.editForm };
    await api.put(`/tickets/${payload.id}`, payload);
    await Promise.all([openTicketDetail({ id: payload.id }), refreshAllData()]);
    ElMessage.success("工单更新成功");
  }

  async function onDetailProjectChange(projectId) {
    await loadVersions(projectId);
    if (!versions.value.some((item) => item.id === ticketDetail.editForm.version_id)) {
      ticketDetail.editForm.version_id = versions.value[0]?.id || null;
    }
  }

  async function onDetailAttachmentChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    ticketAttachmentError.value = "";
    if (!ticketDetail.ticket?.id) {
      ticketAttachmentError.value = "请先选择工单";
      ElMessage.warning(ticketAttachmentError.value);
      event.target.value = "";
      return;
    }
    const invalid = files.find((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/"));
    if (invalid) {
      ticketAttachmentError.value = "仅支持图片和视频附件";
      ElMessage.warning(ticketAttachmentError.value);
      event.target.value = "";
      return;
    }
    const oversize = files.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversize) {
      ticketAttachmentError.value = `文件「${oversize.name}」超过 ${MAX_ATTACHMENT_SIZE_MB}MB，请压缩后再上传`;
      ElMessage.warning(ticketAttachmentError.value);
      event.target.value = "";
      return;
    }
    const readPromises = files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              type: file.type,
              url: reader.result,
            });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    );
    try {
      const mapped = await Promise.all(readPromises);
      const nextAttachments = [...normalizeAttachments(ticketDetail.ticket.attachments), ...mapped];
      const ok = await persistTicketAttachments(nextAttachments);
      if (ok) {
        ticketAttachmentError.value = "";
        ElMessage.success("附件提交成功");
      }
    } catch {
      ticketAttachmentError.value = "附件读取失败，请重试";
      ElMessage.error(ticketAttachmentError.value);
    }
    event.target.value = "";
  }

  async function removeDetailAttachment(index) {
    if (!ticketDetail.ticket?.id) return;
    const current = normalizeAttachments(ticketDetail.ticket.attachments);
    current.splice(index, 1);
    const ok = await persistTicketAttachments(current);
    if (ok) {
      ticketAttachmentError.value = "";
      ElMessage.success("附件删除成功");
    }
  }

  async function persistTicketAttachments(attachments) {
    if (!ticketDetail.ticket?.id) return;
    try {
      await api.put(`/tickets/${ticketDetail.ticket.id}`, { attachments });
      ticketDetail.ticket.attachments = attachments;
      ticketDetail.editForm.attachments = attachments;
      await refreshAllData();
      return true;
    } catch (err) {
      ticketAttachmentError.value = getErrorMessage(err, "附件提交失败");
      ElMessage.error(ticketAttachmentError.value);
      return false;
    }
  }

  async function addComment() {
    if (!ticketDetail.ticket.id || !ticketDetail.newComment.trim()) return;
    await api.post(`/tickets/${ticketDetail.ticket.id}/comments`, { content: ticketDetail.newComment.trim() });
    await openTicketDetail(ticketDetail.ticket);
    await refreshAllData();
  }

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
