<template>
  <section v-show="activeTab === 'dashboard'">
    <div class="dashboard-view-toggle-row">
      <el-radio-group
        :model-value="dashboardViewMode"
        size="small"
        @update:model-value="onDashboardViewModeChange"
      >
        <el-radio-button label="current" value="current">待我处理</el-radio-button>
        <el-radio-button label="created" value="created">我创建的</el-radio-button>
        <el-radio-button label="related" value="related">和我有关的单</el-radio-button>
      </el-radio-group>
    </div>
    <div class="dashboard-grid">
      <div class="dashboard-column dashboard-left-column">
        <el-card class="dashboard-panel dashboard-task-card">
          <template #header>
            <div class="dashboard-card-head">
              <div class="dashboard-panel-title">
                {{
                  dashboardViewMode === "created"
                    ? "我创建的需求"
                    : dashboardViewMode === "related"
                      ? "和我有关的需求"
                      : "待我处理需求"
                }}
              </div>
              <el-tag
                v-if="dashboardActiveFilterLabel"
                size="small"
                type="primary"
                effect="light"
                class="dashboard-filter-tag"
                title="点击清除筛选"
                @click="clearDashboardStatusFilter"
              >
                {{ dashboardActiveFilterLabel }}
              </el-tag>
            </div>
          </template>
          <el-table
            :data="sortedPagedDashboardTasks"
            stripe
            max-height="520"
            class="clickable-ticket-table dashboard-main-table"
            :empty-text="dashboardTaskEmptyText"
            @sort-change="onDashboardTaskSortChange"
            @row-click="handleTicketRowClick"
          >
            <el-table-column label="ID" prop="id" width="76" sortable="custom" align="center">
              <template #default="scope">
                <span class="dashboard-type-dot task dashboard-ticket-id-dot" @click.stop="copyTicketId(scope.row.id)">
                  {{ scope.row.id || "-" }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="标题" prop="id" sortable="custom" min-width="300">
              <template #default="scope">
                <div class="dashboard-title-cell" :class="{ 'is-child-task': isChildTask(scope.row) }">
                  <span
                    v-if="getTaskRelationRole(scope.row)"
                    :class="[
                      'dashboard-link-badge',
                      `is-${getTaskRelationRole(scope.row)}`,
                      { 'is-child-offset': getTaskRelationRole(scope.row) === 'child' },
                    ]"
                  >
                    {{ getTaskRelationRole(scope.row) === "parent" ? "父" : "子" }}
                  </span>
                  <div class="dashboard-title-main">
                    <div class="dashboard-title-line">
                      <span class="dashboard-title-text">{{ scope.row.title }}</span>
                    </div>
                    <div v-if="getTaskRelationText(scope.row)" class="dashboard-task-relation">
                      {{ getTaskRelationText(scope.row) }}
                    </div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" prop="status" sortable="custom" width="92" align="center">
              <template #default="scope">
                <el-tag size="small" effect="light" :type="getDashboardStatusTagType(scope.row.status)">
                  {{ scope.row.status }}
                </el-tag>
                <el-tag v-if="isTicketOverdue(scope.row)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                  已逾期
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="优先级" prop="priority" sortable="custom" width="87" align="center">
              <template #default="scope">
                <span class="dashboard-priority-chip">
                  <span :class="['dashboard-priority-dot', getDashboardPriorityDotClass(scope.row.priority)]"></span>
                  {{ scope.row.priority }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="负责人" width="88">
              <template #default="scope">
                <div class="dashboard-owner-cell">
                  <span class="dashboard-owner-name">{{ getDashboardOwnerName(scope.row) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="截止" prop="end_time" sortable="custom" width="140">
              <template #default="scope">
                <div class="dashboard-deadline-cell">
                  <div>{{ formatDeadlineSlot(scope.row.end_time) }}</div>
                  <div :class="['dashboard-deadline-hint', getDeadlineHintType(scope.row)]">{{ getDeadlineHint(scope.row) }}</div>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="filteredDashboardTasks.length > dashboardTaskPageSize" class="dashboard-pagination">
            <el-pagination
              background
              small
              layout="total, prev, pager, next"
              :total="filteredDashboardTasks.length"
              :page-size="dashboardTaskPageSize"
              v-model:current-page="dashboardTaskPage"
            />
          </div>
        </el-card>

        <el-card class="dashboard-panel dashboard-dynamics">
          <template #header>
            <div class="dashboard-card-head dashboard-dynamics-head">
              <div class="dashboard-panel-title">我的动态</div>
              <el-switch
                v-model="dashboardDynamicsOnlyMine"
                inline-prompt
                active-text="只看我参与"
                inactive-text="全部"
              />
            </div>
          </template>
          <div v-if="dashboardVisibleDynamics.length > 0" class="dashboard-dynamics-list">
            <div v-for="item in dashboardVisibleDynamics" :key="item.id" class="dynamic-compact">
              <div class="dynamic-compact-line1">
                <span class="dynamic-compact-ref">#{{ item.ticket_id }}</span>
                <span class="dynamic-compact-title">{{ item.ticket_title }}</span>
                <span class="dynamic-compact-time">{{ formatDynamicTime(item.created_at) }}</span>
              </div>
              <div class="dynamic-compact-line2">{{ item.editor_name }} · {{ item.summary }}</div>
            </div>
          </div>
          <el-empty v-else :description="dashboardDynamicsEmptyText" :image-size="72" />
        </el-card>
      </div>

      <div class="dashboard-column dashboard-right-column">
        <el-card class="dashboard-panel dashboard-bug-card">
          <template #header>
            <div class="dashboard-card-head">
              <div class="dashboard-panel-title">
                {{
                  dashboardViewMode === "created"
                    ? "我创建的BUG"
                    : dashboardViewMode === "related"
                      ? "和我有关的BUG"
                      : "待我处理BUG"
                }}
              </div>
              <el-tag
                v-if="dashboardActiveFilterLabel"
                size="small"
                type="primary"
                effect="light"
                class="dashboard-filter-tag"
                title="点击清除筛选"
                @click="clearDashboardStatusFilter"
              >
                {{ dashboardActiveFilterLabel }}
              </el-tag>
            </div>
          </template>
          <el-table
            :data="sortedPagedDashboardBugs"
            stripe
            max-height="520"
            class="clickable-ticket-table dashboard-main-table"
            :empty-text="dashboardBugEmptyText"
            @sort-change="onDashboardBugSortChange"
            @row-click="handleTicketRowClick"
          >
            <el-table-column label="ID" prop="id" width="76" sortable="custom" align="center">
              <template #default="scope">
                <span class="dashboard-type-dot bug dashboard-ticket-id-dot" @click.stop="copyTicketId(scope.row.id)">
                  {{ scope.row.id || "-" }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="标题" prop="id" sortable="custom" min-width="360">
              <template #default="scope">
                <div class="dashboard-title-cell">
                  <div class="dashboard-title-main">
                    <div class="dashboard-title-line">
                      <span class="dashboard-title-text">{{ scope.row.title }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" prop="status" sortable="custom" width="92" align="center">
              <template #default="scope">
                <el-tag size="small" effect="light" :type="getDashboardStatusTagType(scope.row.status)">
                  {{ scope.row.status }}
                </el-tag>
                <el-tag v-if="isTicketOverdue(scope.row)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                  已逾期
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="优先级" prop="priority" sortable="custom" width="87" align="center">
              <template #default="scope">
                <span class="dashboard-priority-chip">
                  <span :class="['dashboard-priority-dot', getDashboardPriorityDotClass(scope.row.priority)]"></span>
                  {{ scope.row.priority }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="负责人" width="88">
              <template #default="scope">
                <div class="dashboard-owner-cell">
                  <span class="dashboard-owner-name">{{ getDashboardOwnerName(scope.row) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="截止" prop="end_time" sortable="custom" width="140">
              <template #default="scope">
                <div class="dashboard-deadline-cell">
                  <div>{{ formatDeadlineSlot(scope.row.end_time) }}</div>
                  <div :class="['dashboard-deadline-hint', getDeadlineHintType(scope.row)]">{{ getDeadlineHint(scope.row) }}</div>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="filteredDashboardBugs.length > dashboardBugPageSize" class="dashboard-pagination">
            <el-pagination
              background
              small
              layout="total, prev, pager, next"
              :total="filteredDashboardBugs.length"
              :page-size="dashboardBugPageSize"
              v-model:current-page="dashboardBugPage"
            />
          </div>
        </el-card>

        <el-card class="dashboard-panel dashboard-other-info">
          <template #header>
            <div class="dashboard-overview-head">
              <div class="dashboard-panel-title">统计视图</div>
              <span class="dashboard-overview-scope">{{ dashboardScopeLabel }}</span>
            </div>
          </template>
          <div class="dashboard-overview-kpis">
            <div
              class="dashboard-overview-kpi dashboard-overview-kpi-action"
              title="查看全部状态"
              @click="onDashboardKpiFilterClick('all')"
            >
              <div class="dashboard-overview-kpi-label">总工单</div>
              <div class="dashboard-overview-kpi-value">{{ dashboardTotalTickets }}</div>
            </div>
            <div
              class="dashboard-overview-kpi dashboard-overview-kpi-action"
              :class="{ 'is-active-filter': dashboardQuickFilterMode === 'pending' }"
              title="筛选未完成状态"
              @click="onDashboardKpiFilterClick('pending')"
            >
              <div class="dashboard-overview-kpi-label">未完成(项目)</div>
              <div class="dashboard-overview-kpi-value">{{ dashboardPendingCount }}</div>
            </div>
            <div
              class="dashboard-overview-kpi dashboard-overview-kpi-action"
              :class="{ 'is-active-filter': dashboardQuickFilterMode === 'completed' }"
              title="筛选已完成状态"
              @click="onDashboardKpiFilterClick('completed')"
            >
              <div class="dashboard-overview-kpi-label">已完成(项目)</div>
              <div class="dashboard-overview-kpi-value">{{ dashboardCompletedCount }}</div>
            </div>
            <div
              class="dashboard-overview-kpi dashboard-overview-kpi-action dashboard-overview-kpi-overdue"
              :class="{ 'is-active-filter': dashboardQuickFilterMode === 'overdue' }"
              title="筛选已逾期工单"
              @click="onDashboardKpiFilterClick('overdue')"
            >
              <div class="dashboard-overview-kpi-label">已逾期</div>
              <div class="dashboard-overview-kpi-value">{{ dashboardOverdueCount }}</div>
            </div>
          </div>
          <div v-if="dashboardActiveFilterLabel" class="dashboard-status-filter-bar">
            <span class="dashboard-status-filter-text">已按状态筛选：</span>
            <el-tag closable size="small" @close="clearDashboardStatusFilter">{{ dashboardActiveFilterLabel }}</el-tag>
          </div>
          <el-table
            class="mt8 dashboard-status-table"
            :data="dashboardStatusRows"
            size="small"
            stripe
            max-height="220"
            :row-class-name="dashboardStatusRowClassName"
            @row-click="onDashboardStatusRowClick"
          >
            <el-table-column prop="status" label="状态" width="120">
              <template #default="scope">
                <el-tag size="small" effect="light" :type="getDashboardStatusTagType(scope.row.status)">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="count" label="数量" width="88" />
            <el-table-column prop="ratioLabel" label="占比" />
          </el-table>
          <div class="dashboard-status-tip">点击状态可联动筛选左右工单列表</div>
        </el-card>
      </div>
    </div>
  </section>
</template>

<script setup>
import { inject } from "vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("DashboardPage requires appCtx");
}

const {
  activeTab,
  dashboardViewMode,
  onDashboardViewModeChange,
  dashboardActiveFilterLabel,
  clearDashboardStatusFilter,
  sortedPagedDashboardTasks,
  dashboardTaskEmptyText,
  onDashboardTaskSortChange,
  handleTicketRowClick,
  copyTicketId,
  isChildTask,
  getTaskRelationRole,
  getTaskRelationText,
  getDashboardStatusTagType,
  isTicketOverdue,
  getDashboardPriorityDotClass,
  getDashboardOwnerName,
  formatDeadlineSlot,
  getDeadlineHintType,
  getDeadlineHint,
  filteredDashboardTasks,
  dashboardTaskPageSize,
  dashboardTaskPage,
  dashboardDynamicsOnlyMine,
  dashboardVisibleDynamics,
  formatDynamicTime,
  dashboardDynamicsEmptyText,
  sortedPagedDashboardBugs,
  dashboardBugEmptyText,
  onDashboardBugSortChange,
  filteredDashboardBugs,
  dashboardBugPageSize,
  dashboardBugPage,
  dashboardScopeLabel,
  onDashboardKpiFilterClick,
  dashboardTotalTickets,
  dashboardQuickFilterMode,
  dashboardPendingCount,
  dashboardCompletedCount,
  dashboardOverdueCount,
  dashboardStatusRows,
  dashboardStatusRowClassName,
  onDashboardStatusRowClick,
} = appCtx;
</script>

<style scoped>
.dashboard-view-toggle-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 12px;
}

.dashboard-column {
  display: grid;
  gap: 14px;
  align-content: start;
}

.dashboard-left-column {
  gap: 12px;
}

.dashboard-right-column {
  gap: 14px;
  padding-top: 0;
}

.dashboard-panel {
  height: auto;
  border-radius: 8px;
  border: 1px solid #e6e8ec;
  box-shadow: none;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.dashboard-panel:hover {
  border-color: #d4d9e1;
  background: #fcfcfd;
}

.dashboard-task-card {
  min-height: 640px;
  background: #ffffff;
}

.dashboard-bug-card {
  min-height: 640px;
  border-color: #f3f4f6;
  background: #ffffff;
}

.dashboard-other-info,
.dashboard-dynamics {
  background: #ffffff;
}

.dashboard-panel-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-left: 8px;
}

.dashboard-panel-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 12px;
  border-radius: 999px;
  background: #9ca3af;
}

.dashboard-task-card .dashboard-panel-title::before {
  background: #60a5fa;
}

.dashboard-bug-card .dashboard-panel-title::before {
  background: #f87171;
}

.dashboard-dynamics .dashboard-panel-title::before {
  background: #a78bfa;
}

.dashboard-other-info .dashboard-panel-title::before {
  background: #94a3b8;
}

.dashboard-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
}

.dashboard-dynamics {
  min-height: 440px;
}

.dashboard-dynamics-list {
  max-height: 360px;
  overflow: auto;
  padding-right: 4px;
}

.dynamic-compact {
  padding: 8px 0;
  border-bottom: 1px solid #edf0f2;
  font-size: var(--tf-font-body);
}

.dynamic-compact:last-child {
  border-bottom: none;
}

.dynamic-compact-line1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  line-height: 1.35;
}

.dynamic-compact-ref {
  flex-shrink: 0;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
}

.dynamic-compact-title {
  flex: 1;
  min-width: 0;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dynamic-compact-time {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: var(--tf-font-caption);
}

.dashboard-dynamics-list .dynamic-compact-line2 {
  display: block;
  margin-top: 4px;
  color: #606266;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-other-info {
  min-height: 440px;
}

.dashboard-overview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dashboard-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dashboard-filter-tag {
  cursor: pointer;
  user-select: none;
}

.dashboard-dynamics-head :deep(.el-switch__label) {
  color: #94a3b8;
  font-size: var(--tf-font-caption);
}

.dashboard-overview-scope {
  font-size: var(--tf-font-caption);
  color: #94a3b8;
}

.dashboard-overview-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dashboard-overview-kpi {
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  padding: 8px 10px;
  background: #ffffff;
}

.dashboard-overview-kpi-action {
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.dashboard-overview-kpi-action:hover {
  border-color: #d4d9e1;
  background: #fafbfc;
}

.dashboard-overview-kpi-action.is-active-filter {
  border-color: #bfdbfe;
  background: #f4f8ff;
}

.dashboard-overview-kpi-overdue {
  border-color: #f4d6d6;
  background: #fff8f8;
}

.dashboard-overview-kpi-overdue .dashboard-overview-kpi-value {
  color: #b91c1c;
}

.dashboard-overview-kpi-label {
  font-size: var(--tf-font-caption);
  color: #94a3b8;
}

.dashboard-overview-kpi-value {
  margin-top: 4px;
  font-size: var(--tf-font-kpi);
  line-height: 1;
  font-weight: 500;
  color: #1f2937;
}

.dashboard-status-filter-bar {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dashboard-status-filter-text {
  font-size: var(--tf-font-caption);
  color: #606266;
}

.dashboard-status-table :deep(.el-table__body tr) {
  cursor: pointer;
}

.dashboard-status-table :deep(.el-table__body tr.dashboard-status-row-active > td) {
  background: #ecf5ff !important;
}

.dashboard-status-tip {
  margin-top: 8px;
  font-size: var(--tf-font-caption);
  color: #94a3b8;
}

.status-overdue-tag {
  margin-left: 6px;
}

.clickable-ticket-table :deep(.el-table__row) {
  cursor: pointer;
}

.dashboard-main-table :deep(.el-table__cell) {
  font-size: var(--tf-font-body);
  padding-top: var(--tf-table-cell-padding-y);
  padding-bottom: var(--tf-table-cell-padding-y);
}

.dashboard-main-table :deep(.el-table__body .el-table__cell:first-child .cell) {
  white-space: normal;
  word-break: break-word;
}

.dashboard-main-table :deep(.el-table__body .el-table__cell:nth-child(2) .cell) {
  white-space: normal;
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  vertical-align: middle;
}

.dashboard-title-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  position: relative;
  padding: 2px 0;
}

.dashboard-title-cell.is-child-task {
  padding-left: 12px;
}

.dashboard-title-cell.is-child-task::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 2px;
  bottom: 2px;
  width: 1px;
  background: #cbd5e1;
}

.dashboard-title-cell.is-child-task::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 50%;
  width: 8px;
  height: 1px;
  background: #cbd5e1;
  transform: translateY(-50%);
}

.dashboard-link-badge {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--tf-font-caption);
  font-weight: 600;
  line-height: 1;
  flex-shrink: 0;
}

.dashboard-link-badge.is-parent {
  color: #1d4ed8;
  background: #dbeafe;
}

.dashboard-link-badge.is-child {
  color: #047857;
  background: #d1fae5;
}

.dashboard-link-badge.is-child-offset {
  margin-left: 10px;
}

.dashboard-type-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.dashboard-ticket-id-dot {
  cursor: copy;
}

.dashboard-type-dot.task {
  color: #2563eb;
  background: #dbeafe;
}

.dashboard-type-dot.bug {
  color: #b91c1c;
  background: #fee2e2;
}

.dashboard-title-main {
  min-width: 0;
}

.dashboard-title-line {
  color: #303133;
  font-weight: 500;
  line-height: 1.45;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.dashboard-title-text {
  font-weight: 500;
}

.dashboard-task-relation {
  margin-top: 4px;
  color: #94a3b8;
  font-size: var(--tf-font-caption);
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.dashboard-priority-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 500;
  width: 100%;
}

.dashboard-priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #909399;
}

.dashboard-priority-dot.is-low {
  background: #909399;
}

.dashboard-priority-dot.is-mid {
  background: #409eff;
}

.dashboard-priority-dot.is-high {
  background: #e6a23c;
}

.dashboard-priority-dot.is-urgent {
  background: #f56c6c;
}

.dashboard-owner-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dashboard-owner-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-deadline-cell {
  line-height: 1.2;
}

.dashboard-deadline-hint {
  margin-top: 2px;
  font-size: var(--tf-font-caption);
}

.dashboard-deadline-hint.normal {
  color: #94a3b8;
}

.dashboard-deadline-hint.soon {
  color: #e6a23c;
  font-weight: 500;
}

.dashboard-deadline-hint.overdue {
  color: #f56c6c;
  font-weight: 500;
}

.dashboard-deadline-hint.neutral {
  color: #94a3b8;
}

@media (max-width: 1366px) {
  .dashboard-overview-kpis {
    gap: 6px;
  }

  .dashboard-overview-kpi {
    padding: 7px 9px;
  }

  .dashboard-overview-kpi-value {
    font-size: var(--tf-font-kpi);
  }
}

@media (max-width: 1100px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-right-column {
    padding-top: 0;
  }

  .dashboard-dynamics {
    min-height: 320px;
  }
}
</style>
