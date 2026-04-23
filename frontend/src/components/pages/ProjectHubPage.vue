<template>
  <section v-show="activeTab === 'project_hub'">
    <div class="project-hub-main">
      <div class="project-hub-main-column">
        <el-card class="project-hub-tickets-card">
          <template #header>
            <div class="project-hub-card-head project-hub-tickets-head">
              <span class="dashboard-panel-title">工单</span>
              <span class="project-hub-muted">共 {{ projectHubFilteredTickets.length }} 条</span>
              <button
                type="button"
                class="project-view-icon-btn"
                :class="{ active: projectHubFilterExpanded, 'has-active-filter': projectHubFiltersActive }"
                title="筛选条件"
                @click="toggleProjectHubFilters"
              >
                <el-icon aria-hidden="true"><Filter /></el-icon>
                <span v-if="projectHubFiltersActive" class="project-filter-active-dot"></span>
              </button>
              <div class="project-hub-view-icons">
                <button
                  type="button"
                  class="project-view-icon-btn"
                  :class="{ active: projectHubTicketViewMode === 'list' }"
                  title="列表视图"
                  @click="onProjectHubViewModeChange('list')"
                >
                  <span aria-hidden="true">☰</span>
                </button>
                <button
                  type="button"
                  class="project-view-icon-btn"
                  :class="{ active: projectHubTicketViewMode === 'kanban' }"
                  title="看板视图"
                  @click="onProjectHubViewModeChange('kanban')"
                >
                  <span aria-hidden="true">▦</span>
                </button>
              </div>
            </div>
          </template>
          <div v-if="searchResultTip" class="ticket-search-floating">
            <span>{{ searchResultTip }}</span>
            <button class="ticket-search-clear-btn" title="清除搜索" @click="clearTopbarSearch">×</button>
          </div>
          <div v-if="projectHubFilterExpanded" class="project-hub-filter-panel">
            <el-form label-width="72px" class="project-hub-filter-form">
              <el-form-item label="关键词">
                <div class="project-hub-filter-keyword">
                  <el-select
                    v-model="projectHubTicketFilters.keyword_field"
                    class="project-hub-filter-keyword-field"
                    popper-class="project-hub-filter-popper"
                    @change="onProjectHubFilterChange"
                  >
                    <el-option label="标题" value="title" />
                    <el-option label="描述" value="description" />
                  </el-select>
                  <el-input
                    v-model="projectHubTicketFilters.keyword"
                    clearable
                    placeholder="输入关键词"
                    class="project-hub-filter-keyword-input"
                    @input="onProjectHubFilterChange"
                    @clear="onProjectHubFilterChange"
                  />
                </div>
              </el-form-item>
              <el-form-item label="状态">
                <el-select
                  v-model="projectHubTicketFilters.status"
                  clearable
                  placeholder="全部状态"
                  class="project-hub-filter-item"
                  popper-class="project-hub-filter-popper"
                  @change="onProjectHubFilterChange"
                >
                  <el-option v-for="item in meta.ticket_status" :key="`project-hub-status-${item}`" :label="item" :value="item" />
                </el-select>
              </el-form-item>
              <el-form-item label="相关人员">
                <el-select
                  v-model="projectHubTicketFilters.related_user_id"
                  clearable
                  filterable
                  placeholder="全部人员"
                  class="project-hub-filter-item"
                  popper-class="project-hub-filter-popper"
                  @change="onProjectHubFilterChange"
                >
                  <el-option v-for="item in users" :key="`project-hub-related-${item.id}`" :label="item.display_name || item.username" :value="item.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="执行人">
                <el-select
                  v-model="projectHubTicketFilters.executor_id"
                  clearable
                  filterable
                  placeholder="全部执行人"
                  class="project-hub-filter-item"
                  popper-class="project-hub-filter-popper"
                  @change="onProjectHubFilterChange"
                >
                  <el-option v-for="item in users" :key="`project-hub-executor-${item.id}`" :label="item.display_name || item.username" :value="item.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="类型">
                <el-select
                  v-model="projectHubTicketTypeMode"
                  class="project-hub-filter-item"
                  popper-class="project-hub-filter-popper"
                  @change="onProjectHubFilterChange"
                >
                  <el-option label="全部" value="all" />
                  <el-option label="需求" value="task" />
                  <el-option label="BUG" value="bug" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button size="small" @click="resetProjectHubFilters">重置筛选</el-button>
              </el-form-item>
            </el-form>
          </div>
          <div v-show="projectHubTicketViewMode === 'list'" class="table-scroll-inner">
            <el-table
              :data="pagedTickets"
              stripe
              class="clickable-ticket-table project-hub-ticket-table"
              @row-click="handleTicketRowClick"
            >
              <el-table-column prop="id" label="ID" width="76">
                <template #default="scope">{{ scope.row.id }}</template>
              </el-table-column>
              <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip />
              <el-table-column prop="ticket_type" label="类型" width="88" />
              <el-table-column label="状态" width="112">
                <template #default="scope">
                  <span>{{ scope.row.status }}</span>
                  <el-tag v-if="isTicketOverdue(scope.row)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                    已逾期
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="priority" label="优先级" width="72" />
              <el-table-column label="负责人" min-width="160" show-overflow-tooltip>
                <template #default="scope">{{ scope.row.assignees.map((x) => x.display_name).join("、") || "—" }}</template>
              </el-table-column>
              <el-table-column label="截止" width="160">
                <template #default="scope">{{ formatDynamicTime(scope.row.end_time) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="92" fixed="right" align="center">
                <template #default="scope">
                  <el-dropdown trigger="click" @command="(command) => onProjectHubRowAction(command, scope.row)">
                    <el-button link type="primary" class="project-row-more-btn" @click.stop>
                      更多
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="edit">编辑</el-dropdown-item>
                        <el-dropdown-item command="detail">详情</el-dropdown-item>
                        <el-dropdown-item command="delete" :disabled="!user.is_admin">删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-show="projectHubTicketViewMode === 'kanban'" class="project-kanban">
            <div v-for="col in kanbanColumns" :key="col.status" class="project-kanban-column">
              <div class="project-kanban-column-head">{{ col.status }} · {{ col.tickets.length }}</div>
              <div class="project-kanban-cards">
                <div
                  v-for="t in col.tickets"
                  :key="t.id"
                  class="project-kanban-card"
                  @click="handleTicketRowClick(t)"
                >
                  <div class="project-kanban-card-title">{{ t.title }}</div>
                  <div class="project-kanban-card-meta">
                    <el-tag size="small" effect="plain">{{ t.ticket_type }}</el-tag>
                    <span class="project-kanban-priority">{{ t.priority }}</span>
                  </div>
                </div>
                <el-empty v-if="!col.tickets.length" description="无" :image-size="48" class="project-kanban-empty" />
              </div>
            </div>
          </div>
          <div v-show="projectHubTicketViewMode === 'list'" class="project-hub-pagination">
            <el-pagination
              background
              layout="total, sizes, prev, pager, next"
              :total="projectHubFilteredTickets.length"
              :page-sizes="[20, 30, 50, 100]"
              v-model:page-size="ticketPageSize"
              v-model:current-page="ticketPage"
              @size-change="ticketPage = 1"
            />
          </div>
        </el-card>

        <el-card class="project-hub-stats-card">
          <template #header>
            <div class="project-hub-card-head">
              <div class="dashboard-panel-title">数据与报表</div>
              <div class="report-toolbar">
                <el-radio-group
                  :model-value="analytics.range_days"
                  size="small"
                  @update:model-value="onAnalyticsRangeChange"
                >
                  <el-radio-button :value="7">7天</el-radio-button>
                  <el-radio-button :value="14">14天</el-radio-button>
                  <el-radio-button :value="30">30天</el-radio-button>
                </el-radio-group>
                <el-button size="small" text @click="loadAnalytics(currentProjectId, currentVersionId)">刷新</el-button>
              </div>
            </div>
          </template>
          <div class="report-metric-grid">
            <div class="report-metric-item"><div class="report-metric-label">工单总数</div><div class="report-metric-value">{{ analytics.progress.summary?.total || 0 }}</div></div>
            <div class="report-metric-item"><div class="report-metric-label">进行中</div><div class="report-metric-value">{{ analytics.progress.summary?.in_progress || 0 }}</div></div>
            <div class="report-metric-item"><div class="report-metric-label">已完成</div><div class="report-metric-value">{{ analytics.progress.summary?.done || 0 }}</div></div>
            <div class="report-metric-item"><div class="report-metric-label">完成率</div><div class="report-metric-value">{{ analytics.progress.summary?.completion_rate || 0 }}%</div></div>
            <div class="report-metric-item"><div class="report-metric-label">逾期</div><div class="report-metric-value">{{ analytics.progress.summary?.overdue || 0 }}</div></div>
            <div class="report-metric-item"><div class="report-metric-label">即将逾期</div><div class="report-metric-value">{{ analytics.progress.summary?.due_soon || 0 }}</div></div>
          </div>
          <div class="stats-tables-compact">
            <div class="stats-subsection">
              <div class="stats-subtitle">风险预警</div>
              <el-table :data="analytics.risk.items || []" stripe size="small" max-height="190">
                <el-table-column label="风险" width="92">
                  <template #default="scope">
                    <el-tag size="small" :type="getRiskTagType(scope.row.risk_type)">{{ scope.row.risk_type }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="工单" min-width="160" show-overflow-tooltip>
                  <template #default="scope">#{{ scope.row.ticket_id }} {{ scope.row.title }}</template>
                </el-table-column>
                <el-table-column prop="current_owner_name" label="负责人" width="90" />
              </el-table>
            </div>
            <div class="stats-subsection">
              <div class="stats-subtitle report-row-head">
                <span>人力负载</span>
                <el-radio-group :model-value="analytics.workload_group_by" size="small" @update:model-value="onAnalyticsWorkloadGroupChange">
                  <el-radio-button value="position">岗位</el-radio-button>
                  <el-radio-button value="user">个人</el-radio-button>
                </el-radio-group>
              </div>
              <el-table :data="workloadRows" stripe size="small" max-height="190">
                <el-table-column v-if="analytics.workload_group_by === 'position'" prop="label" label="岗位" width="90" />
                <el-table-column v-else prop="user_name" label="成员" width="90" show-overflow-tooltip />
                <el-table-column prop="active_ticket_count" label="在制" width="60" />
                <el-table-column prop="weighted_load" label="负载" width="66">
                  <template #default="scope">{{ Number(scope.row.weighted_load || 0).toFixed(1) }}</template>
                </el-table-column>
                <el-table-column prop="overdue_in_charge" label="逾期" width="60" />
              </el-table>
            </div>
          </div>
          <div class="stats-subsection density-section">
            <div class="stats-subtitle report-row-head">
              <span>个人任务密集度</span>
              <div class="density-filters">
                <el-select
                  :model-value="analytics.selected_density_member_id"
                  size="small"
                  placeholder="选择成员"
                  class="density-filter-member"
                  @change="onAnalyticsDensityMemberChange"
                >
                  <el-option v-for="item in analytics.density.members || []" :key="`density-member-${item.id}`" :label="item.name" :value="item.id" />
                </el-select>
              </div>
            </div>
            <div v-if="densityCalendarWeeks.length" class="density-timeline-wrap">
              <div class="density-calendar-head">
                <div class="density-week-col">周区间</div>
                <div v-for="(label, idx) in ['一', '二', '三', '四', '五', '六', '日']" :key="`weekday-${idx}`" class="density-weekday-col">周{{ label }}</div>
              </div>
              <div v-for="(week, wIdx) in densityCalendarWeeks" :key="`week-${wIdx}`" class="density-calendar-row">
                <div class="density-week-col">{{ week.week_label }}</div>
                <div
                  v-for="day in week.days"
                  :key="`${week.week_start}-${day.date}`"
                  class="density-calendar-cell"
                  :class="{ weekend: day.is_weekend }"
                  :style="getDensityCellStyle(day.task_count, day.is_weekend)"
                  :title="getDensityTooltip(day)"
                >
                  <div class="density-cell-date">{{ day.date.slice(5) }}</div>
                  <template v-if="day.is_weekend"><div class="density-day-empty">休</div></template>
                  <template v-else-if="day.tasks?.length">
                    <button
                      v-for="task in day.tasks.slice(0, 2)"
                      :key="`density-task-${day.date}-${task.ticket_id}`"
                      class="density-task-chip"
                      :title="`#${task.ticket_id} ${task.title}`"
                      type="button"
                      @click.stop="openTicketDetail({ id: task.ticket_id })"
                    >
                      #{{ task.ticket_id }} {{ task.title }}
                    </button>
                    <div v-if="day.tasks.length > 2" class="density-task-more">+{{ day.tasks.length - 2 }}</div>
                  </template>
                  <div v-else class="density-day-empty">-</div>
                </div>
              </div>
              <div class="density-legend">颜色越深表示该工作日安排的需求单越密集（单日最高 {{ densityMaxOverlap }} 个）</div>
            </div>
            <el-empty v-else description="暂无密集度数据" :image-size="56" />
          </div>
        </el-card>
      </div>

      <div class="project-hub-side-column">
        <el-card class="project-hub-dynamics-card">
          <template #header>
            <div class="project-hub-card-head">
              <span class="dashboard-panel-title">项目动态</span>
              <el-button size="small" text @click="loadProjectHub(currentProjectId)">刷新</el-button>
            </div>
          </template>
          <div v-if="(projectHub.dynamics || []).length > 0" class="dynamics-compact-scroll">
            <div v-for="item in pagedProjectDynamics" :key="item.id" class="dynamic-compact">
              <div class="dynamic-compact-line1">
                <span class="dynamic-compact-ref">#{{ item.ticket_id }}</span>
                <span class="dynamic-compact-title">{{ item.ticket_title }}</span>
                <span class="dynamic-compact-time">{{ formatDynamicTime(item.created_at) }}</span>
              </div>
              <div class="dynamic-compact-line2">{{ item.editor_name }} · {{ item.summary }}</div>
            </div>
          </div>
          <el-empty v-else description="暂无动态" :image-size="56" />
          <div v-if="(projectHub.dynamics || []).length > projectDynamicsPageSize" class="project-hub-dynamics-pagination">
            <el-pagination
              background
              small
              layout="total, prev, pager, next"
              :total="(projectHub.dynamics || []).length"
              :page-size="projectDynamicsPageSize"
              v-model:current-page="projectDynamicsPage"
            />
          </div>
        </el-card>
        <el-card class="project-hub-version-card">
          <template #header><div class="dashboard-panel-title">版本管理</div></template>
          <el-collapse class="version-manage-collapse">
            <el-collapse-item title="展开管理版本（创建/删除）" name="manage">
              <div class="version-create-actions version-create-entry">
                <el-button v-if="!showVersionCreateForm" type="primary" size="small" :disabled="!user.is_admin" @click="showVersionCreateForm = true">创建版本</el-button>
              </div>
              <div v-if="showVersionCreateForm">
                <div class="version-create-row compact">
                  <el-input v-model="versionForm.name" placeholder="版本名，如 v1.1.0" class="version-name-input compact" />
                  <el-input v-model="versionForm.description" placeholder="说明（可选）" />
                </div>
                <div class="version-create-actions">
                  <el-button size="small" @click="cancelCreateVersion">取消</el-button>
                  <el-button type="primary" size="small" :disabled="!user.is_admin" @click="createVersion">确认创建</el-button>
                </div>
              </div>
              <el-table :data="versions" stripe size="small" max-height="160" class="mt8">
                <el-table-column prop="name" label="版本" width="120" />
                <el-table-column label="创建时间" width="145">
                  <template #default="scope">{{ formatDynamicTime(scope.row.created_at) }}</template>
                </el-table-column>
                <el-table-column label="操作" width="80">
                  <template #default="scope">
                    <el-button link type="danger" :disabled="!user.is_admin" @click="removeVersion(scope.row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </el-card>
        <el-card class="project-hub-info-card">
          <template #header><div class="dashboard-panel-title">项目详情</div></template>
          <el-descriptions v-if="projectHub.selected_project" :column="1" border size="small">
            <el-descriptions-item label="项目名">{{ projectHub.selected_project.name }}</el-descriptions-item>
            <el-descriptions-item label="描述">{{ projectHub.selected_project.description || "暂无描述" }}</el-descriptions-item>
            <el-descriptions-item label="默认项目">{{ projectHub.selected_project.is_default ? "是" : "否" }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDynamicTime(projectHub.selected_project.created_at) }}</el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="暂无项目" :image-size="56" />
        </el-card>
      </div>
    </div>
  </section>
