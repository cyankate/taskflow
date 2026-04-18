import { computed, reactive, ref, watch } from "vue";

import { computeSplitDiffRows, normalizeTextForLineDiff } from "../../utils/textDiff.js";

const SKYNET_GATEWAY_STORAGE_KEY = "taskflow_skynet_gateway_id";

const DB_FILTER_OPS = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN", "IS NULL", "IS NOT NULL"];

export function useConsoleModule({ api, ElMessage, getErrorMessage }) {
  const consoleStatus = reactive({
    loaded: false,
    skynet_gateway_configured: false,
    hint: "",
    gateways: [],
  });

  const selectedGatewayId = ref("");

  /** 控制台子视图：home | db_explorer | hot_reload */
  const consoleSubView = ref("home");

  const dbExplorer = reactive({
    tables: [],
    tablesLoading: false,
    tablesHint: "",
    columns: [],
    columnsLoading: false,
    selectedTable: "",
    sql: "",
    filters: [{ field: "", operator: "=", value: "" }],
    resultColumns: [],
    resultRows: [],
    resultMessage: "",
    queryLoading: false,
  });

  const filterOperators = DB_FILTER_OPS;

  const currentSkynetGateway = computed(() => {
    const list = consoleStatus.gateways || [];
    return list.find((g) => String(g.id) === String(selectedGatewayId.value)) || null;
  });

  const hotReloadFileInputRef = ref(null);
  const hotReloadDiffVisible = ref(false);
  const hotReloadDiffRows = ref([]);

  const hotReload = reactive({
    serverFiles: [],
    serverFilesLoading: false,
    uploadLoading: false,
    serverContent: "",
    serverContentLoading: false,
    selectedFile: "",
    serverHint: "",
    /** 浏览选择的本地文件（浏览器内读取，仅用于对比） */
    localPickedText: "",
    pickedFileName: "",
  });

  const consoleForms = reactive({
    accountKeyword: "",
    command: "",
    commandResult: "",
  });

  function syncGatewaySelectionFromStorage() {
    const list = consoleStatus.gateways || [];
    if (!list.length) {
      selectedGatewayId.value = "";
      return;
    }
    let saved = "";
    try {
      saved = typeof localStorage !== "undefined" ? localStorage.getItem(SKYNET_GATEWAY_STORAGE_KEY) || "" : "";
    } catch {
      saved = "";
    }
    if (saved && list.some((g) => String(g.id) === saved)) {
      selectedGatewayId.value = saved;
      return;
    }
    selectedGatewayId.value = String(list[0].id);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SKYNET_GATEWAY_STORAGE_KEY, selectedGatewayId.value);
      }
    } catch {
      /* ignore */
    }
  }

  watch(consoleSubView, (v) => {
    if (v !== "hot_reload") {
      hotReloadDiffVisible.value = false;
    }
  });

  watch(selectedGatewayId, (id) => {
    if (!id) return;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SKYNET_GATEWAY_STORAGE_KEY, String(id));
      }
    } catch {
      /* ignore */
    }
    if (consoleSubView.value === "db_explorer") {
      resetDbExplorerForGatewaySwitch();
      loadDbTables();
    }
    if (consoleSubView.value === "hot_reload") {
      loadHotReloadServerFiles().then(() => {
        if (hotReload.selectedFile) {
          loadHotReloadServerContent(hotReload.selectedFile);
        }
      });
    }
  });

  async function loadConsoleStatus() {
    try {
      const { data } = await api.get("/console/status");
      consoleStatus.skynet_gateway_configured = !!data?.skynet_gateway_configured;
      consoleStatus.hint = data?.hint || "";
      const list = Array.isArray(data?.gateways) ? data.gateways : [];
      consoleStatus.gateways = list;
      syncGatewaySelectionFromStorage();
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "加载控制台状态失败"));
      consoleStatus.skynet_gateway_configured = false;
      consoleStatus.hint = "无法加载控制台网关配置，请稍后重试。";
      consoleStatus.gateways = [];
      syncGatewaySelectionFromStorage();
    } finally {
      consoleStatus.loaded = true;
    }
  }

  function resetDbExplorerForGatewaySwitch() {
    dbExplorer.tables = [];
    dbExplorer.tablesHint = "";
    dbExplorer.columns = [];
    dbExplorer.selectedTable = "";
    dbExplorer.sql = "";
    dbExplorer.filters = [{ field: "", operator: "=", value: "" }];
    dbExplorer.resultColumns = [];
    dbExplorer.resultRows = [];
    dbExplorer.resultMessage = "";
  }

  function openDbExplorer() {
    if (!selectedGatewayId.value) {
      ElMessage.warning("请先选择当前服务器");
      return;
    }
    consoleSubView.value = "db_explorer";
    loadDbTables();
  }

  function closeDbExplorer() {
    consoleSubView.value = "home";
  }

  async function loadDbTables() {
    if (!selectedGatewayId.value) return;
    dbExplorer.tablesLoading = true;
    try {
      const { data } = await api.get("/console/skynet/db/tables", {
        params: { gateway_id: selectedGatewayId.value },
      });
      dbExplorer.tables = Array.isArray(data?.tables) ? data.tables : [];
      dbExplorer.tablesHint =
        !dbExplorer.tables.length && data?.message ? String(data.message) : "";
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "加载表列表失败"));
      dbExplorer.tables = [];
    } finally {
      dbExplorer.tablesLoading = false;
    }
  }

  async function selectDbTable(name) {
    const next = (name || "").trim();
    if (dbExplorer.selectedTable === next) return;
    dbExplorer.selectedTable = next;
    dbExplorer.columns = [];
    dbExplorer.sql = "";
    if (!next) return;
    dbExplorer.columnsLoading = true;
    try {
      const { data } = await api.get("/console/skynet/db/columns", {
        params: { gateway_id: selectedGatewayId.value, table: next },
      });
      dbExplorer.columns = Array.isArray(data?.columns) ? data.columns : [];
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "加载字段列表失败"));
      dbExplorer.columns = [];
    } finally {
      dbExplorer.columnsLoading = false;
    }
  }

  function addFilterRow() {
    dbExplorer.filters.push({ field: "", operator: "=", value: "" });
  }

  function removeFilterRow(index) {
    if (dbExplorer.filters.length <= 1) {
      dbExplorer.filters[0] = { field: "", operator: "=", value: "" };
      return;
    }
    dbExplorer.filters.splice(index, 1);
  }

  function needsFilterValue(op) {
    return op !== "IS NULL" && op !== "IS NOT NULL";
  }

  async function runDbExplorerQuery() {
    if (!selectedGatewayId.value) {
      ElMessage.warning("请先选择网关");
      return;
    }
    const table = (dbExplorer.selectedTable || "").trim();
    const sql = (dbExplorer.sql || "").trim();
    if (!table && !sql) {
      ElMessage.warning("请选择数据表，或填写 SQL");
      return;
    }
    const filters = dbExplorer.filters
      .filter((row) => {
        const op = row.operator || "=";
        if (!needsFilterValue(op)) return !!row.field;
        return !!row.field && String(row.value).trim() !== "";
      })
      .map((row) => ({
        field: row.field,
        operator: row.operator || "=",
        value: needsFilterValue(row.operator) ? String(row.value).trim() : "",
      }));

    dbExplorer.queryLoading = true;
    try {
      const { data } = await api.post("/console/skynet/db/query", {
        gateway_id: selectedGatewayId.value,
        table,
        sql,
        filters,
      });
      dbExplorer.resultColumns = Array.isArray(data?.columns) ? data.columns : [];
      dbExplorer.resultRows = Array.isArray(data?.rows) ? data.rows : [];
      dbExplorer.resultMessage = typeof data?.message === "string" ? data.message : "";
      if (data?.error) {
        ElMessage.error(String(data.error));
      } else if (dbExplorer.resultMessage && !dbExplorer.resultRows.length) {
        ElMessage.info(dbExplorer.resultMessage);
      }
    } catch (err) {
      dbExplorer.resultColumns = [];
      dbExplorer.resultRows = [];
      dbExplorer.resultMessage = "";
      ElMessage.error(getErrorMessage(err, "查询失败"));
    } finally {
      dbExplorer.queryLoading = false;
    }
  }

  function clearDbExplorerResult() {
    dbExplorer.resultColumns = [];
    dbExplorer.resultRows = [];
    dbExplorer.resultMessage = "";
  }

  function clearDbExplorerSql() {
    dbExplorer.sql = "";
  }

  function clearDbExplorerFilters() {
    dbExplorer.filters = [{ field: "", operator: "=", value: "" }];
  }

  async function loadHotReloadServerFiles() {
    if (!selectedGatewayId.value) return;
    hotReload.serverFilesLoading = true;
    try {
      const { data } = await api.get("/console/hotreload/skynet/files", {
        params: { gateway_id: selectedGatewayId.value },
      });
      hotReload.serverFiles = Array.isArray(data?.files) ? data.files : [];
      hotReload.serverHint = typeof data?.message === "string" ? data.message : "";
    } catch {
      hotReload.serverFiles = [];
      hotReload.serverHint = "";
    } finally {
      hotReload.serverFilesLoading = false;
    }
  }

  function openHotReload() {
    if (!selectedGatewayId.value) {
      ElMessage.warning("请先选择当前服务器");
      return;
    }
    consoleSubView.value = "hot_reload";
    hotReload.selectedFile = "";
    hotReload.serverContent = "";
    hotReload.localPickedText = "";
    hotReload.pickedFileName = "";
    loadHotReloadServerFiles();
  }

  function closeHotReload() {
    consoleSubView.value = "home";
  }

  async function selectHotReloadFile(name) {
    const n = (name || "").trim();
    if (!n) return;
    hotReload.selectedFile = n;
    await loadHotReloadServerContent(n);
  }

  function triggerHotReloadFilePick() {
    try {
      hotReloadFileInputRef.value?.click?.();
    } catch {
      /* ignore */
    }
  }

  function onHotReloadLocalFileChange(ev) {
    const input = ev?.target;
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (!file) return;
    hotReload.pickedFileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      hotReload.localPickedText = typeof reader.result === "string" ? reader.result : "";
    };
    reader.onerror = () => {
      hotReload.localPickedText = "";
      ElMessage.error("读取本地文件失败");
    };
    reader.readAsText(file, "UTF-8");
  }

  function clearHotReloadLocalPick() {
    hotReload.localPickedText = "";
    hotReload.pickedFileName = "";
  }

  async function uploadHotReloadLocalToSkynet() {
    if (!selectedGatewayId.value) {
      ElMessage.warning("请先选择当前服务器");
      return;
    }
    if (!hotReload.pickedFileName) {
      ElMessage.warning("请先选择本地文件");
      return;
    }
    const targetName = (hotReload.selectedFile || hotReload.pickedFileName || "").trim();
    if (!targetName) {
      ElMessage.warning("缺少目标文件名");
      return;
    }
    hotReload.uploadLoading = true;
    try {
      const { data } = await api.post("/console/hotreload/skynet/upload", {
        gateway_id: selectedGatewayId.value,
        name: targetName,
        content: String(hotReload.localPickedText ?? ""),
        encoding: "utf-8",
      });
      if (data?.ok === false) {
        throw new Error(data?.message || "上传失败");
      }
      ElMessage.success(data?.message || "上传成功");
      await loadHotReloadServerFiles();
      hotReload.selectedFile = targetName;
      await loadHotReloadServerContent(targetName);
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "上传到服务器失败"));
    } finally {
      hotReload.uploadLoading = false;
    }
  }

  async function loadHotReloadServerContent(name) {
    hotReload.serverContentLoading = true;
    hotReload.serverContent = "";
    try {
      const { data } = await api.get("/console/hotreload/skynet/content", {
        params: { gateway_id: selectedGatewayId.value, name },
      });
      if (data?.ok === false) {
        hotReload.serverContent = data?.message || "加载失败";
      } else if (data?.binary) {
        hotReload.serverContent = `[二进制或非 UTF-8]\n${data?.message || ""}\nBase64 预览: ${data?.base64_preview || ""}`;
      } else {
        hotReload.serverContent = data?.text ?? "";
      }
    } catch (err) {
      hotReload.serverContent = getErrorMessage(err, "加载失败");
    } finally {
      hotReload.serverContentLoading = false;
    }
  }

  const hotReloadDiffers = computed(() => {
    const a = normalizeTextForLineDiff(hotReload.serverContent ?? "");
    const b = normalizeTextForLineDiff(hotReload.localPickedText ?? "");
    if (!hotReload.pickedFileName || !b) return false;
    return a !== b;
  });

  function openHotReloadDiff() {
    const server = String(hotReload.serverContent ?? "");
    const local = String(hotReload.localPickedText ?? "");
    if (!server.trim() && !local.trim()) {
      ElMessage.warning("请先加载服务器内容并选择本地文件");
      return;
    }
    hotReloadDiffRows.value = computeSplitDiffRows(server, local);
    hotReloadDiffVisible.value = true;
  }

  function closeHotReloadDiff() {
    hotReloadDiffVisible.value = false;
  }

  async function copyAccountInfo() {
    const text = (consoleForms.accountKeyword || "").trim();
    if (!text) {
      ElMessage.warning("请先输入要复制的账号标识");
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      ElMessage.success("已复制到剪贴板");
    } catch {
      ElMessage.error("复制失败");
    }
  }

  function sendSkynetCommand() {
    const cmd = (consoleForms.command || "").trim();
    if (!cmd) {
      ElMessage.warning("请输入要发送的内容");
      return;
    }
    consoleForms.commandResult = "";
    ElMessage.warning("指令发送功能暂未接入后端接口");
  }

  function isExpandableDbCellValue(value) {
    return value !== null && typeof value === "object";
  }

  function formatDbCellPreview(value) {
    if (value == null) return "";
    if (!isExpandableDbCellValue(value)) return String(value);
    try {
      const text = JSON.stringify(value);
      return text.length > 80 ? `${text.slice(0, 80)}...` : text;
    } catch {
      return "[对象]";
    }
  }

  function formatDbCellExpanded(value) {
    if (!isExpandableDbCellValue(value)) return String(value ?? "");
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[对象无法序列化]";
    }
  }

  const dbExplorerTableRows = computed(() => {
    const cols = dbExplorer.resultColumns || [];
    if (!cols.length) return [];
    return (dbExplorer.resultRows || []).map((row) => {
      const obj = {};
      cols.forEach((c, i) => {
        obj[c] = Array.isArray(row) ? row[i] : row?.[c];
      });
      return obj;
    });
  });

  return {
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
    loadDbTables,
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
    loadHotReloadServerFiles,
    triggerHotReloadFilePick,
    onHotReloadLocalFileChange,
    clearHotReloadLocalPick,
    uploadHotReloadLocalToSkynet,
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
  };
}
