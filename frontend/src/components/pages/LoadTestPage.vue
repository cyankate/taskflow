<template>
  <section v-if="user.is_admin" v-show="activeTab === 'loadtest'" class="loadtest-page">
    <el-card shadow="never" class="loadtest-intro-card">
      <template #header>
        <div class="dashboard-panel-title">压测台</div>
      </template>
      <p class="loadtest-intro-text">
        通过 Go loadgen Agent 对 Skynet TCP 网关发起并发压测，查看实时指标与历史任务。
      </p>
      <el-alert
        v-if="loadTestStatus.loaded"
        :type="loadTestStatus.agentOk ? 'success' : 'warning'"
        show-icon
        :closable="false"
        class="loadtest-status-alert"
      >
        <div>{{ loadTestStatus.hint || (loadTestStatus.agentOk ? "Agent 已连接" : "Agent 不可用") }}</div>
      </el-alert>
    </el-card>

    <div class="loadtest-grid">
      <el-card shadow="never" class="loadtest-panel">
        <template #header><span class="loadtest-card-title">启动压测</span></template>
        <el-form label-width="110px" class="loadtest-form">
          <el-form-item label="场景预设">
            <el-select v-model="loadTestForm.preset" class="loadtest-field">
              <el-option
                v-for="p in loadTestPresets"
                :key="p.id"
                :label="p.label"
                :value="p.id"
              >
                <div class="loadtest-option">
                  <span>{{ p.label }}</span>
                  <span v-if="p.description" class="loadtest-option-desc">{{ p.description }}</span>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="网关地址">
            <el-input v-model="loadTestForm.address" placeholder="host:8888（TCP gate）" class="loadtest-field" />
          </el-form-item>
          <el-form-item label="并发人数">
            <el-input-number v-model="loadTestForm.clients" :min="1" :max="5000" />
          </el-form-item>
          <el-form-item label="持续时间(秒)">
            <el-input-number v-model="loadTestForm.durationSeconds" :min="10" :max="86400" />
          </el-form-item>
          <el-form-item label="账号前缀">
            <el-input v-model="loadTestForm.accountPrefix" class="loadtest-field" />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="loadTestLoading"
              :disabled="!loadTestStatus.agentOk || isRunActive"
              @click="startLoadTestRun"
            >
              开始压测
            </el-button>
            <el-button
              type="danger"
              plain
              :loading="loadTestLoading"
              :disabled="!isRunActive"
              @click="stopLoadTestRun"
            >
              停止
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" class="loadtest-panel">
        <template #header><span class="loadtest-card-title">实时指标</span></template>
        <div v-if="!activeRun" class="loadtest-empty">选择或启动一次压测后查看指标</div>
        <template v-else>
          <div class="loadtest-run-meta">
            <span>任务 {{ activeRun.id }}</span>
            <el-tag size="small" :type="isRunActive ? 'success' : 'info'">{{ formatRunStatus(activeRun.status) }}</el-tag>
          </div>
          <div v-if="loadTestMetrics" class="loadtest-metrics-grid">
            <div class="loadtest-metric"><span>在线连接</span><strong>{{ loadTestMetrics.active_connected }}</strong></div>
            <div class="loadtest-metric"><span>累计连接</span><strong>{{ loadTestMetrics.connected_total }}</strong></div>
            <div class="loadtest-metric"><span>发送 QPS</span><strong>{{ loadTestMetrics.send_qps?.toFixed?.(2) ?? loadTestMetrics.send_qps }}</strong></div>
            <div class="loadtest-metric"><span>接收 QPS</span><strong>{{ loadTestMetrics.recv_qps?.toFixed?.(2) ?? loadTestMetrics.recv_qps }}</strong></div>
            <div class="loadtest-metric"><span>错误数</span><strong>{{ loadTestMetrics.errors }}</strong></div>
            <div class="loadtest-metric"><span>重连</span><strong>{{ loadTestMetrics.reconnects }}</strong></div>
          </div>
          <div v-if="loadTestMetrics?.action_sent && Object.keys(loadTestMetrics.action_sent).length" class="loadtest-action-table-wrap">
            <div class="loadtest-subtitle">动作发送</div>
            <el-table :data="actionSentRows" size="small" border>
              <el-table-column prop="action" label="动作" />
              <el-table-column prop="count" label="次数" width="100" />
            </el-table>
          </div>
          <div v-if="loadTestMetrics?.action_err && Object.keys(loadTestMetrics.action_err).length" class="loadtest-action-table-wrap">
            <div class="loadtest-subtitle">动作错误</div>
            <el-table :data="actionErrRows" size="small" border>
              <el-table-column prop="action" label="动作" />
              <el-table-column prop="count" label="次数" width="100" />
            </el-table>
          </div>
          <div v-if="loadTestMetrics?.action_skipped && Object.keys(loadTestMetrics.action_skipped).length" class="loadtest-action-table-wrap">
            <div class="loadtest-subtitle">动作跳过（缺前置状态）</div>
            <el-table :data="actionSkippedRows" size="small" border>
              <el-table-column prop="action" label="动作" />
              <el-table-column prop="count" label="次数" width="100" />
            </el-table>
          </div>
        </template>
      </el-card>
    </div>

    <el-card shadow="never" class="loadtest-history-card">
      <template #header>
        <div class="loadtest-history-header">
          <span class="loadtest-card-title">历史任务</span>
          <el-button text type="primary" @click="loadLoadTestRuns">刷新</el-button>
        </div>
      </template>
      <el-table :data="loadTestRuns" size="small" border @row-click="(row) => selectLoadTestRun(row.id)">
        <el-table-column prop="id" label="任务 ID" min-width="160" />
        <el-table-column prop="preset" label="预设" width="100" />
        <el-table-column prop="address" label="网关" min-width="160" />
        <el-table-column prop="clients" label="并发" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ formatRunStatus(row.status) }}</template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="120" />
      </el-table>
    </el-card>
  </section>