</template>

<script setup>
import { inject } from "vue";
import { Filter } from "@element-plus/icons-vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("ProjectHubPage requires appCtx");
}

const {
  activeTab,
  projectHubFilteredTickets,
  projectHubFilterExpanded,
  projectHubFiltersActive,
  toggleProjectHubFilters,
  projectHubTicketViewMode,
  onProjectHubViewModeChange,
  searchResultTip,
  clearTopbarSearch,
  projectHubTicketFilters,
  onProjectHubFilterChange,
  meta,
  users,
  projectHubTicketTypeMode,
  resetProjectHubFilters,
  pagedTickets,
  handleTicketRowClick,
  isTicketOverdue,
  formatDynamicTime,
  onProjectHubRowAction,
  user,
  kanbanColumns,
  ticketPageSize,
  ticketPage,
  analytics,
  getRiskTagType,
  onAnalyticsWorkloadGroupChange,
  workloadRows,
  densityCalendarWeeks,
  onAnalyticsDensityMemberChange,
  getDensityCellStyle,
  getDensityTooltip,
  openTicketDetail,
  densityMaxOverlap,
  onAnalyticsRangeChange,
  loadAnalytics,
  currentProjectId,
  currentVersionId,
  loadProjectHub,
  projectHub,
  pagedProjectDynamics,
  projectDynamicsPageSize,
  projectDynamicsPage,
  showVersionCreateForm,
  versionForm,
  cancelCreateVersion,
  createVersion,
  versions,
  removeVersion,
} = appCtx;
</script>

