import { nextTick, reactive, ref, watch } from "vue";

export function useWikiPageState({
  wikiDetail,
  wikiDialog,
  wikiAttachmentError,
  wikiEditorRef,
  openWikiDetailRaw,
  saveWikiArticle,
  onWikiEditorInput,
  normalizeDescriptionLink,
  normalizeColorValue,
  normalizeWikiFontTags,
  FONT_SIZE_COMMAND_MAP,
  FONT_SIZE_COMMAND_REVERSE_MAP,
}) {
  const wikiViewMode = ref("list");
  const wikiDetailEditing = ref(false);
  const wikiToolbarState = reactive({
    bold: false,
    strike: false,
    orderedList: false,
    unorderedList: false,
    blockquote: false,
    link: false,
    color: "#303133",
    fontSize: 14,
  });
  const wikiLastRange = ref(null);

  async function openWikiDetailPage(row) {
    if (!row?.id) return;
    await openWikiDetailRaw(row);
    wikiViewMode.value = "detail";
    wikiDetailEditing.value = false;
  }

  function openWikiDetailPageByRow(row) {
    if (!row?.id) return;
    openWikiDetailPage(row);
  }

  async function openWikiDetailEditPage(row) {
    await openWikiDetailPage(row);
    await startWikiDetailEdit();
  }

  function backToWikiList() {
    wikiViewMode.value = "list";
    wikiDetailEditing.value = false;
    wikiDetail.visible = false;
  }

  async function startWikiDetailEdit() {
    const article = wikiDetail.article || {};
    if (!article.id) return;
    wikiAttachmentError.value = "";
    wikiDialog.form = {
      id: article.id,
      title: article.title || "",
      category_name: article.category_name || "",
      content: article.content || "",
      attachments: Array.isArray(article.attachments) ? [...article.attachments] : [],
    };
    wikiDetailEditing.value = true;
    await nextTick();
    if (wikiEditorRef.value) {
      wikiEditorRef.value.innerHTML = wikiDialog.form.content || "";
    }
    syncWikiToolbarState();
  }

  function cancelWikiDetailEdit() {
    wikiDetailEditing.value = false;
    wikiAttachmentError.value = "";
  }

  async function saveWikiDetailPage() {
    if (!wikiDetailEditing.value) return;
    await saveWikiArticle();
    await openWikiDetailRaw({ id: wikiDialog.form.id });
    wikiViewMode.value = "detail";
    wikiDetailEditing.value = false;
  }

  function getWikiSelectionContext() {
    const editor = wikiEditorRef.value;
    if (!editor || typeof window === "undefined") return null;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return { editor, selection, range };
  }

  function syncWikiToolbarState() {
    if (!wikiDialog.visible && !wikiDetailEditing.value) return;
    const ctx = getWikiSelectionContext();
    if (!ctx) {
      wikiToolbarState.bold = false;
      wikiToolbarState.strike = false;
      wikiToolbarState.orderedList = false;
      wikiToolbarState.unorderedList = false;
      wikiToolbarState.blockquote = false;
      wikiToolbarState.link = false;
      wikiToolbarState.fontSize = 14;
      return;
    }
    wikiLastRange.value = ctx.range.cloneRange();
    wikiToolbarState.bold = !!document.queryCommandState("bold");
    wikiToolbarState.strike = !!document.queryCommandState("strikeThrough");
    wikiToolbarState.orderedList = !!document.queryCommandState("insertOrderedList");
    wikiToolbarState.unorderedList = !!document.queryCommandState("insertUnorderedList");
    wikiToolbarState.link = !!document.queryCommandState("createLink");
    const formatBlock = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
    wikiToolbarState.blockquote = formatBlock.includes("blockquote");
    const color = normalizeColorValue(document.queryCommandValue("foreColor"));
    if (color) wikiToolbarState.color = color;
    const commandSize = String(document.queryCommandValue("fontSize") || "").trim();
    if (FONT_SIZE_COMMAND_REVERSE_MAP[commandSize]) {
      wikiToolbarState.fontSize = FONT_SIZE_COMMAND_REVERSE_MAP[commandSize];
    }
  }

  function applyWikiEditorCommand(command, value = null) {
    const editor = wikiEditorRef.value;
    if (!editor) return;
    let ctx = getWikiSelectionContext();
    if (!ctx && wikiLastRange.value && typeof window !== "undefined") {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(wikiLastRange.value);
      ctx = getWikiSelectionContext();
    }
    if (!ctx) return;
    editor.focus();
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(command, false, value);
    if (command === "fontSize") {
      normalizeWikiFontTags();
    }
    onWikiEditorInput();
    syncWikiToolbarState();
  }

  function insertWikiEditorLink() {
    const linkUrl = window.prompt("请输入超链接地址（如 https://example.com）", "https://");
    const normalized = normalizeDescriptionLink(linkUrl);
    if (!normalized) return;
    applyWikiEditorCommand("createLink", normalized);
  }

  function toggleWikiEditorBlockquote() {
    const next = wikiToolbarState.blockquote ? "p" : "blockquote";
    applyWikiEditorCommand("formatBlock", next);
  }

  function onWikiEditorColorChange(color) {
    if (!color) return;
    applyWikiEditorCommand("foreColor", color);
  }

  function onWikiFontSizeChange(size) {
    const commandSize = FONT_SIZE_COMMAND_MAP[size];
    if (!commandSize) return;
    applyWikiEditorCommand("fontSize", commandSize);
  }

  watch(
    () => wikiDialog.visible,
    async (visible) => {
      if (!visible && !wikiDetailEditing.value) return;
      await nextTick();
      syncWikiToolbarState();
    },
  );

  watch(
    () => wikiDetailEditing.value,
    async (editing) => {
      if (!editing) return;
      await nextTick();
      syncWikiToolbarState();
    },
  );

  return {
    wikiViewMode,
    wikiDetailEditing,
    wikiToolbarState,
    openWikiDetailPage,
    openWikiDetailPageByRow,
    openWikiDetailEditPage,
    backToWikiList,
    startWikiDetailEdit,
    cancelWikiDetailEdit,
    saveWikiDetailPage,
    applyWikiEditorCommand,
    insertWikiEditorLink,
    toggleWikiEditorBlockquote,
    syncWikiToolbarState,
    onWikiEditorColorChange,
    onWikiFontSizeChange,
  };
}
