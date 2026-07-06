import { computed, onUnmounted, reactive, ref, watch } from "vue";

const GATE_DEFAULT = "8.163.100.189:8888";

export function useLoadTestModule({ api, ElMessage, getErrorMessage }) {
  const loadTestStatus = reactive({
    loaded: false,
    configured: false,
    agentOk: false,
    hint: "",
  });

  const loadTestForm = reactive({
    preset: "login",
    address: GATE_DEFAULT,
    clients: 20,
    durationSeconds: 60,
    accountPrefix: "load_user_",
  });

  const loadTestPresets = ref([]);
  const loadTestRuns = ref([]);
  const activeRunId = ref("");
  const activeRun = ref(null);
  const loadTestLoading = ref(false);
  let pollTimer = null;

  const activeRunStatus = computed(() => String(activeRun.value?.status || ""));
  const isRunActive = computed(() => activeRunStatus.value === "running");

  const loadTestMetrics = computed(() => activeRun.value?.metrics || null);

  async function loadLoadTestStatus() {
    try {
      const { data } = await api.get("/loadtest/status");
      loadTestStatus.loaded = true;
      loadTestStatus.configured = !!data?.configured;
      loadTestStatus.agentOk = !!data?.ok;
      loadTestStatus.hint = data?.message || "";
    } catch (err) {
      loadTestStatus.loaded = true;
      loadTestStatus.configured = false;
      loadTestStatus.agentOk = false;
      loadTestStatus.hint = getErrorMessage(err, "加载压测 Agent 状态失败");
    }
  }

  async function loadLoadTestPresets() {
    try {
      const { data } = await api.get("/loadtest/presets");
      loadTestPresets.value = Array.isArray(data?.presets) ? data.presets : [];
    } catch (err) {
      loadTestPresets.value = [];
      ElMessage.error(getErrorMessage(err, "加载场景预设失败"));
    }
  }

  async function loadLoadTestRuns() {
    try {
      const { data } = await api.get("/loadtest/runs");
      loadTestRuns.value = Array.isArray(data?.runs) ? data.runs : [];
      const running = loadTestRuns.value.find((r) => r.status === "running");
      if (running?.id && !activeRunId.value) {
        activeRunId.value = running.id;
      }
    } catch (err) {
      loadTestRuns.value = [];
    }
  }

  async function refreshActiveRun() {
    if (!activeRunId.value) {
      activeRun.value = null;
      return;
    }
    try {
      const { data } = await api.get(`/loadtest/runs/${encodeURIComponent(activeRunId.value)}`);
      activeRun.value = data?.run || null;
      if (activeRun.value && activeRun.value.status !== "running") {
        stopRunPolling();
        await loadLoadTestRuns();
      }
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "刷新压测状态失败"));
    }
  }

  function startRunPolling() {
    stopRunPolling();
    pollTimer = setInterval(() => {
      refreshActiveRun();
    }, 2000);
  }

  function stopRunPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function bootstrapLoadTestPage() {
    loadTestLoading.value = true;
    try {
      await Promise.all([loadLoadTestStatus(), loadLoadTestPresets(), loadLoadTestRuns()]);
      if (activeRunId.value) {
        await refreshActiveRun();
        if (isRunActive.value) {
          startRunPolling();
        }
      }
    } finally {
      loadTestLoading.value = false;
    }
  }

  async function startLoadTestRun() {
    if (!loadTestForm.address?.trim()) {
      ElMessage.warning("请填写 Skynet 网关地址（TCP）");
      return;
    }
    if (loadTestForm.clients <= 0) {
      ElMessage.warning("并发人数需大于 0");
      return;
    }
    loadTestLoading.value = true;
    try {
      const { data } = await api.post("/loadtest/runs", {
        preset: loadTestForm.preset,
        address: loadTestForm.address.trim(),
        clients: Number(loadTestForm.clients),
        duration_seconds: Number(loadTestForm.durationSeconds),
        account_prefix: loadTestForm.accountPrefix || "load_user_",
      });
      if (!data?.ok || !data?.run?.id) {
        ElMessage.error(data?.message || "启动压测失败");
        return;
      }
      activeRunId.value = data.run.id;
      activeRun.value = data.run;
      ElMessage.success("压测已启动");
      startRunPolling();
      await loadLoadTestRuns();
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "启动压测失败"));
    } finally {
      loadTestLoading.value = false;
    }
  }

  async function stopLoadTestRun() {
    if (!activeRunId.value) {
      ElMessage.warning("当前没有运行中的压测");
      return;
    }
    loadTestLoading.value = true;
    try {
      const { data } = await api.post(`/loadtest/runs/${encodeURIComponent(activeRunId.value)}/stop`);
      activeRun.value = data?.run || activeRun.value;
      stopRunPolling();
      ElMessage.success("已发送停止指令");
      await loadLoadTestRuns();
      await refreshActiveRun();
    } catch (err) {
      ElMessage.error(getErrorMessage(err, "停止压测失败"));
    } finally {
      loadTestLoading.value = false;
    }
  }

  function selectLoadTestRun(runId) {
    activeRunId.value = runId || "";
    refreshActiveRun();
    if (activeRun.value?.status === "running") {
      startRunPolling();
    } else {
      stopRunPolling();
    }
  }

  function formatRunStatus(status) {
    const map = {
      pending: "准备中",
      running: "运行中",
      completed: "已完成",
      stopped: "已停止",
      failed: "失败",
    };
    return map[status] || status || "-";
  }

  watch(isRunActive, (running) => {
    if (running && activeRunId.value) {
      startRunPolling();
    } else if (!running) {
      stopRunPolling();
    }
  });

  onUnmounted(() => {
    stopRunPolling();
  });

  return {
    loadTestStatus,
    loadTestForm,
    loadTestPresets,
    loadTestRuns,
    activeRunId,
    activeRun,
    loadTestLoading,
    loadTestMetrics,
    isRunActive,
    bootstrapLoadTestPage,
    loadLoadTestStatus,
    loadLoadTestRuns,
    startLoadTestRun,
    stopLoadTestRun,
    selectLoadTestRun,
    formatRunStatus,
  };
}