</template>

<script setup>
import { computed, inject } from "vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("LoadTestPage requires appCtx");
}

const {
  user,
  activeTab,
  loadTestStatus,
  loadTestForm,
  loadTestPresets,
  loadTestRuns,
  activeRun,
  loadTestLoading,
  loadTestMetrics,
  isRunActive,
  startLoadTestRun,
  stopLoadTestRun,
  selectLoadTestRun,
  loadLoadTestRuns,
  formatRunStatus,
} = appCtx;

function mapCountRows(obj) {
  if (!obj) return [];
  return Object.entries(obj).map(([action, count]) => ({ action, count }));
}

const actionSentRows = computed(() => mapCountRows(loadTestMetrics.value?.action_sent));
const actionErrRows = computed(() => mapCountRows(loadTestMetrics.value?.action_err));
const actionSkippedRows = computed(() => mapCountRows(loadTestMetrics.value?.action_skipped));
</script>

<style scoped>
.loadtest-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loadtest-intro-text,
.loadtest-empty {
  color: #64748b;
  margin: 0;
}

.loadtest-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.loadtest-panel,
.loadtest-intro-card,
.loadtest-history-card {
  border-radius: 12px;
}

.loadtest-form {
  max-width: 520px;
}

.loadtest-field {
  width: 100%;
}

.loadtest-option {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}

.loadtest-option-desc {
  font-size: 12px;
  color: #94a3b8;
}

.loadtest-run-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  color: #334155;
}

.loadtest-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.loadtest-metric {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.loadtest-metric span {
  font-size: 12px;
  color: #64748b;
}

.loadtest-metric strong {
  font-size: 20px;
  color: #0f172a;
}

.loadtest-subtitle {
  font-size: 13px;
  color: #475569;
  margin: 8px 0;
}

.loadtest-action-table-wrap {
  margin-top: 8px;
}

.loadtest-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@media (max-width: 960px) {
  .loadtest-grid {
    grid-template-columns: 1fr;
  }
}
</style>
