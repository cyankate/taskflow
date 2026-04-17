export function useTicketModule({
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
  selectedTicketIds,
  batchEdit,
  projects,
  versions,
  meta,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENT_SIZE_MB,
  normalizeAttachments,
  toDateInputFormat,
  loadVersions,
  refreshAllData,
}) {
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
          parent_task_id: row.parent_task_id || null,
          related_task_id: row.related_task_id || null,
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
          parent_task_id: null,
          related_task_id: null,
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
      parent_task_id: ticket.parent_task_id || null,
      related_task_id: ticket.related_task_id || null,
      start_time: toDateInputFormat(ticket.start_time),
      end_time: toDateInputFormat(ticket.end_time),
      attachments: normalizeAttachments(ticket.attachments),
    };
    ticketDetail.comments = data.comments;
    ticketDetail.commentReplies = data.comment_replies || [];
    ticketDetail.checklistItems = data.checklist_items || [];
    ticketDetail.childTaskTickets = data.child_task_tickets || [];
    ticketDetail.relatedBugTickets = data.related_bug_tickets || [];
    ticketDetail.childTaskProgress = data.child_task_progress || { total: 0, done: 0 };
    ticketDetail.relatedBugProgress = data.related_bug_progress || { total: 0, done: 0 };
    ticketDetail.histories = data.histories;
    ticketDetail.newComment = "";
    ticketDetail.commentMentionIds = [];
    ticketDetail.replyDrafts = {};
    ticketDetail.replyMentionIds = {};
    ticketDetail.newChecklistItem = "";
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
    await api.post(`/tickets/${ticketDetail.ticket.id}/comments`, {
      content: ticketDetail.newComment.trim(),
      mentions: ticketDetail.commentMentionIds || [],
    });
    ticketDetail.commentMentionIds = [];
    await openTicketDetail(ticketDetail.ticket);
    await refreshAllData();
  }

  async function addCommentReply(commentId) {
    if (!ticketDetail.ticket.id || !commentId) return;
    const content = (ticketDetail.replyDrafts[commentId] || "").trim();
    if (!content) return;
    await api.post(`/tickets/${ticketDetail.ticket.id}/comments/${commentId}/replies`, {
      content,
      mentions: ticketDetail.replyMentionIds[commentId] || [],
    });
    ticketDetail.replyDrafts[commentId] = "";
    ticketDetail.replyMentionIds[commentId] = [];
    await openTicketDetail(ticketDetail.ticket);
    await refreshAllData();
  }

  async function toggleTicketFollow() {
    if (!ticketDetail.ticket?.id) return;
    if (ticketDetail.ticket.is_following) {
      await api.delete(`/tickets/${ticketDetail.ticket.id}/watch`);
      ElMessage.success("已取消关注");
    } else {
      await api.post(`/tickets/${ticketDetail.ticket.id}/watch`);
      ElMessage.success("已关注工单");
    }
    await openTicketDetail(ticketDetail.ticket);
    await refreshAllData();
  }

  async function addChecklistItem() {
    if (!ticketDetail.ticket?.id) return;
    const content = (ticketDetail.newChecklistItem || "").trim();
    if (!content) return;
    await api.post(`/tickets/${ticketDetail.ticket.id}/checklist`, { content });
    ticketDetail.newChecklistItem = "";
    await openTicketDetail(ticketDetail.ticket);
    await refreshAllData();
  }

  async function toggleChecklistItem(item) {
    if (!ticketDetail.ticket?.id || !item?.id) return;
    await api.patch(`/tickets/${ticketDetail.ticket.id}/checklist/${item.id}`, {
      is_done: !item.is_done,
    });
    await openTicketDetail(ticketDetail.ticket);
    await refreshAllData();
  }

  async function removeChecklistItem(item) {
    if (!ticketDetail.ticket?.id || !item?.id) return;
    await api.delete(`/tickets/${ticketDetail.ticket.id}/checklist/${item.id}`);
    await openTicketDetail(ticketDetail.ticket);
    await refreshAllData();
  }

  async function batchUpdateTickets() {
    if (!selectedTicketIds.value.length) {
      ElMessage.warning("请先选择要批量操作的工单");
      return;
    }
    const payload = { ticket_ids: selectedTicketIds.value };
    if (batchEdit.status) payload.status = batchEdit.status;
    if (batchEdit.priority) payload.priority = batchEdit.priority;
    if (Array.isArray(batchEdit.assignee_ids) && batchEdit.assignee_ids.length) {
      payload.assignee_ids = batchEdit.assignee_ids;
    }
    if (!payload.status && !payload.priority && !payload.assignee_ids) {
      ElMessage.warning("请选择至少一项批量更新字段");
      return;
    }
    const { data } = await api.post("/tickets/batch-update", payload);
    ElMessage.success(`批量更新完成（${data.updated_count || 0} 条）`);
    selectedTicketIds.value = [];
    batchEdit.status = "";
    batchEdit.priority = "";
    batchEdit.assignee_ids = [];
    await refreshAllData();
  }

  return {
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
    addCommentReply,
    toggleTicketFollow,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    batchUpdateTickets,
  };
}