<style scoped>
.project-hub-tickets-card {
  position: relative;
}

.project-hub-tickets-card,
.project-hub-stats-card,
.project-hub-dynamics-card,
.project-hub-version-card,
.project-hub-info-card {
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  box-shadow: none;
}

.ticket-search-floating {
  position: absolute;
  right: 14px;
  top: 58px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid #d4d9e1;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  box-shadow: none;
}

.ticket-search-clear-btn {
  border: 0;
  background: transparent;
  color: #409eff;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

.ticket-search-clear-btn:hover {
  color: #337ecc;
}

.project-hub-main {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.55fr);
  gap: 12px;
  align-items: stretch;
  min-height: 680px;
}

.project-hub-main-column {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.project-hub-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.dashboard-panel-title {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}

.project-hub-tickets-head {
  flex-wrap: wrap;
  gap: 8px;
}

.project-hub-muted {
  font-size: 11px;
  color: #94a3b8;
}

.project-hub-filter-panel {
  margin-bottom: 10px;
  padding: 10px 12px 4px;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  background: #ffffff;
}

.project-hub-filter-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 12px;
}

.project-hub-filter-form :deep(.el-form-item) {
  margin-bottom: 8px;
}

.project-hub-filter-form :deep(.el-form-item__label) {
  font-size: 11px;
  color: #94a3b8;
}

