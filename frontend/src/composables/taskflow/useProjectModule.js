import { reactive } from "vue";

export function useProjectModule({
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
}) {
  const notificationFeed = reactive({
    items: [],
    total: 0,
    page: 1,
    per_page: 20,
  });

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

  async function loadNotificationFeed(page = 1) {
    const { data } = await api.get("/notification-feed", {
      params: { page, per_page: notificationFeed.per_page },
    });
    notificationFeed.items = data.items || [];
    notificationFeed.total = data.total || 0;
    notificationFeed.page = data.page || page;
    notificationFeed.per_page = data.per_page || 20;
  }

  async function markNotificationRead(id) {
    await api.post(`/notifications/${id}/read`);
    await loadNotifications(currentProjectId.value);
    await loadNotificationFeed(notificationFeed.page);
  }

  async function markAllNotificationsRead() {
    await api.post("/notifications/read-all");
    await loadNotifications(currentProjectId.value);
    await loadNotificationFeed(notificationFeed.page);
    ElMessage.success("已全部标为已读");
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

  return {
    loadMeta,
    loadUsers,
    loadProjects,
    loadVersions,
    loadProjectHub,
    loadDashboard,
    loadStats,
    loadNotifications,
    notificationFeed,
    loadNotificationFeed,
    markNotificationRead,
    markAllNotificationsRead,
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
  };
}
