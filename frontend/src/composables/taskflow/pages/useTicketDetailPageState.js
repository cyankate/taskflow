import { nextTick, reactive, ref, watch } from "vue";

const DESCRIPTION_COLORS = [
  { label: "默认", value: "#303133" },
  { label: "红色", value: "#e53935" },
  { label: "橙色", value: "#fb8c00" },
  { label: "绿色", value: "#43a047" },
  { label: "蓝色", value: "#1e88e5" },
  { label: "紫色", value: "#8e24aa" },
];

const DESCRIPTION_FONT_SIZES = [12, 14, 16, 18, 20];
const FONT_SIZE_COMMAND_MAP = {
  12: "2",
  14: "3",
  16: "4",
  18: "5",
  20: "6",
};
const FONT_SIZE_COMMAND_REVERSE_MAP = {
  2: 12,
  3: 14,
  4: 16,
  5: 18,
  6: 20,
};

export function useTicketDetailPageState({
  ticketDialog,
  ticketDetail,
  meta,
  user,
  activeTab,
  onDetailProjectChange,
  runTicketFlowAction,
  saveTicketDescription,
  ElMessage,
}) {
  const descriptionEditorRef = ref(null);
  const ticketDialogEditorRef = ref(null);
  const descriptionToolbarState = reactive({
    undoEnabled: false,
    redoEnabled: false,
    bold: false,
    strike: false,
    blockquote: false,
    orderedList: false,
    unorderedList: false,
    link: false,
    color: "#303133",
    fontSize: 14,
  });
  const descriptionLastRange = ref(null);

  function syncTicketDialogEditorFromForm() {
    const editor = ticketDialogEditorRef.value;
    if (!editor) return;
    const html = String(ticketDialog.form.description || "");
    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
  }

  function onTicketDialogEditorInput() {
    const editor = ticketDialogEditorRef.value;
    if (!editor) return;
    ticketDialog.form.description = editor.innerHTML;
  }

  function applyTicketDialogCommand(command, value = null) {
    const editor = ticketDialogEditorRef.value;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    onTicketDialogEditorInput();
  }

  function insertTicketDialogLink() {
    if (typeof window === "undefined") return;
    const linkUrl = window.prompt("请输入超链接地址（如 https://example.com）", "https://");
    const normalized = normalizeDescriptionLink(linkUrl);
    if (!normalized) return;
    applyTicketDialogCommand("createLink", normalized);
  }

  watch(
    () => ticketDialog.visible,
    async (visible) => {
      if (!visible) return;
      await nextTick();
      syncTicketDialogEditorFromForm();
    },
  );

  watch(
    () => ticketDialog.form.description,
    () => {
      if (!ticketDialog.visible) return;
      const editor = ticketDialogEditorRef.value;
      if (!editor) return;
      if (document.activeElement === editor) return;
      syncTicketDialogEditorFromForm();
    },
  );

  function escapeDescriptionHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hasRichHtml(content) {
    return /<\/?[a-z][\s\S]*>/i.test(String(content || ""));
  }

  function sanitizeDescriptionHtml(content) {
    return String(content || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "");
  }

  function normalizeColorValue(color) {
    if (!color) return "";
    const raw = String(color).trim().toLowerCase();
    if (raw.startsWith("#")) return raw;
    if (raw.startsWith("rgb")) {
      const nums = raw.match(/\d+/g);
      if (!nums || nums.length < 3) return "";
      const [r, g, b] = nums.slice(0, 3).map((n) => Number(n));
      if ([r, g, b].some((n) => Number.isNaN(n))) return "";
      return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    }
    return raw;
  }

  function renderDescriptionHtml(content) {
    const raw = String(content || "");
    if (hasRichHtml(raw)) return sanitizeDescriptionHtml(raw);
    const escaped = escapeDescriptionHtml(raw);
    return escaped.replace(/\n/g, "<br>");
  }

  function setDescriptionEditorContent(content) {
    const editor = descriptionEditorRef.value;
    if (!editor) return;
    const html = renderDescriptionHtml(content);
    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
    ticketDetail.descriptionDraft = editor.innerHTML;
  }

  function getDescriptionSelectionContext() {
    const editor = descriptionEditorRef.value;
    if (!editor || typeof window === "undefined") return null;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return { editor, selection, range };
  }

  function normalizeDescriptionFontTags() {
    const editor = descriptionEditorRef.value;
    if (!editor) return;
    const fontNodes = editor.querySelectorAll("font[size]");
    for (const node of fontNodes) {
      const size = Number(node.getAttribute("size") || 0);
      const px = FONT_SIZE_COMMAND_REVERSE_MAP[size];
      if (!px) continue;
      node.style.fontSize = `${px}px`;
      node.removeAttribute("size");
    }
  }

  function normalizeWikiFontTags() {
    // Reused by wiki page module.
    const editor = typeof document !== "undefined" ? document.querySelector(".wiki-editor-content[contenteditable='true']") : null;
    if (!editor) return;
    const fontNodes = editor.querySelectorAll("font[size]");
    for (const node of fontNodes) {
      const size = Number(node.getAttribute("size") || 0);
      const px = FONT_SIZE_COMMAND_REVERSE_MAP[size];
      if (!px) continue;
      node.style.fontSize = `${px}px`;
      node.removeAttribute("size");
    }
  }

  function syncDescriptionToolbarState() {
    if (!ticketDetail.descriptionEditing) return;
    const ctx = getDescriptionSelectionContext();
    if (!ctx) {
      descriptionToolbarState.undoEnabled = false;
      descriptionToolbarState.redoEnabled = false;
      descriptionToolbarState.bold = false;
      descriptionToolbarState.strike = false;
      descriptionToolbarState.blockquote = false;
      descriptionToolbarState.orderedList = false;
      descriptionToolbarState.unorderedList = false;
      descriptionToolbarState.link = false;
      descriptionToolbarState.fontSize = 14;
      return;
    }
    descriptionLastRange.value = ctx.range.cloneRange();
    descriptionToolbarState.undoEnabled = !!document.queryCommandEnabled("undo");
    descriptionToolbarState.redoEnabled = !!document.queryCommandEnabled("redo");
    descriptionToolbarState.bold = !!document.queryCommandState("bold");
    descriptionToolbarState.strike = !!document.queryCommandState("strikeThrough");
    descriptionToolbarState.orderedList = !!document.queryCommandState("insertOrderedList");
    descriptionToolbarState.unorderedList = !!document.queryCommandState("insertUnorderedList");
    descriptionToolbarState.link = !!document.queryCommandState("createLink");
    const formatBlock = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
    descriptionToolbarState.blockquote = formatBlock.includes("blockquote");
    const color = normalizeColorValue(document.queryCommandValue("foreColor"));
    if (color) descriptionToolbarState.color = color;
    const commandSize = String(document.queryCommandValue("fontSize") || "").trim();
    if (FONT_SIZE_COMMAND_REVERSE_MAP[commandSize]) {
      descriptionToolbarState.fontSize = FONT_SIZE_COMMAND_REVERSE_MAP[commandSize];
    }
  }

  async function startDescriptionEdit() {
    ticketDetail.descriptionEditing = true;
    await nextTick();
    setDescriptionEditorContent(ticketDetail.ticket?.description || "");
    syncDescriptionToolbarState();
  }

  function cancelDescriptionEdit() {
    ticketDetail.descriptionEditing = false;
    ticketDetail.descriptionDraft = ticketDetail.ticket?.description || "";
    descriptionLastRange.value = null;
  }

  function onDescriptionEditorInput() {
    const editor = descriptionEditorRef.value;
    if (!editor) return;
    ticketDetail.descriptionDraft = editor.innerHTML;
  }

  function applyDescriptionCommand(command, value = null, options = {}) {
    const editor = descriptionEditorRef.value;
    if (!editor) return;
    let ctx = getDescriptionSelectionContext();
    if (!ctx && descriptionLastRange.value && typeof window !== "undefined") {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(descriptionLastRange.value);
      ctx = getDescriptionSelectionContext();
    }
    if (!ctx) return;
    editor.focus();
    if (command === "undo" || command === "redo") {
      document.execCommand(command, false);
    } else {
      document.execCommand("styleWithCSS", false, true);
      document.execCommand(command, false, value);
    }
    if (options.normalizeFontSize) {
      normalizeDescriptionFontTags();
    }
    onDescriptionEditorInput();
    syncDescriptionToolbarState();
  }

  function onDescriptionColorChange(color) {
    if (!color) return;
    applyDescriptionCommand("foreColor", color);
  }

  function onDescriptionFontSizeChange(size) {
    const commandSize = FONT_SIZE_COMMAND_MAP[size];
    if (!commandSize) return;
    applyDescriptionCommand("fontSize", commandSize, { normalizeFontSize: true });
  }

  function clearDescriptionFormatting() {
    applyDescriptionCommand("removeFormat");
  }

  function normalizeDescriptionLink(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
    if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(raw)) return `https://${raw}`;
    return "";
  }

  function insertDescriptionLink() {
    const linkUrl = window.prompt("请输入超链接地址（如 https://example.com）", "https://");
    const normalized = normalizeDescriptionLink(linkUrl);
    if (!normalized) return;
    applyDescriptionCommand("createLink", normalized);
  }

  function toggleDescriptionBlockquote() {
    const next = descriptionToolbarState.blockquote ? "p" : "blockquote";
    applyDescriptionCommand("formatBlock", next);
  }

  function onTicketDialogTypeChange(nextType) {
    if (!nextType) return;
    if (nextType === "BUG单") {
      ticketDialog.form.sub_type = "BUG修复";
    } else {
      ticketDialog.form.sub_type = "策划需求";
    }
    onDetailProjectChange(ticketDialog.form.project_id);
  }

  function getExecutorCandidates(ticketType, subType) {
    if (ticketType === "BUG单") return ["测试", "前端程序", "后端程序"];
    if (subType === "策划需求") return ["策划"];
    if (subType === "程序需求") return ["前端程序", "后端程序"];
    if (subType === "美术需求") return ["美术"];
    if (subType === "测试需求") return ["测试"];
    return meta.positions || [];
  }

  function onTicketDialogSubTypeChange(nextSubType) {
    if (!nextSubType) return;
    const candidates = getExecutorCandidates(ticketDialog.form.ticket_type, nextSubType);
    if (!candidates.includes(ticketDialog.form.executor_position)) {
      ticketDialog.form.executor_id = null;
    }
  }

  async function onTicketFlowAction(action) {
    let rejectReason = "";
    if (action === "reject") {
      rejectReason = window.prompt("请输入驳回原因", "") || "";
      if (!rejectReason.trim()) return;
    }
    await runTicketFlowAction(action, rejectReason);
  }

  function isTicketOverdue(ticket) {
    const endTimeRaw = ticket?.end_time;
    if (!endTimeRaw) return false;
    const status = String(ticket?.status || "");
    if (status === "待验收" || status === "已完成") return false;
    const endTime = new Date(endTimeRaw);
    if (Number.isNaN(endTime.getTime())) return false;
    return endTime.getTime() < Date.now();
  }

  function isTicketDueWithin24h(ticket) {
    const endTimeRaw = ticket?.end_time;
    if (!endTimeRaw) return false;
    const status = String(ticket?.status || "");
    if (status === "待验收" || status === "已完成") return false;
    const endTime = new Date(endTimeRaw);
    if (Number.isNaN(endTime.getTime())) return false;
    const diffMs = endTime.getTime() - Date.now();
    return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
  }

  function getDeadlineHint(ticket) {
    const endTimeRaw = ticket?.end_time;
    if (!endTimeRaw) return "未设置截止";
    const endTime = new Date(endTimeRaw);
    if (Number.isNaN(endTime.getTime())) return "截止时间异常";
    const diffMs = endTime.getTime() - Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil(diffMs / dayMs);
    if (diffDays < 0) return `已逾期 ${Math.abs(diffDays)} 天`;
    if (diffDays === 0) return "今天截止";
    return `剩余 ${diffDays} 天`;
  }

  function getDeadlineHintType(ticket) {
    const endTimeRaw = ticket?.end_time;
    if (!endTimeRaw) return "neutral";
    const endTime = new Date(endTimeRaw);
    if (Number.isNaN(endTime.getTime())) return "neutral";
    const diffMs = endTime.getTime() - Date.now();
    if (diffMs < 0) return "overdue";
    if (diffMs <= 2 * 24 * 60 * 60 * 1000) return "soon";
    return "normal";
  }

  function getWikiAttachmentCount(attachments) {
    return Array.isArray(attachments) ? attachments.length : 0;
  }

  function getWikiAttachmentSectionClass(attachments) {
    const count = getWikiAttachmentCount(attachments);
    if (count <= 0) return "is-empty";
    if (count <= 2) return "is-few";
    if (count <= 6) return "is-medium";
    return "is-many";
  }

  async function copyTicketId(ticketId) {
    const text = String(ticketId ?? "").trim();
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("input");
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      ElMessage.success(`已复制工单号 ${text}`);
    } catch {
      ElMessage.error("复制失败，请手动复制");
    }
  }

  function handleSideNavClick(tabKey) {
    const wasInDetail = !!ticketDetail.visible;
    if (ticketDetail.visible) {
      ticketDetail.visible = false;
      ticketDetail.editing = false;
      ticketDetail.descriptionEditing = false;
    }
    const sameTab = activeTab.value === tabKey;
    if (!sameTab) {
      activeTab.value = tabKey;
    }
    if (sameTab || wasInDetail) {
      nextTick(() => {
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
      });
    }
  }

  function getPriorityToneClass(priority) {
    const map = {
      低: "quick-priority-low",
      中: "quick-priority-mid",
      高: "quick-priority-high",
      紧急: "quick-priority-urgent",
    };
    return map[priority] || "quick-priority-mid";
  }

  function canEditTicketPriority(ticket) {
    const uid = Number(user.value?.id || 0);
    if (!uid) return false;
    const creatorId = Number(ticket?.creator_id || 0);
    const testerId = Number(ticket?.tester_id || 0);
    return uid === creatorId || uid === testerId;
  }

  async function submitDescriptionEdit() {
    const sanitized = sanitizeDescriptionHtml(ticketDetail.descriptionDraft || "");
    await saveTicketDescription(sanitized);
    ticketDetail.descriptionEditing = false;
    descriptionLastRange.value = null;
  }

  return {
    DESCRIPTION_COLORS,
    DESCRIPTION_FONT_SIZES,
    FONT_SIZE_COMMAND_MAP,
    FONT_SIZE_COMMAND_REVERSE_MAP,
    descriptionEditorRef,
    ticketDialogEditorRef,
    descriptionToolbarState,
    syncTicketDialogEditorFromForm,
    onTicketDialogEditorInput,
    applyTicketDialogCommand,
    insertTicketDialogLink,
    renderDescriptionHtml,
    sanitizeDescriptionHtml,
    normalizeColorValue,
    normalizeDescriptionFontTags,
    normalizeWikiFontTags,
    syncDescriptionToolbarState,
    startDescriptionEdit,
    cancelDescriptionEdit,
    onDescriptionEditorInput,
    applyDescriptionCommand,
    onDescriptionColorChange,
    onDescriptionFontSizeChange,
    clearDescriptionFormatting,
    normalizeDescriptionLink,
    insertDescriptionLink,
    toggleDescriptionBlockquote,
    onTicketDialogTypeChange,
    getExecutorCandidates,
    onTicketDialogSubTypeChange,
    onTicketFlowAction,
    isTicketOverdue,
    isTicketDueWithin24h,
    getDeadlineHint,
    getDeadlineHintType,
    getWikiAttachmentCount,
    getWikiAttachmentSectionClass,
    copyTicketId,
    handleSideNavClick,
    getPriorityToneClass,
    canEditTicketPriority,
    submitDescriptionEdit,
  };
}