.project-hub-filter-panel :deep(.el-input__inner),
.project-hub-filter-panel :deep(.el-select__selected-item),
.project-hub-filter-panel :deep(.el-select__placeholder),
.project-hub-filter-panel :deep(.el-select__input) {
  font-size: 12px;
}

:global(.project-hub-filter-popper .el-select-dropdown__item) {
  font-size: 12px;
}

.project-hub-filter-keyword {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.project-hub-filter-keyword-field {
  width: 92px;
  flex-shrink: 0;
}

.project-hub-filter-keyword-input,
.project-hub-filter-item {
  width: 100%;
}

.project-hub-view-icons {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.project-view-icon-btn {
  width: 30px;
  height: 30px;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  background: #fff;
  color: #606266;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
  position: relative;
}

.project-view-icon-btn:hover {
  border-color: #d4d9e1;
  color: #475569;
}

.project-view-icon-btn.active {
  border-color: #bfdbfe;
  color: #2563eb;
  background: #f4f8ff;
}

.project-filter-active-dot {
  position: absolute;
  right: 5px;
  top: 5px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #f56c6c;
}

.table-scroll-inner {
  min-height: 0;
}

.project-hub-ticket-table :deep(.el-table__cell) {
  font-size: 12px;
  padding-top: 10px;
  padding-bottom: 10px;
}

.project-hub-ticket-table :deep(.el-table__row) {
  cursor: pointer;
}

.project-row-more-btn {
  font-size: 12px;
}

.project-kanban {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 6px;
  min-height: 280px;
}

.project-kanban-column {
  flex: 0 0 220px;
  min-width: 0;
  max-height: 520px;
  display: flex;
  flex-direction: column;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  background: #ffffff;
}

.project-kanban-column-head {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 10px;
  border-bottom: 1px solid #eef1f4;
  background: #fff;
  border-radius: 8px 8px 0 0;
}

.project-kanban-cards {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 8px;
}

.project-kanban-card {
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  padding: 8px;
  background: #fff;
  margin-bottom: 8px;
  cursor: pointer;
}

.project-kanban-card:hover {
  border-color: #d4d9e1;
  background: #fcfcfd;
}

.project-kanban-card-title {
  font-size: 13px;
  color: #303133;
  margin-bottom: 6px;
}

.project-kanban-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.project-kanban-priority {
  margin-left: auto;
  flex-shrink: 0;
}

.project-kanban-empty {
  padding: 8px 0;
}

.project-hub-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
}

.project-hub-side-column {
  display: grid;
  grid-template-rows: minmax(250px, 1fr) auto auto;
  gap: 12px;
  min-height: 0;
}

.project-hub-dynamics-card {
  min-height: 0;
}

.project-hub-dynamics-card :deep(.el-card__body) {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.dynamics-compact-scroll {
  flex: 1;
  min-height: 0;
  max-height: none;
  overflow: auto;
  padding-right: 4px;
}

.project-hub-dynamics-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
}

.dynamic-compact {
  padding: 8px 0;
  border-bottom: 1px solid #edf0f2;
  font-size: 12px;
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
  font-size: 11px;
}

.dynamic-compact-line2 {
  margin-top: 4px;
  color: #606266;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-hub-version-card {
  min-height: 0;
}

.version-manage-collapse {
  border: none;
}

.version-manage-collapse :deep(.el-collapse-item__header) {
  font-size: 11px;
  color: #6b7280;
}

.version-manage-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 4px;
}

