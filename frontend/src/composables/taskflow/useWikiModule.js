export function useWikiModule({
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
}) {
  function escapeHtmlAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function uploadWikiFile(file, { allowDocuments = false, scope = "wiki" } = {}) {
    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({ scope });
    if (allowDocuments) {
      params.set("allow_documents", "1");
    }
    const { data } = await api.post(`/uploads?${params.toString()}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return {
      name: data?.name || file.name,
      type: data?.type || file.type,
      url: data?.url,
    };
  }

  async function loadWikiCategories() {
    const { data } = await api.get("/wiki/categories");
    wikiCategories.value = data || [];
  }

  async function loadWikiArticles() {
    const params = {};
    if (wikiFilter.category_id) params.category_id = wikiFilter.category_id;
    const { data } = await api.get("/wiki/articles", { params });
    wikiArticles.value = data || [];
  }

  async function setWikiCategoryFilter(categoryId) {
    if (wikiFilter.category_id === categoryId) {
      wikiFilter.category_id = null;
    } else {
      wikiFilter.category_id = categoryId;
    }
    wikiPage.value = 1;
    await loadWikiArticles();
  }

  async function openWikiDialog(row) {
    if (row?.id) {
      const { data } = await api.get(`/wiki/articles/${row.id}`);
      wikiDialog.form = {
        id: data.id,
        title: data.title || "",
        category_name: data.category_name || "",
        content: data.content || "",
        attachments: normalizeAttachments(data.attachments),
      };
    } else {
      wikiDialog.form = {
        id: null,
        title: "",
        category_name: "",
        content: "",
        attachments: [],
      };
    }
    wikiDialog.visible = true;
    await nextTick();
    if (wikiEditorRef.value) {
      wikiEditorRef.value.innerHTML = wikiDialog.form.content || "";
    }
  }

  function onWikiEditorInput() {
    wikiDialog.form.content = wikiEditorRef.value?.innerHTML || "";
  }

  function insertHtmlToWikiEditor(html) {
    if (!wikiEditorRef.value) return;
    wikiEditorRef.value.focus();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const inEditor = wikiEditorRef.value.contains(container.nodeType === 1 ? container : container.parentNode);
      if (inEditor) {
        range.deleteContents();
        const temp = document.createElement("div");
        temp.innerHTML = html;
        const fragment = document.createDocumentFragment();
        let node;
        let lastNode = null;
        while ((node = temp.firstChild)) {
          lastNode = fragment.appendChild(node);
        }
        range.insertNode(fragment);
        if (lastNode) {
          const newRange = document.createRange();
          newRange.setStartAfter(lastNode);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
        onWikiEditorInput();
        return;
      }
    }
    wikiEditorRef.value.innerHTML = (wikiEditorRef.value.innerHTML || "") + html;
    onWikiEditorInput();
  }

  async function insertWikiMedia(event, mediaType) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      ElMessage.warning(`文件超过 ${MAX_ATTACHMENT_SIZE_MB}MB，请压缩后再上传`);
      event.target.value = "";
      return;
    }
    const allowedPrefix = mediaType === "image" ? "image/" : "video/";
    if (!file.type.startsWith(allowedPrefix)) {
      ElMessage.warning(mediaType === "image" ? "请选择图片文件" : "请选择视频文件");
      event.target.value = "";
      return;
    }
    try {
      const uploaded = await uploadWikiFile(file, { allowDocuments: false, scope: "wiki-inline" });
      const mediaUrl = escapeHtmlAttribute(uploaded.url);
      const altText = escapeHtmlAttribute(file.name);
      if (mediaType === "image") {
        insertHtmlToWikiEditor(`<p><img src="${mediaUrl}" alt="${altText}" style="max-width:100%;" /></p>`);
      } else {
        insertHtmlToWikiEditor(`<p><video src="${mediaUrl}" controls style="max-width:100%;height:auto;"></video></p>`);
      }
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "媒体上传失败，请重试"));
    }
    event.target.value = "";
  }

  async function onWikiAttachmentChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    wikiAttachmentError.value = "";
    const oversize = files.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversize) {
      wikiAttachmentError.value = `文件「${oversize.name}」超过 ${MAX_ATTACHMENT_SIZE_MB}MB`;
      ElMessage.warning(wikiAttachmentError.value);
      event.target.value = "";
      return;
    }
    try {
      const mapped = await Promise.all(files.map((file) => uploadWikiFile(file, { allowDocuments: true, scope: "wiki" })));
      wikiDialog.form.attachments = [...(wikiDialog.form.attachments || []), ...mapped];
    } catch (err) {
      wikiAttachmentError.value = getErrorMessage(err, "附件上传失败，请重试");
      ElMessage.error(wikiAttachmentError.value);
    }
    event.target.value = "";
  }

  function removeWikiAttachment(index) {
    wikiDialog.form.attachments.splice(index, 1);
  }

  async function saveWikiArticle() {
    if (!wikiDialog.form.title.trim()) {
      ElMessage.warning("请输入文章标题");
      return;
    }
    const payload = {
      title: wikiDialog.form.title.trim(),
      category_name: (wikiDialog.form.category_name || "").trim(),
      content: wikiDialog.form.content || "",
      attachments: wikiDialog.form.attachments || [],
    };
    try {
      if (wikiDialog.form.id) {
        await api.put(`/wiki/articles/${wikiDialog.form.id}`, payload);
      } else {
        await api.post("/wiki/articles", payload);
      }
      wikiDialog.visible = false;
      wikiAttachmentError.value = "";
      await Promise.all([loadWikiCategories(), loadWikiArticles()]);
      ElMessage.success("文章已保存");
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "文章保存失败"));
    }
  }

  async function openWikiDetail(row) {
    const { data } = await api.get(`/wiki/articles/${row.id}`);
    wikiDetail.article = data || {};
    wikiDetail.visible = true;
  }

  function openWikiDetailByRow(row) {
    if (!row?.id) return;
    openWikiDetail(row);
  }

  async function removeWikiArticle(row) {
    try {
      await ElMessageBox.confirm(`确认删除文章「${row.title}」?`, "提示");
      await api.delete(`/wiki/articles/${row.id}`);
      await loadWikiArticles();
      ElMessage.success("删除成功");
    } catch (err) {
      if (err !== "cancel" && err !== "close") {
        ElMessage.error(getErrorMessage(err, "删除文章失败"));
      }
    }
  }

  return {
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
  };
}