.report-toolbar {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.report-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.report-metric-item {
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  padding: 8px 10px;
  background: #ffffff;
}

.report-metric-label {
  font-size: 11px;
  color: #94a3b8;
}

.report-metric-value {
  margin-top: 3px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.stats-tables-compact {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.stats-subtitle {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #606266;
}

.stats-subsection {
  min-width: 0;
}

.report-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.density-section {
  margin-top: 8px;
}

.density-filters {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.density-filter-member {
  width: 140px;
}

.density-timeline-wrap {
  margin-top: 6px;
  overflow-x: auto;
}

.density-calendar-head,
.density-calendar-row {
  display: grid;
  grid-template-columns: 124px repeat(7, minmax(100px, 1fr));
  gap: 6px;
  min-width: 860px;
}

.density-calendar-head {
  margin-bottom: 6px;
}

.density-week-col,
.density-weekday-col {
  border: 1px solid #e6e8ec;
  border-radius: 6px;
  background: #f9fafb;
  color: #606266;
  font-size: 13px;
  font-weight: 500;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.density-week-col {
  justify-content: flex-start;
  padding: 0 10px;
}

.density-calendar-row + .density-calendar-row {
  margin-top: 6px;
}

.density-calendar-cell {
  min-height: 76px;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
}

.density-calendar-cell.weekend {
  opacity: 0.7;
}

.density-cell-date {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
}

.density-task-chip {
  appearance: none;
  border: 1px solid #e6e8ec;
  outline: none;
  cursor: pointer;
  text-align: left;
  font-size: 11px;
  color: #1f2937;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #ffffff;
  border-radius: 4px;
  padding: 1px 4px;
}

.density-task-chip:hover {
  border-color: #d4d9e1;
  color: #334155;
}

.density-task-more {
  font-size: 11px;
  color: #1d4ed8;
  font-weight: 500;
}

.density-day-empty {
  font-size: 11px;
  color: #9ca3af;
  margin-top: auto;
}

.density-legend {
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
}

@media (max-width: 1200px) {
  .project-hub-filter-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .project-hub-filter-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1400px) {
  .project-hub-main {
    grid-template-columns: 1fr;
    min-height: unset;
  }

  .project-hub-side-column {
    grid-template-rows: none;
  }
}
</style>
