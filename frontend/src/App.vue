<template>
  <div class="page">
    <el-card v-if="!token" class="login-card">
      <template #header>TaskFlow 登录</template>
      <el-form :model="loginForm" label-width="80px" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" placeholder="admin" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" placeholder="admin123" />
        </el-form-item>
        <el-button type="primary" @click="doLogin">登录</el-button>
      </el-form>
    </el-card>

    <div v-else>
      <el-header class="header topbar">
        <div class="topbar-left">
          <div class="platform-logo">TF</div>
          <strong class="platform-title">TaskFlow</strong>
          <el-select
            v-model="currentProjectId"
            placeholder="请选择项目"
            class="project-switch-select compact"
            @change="onGlobalProjectChange"
          >
            <el-option v-for="item in projects" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </div>

        <div class="topbar-middle">
          <el-input
            v-model="globalSearchKeyword"
            placeholder="搜索标题、描述、模块"
            clearable
            class="global-search-input"
            @keyup.enter="runTopbarSearch"
            @clear="runTopbarSearch"
          >
            <template #append>
              <el-button @click="runTopbarSearch">搜索</el-button>
            </template>
          </el-input>
          <el-button type="primary" plain @click="createQuickTicket('需求单')">创建任务</el-button>
          <el-button type="danger" plain @click="createQuickTicket('BUG单')">创建BUG</el-button>
        </div>

        <div class="topbar-right">
          <el-badge
            class="topbar-notify-badge"
            :value="notification.unread_notification_count"
            :hidden="!notification.unread_notification_count"
            :max="99"
          >
            <el-button circle text class="topbar-notify-btn" title="通知" @click="openNotificationCenter">
              <span class="notify-bell-icon" aria-hidden="true">🔔</span>
            </el-button>
          </el-badge>
          <el-dropdown trigger="click" @command="handleUserMenuCommand">
            <div class="user-menu-trigger">
              <el-avatar :size="30" class="user-avatar">{{ userInitial }}</el-avatar>
              <div class="user-meta">
                <div class="user-name">{{ user.display_name || user.username || "未命名用户" }}</div>
                <div class="user-role">{{ user.position || "成员" }}</div>
              </div>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>{{ user.display_name || user.username || "未命名用户" }}</el-dropdown-item>
                <el-dropdown-item disabled>{{ user.position || "成员" }}</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-alert
        v-if="notification.overdue_count || notification.soon_due_count || notification.new_ticket_count"
        type="warning"
        show-icon
        :closable="false"
        class="mb12"
      >
        <template #title>
          新工单 {{ notification.new_ticket_count }} 个，逾期 {{ notification.overdue_count }} 个，即将逾期
          {{ notification.soon_due_count }} 个
        </template>
      </el-alert>

      <div class="main-layout">
        <aside class="side-nav">
          <button class="side-nav-item" :class="{ active: activeTab === 'dashboard' }" @click="handleSideNavClick('dashboard')">
            <span class="side-nav-icon">▦</span>
            <span>工作台</span>
          </button>
          <div class="side-version-group">
            <div class="side-version-title">版本</div>
            <div class="side-version-list">
              <button class="side-version-btn" :class="{ active: !currentVersionId }" @click="selectVersionByButton(null)">全部</button>
              <button
                v-for="item in versions"
                :key="item.id"
                class="side-version-btn"
                :class="{ active: currentVersionId === item.id }"
                @click="selectVersionByButton(item.id)"
              >
                {{ item.name }}
              </button>
            </div>
          </div>
          <button class="side-nav-item" :class="{ active: activeTab === 'project_hub' }" @click="handleSideNavClick('project_hub')">
            <span class="side-nav-icon">◫</span>
            <span>项目栏</span>
          </button>
          <button class="side-nav-item" :class="{ active: activeTab === 'wiki' }" @click="handleSideNavClick('wiki')">
            <span class="side-nav-icon">▤</span>
            <span>Wiki</span>
          </button>
          <button
            class="side-nav-item"
            :class="{ active: activeTab === 'console' }"
            @click="handleSideNavClick('console')"
          >
            <span class="side-nav-icon">⌗</span>
            <span>控制台</span>
          </button>
          <button
            v-if="user.is_admin"
            class="side-nav-item"
            :class="{ active: activeTab === 'projects' }"
            @click="handleSideNavClick('projects')"
          >
            <span class="side-nav-icon">◧</span>
            <span>项目管理</span>
          </button>
          <button
            v-if="user.is_admin"
            class="side-nav-item"
            :class="{ active: activeTab === 'users' }"
            @click="handleSideNavClick('users')"
          >
            <span class="side-nav-icon">◉</span>
            <span>用户管理</span>
          </button>
        </aside>

        <div class="main-content-area">
          <transition name="content-fade-slide" mode="out-in">
          <div v-if="!ticketDetail.visible" key="content-list">
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
                  <div class="dashboard-panel-title">
                    {{
                      dashboardViewMode === "created"
                        ? "我创建的需求"
                        : dashboardViewMode === "related"
                          ? "和我有关的需求"
                          : "待我处理需求"
                    }}
                  </div>
                </template>
                <el-table
                  :data="pagedDashboardTasks"
                  stripe
                  max-height="390"
                  class="clickable-ticket-table dashboard-main-table"
                  @row-click="handleTicketRowClick"
                >
                  <el-table-column label="标题" min-width="270" show-overflow-tooltip>
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
                        <span class="dashboard-type-dot task">{{ getTaskTypeDotText(scope.row) }}</span>
                        <div class="dashboard-title-main">
                          <div class="dashboard-title-line">
                            <span class="dashboard-ticket-id" @click.stop="copyTicketId(scope.row.id)">#{{ scope.row.id }}</span>
                            <span>{{ scope.row.title }}</span>
                          </div>
                          <div v-if="getTaskRelationText(scope.row)" class="dashboard-task-relation">
                            {{ getTaskRelationText(scope.row) }}
                          </div>
                        </div>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="138">
                    <template #default="scope">
                      <el-tag size="small" effect="light" :type="getDashboardStatusTagType(scope.row.status)">
                        {{ scope.row.status }}
                      </el-tag>
                      <el-tag v-if="isTicketOverdue(scope.row)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                        已逾期
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="优先级" width="102">
                    <template #default="scope">
                      <span class="dashboard-priority-chip">
                        <span :class="['dashboard-priority-dot', getDashboardPriorityDotClass(scope.row.priority)]"></span>
                        {{ scope.row.priority }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column label="负责人" width="126">
                    <template #default="scope">
                      <div class="dashboard-owner-cell">
                        <span class="dashboard-owner-avatar">{{ getDashboardOwnerInitial(scope.row) }}</span>
                        <span class="dashboard-owner-name">{{ getDashboardOwnerName(scope.row) }}</span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="截止" width="140">
                    <template #default="scope">
                      <div class="dashboard-deadline-cell">
                        <div>{{ formatDeadlineSlot(scope.row.end_time) }}</div>
                        <div :class="['dashboard-deadline-hint', getDeadlineHintType(scope.row)]">{{ getDeadlineHint(scope.row) }}</div>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-if="dashboardTasks.length > dashboardTaskPageSize" class="dashboard-pagination">
                  <el-pagination
                    background
                    small
                    layout="total, prev, pager, next"
                    :total="dashboardTasks.length"
                    :page-size="dashboardTaskPageSize"
                    v-model:current-page="dashboardTaskPage"
                  />
                </div>
              </el-card>

              <el-card class="dashboard-panel dashboard-dynamics">
                <template #header><div class="dashboard-panel-title">我的动态</div></template>
                <div v-if="(dashboard.my_dynamics || []).length > 0" class="dashboard-dynamics-list">
                  <div v-for="item in dashboard.my_dynamics" :key="item.id" class="dynamic-compact">
                    <div class="dynamic-compact-line1">
                      <span class="dynamic-compact-ref">#{{ item.ticket_id }}</span>
                      <span class="dynamic-compact-title">{{ item.ticket_title }}</span>
                      <span class="dynamic-compact-time">{{ formatDynamicTime(item.created_at) }}</span>
                    </div>
                    <div class="dynamic-compact-line2">{{ item.editor_name }} · {{ item.summary }}</div>
                  </div>
                </div>
                <el-empty v-else description="暂无项目动态" :image-size="72" />
              </el-card>
            </div>

            <div class="dashboard-column dashboard-right-column">
              <el-card class="dashboard-panel dashboard-bug-card">
                <template #header>
                  <div class="dashboard-panel-title">
                    {{
                      dashboardViewMode === "created"
                        ? "我创建的BUG"
                        : dashboardViewMode === "related"
                          ? "和我有关的BUG"
                          : "待我处理BUG"
                    }}
                  </div>
                </template>
                <el-table
                  :data="pagedDashboardBugs"
                  stripe
                  max-height="460"
                  class="clickable-ticket-table dashboard-main-table"
                  @row-click="handleTicketRowClick"
                >
                  <el-table-column label="标题" min-width="270" show-overflow-tooltip>
                    <template #default="scope">
                      <div class="dashboard-title-cell">
                        <span class="dashboard-type-dot bug">{{ getBugTypeDotText(scope.row) }}</span>
                        <div class="dashboard-title-main">
                          <div class="dashboard-title-line">
                            <span class="dashboard-ticket-id" @click.stop="copyTicketId(scope.row.id)">#{{ scope.row.id }}</span>
                            <span>{{ scope.row.title }}</span>
                          </div>
                        </div>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="138">
                    <template #default="scope">
                      <el-tag size="small" effect="light" :type="getDashboardStatusTagType(scope.row.status)">
                        {{ scope.row.status }}
                      </el-tag>
                      <el-tag v-if="isTicketOverdue(scope.row)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                        已逾期
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="优先级" width="102">
                    <template #default="scope">
                      <span class="dashboard-priority-chip">
                        <span :class="['dashboard-priority-dot', getDashboardPriorityDotClass(scope.row.priority)]"></span>
                        {{ scope.row.priority }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column label="负责人" width="126">
                    <template #default="scope">
                      <div class="dashboard-owner-cell">
                        <span class="dashboard-owner-avatar">{{ getDashboardOwnerInitial(scope.row) }}</span>
                        <span class="dashboard-owner-name">{{ getDashboardOwnerName(scope.row) }}</span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="截止" width="140">
                    <template #default="scope">
                      <div class="dashboard-deadline-cell">
                        <div>{{ formatDeadlineSlot(scope.row.end_time) }}</div>
                        <div :class="['dashboard-deadline-hint', getDeadlineHintType(scope.row)]">{{ getDeadlineHint(scope.row) }}</div>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-if="dashboardBugs.length > dashboardBugPageSize" class="dashboard-pagination">
                  <el-pagination
                    background
                    small
                    layout="total, prev, pager, next"
                    :total="dashboardBugs.length"
                    :page-size="dashboardBugPageSize"
                    v-model:current-page="dashboardBugPage"
                  />
                </div>
              </el-card>

              <el-card class="dashboard-panel dashboard-other-info">
                <template #header><div class="dashboard-panel-title">其他信息</div></template>
                <el-descriptions :column="2" border size="small">
                  <el-descriptions-item label="总工单">{{ dashboard.ticket_count || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="进行中">
                    {{ (dashboard.by_status?.["待处理"] || 0) + (dashboard.by_status?.["待验收"] || 0) + (dashboard.by_status?.["待测试"] || 0) }}
                  </el-descriptions-item>
                </el-descriptions>
                <el-table
                  class="mt8"
                  :data="Object.entries(dashboard.by_status || {}).map(([status, count]) => ({ status, count }))"
                  size="small"
                  stripe
                  max-height="220"
                >
                  <el-table-column prop="status" label="状态" width="150" />
                  <el-table-column prop="count" label="数量" />
                </el-table>
              </el-card>
            </div>
          </div>
          </section>

          <section v-if="user.is_admin" v-show="activeTab === 'users'">
          <div class="toolbar">
            <el-button type="primary" @click="openUserDialog()" :disabled="!user.is_admin">新增用户</el-button>
          </div>
          <el-table :data="users" stripe>
            <el-table-column prop="username" label="账号" width="150" />
            <el-table-column prop="display_name" label="姓名" width="160" />
            <el-table-column prop="position" label="岗位" width="120" />
            <el-table-column label="管理员" width="100">
              <template #default="scope">{{ scope.row.is_admin ? "是" : "否" }}</template>
            </el-table-column>
            <el-table-column label="操作">
              <template #default="scope">
                <el-button link type="primary" @click="openUserDialog(scope.row)" :disabled="!user.is_admin">编辑</el-button>
                <el-button link type="danger" @click="removeUser(scope.row)" :disabled="!user.is_admin">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          </section>

          <section v-if="user.is_admin" v-show="activeTab === 'projects'">
          <div class="toolbar">
            <el-button type="primary" @click="openProjectDialog()" :disabled="!user.is_admin">新增项目</el-button>
          </div>
          <el-table :data="projects" stripe>
            <el-table-column prop="name" label="项目名" width="180" />
            <el-table-column prop="description" label="描述" />
            <el-table-column label="默认项目" width="120">
              <template #default="scope">{{ scope.row.is_default ? "是" : "否" }}</template>
            </el-table-column>
            <el-table-column label="操作" width="260">
              <template #default="scope">
                <el-button link type="primary" @click="openProjectDialog(scope.row)" :disabled="!user.is_admin">编辑</el-button>
                <el-button link type="warning" @click="setDefaultProject(scope.row)" :disabled="!user.is_admin">设为默认</el-button>
                <el-button link type="danger" @click="removeProject(scope.row)" :disabled="!user.is_admin">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          </section>

          <section v-show="activeTab === 'project_hub'">
          <div class="project-hub-main">
            <div class="project-hub-main-column">
              <el-card class="project-hub-tickets-card">
                <template #header>
                  <div class="project-hub-card-head project-hub-tickets-head">
                    <span class="dashboard-panel-title">工单</span>
                    <el-radio-group
                      :model-value="projectHubTicketTypeMode"
                      size="small"
                      class="project-hub-type-toggle"
                      @update:model-value="onProjectHubTicketTypeChange"
                    >
                      <el-radio-button label="all" value="all">全部</el-radio-button>
                      <el-radio-button label="task" value="task">需求</el-radio-button>
                      <el-radio-button label="bug" value="bug">BUG</el-radio-button>
                    </el-radio-group>
                    <span class="project-hub-muted">共 {{ projectHubFilteredTickets.length }} 条</span>
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
                <div class="ticket-batch-bar">
                  <span class="ticket-batch-label">已选 {{ selectedTicketIds.length }} 条</span>
                  <el-select v-model="batchEdit.priority" clearable placeholder="批量优先级" class="ticket-batch-select">
                    <el-option v-for="item in meta.priorities" :key="item" :label="item" :value="item" />
                  </el-select>
                  <el-select
                    v-model="batchEdit.assignee_ids"
                    multiple
                    clearable
                    collapse-tags
                    collapse-tags-tooltip
                    placeholder="批量负责人"
                    class="ticket-batch-select assignee"
                  >
                    <el-option
                      v-for="item in users"
                      :key="item.id"
                      :label="item.display_name || item.username"
                      :value="item.id"
                    />
                  </el-select>
                  <el-button type="primary" plain :disabled="!selectedTicketIds.length" @click="submitBatchEdit">批量应用</el-button>
                </div>
                <div v-show="projectHubTicketViewMode === 'list'" class="table-scroll-inner">
                  <el-table
                    :data="pagedTickets"
                    stripe
                    class="clickable-ticket-table dashboard-main-table"
                    @selection-change="onProjectHubSelectionChange"
                    @row-click="handleTicketRowClick"
                  >
                    <el-table-column type="selection" width="44" />
                    <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
                    <el-table-column prop="ticket_type" label="类型" width="88" />
                    <el-table-column label="状态" width="150">
                      <template #default="scope">
                        <span>{{ scope.row.status }}</span>
                        <el-tag v-if="isTicketOverdue(scope.row)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                          已逾期
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column prop="priority" label="优先级" width="80" />
                    <el-table-column label="负责人" min-width="120" show-overflow-tooltip>
                      <template #default="scope">{{ scope.row.assignees.map((x) => x.display_name).join("、") || "—" }}</template>
                    </el-table-column>
                    <el-table-column label="截止" width="160">
                      <template #default="scope">{{ formatDynamicTime(scope.row.end_time) }}</template>
                    </el-table-column>
                    <el-table-column label="操作" width="200" fixed="right">
                      <template #default="scope">
                        <el-button link type="primary" @click.stop="openTicketDialog(scope.row)">编辑</el-button>
                        <el-button link type="success" @click.stop="openTicketDetail(scope.row)">详情</el-button>
                        <el-button link type="danger" @click.stop="removeTicket(scope.row)">删除</el-button>
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
                  <div class="report-metric-item">
                    <div class="report-metric-label">工单总数</div>
                    <div class="report-metric-value">{{ analytics.progress.summary?.total || 0 }}</div>
                  </div>
                  <div class="report-metric-item">
                    <div class="report-metric-label">进行中</div>
                    <div class="report-metric-value">{{ analytics.progress.summary?.in_progress || 0 }}</div>
                  </div>
                  <div class="report-metric-item">
                    <div class="report-metric-label">已完成</div>
                    <div class="report-metric-value">{{ analytics.progress.summary?.done || 0 }}</div>
                  </div>
                  <div class="report-metric-item">
                    <div class="report-metric-label">完成率</div>
                    <div class="report-metric-value">{{ analytics.progress.summary?.completion_rate || 0 }}%</div>
                  </div>
                  <div class="report-metric-item">
                    <div class="report-metric-label">逾期</div>
                    <div class="report-metric-value">{{ analytics.progress.summary?.overdue || 0 }}</div>
                  </div>
                  <div class="report-metric-item">
                    <div class="report-metric-label">即将逾期</div>
                    <div class="report-metric-value">{{ analytics.progress.summary?.due_soon || 0 }}</div>
                  </div>
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
                      <el-radio-group
                        :model-value="analytics.workload_group_by"
                        size="small"
                        @update:model-value="onAnalyticsWorkloadGroupChange"
                      >
                        <el-radio-button value="position">岗位</el-radio-button>
                        <el-radio-button value="user">个人</el-radio-button>
                      </el-radio-group>
                    </div>
                    <el-table :data="workloadRows" stripe size="small" max-height="190">
                      <el-table-column
                        v-if="analytics.workload_group_by === 'position'"
                        prop="label"
                        label="岗位"
                        width="90"
                      />
                      <el-table-column
                        v-else
                        prop="user_name"
                        label="成员"
                        width="90"
                        show-overflow-tooltip
                      />
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
                        <el-option
                          v-for="item in analytics.density.members || []"
                          :key="`density-member-${item.id}`"
                          :label="item.name"
                          :value="item.id"
                        />
                      </el-select>
                    </div>
                  </div>
                  <div v-if="densityCalendarWeeks.length" class="density-timeline-wrap">
                    <div class="density-calendar-head">
                      <div class="density-week-col">周区间</div>
                      <div v-for="(label, idx) in ['一', '二', '三', '四', '五', '六', '日']" :key="`weekday-${idx}`" class="density-weekday-col">
                        周{{ label }}
                      </div>
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
                        <template v-if="day.is_weekend">
                          <div class="density-day-empty">休</div>
                        </template>
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
                      <el-button
                        v-if="!showVersionCreateForm"
                        type="primary"
                        size="small"
                        :disabled="!user.is_admin"
                        @click="showVersionCreateForm = true"
                      >
                        创建版本
                      </el-button>
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

          <section v-show="activeTab === 'wiki'">
          <el-card class="wiki-card">
            <div class="wiki-category-bar">
              <el-button
                size="small"
                :type="!wikiFilter.category_id ? 'primary' : 'default'"
                @click="setWikiCategoryFilter(null)"
              >
                全部
              </el-button>
              <el-button
                v-for="item in wikiCategories"
                :key="item.id"
                size="small"
                :type="wikiFilter.category_id === item.id ? 'primary' : 'default'"
                @click="setWikiCategoryFilter(item.id)"
              >
                {{ item.name }}
              </el-button>
            </div>
            <el-table :data="pagedWikiArticles" stripe class="clickable-ticket-table" @row-click="openWikiDetailByRow">
              <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
              <el-table-column prop="category_name" label="专栏" width="140" />
              <el-table-column prop="updater_name" label="更新人" width="120" />
              <el-table-column label="更新时间" width="180">
                <template #default="scope">{{ formatDynamicTime(scope.row.updated_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="220">
                <template #default="scope">
                  <el-button link type="primary" @click.stop="openWikiDialog(scope.row)">编辑</el-button>
                  <el-button link type="success" @click.stop="openWikiDetail(scope.row)">查看</el-button>
                  <el-button
                    link
                    type="danger"
                    @click.stop="removeWikiArticle(scope.row)"
                    :disabled="!user.is_admin && scope.row.creator_id !== user.id"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="project-hub-pagination">
              <el-pagination
                background
                layout="total, prev, pager, next"
                :total="wikiArticles.length"
                :page-size="wikiPageSize"
                v-model:current-page="wikiPage"
              />
            </div>
          </el-card>
          <el-button class="wiki-fab-create" type="primary" @click="openWikiDialog()">新建文章</el-button>
          </section>

          <section v-show="activeTab === 'console'" class="console-page">
            <div class="console-gateway-bar">
              <span class="console-gateway-label">当前服务器</span>
              <el-select
                v-model="selectedGatewayId"
                class="console-gateway-select"
                placeholder="请先配置网关地址"
                :disabled="!consoleStatus.gateways?.length"
                filterable
              >
                <el-option 
                  v-for="g in consoleStatus.gateways"
                  :key="g.id"
                  :label="g.label"
                  :value="String(g.id)"
                />
              </el-select>
            </div>

            <template v-if="consoleSubView === 'home'">
              <el-card shadow="never" class="console-intro-card">
                <template #header>
                  <div class="dashboard-panel-title">控制台</div>
                </template>
                <p class="console-intro-text">
                  用于对接服务器游戏的便捷操作与查询
                </p>
                <el-alert
                  v-if="consoleStatus.loaded && consoleStatus.hint"
                  type="info"
                  show-icon
                  :closable="false"
                  class="console-status-alert"
                >
                  <div class="console-hint">{{ consoleStatus.hint }}</div>
                </el-alert>
              </el-card>

              <div class="console-card-grid">
                <el-card shadow="never" class="console-tool-card console-hotreload-entry-card" @click="openHotReload">
                  <template #header><span class="console-card-title">数据文件对比 / 热更新</span></template>
                  <p class="console-card-desc">
                    对比服务器上数据文件与 TaskFlow 后端本机目录中的同名文件，可将本地文件上传到服务器。
                  </p>
                  <el-button class="console-hotreload-entry-button" @click.stop="openHotReload">进入数据文件对比</el-button>
                </el-card>

                <el-card shadow="never" class="console-tool-card console-db-entry-card" @click="openDbExplorer">
                  <template #header><span class="console-card-title">数据库查询</span></template>
                  <p class="console-card-desc">
                    从服务器拉取表与字段，支持可视化条件与可选 SQL。
                  </p>
                  <el-button class="console-db-entry-button" plain @click.stop="openDbExplorer">进入数据库查询</el-button>
                </el-card>

                <el-card shadow="never" class="console-tool-card console-tool-card-wide">
                  <template #header><span class="console-card-title">发送指令</span></template>
                  <p class="console-card-desc">向服务器发送管理指令（Lua/文本协议依项目而定）。</p>
                  <el-input
                    v-model="consoleForms.command"
                    type="textarea"
                    :rows="5"
                    placeholder="输入指令内容..."
                    class="mb12"
                  />
                  <div class="console-command-actions">
                    <el-button type="primary" @click="sendSkynetCommand">发送</el-button>
                  </div>
                  <el-input
                    v-if="consoleForms.commandResult"
                    v-model="consoleForms.commandResult"
                    type="textarea"
                    :rows="4"
                    readonly
                    class="console-result"
                  />
                </el-card>
              </div>
            </template>

            <div v-else-if="consoleSubView === 'db_explorer'" class="console-db-explorer">
              <div class="console-db-toolbar">
                <el-button link type="primary" class="console-db-back" @click="closeDbExplorer">← 返回控制台</el-button>
                <h3 class="console-db-heading">数据库查询</h3>
                <span v-if="currentSkynetGateway" class="console-db-gateway-pill">{{ currentSkynetGateway.label }}</span>
              </div>

              <div class="console-db-main">
                <aside class="console-db-panel console-db-tables">
                  <div class="console-db-panel-title">数据表</div>
                  <el-scrollbar class="console-db-scroll">
                    <div v-loading="dbExplorer.tablesLoading" class="console-db-list-wrap">
                      <button
                        v-for="t in dbExplorer.tables"
                        :key="t.name"
                        type="button"
                        class="console-db-list-item"
                        :class="{ active: dbExplorer.selectedTable === t.name }"
                        @click="selectDbTable(t.name)"
                      >
                        <span class="console-db-item-name">{{ t.name }}</span>
                        <span v-if="t.comment" class="console-db-item-sub">{{ t.comment }}</span>
                      </button>
                      <el-empty
                        v-if="!dbExplorer.tablesLoading && !dbExplorer.tables.length"
                        :description="dbExplorer.tablesHint || '暂无表'"
                        :image-size="48"
                      />
                    </div>
                  </el-scrollbar>
                  <p v-if="dbExplorer.tablesHint && dbExplorer.tables.length" class="console-db-mini-hint">{{ dbExplorer.tablesHint }}</p>
                </aside>

                <aside class="console-db-panel console-db-fields">
                  <div class="console-db-panel-title">字段</div>
                  <el-scrollbar class="console-db-scroll">
                    <div v-loading="dbExplorer.columnsLoading" class="console-db-field-wrap">
                      <div v-for="c in dbExplorer.columns" :key="c.name" class="console-db-field-row">
                        <code class="console-db-field-name">{{ c.name }}</code>
                        <span class="console-db-field-type">{{ c.type || "—" }}</span>
                      </div>
                      <div v-if="!dbExplorer.selectedTable" class="console-db-placeholder">选择左侧表后显示字段</div>
                      <el-empty
                        v-else-if="!dbExplorer.columnsLoading && !dbExplorer.columns.length"
                        description="无字段信息"
                        :image-size="40"
                      />
                    </div>
                  </el-scrollbar>
                </aside>

                <div class="console-db-workspace">
                  <div class="console-db-sql-block">
                    <div class="console-db-label-row">
                      <label class="console-db-label">SQL（可选）</label>
                      <el-button size="small" text type="primary" @click="clearDbExplorerSql">清除</el-button>
                    </div>
                    <el-input
                      v-model="dbExplorer.sql"
                      type="textarea"
                      :rows="5"
                      placeholder="留空则按下方「表 + 条件」由后端生成查询；填写完整 SQL 时由后端校验白名单后执行"
                      class="console-db-sql-input"
                    />
                  </div>
                  <div class="console-db-filters-block">
                    <div class="console-db-label-row">
                      <label class="console-db-label">条件</label>
                      <span class="console-db-label-actions">
                        <el-button size="small" text type="primary" @click="addFilterRow">添加条件</el-button>
                        <el-button size="small" text @click="clearDbExplorerFilters">清空条件</el-button>
                      </span>
                    </div>
                    <div class="console-db-filter-rows">
                      <div v-for="(row, idx) in dbExplorer.filters" :key="idx" class="console-db-filter-line">
                        <el-select v-model="row.field" placeholder="字段" filterable clearable class="console-db-f-sel">
                          <el-option v-for="c in dbExplorer.columns" :key="c.name" :label="c.name" :value="c.name" />
                        </el-select>
                        <el-select v-model="row.operator" class="console-db-op-sel">
                          <el-option v-for="op in filterOperators" :key="op" :label="op" :value="op" />
                        </el-select>
                        <el-input
                          v-if="needsFilterValue(row.operator)"
                          v-model="row.value"
                          placeholder="值"
                          clearable
                          class="console-db-val-inp"
                        />
                        <span v-else class="console-db-no-val">—</span>
                        <el-button link type="danger" @click="removeFilterRow(idx)">移除</el-button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="console-db-cta">
                  <el-button type="primary" size="large" :loading="dbExplorer.queryLoading" @click="runDbExplorerQuery">
                    查询
                  </el-button>
                  <el-button @click="clearDbExplorerResult">清空结果</el-button>
                </div>
              </div>

              <el-alert v-if="dbExplorer.resultMessage" type="info" :closable="false" show-icon class="console-db-alert">
                {{ dbExplorer.resultMessage }}
              </el-alert>

              <el-card shadow="never" class="console-db-result-card">
                <template #header><span class="console-card-title">查询结果</span></template>
                <el-table
                  v-loading="dbExplorer.queryLoading"
                  :data="dbExplorerTableRows"
                  stripe
                  border
                  class="console-db-table"
                  max-height="480"
                  empty-text="暂无数据"
                >
                  <el-table-column
                    v-for="col in dbExplorer.resultColumns"
                    :key="col"
                    :label="col"
                    min-width="120"
                  >
                    <template #default="{ row }">
                      <template v-if="isExpandableDbCellValue(row[col])">
                        <el-popover placement="top" trigger="click" width="560">
                          <template #reference>
                            <el-button link type="primary" class="console-db-cell-expand-btn">展开</el-button>
                          </template>
                          <pre class="console-db-cell-json">{{ formatDbCellExpanded(row[col]) }}</pre>
                        </el-popover>
                        <span class="console-db-cell-preview">{{ formatDbCellPreview(row[col]) }}</span>
                      </template>
                      <span v-else>{{ formatDbCellPreview(row[col]) }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </div>

            <div v-else-if="consoleSubView === 'hot_reload'" class="console-hotreload-page">
              <input
                ref="hotReloadFileInputRef"
                type="file"
                multiple
                class="console-hotreload-file-input-hidden"
                @change="onHotReloadLocalFileChange"
              />
              <div class="console-hotreload-toolbar">
                <el-button link type="primary" class="console-db-back" @click="closeHotReload">← 返回控制台</el-button>
                <h3 class="console-hotreload-heading">数据文件对比</h3>
                <span v-if="currentSkynetGateway" class="console-db-gateway-pill">{{ currentSkynetGateway.label }}</span>
                <el-tag v-if="hotReloadDiffers" type="warning" size="small" effect="plain">与服务器内容不一致</el-tag>
                <el-button
                  type="primary"
                  size="small"
                  :disabled="!String(hotReload.serverContent || '').trim() && !String(hotReload.localPickedText || '').trim()"
                  @click="openHotReloadDiff"
                >
                  对比高亮
                </el-button> 
              </div>
              <p class="console-hotreload-note">
                左侧列表来自服务器；右侧下方用「浏览」在本地任选文件，仅在本页以 UTF-8 文本读取后对比，不会上传到服务器。
              </p>
              <div class="console-hotreload-main">
                <aside class="console-hotreload-aside">
                  <div class="console-hotreload-aside-title">数据文件</div>
                  <el-scrollbar v-loading="hotReload.serverFilesLoading" class="console-hotreload-scroll">
                    <button
                      v-for="f in hotReload.serverFiles"
                      :key="f.name"
                      type="button"
                      class="console-hotreload-file-item"
                      :class="{ active: hotReload.selectedFile === f.name }"
                      @click="selectHotReloadFile(f.name)"
                    >
                      <span class="console-hotreload-file-name">{{ f.name }}</span>
                      <span v-if="f.size != null" class="console-hotreload-file-size">{{ f.size }} B</span>
                    </button>
                    <el-empty
                      v-if="!hotReload.serverFilesLoading && !hotReload.serverFiles.length"
                      :description="hotReload.serverHint || '暂无文件'"
                      :image-size="48"
                    />
                  </el-scrollbar>
                  <p v-if="hotReload.serverHint && hotReload.serverFiles.length" class="console-hotreload-mini-hint">
                    {{ hotReload.serverHint }}
                  </p>
                </aside>
                <div class="console-hotreload-panels">
                  <div class="console-hotreload-panel console-hotreload-panel-server">
                    <div class="console-hotreload-panel-head">服务器内容</div>
                    <div v-loading="hotReload.serverContentLoading" class="console-hotreload-textarea-wrap">
                      <el-input
                        :model-value="hotReload.serverContent"
                        type="textarea"
                        :rows="22"
                        readonly
                        class="console-hotreload-textarea"
                        placeholder="选择左侧文件后从服务器加载"
                      />
                    </div>
                  </div>
                  <div class="console-hotreload-panel console-hotreload-panel-local">
                    <div class="console-hotreload-panel-head">
                      <span>本地文件（浏览选择）</span>
                      <span class="console-hotreload-panel-tools">
                        <el-button size="small" type="primary" plain @click="triggerHotReloadFilePick">浏览…</el-button>
                        <el-button
                          size="small"
                          type="success"
                          plain
                          :loading="hotReload.uploadLoading"
                          :disabled="!hotReload.localFiles.length || !selectedGatewayId"
                          @click="uploadHotReloadLocalToSkynet"
                        >
                          上传到服务器（{{ hotReload.localFiles.length }}）
                        </el-button>
                        <el-button
                          v-if="hotReload.localFiles.length"
                          size="small"
                          text
                          type="danger"
                          @click="clearHotReloadLocalPick"
                        >
                          清除
                        </el-button>
                      </span>
                    </div>
                    <p v-if="hotReload.localFiles.length" class="console-hotreload-picked-name">
                      已选 {{ hotReloadLocalFilesStats.total }} 个；
                      成功 {{ hotReloadLocalFilesStats.success }} 个，
                      失败 {{ hotReloadLocalFilesStats.failed }} 个
                    </p>
                    <p v-if="hotReload.uploadSummary" class="console-hotreload-mini-hint">{{ hotReload.uploadSummary }}</p>
                    <el-scrollbar v-if="hotReload.localFiles.length" class="console-hotreload-local-list">
                      <button
                        v-for="f in hotReload.localFiles"
                        :key="f.name"
                        type="button"
                        class="console-hotreload-file-item console-hotreload-local-item"
                        :class="{ active: hotReload.localActiveName === f.name }"
                        @click="selectHotReloadLocalFile(f.name)"
                      >
                        <span class="console-hotreload-file-name">{{ f.name }}</span>
                        <span class="console-hotreload-local-item-right">
                          <el-tag
                            size="small"
                            :type="
                              f.status === 'success'
                                ? 'success'
                                : f.status === 'failed'
                                  ? 'danger'
                                  : f.status === 'uploading'
                                    ? 'warning'
                                    : 'info'
                            "
                            effect="plain"
                          >
                            {{
                              f.status === "success"
                                ? "成功"
                                : f.status === "failed"
                                  ? "失败"
                                  : f.status === "uploading"
                                    ? "上传中"
                                    : "待上传"
                            }}
                          </el-tag>
                          <el-button
                            link
                            type="danger"
                            class="console-hotreload-local-remove"
                            @click.stop="removeHotReloadLocalFile(f.name)"
                          >
                            移除
                          </el-button>
                        </span>
                      </button>
                    </el-scrollbar>
                    <div class="console-hotreload-textarea-wrap">
                      <el-input
                        :model-value="hotReload.localPickedText"
                        type="textarea"
                        :rows="20"
                        readonly
                        class="console-hotreload-textarea"
                        placeholder="点击「浏览」选择本地文件，以 UTF-8 读取后与上方对比"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <el-dialog
                v-model="hotReloadDiffVisible"
                title="文本差异（左右对照）"
                width="min(1360px, 97vw)"
                class="hotreload-diff-dialog"
                append-to-body
                destroy-on-close
                @closed="closeHotReloadDiff"
              >
                <div class="hotreload-diff-inner">
                  <p class="hotreload-diff-legend">
                    <span class="hotreload-diff-legend-item">
                      <span class="hotreload-diff-swatch hotreload-diff-swatch--change" />
                      黄底：同一行两侧内容不同
                    </span>
                    <span class="hotreload-diff-legend-item">
                      <span class="hotreload-diff-swatch hotreload-diff-swatch--remove" />
                      红底：仅服务器有
                    </span>
                    <span class="hotreload-diff-legend-item">
                      <span class="hotreload-diff-swatch hotreload-diff-swatch--add" />
                      绿底：仅本地有
                    </span>
                    <span class="hotreload-diff-legend-item muted">灰白：两侧相同</span>
                  </p>
                  <div class="hotreload-diff-scroll-wrap">
                    <el-scrollbar class="hotreload-diff-scrollbar">
                      <div class="hotreload-split-table">
                        <div class="hotreload-split-thead">
                          <div class="hotreload-split-th">服务器</div>
                          <div class="hotreload-split-th">本地文件</div>
                        </div>
                        <div class="hotreload-split-tbody">
                          <div
                            v-for="(row, idx) in hotReloadDiffRows"
                            :key="idx"
                            class="hotreload-split-row"
                            :class="'hotreload-split-row--' + row.type"
                          >
                            <div class="hotreload-split-cell hotreload-split-cell--left">
                              {{ row.left || "\u00a0" }}
                            </div>
                            <div class="hotreload-split-cell hotreload-split-cell--right">
                              {{ row.right || "\u00a0" }}
                            </div>
                          </div>
                        </div>
                      </div>
                    </el-scrollbar>
                  </div>
                </div>
              </el-dialog>
            </div>
          </section>
          </div>

          <section v-else key="content-detail" class="ticket-detail-page">
            <div class="ticket-detail-head">
              <h3 class="ticket-detail-title">
                <span class="ticket-title-id">#{{ ticketDetail.ticket.id || "-" }}</span>
                <span
                  class="ticket-type-art"
                  :class="ticketDetail.ticket.ticket_type === 'BUG单' ? 'bug' : 'demand'"
                >
                  {{ ticketDetail.ticket.ticket_type || "需求单" }}
                </span>
                <span class="ticket-title-text">{{ ticketDetail.ticket.title }}</span>
              </h3>
              <div class="ticket-detail-actions">
                <el-button size="small" plain @click="closeTicketDetail">返回列表</el-button>
                <el-button v-if="ticketDetail.ticket.ticket_type !== 'BUG单'" size="small" plain @click="createSubTaskFromDetail">
                  新建子任务
                </el-button>
                <el-button v-if="ticketDetail.ticket.ticket_type !== 'BUG单'" size="small" plain type="warning" @click="createBugFromDetail">
                  新建关联BUG
                </el-button>
                <el-button size="small" type="primary" plain @click="toggleTicketFollow">
                  {{ ticketDetail.ticket.is_following ? "取消关注" : "关注工单" }}
                </el-button>
                <el-button
                  v-if="(ticketDetail.ticket.available_actions || []).includes('submit')"
                  size="small"
                  type="success"
                  @click="onTicketFlowAction('submit')"
                >
                  提交
                </el-button>
                <el-button
                  v-if="(ticketDetail.ticket.available_actions || []).includes('approve')"
                  size="small"
                  type="success"
                  @click="onTicketFlowAction('approve')"
                >
                  通过
                </el-button>
                <el-button
                  v-if="(ticketDetail.ticket.available_actions || []).includes('reject')"
                  size="small"
                  type="danger"
                  plain
                  @click="onTicketFlowAction('reject')"
                >
                  驳回
                </el-button>
                <el-button size="small" @click="ticketDetail.editing = !ticketDetail.editing">
                  {{ ticketDetail.editing ? "取消编辑" : "编辑工单" }}
                </el-button>
                <el-button v-if="ticketDetail.editing" size="small" type="primary" @click="saveTicketDetailEdit">提交保存</el-button>
              </div>
            </div>
            <div class="ticket-detail-layout">
              <div class="ticket-detail-main">
                <div class="detail-stream-section ticket-description-block">
                  <div class="ticket-description-head">
                    <div class="ticket-description-title">工单描述</div>
                    <div class="ticket-description-actions">
                      <template v-if="ticketDetail.descriptionEditing">
                        <el-button
                          size="small"
                          text
                          :disabled="!descriptionToolbarState.undoEnabled"
                          @click="applyDescriptionCommand('undo')"
                        >
                          撤销
                        </el-button>
                        <el-button
                          size="small"
                          text
                          :disabled="!descriptionToolbarState.redoEnabled"
                          @click="applyDescriptionCommand('redo')"
                        >
                          重做
                        </el-button>
                        <el-button
                          size="small"
                          text
                          :type="descriptionToolbarState.bold ? 'primary' : undefined"
                          @click="applyDescriptionCommand('bold', null, { requireSelection: true })"
                        >
                          加粗
                        </el-button>
                        <el-button
                          size="small"
                          text
                          :type="descriptionToolbarState.strike ? 'primary' : undefined"
                          @click="applyDescriptionCommand('strikeThrough', null, { requireSelection: true })"
                        >
                          划线
                        </el-button>
                        <el-button
                          size="small"
                          text
                          :type="descriptionToolbarState.blockquote ? 'primary' : undefined"
                          @click="toggleDescriptionBlockquote"
                        >
                          引用块
                        </el-button>
                        <el-button
                          size="small"
                          text
                          :type="descriptionToolbarState.orderedList ? 'primary' : undefined"
                          @click="applyDescriptionCommand('insertOrderedList')"
                        >
                          有序列表
                        </el-button>
                        <el-button
                          size="small"
                          text
                          :type="descriptionToolbarState.unorderedList ? 'primary' : undefined"
                          @click="applyDescriptionCommand('insertUnorderedList')"
                        >
                          无序列表
                        </el-button>
                        <el-select
                          :model-value="descriptionToolbarState.fontSize"
                          size="small"
                          class="description-font-size-select"
                          @change="onDescriptionFontSizeChange"
                        >
                          <el-option
                            v-for="item in DESCRIPTION_FONT_SIZES"
                            :key="item"
                            :label="`${item}px`"
                            :value="item"
                          />
                        </el-select>
                        <div class="description-color-group">
                          <button
                            v-for="item in DESCRIPTION_COLORS"
                            :key="item.value"
                            type="button"
                            class="description-color-dot"
                            :class="{ active: descriptionToolbarState.color === item.value.toLowerCase() }"
                            :style="{ backgroundColor: item.value }"
                            :title="item.label"
                            @click="onDescriptionColorChange(item.value)"
                          ></button>
                        </div>
                        <el-button
                          size="small"
                          text
                          :type="descriptionToolbarState.link ? 'primary' : undefined"
                          @click="insertDescriptionLink"
                        >
                          超链接
                        </el-button>
                        <el-button size="small" text @click="clearDescriptionFormatting">清除格式</el-button>
                        <el-button size="small" @click="cancelDescriptionEdit">取消</el-button>
                        <el-button size="small" type="primary" @click="submitDescriptionEdit">保存描述</el-button>
                      </template>
                      <el-button v-else size="small" text type="primary" @click="startDescriptionEdit">编辑描述</el-button>
                    </div>
                  </div>
                  <div
                    v-if="ticketDetail.descriptionEditing"
                    ref="descriptionEditorRef"
                    class="ticket-description-editor"
                    contenteditable="true"
                    @input="onDescriptionEditorInput"
                    @mouseup="syncDescriptionToolbarState"
                    @keyup="syncDescriptionToolbarState"
                  ></div>
                  <div
                    v-else
                    class="ticket-description-content rich-text-content"
                    v-html="renderDescriptionHtml(ticketDetail.ticket.description)"
                  ></div>
                </div>

                <div
                  v-if="
                    ticketDetail.ticket.ticket_type !== 'BUG单' &&
                    ((ticketDetail.childTaskTickets || []).length || (ticketDetail.relatedBugTickets || []).length)
                  "
                  class="detail-stream-section ticket-related-board"
                >
                  <div v-if="(ticketDetail.childTaskTickets || []).length" class="ticket-related-section">
                    <div class="ticket-related-head">
                      <h4>子任务单</h4>
                      <span class="ticket-related-progress">
                        已完成 {{ ticketDetail.childTaskProgress.done || 0 }}/{{ ticketDetail.childTaskProgress.total || 0 }}
                      </span>
                    </div>
                    <div class="ticket-related-list">
                      <div v-for="item in ticketDetail.childTaskTickets" :key="`child-${item.id}`" class="ticket-related-item">
                        <el-button link type="primary" class="ticket-related-link" @click="openTicketDetail({ id: item.id })">
                          #{{ item.id }} {{ item.title }}
                        </el-button>
                        <div class="related-status-wrap">
                          <el-tag size="small" effect="plain" :type="item.status === '已完成' ? 'success' : 'info'">{{ item.status }}</el-tag>
                          <el-tag v-if="isTicketOverdue(item)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                            已逾期
                          </el-tag>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="(ticketDetail.relatedBugTickets || []).length" class="ticket-related-section">
                    <div class="ticket-related-head">
                      <h4>关联BUG单</h4>
                      <span class="ticket-related-progress">
                        已完成 {{ ticketDetail.relatedBugProgress.done || 0 }}/{{ ticketDetail.relatedBugProgress.total || 0 }}
                      </span>
                    </div>
                    <div class="ticket-related-list">
                      <div v-for="item in ticketDetail.relatedBugTickets" :key="`bug-${item.id}`" class="ticket-related-item">
                        <el-button link type="primary" class="ticket-related-link" @click="openTicketDetail({ id: item.id })">
                          #{{ item.id }} {{ item.title }}
                        </el-button>
                        <div class="related-status-wrap">
                          <el-tag size="small" effect="plain" :type="item.status === '已完成' ? 'success' : 'danger'">{{ item.status }}</el-tag>
                          <el-tag v-if="isTicketOverdue(item)" size="small" type="danger" effect="plain" class="status-overdue-tag">
                            已逾期
                          </el-tag>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <el-form
                  v-if="ticketDetail.editing"
                  :model="ticketDetail.editForm"
                  label-width="90px"
                  class="detail-stream-section ticket-detail-edit-form"
                >
                  <el-form-item label="标题"><el-input v-model="ticketDetail.editForm.title" /></el-form-item>
                  <el-form-item label="描述"><el-input v-model="ticketDetail.editForm.description" type="textarea" /></el-form-item>
                  <el-form-item label="模块"><el-input v-model="ticketDetail.editForm.module" /></el-form-item>
                  <el-form-item label="类型">
                    <el-select
                      v-model="ticketDetail.editForm.ticket_type"
                      class="w140"
                      @change="(val) => { if (val === 'BUG单') ticketDetail.editForm.sub_type = 'BUG修复'; }"
                    >
                      <el-option v-for="item in meta.ticket_types" :key="item" :label="item" :value="item" />
                    </el-select>
                    <el-select v-model="ticketDetail.editForm.sub_type" class="w140 ml8">
                      <el-option
                        v-for="item in ticketDetail.editForm.ticket_type === 'BUG单' ? meta.bug_sub_types : meta.demand_sub_types"
                        :key="`edit-sub-${item}`"
                        :label="item"
                        :value="item"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="ticketDetail.editForm.ticket_type === '需求单' && ticketDetail.editForm.sub_type === '测试需求' ? '测试负责人' : '流程负责人'">
                    <el-select
                      v-if="!(ticketDetail.editForm.ticket_type === '需求单' && ticketDetail.editForm.sub_type === '测试需求')"
                      v-model="ticketDetail.editForm.executor_id"
                      clearable
                      filterable
                      class="w140"
                      placeholder="执行负责人"
                    >
                      <el-option
                        v-for="item in getExecutorCandidates(ticketDetail.editForm.ticket_type, ticketDetail.editForm.sub_type)"
                        :key="`edit-executor-${item.id}`"
                        :label="item.display_name || item.username"
                        :value="item.id"
                      />
                    </el-select>
                    <el-select
                      v-if="
                        ticketDetail.editForm.ticket_type === '需求单' &&
                        ticketDetail.editForm.sub_type !== '测试需求' &&
                        ticketDetail.editForm.sub_type !== '策划需求'
                      "
                      v-model="ticketDetail.editForm.planner_id"
                      clearable
                      filterable
                      class="w140 ml8"
                      placeholder="策划负责人"
                    >
                      <el-option
                        v-for="item in users.filter((x) => x.position === '策划')"
                        :key="`edit-planner-${item.id}`"
                        :label="item.display_name || item.username"
                        :value="item.id"
                      />
                    </el-select>
                    <el-select
                      v-model="ticketDetail.editForm.tester_id"
                      clearable
                      filterable
                      :class="[
                        'w140',
                        !(ticketDetail.editForm.ticket_type === '需求单' && ticketDetail.editForm.sub_type === '测试需求')
                          ? 'ml8'
                          : '',
                      ]"
                      placeholder="测试负责人"
                    >
                      <el-option
                        v-for="item in users.filter((x) => x.position === '测试')"
                        :key="`edit-tester-${item.id}`"
                        :label="item.display_name || item.username"
                        :value="item.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item v-if="ticketDetail.editForm.ticket_type !== 'BUG单'" label="父任务">
                    <el-select v-model="ticketDetail.editForm.parent_task_id" clearable filterable placeholder="可选父任务" style="width: 100%">
                      <el-option
                        v-for="item in taskTicketOptions.filter((x) => x.id !== ticketDetail.editForm.id)"
                        :key="`edit-parent-${item.id}`"
                        :label="`#${item.id} ${item.title}`"
                        :value="item.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item v-if="ticketDetail.editForm.ticket_type === 'BUG单'" label="关联任务单">
                    <el-select v-model="ticketDetail.editForm.related_task_id" clearable filterable placeholder="关联到任务单" style="width: 100%">
                      <el-option
                        v-for="item in taskTicketOptions.filter((x) => x.id !== ticketDetail.editForm.id)"
                        :key="`edit-related-${item.id}`"
                        :label="`#${item.id} ${item.title}`"
                        :value="item.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="项目">
                    <el-select v-model="ticketDetail.editForm.project_id" class="w140" @change="onDetailProjectChange">
                      <el-option v-for="item in projects" :key="item.id" :label="item.name" :value="item.id" />
                    </el-select>
                    <el-select v-model="ticketDetail.editForm.version_id" class="w140 ml8" placeholder="版本">
                      <el-option v-for="item in versions" :key="item.id" :label="item.name" :value="item.id" />
                    </el-select>
                    <el-select v-model="ticketDetail.editForm.priority" class="w140 ml8">
                      <el-option v-for="item in meta.priorities" :key="item" :label="item" :value="item" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="时间">
                    <el-date-picker
                      v-model="ticketDetail.editForm.start_time"
                      value-format="YYYY-MM-DDTHH:mm:ss"
                      type="datetime"
                      placeholder="开始时间"
                    />
                    <el-date-picker
                      v-model="ticketDetail.editForm.end_time"
                      value-format="YYYY-MM-DDTHH:mm:ss"
                      type="datetime"
                      placeholder="结束时间"
                      class="ml8"
                    />
                  </el-form-item>
                </el-form>

                <div class="detail-stream-section ticket-attachments">
                  <div class="ticket-attachments-head">
                    <div class="ticket-attachments-title-wrap">
                      <div class="ticket-attachments-title">附件</div>
                      <div class="attachment-tip">支持图片和视频，可多选，单文件不超过 20MB</div>
                    </div>
                    <label class="upload-btn ticket-upload-btn">
                      <span class="upload-btn-main">上传附件</span>
                      <span class="upload-btn-sub">图片 / 视频</span>
                      <input type="file" multiple accept="image/*,video/*" class="hidden-file-input" @change="onDetailAttachmentChange" />
                    </label>
                  </div>
                  <div v-if="ticketAttachmentError" class="attachment-error-tip">{{ ticketAttachmentError }}</div>
                  <div v-if="ticketDetailAttachments.length > 0" class="attachment-grid">
                    <div v-for="(item, idx) in ticketDetailAttachments" :key="`${item.url}-${idx}`" class="attachment-card">
                      <img
                        v-if="isImageAttachment(item)"
                        :src="item.url"
                        :alt="item.name || 'image'"
                        class="attachment-image previewable"
                        @click="openImagePreview(item)"
                      />
                      <video v-else-if="isVideoAttachment(item)" :src="item.url" controls class="attachment-video" />
                      <a v-else :href="item.url" target="_blank" rel="noreferrer">{{ item.name || `附件${idx + 1}` }}</a>
                      <div class="attachment-caption">{{ item.name || `附件${idx + 1}` }}</div>
                      <el-button link type="danger" class="attachment-remove" @click="removeDetailAttachment(idx)">
                        删除
                      </el-button>
                    </div>
                  </div>
                  <div v-else class="attachment-empty-inline">暂无附件，上传后会显示在这里</div>
                </div>

                <div class="detail-stream-section ticket-activity-wrap">
                  <div class="ticket-activity-head">
                    <el-segmented
                      v-model="ticketDetail.activityTab"
                      :options="[
                        { label: `评论 (${ticketDetail.comments.length})`, value: 'comments' },
                        { label: `修改历史 (${ticketDetail.histories.length})`, value: 'history' },
                      ]"
                    />
                  </div>

                  <div v-show="ticketDetail.activityTab === 'comments'" class="ticket-comments-panel">
                    <div class="ticket-comments-list">
                      <el-timeline>
                        <el-timeline-item v-for="c in ticketDetail.comments" :key="c.id">
                          <div class="comment-item" :class="{ active: isReplyEditorOpen(c.id) }">
                            <div class="comment-line">
                              <strong>{{ c.user?.display_name }}：</strong>
                              <span class="comment-text-html" v-html="commentContentWithMentionsHtml(c.content, c.mentions, users)" />
                            </div>
                            <div v-if="mentionDisplayNames(c.mentions, users).length" class="comment-mention-row">
                              <el-tag
                                v-for="name in mentionDisplayNames(c.mentions, users)"
                                :key="`${c.id}-${name}`"
                                size="small"
                                effect="plain"
                                class="comment-mention-tag"
                              >
                                @{{ name }}
                              </el-tag>
                            </div>
                            <div class="comment-actions-row">
                              <span class="comment-time">{{ formatDynamicTime(c.created_at) }}</span>
                              <button type="button" class="comment-reply-trigger" @click="toggleReplyEditor(c.id)">
                                {{ isReplyEditorOpen(c.id) ? "收起回复" : "回复" }}
                              </button>
                            </div>
                            <div v-if="getCommentReplies(c.id).length" class="comment-reply-list">
                              <div v-for="r in getCommentReplies(c.id)" :key="r.id" class="comment-reply-item">
                                <strong>{{ r.user?.display_name || r.user?.username }}：</strong>
                                <span class="comment-text-html" v-html="commentContentWithMentionsHtml(r.content, r.mentions, users)" />
                              </div>
                            </div>
                            <div v-if="isReplyEditorOpen(c.id)" class="comment-reply-editor">
                              <el-input v-model="ticketDetail.replyDrafts[c.id]" size="small" placeholder="回复这条评论..." />
                              <el-select
                                v-model="ticketDetail.replyMentionIds[c.id]"
                                multiple
                                clearable
                                collapse-tags
                                collapse-tags-tooltip
                                placeholder="@成员"
                                size="small"
                                class="comment-reply-mention"
                                @change="(ids) => onReplyMentionIdsChange(c.id, ids)"
                              >
                                <el-option
                                  v-for="item in users"
                                  :key="item.id"
                                  :label="item.display_name || item.username"
                                  :value="item.id"
                                />
                              </el-select>
                              <el-button size="small" type="primary" plain @click="addCommentReply(c.id)">回复</el-button>
                              <el-button size="small" text @click="toggleReplyEditor(c.id)">取消</el-button>
                            </div>
                          </div>
                        </el-timeline-item>
                      </el-timeline>
                    </div>

                    <div class="ticket-comment-composer">
                      <el-input
                        v-model="ticketDetail.newComment"
                        type="textarea"
                        :class="['comment-composer-input', { compact: !ticketDetail.commentComposerExpanded }]"
                        :autosize="ticketDetail.commentComposerExpanded ? { minRows: 4, maxRows: 8 } : { minRows: 1, maxRows: 1 }"
                        :placeholder="
                          ticketDetail.commentComposerExpanded
                            ? '输入评论；正文中使用 @姓名 可高亮；下方选择成员将收到站内通知'
                            : '写评论...'
                        "
                        @focus="expandCommentComposer"
                        @blur="maybeCollapseCommentComposer"
                      />
                      <el-select
                        v-show="ticketDetail.commentComposerExpanded"
                        v-model="ticketDetail.commentMentionIds"
                        multiple
                        filterable
                        clearable
                        collapse-tags
                        collapse-tags-tooltip
                        placeholder="选择要@的成员（将收到站内通知）"
                        class="mt8 comment-mention-select"
                        @change="onCommentMentionIdsChange"
                      >
                        <el-option
                          v-for="item in users"
                          :key="item.id"
                          :label="item.display_name || item.username"
                          :value="item.id"
                        />
                      </el-select>
                      <el-button
                        v-show="ticketDetail.commentComposerExpanded"
                        class="mt8"
                        type="primary"
                        @click="addComment"
                      >
                        提交评论
                      </el-button>
                    </div>
                  </div>

                  <div v-show="ticketDetail.activityTab === 'history'" class="ticket-history-panel">
                    <el-timeline>
                      <el-timeline-item v-for="h in ticketDetail.histories" :key="h.id" :timestamp="formatDynamicTime(h.created_at)">
                        {{ h.summary }}（{{ h.editor?.display_name }}）
                      </el-timeline-item>
                    </el-timeline>
                  </div>
                </div>
              </div>

              <aside class="ticket-detail-side">
                <div class="detail-side-block">
                  <div class="ticket-quick-edit">
                    <div class="ticket-quick-row">
                      <span class="ticket-quick-label">状态</span>
                      <div class="ticket-quick-status-wrap">
                        <span class="ticket-status-text">{{ ticketDetail.ticket.status || "-" }}</span>
                        <el-tag
                          v-if="isTicketOverdue(ticketDetail.ticket)"
                          size="small"
                          type="danger"
                          effect="plain"
                          class="status-overdue-tag status-overdue-tag-inline"
                        >
                          已逾期
                        </el-tag>
                      </div>
                    </div>
                    <div class="ticket-quick-row">
                      <span class="ticket-quick-label">优先级</span>
                      <el-select
                        v-model="ticketDetail.quickForm.priority"
                        size="small"
                        :class="['ticket-quick-item', getPriorityToneClass(ticketDetail.quickForm.priority)]"
                        popper-class="quick-select-popper"
                        @change="saveTicketQuickEdit"
                      >
                        <el-option v-for="item in meta.priorities" :key="`quick-priority-${item}`" :label="item" :value="item" />
                      </el-select>
                    </div>
                  </div>
                </div>

                <div class="detail-side-block">
                  <el-descriptions border :column="1" size="small" class="ticket-detail-descriptions">
                    <el-descriptions-item label="工单ID">#{{ ticketDetail.ticket.id || "-" }}</el-descriptions-item>
                    <el-descriptions-item label="所属模块">{{ ticketDetail.ticket.module || "-" }}</el-descriptions-item>
                    <el-descriptions-item label="版本">{{ ticketDetail.ticket.version_name || "-" }}</el-descriptions-item>
                    <el-descriptions-item label="创建人">{{ detailCreatorName }}</el-descriptions-item>
                    <el-descriptions-item label="父任务">
                      <el-button
                        v-if="ticketDetail.ticket.parent_task_id"
                        link
                        type="primary"
                        class="ticket-link-btn"
                        @click="openTicketDetail({ id: ticketDetail.ticket.parent_task_id })"
                      >
                        #{{ ticketDetail.ticket.parent_task_id }} {{ ticketDetail.ticket.parent_task_title }}
                      </el-button>
                      <span v-else>-</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="关联任务单">
                      <el-button
                        v-if="ticketDetail.ticket.related_task_id"
                        link
                        type="primary"
                        class="ticket-link-btn"
                        @click="openTicketDetail({ id: ticketDetail.ticket.related_task_id })"
                      >
                        #{{ ticketDetail.ticket.related_task_id }} {{ ticketDetail.ticket.related_task_title }}
                      </el-button>
                      <span v-else>-</span>
                    </el-descriptions-item>
                    <el-descriptions-item label="开始时间">{{ formatDynamicTime(ticketDetail.ticket.start_time) || "-" }}</el-descriptions-item>
                    <el-descriptions-item label="完成时间">{{ formatDynamicTime(ticketDetail.ticket.end_time) || "-" }}</el-descriptions-item>
                    <el-descriptions-item label="创建时间">{{ formatDynamicTime(ticketDetail.ticket.created_at) || "-" }}</el-descriptions-item>
                    <el-descriptions-item label="更新时间">{{ formatDynamicTime(ticketDetail.ticket.updated_at) || "-" }}</el-descriptions-item>
                  </el-descriptions>
                </div>

                <div class="detail-side-block ticket-assignee-board">
                  <div class="ticket-assignee-title">流程负责人</div>
                  <div class="ticket-flow-role-list">
                    <div class="ticket-flow-role-item">
                      <span class="ticket-assignee-position">执行</span>
                      <span class="ticket-assignee-members">{{ ticketDetail.ticket.executor_name || "-" }}</span>
                    </div>
                    <div class="ticket-flow-role-item">
                      <span class="ticket-assignee-position">策划</span>
                      <span class="ticket-assignee-members">{{ ticketDetail.ticket.planner_name || "-" }}</span>
                    </div>
                    <div class="ticket-flow-role-item">
                      <span class="ticket-assignee-position">测试</span>
                      <span class="ticket-assignee-members">{{ ticketDetail.ticket.tester_name || "-" }}</span>
                    </div>
                    <div class="ticket-flow-role-item">
                      <span class="ticket-assignee-position">当前处理人</span>
                      <span class="ticket-assignee-members">{{ ticketDetail.ticket.current_owner_name || "-" }}</span>
                    </div>
                  </div>
                  <div class="ticket-watcher-line">
                    <span class="ticket-watcher-title">关注人：</span>
                    <span class="ticket-watcher-members">
                      {{ (ticketDetail.ticket.watchers || []).map((x) => x.display_name || x.username).join("、") || "暂无关注" }}
                    </span>
                  </div>
                </div>
              </aside>
            </div>
          </section>
          </transition>
        </div>
      </div>
    </div>

    <el-dialog v-model="userDialog.visible" :title="userDialog.form.id ? '编辑用户' : '新增用户'" width="520px">
      <el-form :model="userDialog.form" label-width="100px">
        <el-form-item label="账号">
          <el-input v-model="userDialog.form.username" :disabled="!!userDialog.form.id" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="userDialog.form.display_name" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="userDialog.form.password" placeholder="编辑时可留空" />
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="userDialog.form.position">
            <el-option v-for="item in meta.positions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="管理员">
          <el-switch v-model="userDialog.form.is_admin" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="projectDialog.visible" :title="projectDialog.form.id ? '编辑项目' : '新增项目'" width="520px">
      <el-form :model="projectDialog.form" label-width="100px">
        <el-form-item label="项目名">
          <el-input v-model="projectDialog.form.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="projectDialog.form.description" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveProject">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ticketDialog.visible" :title="ticketDialog.form.id ? '编辑工单' : '新建工单'" width="760px">
      <el-form :model="ticketDialog.form" label-width="100px">
        <el-form-item label="标题"><el-input v-model="ticketDialog.form.title" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="ticketDialog.form.description" type="textarea" /></el-form-item>
        <el-form-item label="模块"><el-input v-model="ticketDialog.form.module" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="ticketDialog.form.ticket_type" class="w140" @change="onTicketDialogTypeChange">
            <el-option v-for="item in meta.ticket_types" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="ticketDialog.form.sub_type" class="w140 ml8" @change="onTicketDialogSubTypeChange">
            <el-option
              v-for="item in ticketDialog.form.ticket_type === 'BUG单' ? meta.bug_sub_types : meta.demand_sub_types"
              :key="`create-sub-${item}`"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="ticketDialog.form.ticket_type === '需求单' && ticketDialog.form.sub_type === '测试需求' ? '测试负责人' : '流程负责人'">
          <el-select
            v-if="!(ticketDialog.form.ticket_type === '需求单' && ticketDialog.form.sub_type === '测试需求')"
            v-model="ticketDialog.form.executor_id"
            clearable
            filterable
            class="w140"
            placeholder="执行负责人"
          >
            <el-option
              v-for="item in getExecutorCandidates(ticketDialog.form.ticket_type, ticketDialog.form.sub_type)"
              :key="`create-executor-${item.id}`"
              :label="item.display_name || item.username"
              :value="item.id"
            />
          </el-select>
          <el-select
            v-if="
              ticketDialog.form.ticket_type === '需求单' &&
              ticketDialog.form.sub_type !== '测试需求' &&
              ticketDialog.form.sub_type !== '策划需求'
            "
            v-model="ticketDialog.form.planner_id"
            clearable
            filterable
            class="w140 ml8"
            placeholder="策划负责人"
          >
            <el-option
              v-for="item in users.filter((x) => x.position === '策划')"
              :key="`create-planner-${item.id}`"
              :label="item.display_name || item.username"
              :value="item.id"
            />
          </el-select>
          <el-select
            v-model="ticketDialog.form.tester_id"
            clearable
            filterable
            :class="[
              'w140',
              !(ticketDialog.form.ticket_type === '需求单' && ticketDialog.form.sub_type === '测试需求') ? 'ml8' : '',
            ]"
            placeholder="测试负责人"
          >
            <el-option
              v-for="item in users.filter((x) => x.position === '测试')"
              :key="`create-tester-${item.id}`"
              :label="item.display_name || item.username"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="ticketDialog.form.ticket_type !== 'BUG单'" label="父任务">
          <el-select v-model="ticketDialog.form.parent_task_id" clearable filterable placeholder="可选父任务" style="width: 100%">
            <el-option
              v-for="item in taskTicketOptions.filter((x) => x.id !== ticketDialog.form.id)"
              :key="`parent-${item.id}`"
              :label="`#${item.id} ${item.title}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="ticketDialog.form.ticket_type === 'BUG单'" label="关联任务单">
          <el-select v-model="ticketDialog.form.related_task_id" clearable filterable placeholder="关联到任务单" style="width: 100%">
            <el-option
              v-for="item in taskTicketOptions.filter((x) => x.id !== ticketDialog.form.id)"
              :key="`related-${item.id}`"
              :label="`#${item.id} ${item.title}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="项目">
          <el-select v-model="ticketDialog.form.project_id" class="w140" @change="onTicketProjectChange">
            <el-option v-for="item in projects" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <el-select v-model="ticketDialog.form.version_id" class="w140 ml8" placeholder="版本">
            <el-option v-for="item in versions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <el-select v-model="ticketDialog.form.priority" class="w140 ml8">
            <el-option v-for="item in meta.priorities" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="ticketDialog.form.start_time"
            value-format="YYYY-MM-DDTHH:mm:ss"
            type="datetime"
            placeholder="开始时间"
          />
          <el-date-picker
            v-model="ticketDialog.form.end_time"
            value-format="YYYY-MM-DDTHH:mm:ss"
            type="datetime"
            placeholder="结束时间"
            class="ml8"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ticketDialog.visible = false">取消</el-button>
        <el-button v-if="ticketDialog.form.id" type="primary" @click="saveTicket(true)">保存</el-button>
        <template v-else>
          <el-button type="primary" plain @click="saveTicket(false)">保存</el-button>
          <el-button type="primary" @click="saveTicket(true)">保存并关闭</el-button>
        </template>
      </template>
    </el-dialog>

    <el-dialog v-model="wikiDialog.visible" :title="wikiDialog.form.id ? '编辑文章' : '新建文章'" width="900px" top="5vh">
      <el-form :model="wikiDialog.form" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="wikiDialog.form.title" />
        </el-form-item>
        <el-form-item label="专栏">
          <el-select
            v-model="wikiDialog.form.category_name"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="可选已有专栏，也可直接输入新专栏"
            class="wiki-category-input"
          >
            <el-option v-for="item in wikiCategories" :key="item.id" :label="item.name" :value="item.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <div class="wiki-editor-wrap">
            <div class="wiki-editor-toolbar">
              <label class="upload-btn">
                插入图片
                <input
                  type="file"
                  accept="image/*"
                  class="hidden-file-input"
                  @change="(event) => insertWikiMedia(event, 'image')"
                />
              </label>
              <label class="upload-btn">
                插入视频
                <input
                  type="file"
                  accept="video/*"
                  class="hidden-file-input"
                  @change="(event) => insertWikiMedia(event, 'video')"
                />
              </label>
            </div>
            <div ref="wikiEditorRef" class="wiki-editor-content" contenteditable="true" @input="onWikiEditorInput"></div>
          </div>
        </el-form-item>
        <el-form-item label="附件">
          <label class="upload-btn">
            添加附件
            <input
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              class="hidden-file-input"
              @change="onWikiAttachmentChange"
            />
          </label>
          <span class="attachment-tip">可上传图片、视频及常见文档，单文件不超过 20MB</span>
          <div v-if="wikiAttachmentError" class="attachment-error-tip">{{ wikiAttachmentError }}</div>
          <div v-if="(wikiDialog.form.attachments || []).length > 0" class="wiki-attachment-list">
            <div v-for="(item, idx) in wikiDialog.form.attachments" :key="`${item.url}-${idx}`" class="wiki-attachment-item">
              <a :href="item.url" target="_blank" rel="noreferrer">{{ item.name || `附件${idx + 1}` }}</a>
              <el-button link type="danger" @click="removeWikiAttachment(idx)">删除</el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="wikiDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveWikiArticle">提交</el-button>
      </template>
    </el-dialog>


    <el-drawer v-model="wikiDetail.visible" title="Wiki 详情" size="60%">
      <h2 class="wiki-detail-title">{{ wikiDetail.article.title }}</h2>
      <div class="wiki-detail-meta">
        <el-tag effect="plain">{{ wikiDetail.article.category_name || "未分类" }}</el-tag>
        <span>创建人：{{ wikiDetail.article.creator_name || "-" }}</span>
        <span>更新人：{{ wikiDetail.article.updater_name || "-" }}</span>
        <span>更新时间：{{ formatDynamicTime(wikiDetail.article.updated_at) || "-" }}</span>
      </div>
      <el-divider />
      <div class="wiki-detail-content" v-html="wikiDetail.article.content || ''"></div>
      <el-divider />
      <div class="ticket-attachments-title">附件</div>
      <div v-if="(wikiDetail.article.attachments || []).length > 0" class="wiki-attachment-list">
        <div v-for="(item, idx) in wikiDetail.article.attachments" :key="`${item.url}-${idx}`" class="wiki-attachment-item">
          <a :href="item.url" target="_blank" rel="noreferrer">{{ item.name || `附件${idx + 1}` }}</a>
        </div>
      </div>
      <el-empty v-else description="暂无附件" :image-size="56" />
    </el-drawer>

    <el-dialog v-model="imagePreview.visible" :title="imagePreview.name || '图片预览'" width="72%" top="5vh" destroy-on-close>
      <div class="image-preview-wrap">
        <img :src="imagePreview.url" :alt="imagePreview.name || 'preview'" class="image-preview-large" />
      </div>
    </el-dialog>

    <el-drawer v-model="notificationDrawerVisible" size="400px" destroy-on-close>
      <template #header>
        <div class="notification-drawer-head">
          <span>通知中心</span>
          <el-button
            v-if="notificationFeed.items.length"
            size="small"
            text
            type="primary"
            @click="markAllNotificationsRead"
          >
            全部已读
          </el-button>
        </div>
      </template>
      <div v-if="notificationFeed.items.length" class="notification-feed-list">
        <div
          v-for="n in notificationFeed.items"
          :key="n.id"
          class="notification-feed-item"
          :class="{ unread: !n.read }"
          @click="onNotificationItemClick(n)"
        >
          <div class="notification-feed-title">{{ n.title }}</div>
          <div v-if="n.body" class="notification-feed-body">{{ n.body }}</div>
          <div class="notification-feed-time">{{ formatDynamicTime(n.created_at) }}</div>
        </div>
      </div>
      <el-empty v-else description="暂无通知" :image-size="72" />
      <div v-if="notificationFeed.total > notificationFeed.per_page" class="notification-feed-pagination">
        <el-pagination
          background
          small
          layout="prev, pager, next"
          :total="notificationFeed.total"
          :page-size="notificationFeed.per_page"
          :current-page="notificationFeed.page"
          @current-change="onNotificationFeedPageChange"
        />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useTaskflowApp } from "./composables/useTaskflowApp";

const {
  token,
  user,
  activeTab,
  dashboardViewMode,
  currentProjectId,
  currentVersionId,
  globalSearchKeyword,
  searchResultTip,
  loginForm,
  users,
  projects,
  versions,
  tickets,
  dashboard,
  notification,
  notificationDrawerVisible,
  notificationFeed,
  projectHubTicketViewMode,
  projectHubTicketTypeMode,
  projectHubFilteredTickets,
  kanbanColumns,
  openNotificationCenter,
  closeTicketDetail,
  onNotificationItemClick,
  onNotificationFeedPageChange,
  markAllNotificationsRead,
  projectHub,
  versionForm,
  showVersionCreateForm,
  meta,
  userDialog,
  projectDialog,
  ticketDialog,
  ticketDetail,
  selectedTicketIds,
  batchEdit,
  imagePreview,
  wikiCategories,
  wikiArticles,
  wikiFilter,
  wikiPage,
  wikiPageSize,
  wikiEditorRef,
  wikiDialog,
  wikiAttachmentError,
  ticketAttachmentError,
  wikiDetail,
  consoleStatus,
  consoleForms,
  consoleSubView,
  dbExplorer,
  filterOperators,
  selectedGatewayId,
  currentSkynetGateway,
  openDbExplorer,
  closeDbExplorer,
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
  selectHotReloadLocalFile,
  loadHotReloadServerFiles,
  triggerHotReloadFilePick,
  onHotReloadLocalFileChange,
  removeHotReloadLocalFile,
  clearHotReloadLocalPick,
  uploadHotReloadLocalToSkynet,
  hotReloadLocalFilesStats,
  hotReloadDiffVisible,
  hotReloadDiffRows,
  openHotReloadDiff,
  closeHotReloadDiff,
  sendSkynetCommand,
  dbExplorerTableRows,
  isExpandableDbCellValue,
  formatDbCellPreview,
  formatDbCellExpanded,
  analytics,
  workloadRows,
  densityCalendarWeeks,
  densityMaxOverlap,
  userInitial,
  ticketDetailAttachments,
  detailCreatorName,
  detailAssigneeGroups,
  taskTicketOptions,
  dashboardTaskPage,
  dashboardTaskPageSize,
  dashboardBugPage,
  dashboardBugPageSize,
  dashboardTasks,
  dashboardBugs,
  pagedDashboardTasks,
  pagedDashboardBugs,
  ticketPage,
  ticketPageSize,
  projectDynamicsPage,
  projectDynamicsPageSize,
  pagedTickets,
  pagedProjectDynamics,
  pagedWikiArticles,
  formatDynamicTime,
  formatDeadlineSlot,
  isImageAttachment,
  isVideoAttachment,
  openImagePreview,
  doLogin,
  handleUserMenuCommand,
  onGlobalProjectChange,
  selectVersionByButton,
  runGlobalSearch,
  runTopbarSearch,
  clearTopbarSearch,
  loadProjectHub,
  loadAnalytics,
  setAnalyticsRangeDays,
  setAnalyticsWorkloadGroup,
  setAnalyticsDensityMember,
  loadWikiCategories,
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
  onTicketProjectChange,
  openTicketDialog,
  createQuickTicket,
  saveTicket,
  removeTicket,
  handleTicketRowClick,
  openTicketDetail,
  saveTicketDetailEdit,
  saveTicketDescription,
  saveTicketQuickEdit,
  runTicketFlowAction,
  onDetailProjectChange,
  onDetailAttachmentChange,
  removeDetailAttachment,
  addComment,
  toggleTicketFollow,
  addCommentReply,
  createSubTaskFromDetail,
  createBugFromDetail,
  onProjectHubSelectionChange,
  submitBatchEdit,
  onCommentMentionIdsChange,
  onReplyMentionIdsChange,
  expandCommentComposer,
  maybeCollapseCommentComposer,
  getCommentReplies,
  isReplyEditorOpen,
  toggleReplyEditor,
  commentContentWithMentionsHtml,
  mentionDisplayNames,
} = useTaskflowApp();

const descriptionEditorRef = ref(null);
const dashboardTaskIdSet = computed(() => new Set((dashboardTasks.value || []).map((item) => item.id)));
const hasTaskHierarchyInView = computed(() =>
  (dashboardTasks.value || []).some((item) => {
    const parentId = Number(item?.parent_task_id || 0);
    return parentId > 0 && dashboardTaskIdSet.value.has(parentId);
  }),
);
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
  const raw = String(color || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("#")) {
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
    }
    return raw;
  }
  const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return raw;
  const toHex = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

function renderDescriptionHtml(content) {
  const raw = String(content || "");
  if (!raw.trim()) return '<span class="ticket-description-empty">暂无描述</span>';
  if (hasRichHtml(raw)) return sanitizeDescriptionHtml(raw);
  return escapeDescriptionHtml(raw).replace(/\n/g, "<br/>");
}

function setDescriptionEditorContent(content) {
  const el = descriptionEditorRef.value;
  if (!el) return;
  const raw = String(content || "");
  if (hasRichHtml(raw)) {
    el.innerHTML = sanitizeDescriptionHtml(raw);
  } else {
    el.textContent = raw;
  }
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
  const fonts = Array.from(editor.querySelectorAll("font[size]"));
  for (const fontEl of fonts) {
    const mapped = FONT_SIZE_COMMAND_REVERSE_MAP[fontEl.getAttribute("size")] || 14;
    const span = document.createElement("span");
    span.style.fontSize = `${mapped}px`;
    span.innerHTML = fontEl.innerHTML;
    fontEl.replaceWith(span);
  }
}

function syncDescriptionToolbarState() {
  if (!ticketDetail.descriptionEditing) return;
  const ctx = getDescriptionSelectionContext();
  if (!ctx) return;
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
  ticketDetail.descriptionDraft = String(ticketDetail.ticket.description || "");
  descriptionLastRange.value = null;
  await nextTick();
  setDescriptionEditorContent(ticketDetail.descriptionDraft);
  descriptionEditorRef.value?.focus();
  syncDescriptionToolbarState();
}

function cancelDescriptionEdit() {
  ticketDetail.descriptionEditing = false;
  ticketDetail.descriptionDraft = String(ticketDetail.ticket.description || "");
  descriptionLastRange.value = null;
}

function onDescriptionEditorInput() {
  ticketDetail.descriptionDraft = descriptionEditorRef.value?.innerHTML || "";
}

function applyDescriptionCommand(command, value = null, options = {}) {
  if (!ticketDetail.descriptionEditing) return;
  const { requireSelection = false } = options;
  let ctx = getDescriptionSelectionContext();
  if (!ctx && descriptionLastRange.value && typeof window !== "undefined") {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(descriptionLastRange.value);
    ctx = getDescriptionSelectionContext();
  }
  if (requireSelection && (!ctx || ctx.selection.isCollapsed)) {
    return;
  }
  descriptionEditorRef.value?.focus();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(command, false, value);
  if (command === "bold" || command === "strikeThrough") {
    const current = getDescriptionSelectionContext();
    if (current?.selection?.isCollapsed && document.queryCommandState(command)) {
      document.execCommand(command, false, null);
    }
  }
  if (command === "fontSize") {
    normalizeDescriptionFontTags();
  }
  onDescriptionEditorInput();
  syncDescriptionToolbarState();
}

function onDescriptionColorChange(color) {
  if (!color) return;
  applyDescriptionCommand("foreColor", color, { requireSelection: true });
}

function onDescriptionFontSizeChange(size) {
  const commandSize = FONT_SIZE_COMMAND_MAP[size];
  if (!commandSize) return;
  applyDescriptionCommand("fontSize", commandSize, { requireSelection: true });
}

function clearDescriptionFormatting() {
  applyDescriptionCommand("removeFormat", null, { requireSelection: true });
}

function normalizeDescriptionLink(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  return `https://${raw}`;
}

function insertDescriptionLink() {
  const linkUrl = window.prompt("请输入超链接地址（如 https://example.com）", "https://");
  const normalized = normalizeDescriptionLink(linkUrl);
  if (!normalized) return;
  applyDescriptionCommand("createLink", normalized, { requireSelection: true });
}

function toggleDescriptionBlockquote() {
  const next = descriptionToolbarState.blockquote ? "p" : "blockquote";
  applyDescriptionCommand("formatBlock", next);
}

function onTicketDialogTypeChange(nextType) {
  if (nextType === "BUG单") {
    ticketDialog.form.sub_type = "BUG修复";
  } else if (!meta.demand_sub_types?.includes(ticketDialog.form.sub_type)) {
    ticketDialog.form.sub_type = meta.demand_sub_types?.[0] || "策划需求";
  }
  onTicketDialogSubTypeChange(ticketDialog.form.sub_type);
}

function getExecutorCandidates(ticketType, subType) {
  if (ticketType === "BUG单") {
    return users.value || [];
  }
  if (subType === "策划需求") {
    return (users.value || []).filter((item) => item.position === "策划");
  }
  if (subType === "程序需求") {
    return (users.value || []).filter((item) => item.position === "前端程序" || item.position === "后端程序");
  }
  if (subType === "美术需求") {
    return (users.value || []).filter((item) => item.position === "美术");
  }
  if (subType === "测试需求") {
    return (users.value || []).filter((item) => item.position === "测试");
  }
  return users.value || [];
}

function onTicketDialogSubTypeChange(nextSubType) {
  if (ticketDialog.form.ticket_type === "BUG单") {
    ticketDialog.form.sub_type = "BUG修复";
    return;
  }
  if (nextSubType === "测试需求") {
    ticketDialog.form.planner_id = null;
    ticketDialog.form.executor_id = ticketDialog.form.tester_id || null;
  }
  if (nextSubType === "策划需求") {
    ticketDialog.form.planner_id = ticketDialog.form.executor_id || null;
  }
  const allowed = new Set(
    getExecutorCandidates(ticketDialog.form.ticket_type, ticketDialog.form.sub_type).map((item) => item.id),
  );
  if (ticketDialog.form.executor_id && !allowed.has(ticketDialog.form.executor_id)) {
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
  if ((ticket?.status || "") === "待验收") return false;
  const endTime = new Date(endTimeRaw);
  if (Number.isNaN(endTime.getTime())) return false;
  return endTime.getTime() < Date.now();
}

function getDashboardStatusTagType(status) {
  const map = {
    待处理: "info",
    待验收: "warning",
    待测试: "primary",
    已完成: "success",
  };
  return map[status] || "info";
}

function getTaskTypeDotText(ticket) {
  const subType = String(ticket?.sub_type || "").trim();
  if (subType) return subType[0];
  const ticketType = String(ticket?.ticket_type || "").trim();
  return ticketType ? ticketType[0] : "需";
}

function getBugTypeDotText(ticket) {
  const relatedSubType = String(ticket?.related_task_sub_type || "").trim();
  if (relatedSubType) return relatedSubType[0];
  const relatedType = String(ticket?.related_task_type || "").trim();
  if (relatedType) return relatedType[0];
  return "B";
}

function getDashboardPriorityDotClass(priority) {
  const map = {
    低: "is-low",
    中: "is-mid",
    高: "is-high",
    紧急: "is-urgent",
  };
  return map[priority] || "is-mid";
}

function getDashboardOwnerName(ticket) {
  return ticket?.current_owner_name || ticket?.executor_name || ticket?.creator_name || "未分配";
}

function getDashboardOwnerInitial(ticket) {
  const name = String(getDashboardOwnerName(ticket) || "").trim();
  return name ? name[0].toUpperCase() : "U";
}

function hasLinkedParentInView(ticket) {
  const parentId = Number(ticket?.parent_task_id || 0);
  return parentId > 0 && dashboardTaskIdSet.value.has(parentId);
}

function isChildTask(ticket) {
  return hasTaskHierarchyInView.value && hasLinkedParentInView(ticket);
}

function hasChildTasks(ticket) {
  if (!hasTaskHierarchyInView.value) return false;
  return (dashboardTasks.value || []).some(
    (item) => Number(item?.parent_task_id || 0) === Number(ticket?.id || 0) && hasLinkedParentInView(item),
  );
}

function getTaskRelationRole(ticket) {
  if (isChildTask(ticket)) return "child";
  if (hasChildTasks(ticket)) return "parent";
  return "";
}

function getTaskRelationText(ticket) {
  if (!hasTaskHierarchyInView.value) return "";
  const parentId = Number(ticket?.parent_task_id || 0);
  if (hasLinkedParentInView(ticket)) return `父 #${parentId}`;
  const childCount = (dashboardTasks.value || []).filter(
    (item) => Number(item?.parent_task_id || 0) === Number(ticket?.id || 0) && hasLinkedParentInView(item),
  ).length;
  if (childCount > 0) return `${childCount} 个子任务`;
  return "";
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

async function copyTicketId(ticketId) {
  const text = `#${ticketId}`;
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

function onDashboardViewModeChange(nextMode) {
  dashboardViewMode.value = nextMode || "current";
}

function onProjectHubViewModeChange(nextMode) {
  projectHubTicketViewMode.value = nextMode || "list";
}

function onProjectHubTicketTypeChange(nextMode) {
  projectHubTicketTypeMode.value = nextMode || "all";
  selectedTicketIds.value = [];
  ticketPage.value = 1;
}

async function onAnalyticsRangeChange(days) {
  await setAnalyticsRangeDays(Number(days || 14));
}

async function onAnalyticsWorkloadGroupChange(groupBy) {
  await setAnalyticsWorkloadGroup(groupBy || "position");
}

async function onAnalyticsDensityMemberChange(memberId) {
  await setAnalyticsDensityMember(memberId || null);
}

function getRiskTagType(riskType) {
  if (riskType === "overdue") return "danger";
  if (riskType === "due_soon") return "warning";
  if (riskType === "stalled") return "info";
  return "";
}

function getDensityCellStyle(taskCount, isWeekend = false) {
  if (isWeekend) {
    return {
      background: "#f5f7fa",
      borderColor: "#ebeef5",
    };
  }
  const max = Math.max(Number(densityMaxOverlap.value || 0), 1);
  const value = Number(taskCount || 0);
  if (value <= 0) {
    return {
      background: "#ffffff",
      borderColor: "#ebeef5",
    };
  }
  if (value === 1) {
    return {
      background: "rgba(64, 158, 255, 0.4)",
      borderColor: "rgba(64, 158, 255, 0.5)",
    };
  }
  const maxOverlap = Math.max(max - 1, 1);
  const normalized = Math.min((value - 1) / maxOverlap, 1);
  const alpha = Math.min(0.35 + normalized * 0.55, 0.92);
  return {
    background: `rgba(64, 158, 255, ${alpha.toFixed(3)})`,
    borderColor: "rgba(64, 158, 255, 0.45)",
  };
}

function getDensityTooltip(day) {
  if (day?.is_weekend) return "周末留空";
  const tasks = day?.tasks || [];
  if (!tasks.length) return "当天无需求单安排";
  const summary = tasks.map((item) => `#${item.ticket_id} ${item.title}`).join("；");
  return `当天安排 ${tasks.length} 个需求单：${summary}`;
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

async function submitDescriptionEdit() {
  const sanitized = sanitizeDescriptionHtml(ticketDetail.descriptionDraft || "");
  await saveTicketDescription(sanitized);
  ticketDetail.descriptionEditing = false;
  descriptionLastRange.value = null;
}

onMounted(() => {
  if (typeof document !== "undefined") {
    document.addEventListener("selectionchange", syncDescriptionToolbarState);
  }
});

onUnmounted(() => {
  if (typeof document !== "undefined") {
    document.removeEventListener("selectionchange", syncDescriptionToolbarState);
  }
});
</script>

<style scoped>
.page {
  padding: 18px;
}

.login-card {
  width: 420px;
  margin: 90px auto 0;
}

.header {
  display: flex;
  align-items: center;
  padding: 0 0 10px;
}

.topbar {
  justify-content: space-between;
  gap: 12px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.platform-logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #409eff;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.platform-title {
  white-space: nowrap;
  display: inline-block;
  font-size: 24px;
  line-height: 1;
  letter-spacing: 0.6px;
  font-weight: 800;
  background: linear-gradient(90deg, #2f80ed 0%, #5b8cff 45%, #7b61ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.topbar-middle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  flex-wrap: nowrap;
}

.project-hub-tickets-card {
  position: relative;
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
  border: 1px solid #b3d8ff;
  background: #ecf5ff;
  color: #409eff;
  font-size: 12px;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.18);
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

.topbar-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.main-layout {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 12px;
}

.side-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 10px;
  height: fit-content;
  position: sticky;
  top: 12px;
}

.side-nav-item {
  border: 1px solid #e4e7ed;
  background: #fff;
  color: #606266;
  border-radius: 8px;
  height: 38px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.side-nav-icon {
  font-size: 13px;
  line-height: 1;
  opacity: 0.9;
}

.side-nav-item:hover {
  border-color: #c6e2ff;
  color: #409eff;
}

.side-nav-item.active {
  border-color: #409eff;
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

.side-version-group {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px;
  background: #fafafa;
}

.side-version-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.side-version-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.side-version-btn {
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #606266;
  border-radius: 999px;
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}

.side-version-btn.active {
  border-color: #409eff;
  background: #ecf5ff;
  color: #409eff;
}

.main-content-area {
  min-width: 0;
}

.content-fade-slide-enter-active,
.content-fade-slide-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.content-fade-slide-enter-from,
.content-fade-slide-leave-to {
  opacity: 0;
  transform: translateX(4px);
}

.user-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  cursor: pointer;
  background: #fff;
}

.user-avatar {
  background: #409eff;
  color: #fff;
  font-weight: 700;
}

.user-meta {
  min-width: 0;
}

.user-name {
  font-size: 13px;
  color: #1f2937;
  line-height: 1.2;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-role {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.2;
}

.project-switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.project-switch-row.compact {
  flex-wrap: nowrap;
  gap: 6px;
}

.project-switch-label {
  color: #6b7280;
  font-size: 13px;
}

.project-switch-select {
  width: 280px;
}

.project-switch-select.compact {
  width: 210px;
}

.global-search-input {
  width: 260px;
  max-width: 100%;
}

.toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}

.project-hub-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.project-select {
  width: 240px;
}

.version-create-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.version-create-row.compact {
  align-items: stretch;
}

.version-name-input {
  width: 220px;
  flex-shrink: 0;
}

.version-name-input.compact {
  width: 140px;
}

.version-create-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.project-hub-version-card {
  min-height: 0;
}

.version-manage-collapse {
  border: none;
}

.version-manage-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  color: #6b7280;
}

.version-manage-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 4px;
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

.project-hub-muted {
  font-size: 12px;
  color: #909399;
}

.table-scroll-inner {
  min-height: 0;
}

.ticket-batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.ticket-batch-label {
  font-size: 12px;
  color: #606266;
}

.ticket-batch-select {
  width: 130px;
}

.ticket-batch-select.assignee {
  width: 200px;
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
  border-bottom: 1px solid #ebeef5;
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
  color: #909399;
  font-family: ui-monospace, monospace;
}

.dynamic-compact-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dynamic-compact-time {
  flex-shrink: 0;
  color: #909399;
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

.project-hub-stats-card .stats-desc {
  margin-bottom: 12px;
}

.project-hub-stats-card .stats-desc.compact :deep(.el-descriptions__body) {
  font-size: 12px;
}

.stats-tables-compact {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.stats-tables-scroll {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.stats-subtitle {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #606266;
}

.stats-subsection {
  min-width: 0;
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
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fafcff;
}

.report-metric-label {
  font-size: 12px;
  color: #909399;
}

.report-metric-value {
  margin-top: 3px;
  font-size: 16px;
  font-weight: 700;
  color: #303133;
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
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #f8fafc;
  color: #606266;
  font-size: 12px;
  font-weight: 600;
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
  border: 1px solid #ebeef5;
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
  font-weight: 600;
}

.density-task-chip {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.7);
  outline: none;
  cursor: pointer;
  text-align: left;
  font-size: 11px;
  color: #1f2937;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 4px;
  padding: 1px 4px;
}

.density-task-chip:hover {
  border-color: rgba(64, 158, 255, 0.8);
  color: #1d4ed8;
}

.density-task-more {
  font-size: 11px;
  color: #1d4ed8;
  font-weight: 600;
}

.density-day-empty {
  font-size: 11px;
  color: #9ca3af;
  margin-top: auto;
}

.density-legend {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

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
  padding-top: 8px;
}

.dashboard-panel {
  height: auto;
  border-radius: 12px;
  border: 1px solid #ebeef5;
  box-shadow: 0 4px 12px rgba(31, 41, 55, 0.04);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.dashboard-panel:hover {
  box-shadow: 0 8px 20px rgba(31, 41, 55, 0.08);
  transform: translateY(-1px);
}

.dashboard-task-card {
  min-height: 500px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
}

.dashboard-bug-card {
  min-height: 560px;
  border-color: #fde9e9;
  box-shadow: 0 8px 22px rgba(245, 108, 108, 0.07);
  background: linear-gradient(180deg, #ffffff 0%, #fff8f8 100%);
}

.dashboard-other-info,
.dashboard-dynamics {
  background: linear-gradient(180deg, #ffffff 0%, #fcfcfe 100%);
}

.dashboard-panel-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-left: 10px;
  font-weight: 600;
}

.dashboard-panel-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  border-radius: 999px;
  background: #9ca3af;
}

.dashboard-task-card .dashboard-panel-title::before {
  background: #409eff;
}

.dashboard-bug-card .dashboard-panel-title::before {
  background: #f56c6c;
}

.dashboard-dynamics .dashboard-panel-title::before {
  background: #8b5cf6;
}

.dashboard-other-info .dashboard-panel-title::before {
  background: #94a3b8;
}

.dashboard-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
}

.dashboard-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 14px;
  background: #fafcff;
}

.dashboard-dynamics {
  min-height: 440px;
}

.dashboard-dynamics-scroll {
  max-height: 360px;
  overflow: auto;
}

.dashboard-dynamics-list {
  max-height: 360px;
  overflow: auto;
  padding-right: 4px;
}

.dashboard-dynamics-list .dynamic-compact-line2 {
  display: block;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dashboard-other-info {
  min-height: 360px;
}

@media (max-width: 1100px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .topbar {
    width: 100%;
    align-items: stretch;
  }

  .topbar-left,
  .topbar-middle,
  .topbar-right {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .project-switch-select.compact {
    width: 180px;
  }

  .global-search-input {
    width: 100%;
  }

  .main-layout {
    grid-template-columns: 1fr;
  }

  .side-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .side-nav-item {
    min-width: 108px;
    padding: 0 12px;
  }

  .side-version-group {
    width: 100%;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-right-column {
    padding-top: 0;
  }

  .dashboard-dynamics {
    min-height: 320px;
  }

  .dashboard-summary {
    grid-template-columns: 1fr;
  }

  .project-hub-main {
    grid-template-columns: 1fr;
    min-height: unset;
  }

  .project-hub-side-column {
    grid-template-rows: none;
  }

  .version-create-row.compact {
    flex-direction: column;
  }

  .version-name-input.compact {
    width: 100%;
  }

  .stats-tables-scroll {
    grid-template-columns: 1fr;
  }
}

.mb12 {
  margin-bottom: 12px;
}

.ml8 {
  margin-left: 8px;
}

.mr8 {
  margin-right: 8px;
}

.mt8 {
  margin-top: 8px;
}

.mt12 {
  margin-top: 12px;
}

.w140 {
  width: 140px;
}

.dynamic-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.dynamic-title-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dynamic-meta {
  margin-top: 6px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-detail-page {
  min-height: calc(100vh - 180px);
  padding: 8px 4px 20px;
  overflow: auto;
  --detail-side-top: 10px;
}

.ticket-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 8px 0 12px;
  border-bottom: 1px solid #e8edf5;
}

.ticket-detail-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ticket-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-title-id {
  color: #6b7785;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}

.ticket-type-art {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 12px;
  letter-spacing: 0;
  font-weight: 700;
  border: 1px solid transparent;
  white-space: nowrap;
}

.ticket-type-art.bug {
  color: #d14343;
  background: #fff2f2;
  border-color: #f3c4c4;
}

.ticket-type-art.demand {
  color: #3359c9;
  background: #eff4ff;
  border-color: #cddaf9;
}

.ticket-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  margin-top: 12px;
  align-items: start;
}

.ticket-detail-main {
  min-width: 0;
}

.ticket-detail-side {
  position: sticky;
  top: var(--detail-side-top);
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - (var(--detail-side-top) * 2));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.detail-stream-section {
  padding: 12px 0;
  border-bottom: 1px solid #edf1f7;
}

.detail-stream-section:first-child {
  padding-top: 4px;
}

.detail-stream-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.detail-side-block {
  padding: 0 0 12px;
  border-bottom: 1px solid #edf1f7;
}

.detail-side-block:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.ticket-detail-summary {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr);
  gap: 12px;
  margin-top: 12px;
  align-items: start;
}

.ticket-detail-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
}

.ticket-quick-edit {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding: 0;
}

.ticket-quick-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.ticket-quick-item {
  width: 100%;
}

.ticket-quick-item.assignees {
  width: 210px;
}

.ticket-quick-status-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ticket-quick-label {
  font-size: 12px;
  color: #7f8a9a;
}

.ticket-status-text {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  color: #4b5b71;
  font-weight: 600;
}

.ticket-detail-descriptions {
  background: #fff;
  border-radius: 0;
  border: none;
  box-shadow: none;
}

.ticket-detail-descriptions :deep(.el-descriptions__table) {
  width: 100%;
  table-layout: fixed;
}

.ticket-detail-descriptions :deep(.el-descriptions__cell) {
  min-width: 0;
}

.ticket-detail-descriptions :deep(.el-descriptions__content) {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ticket-assignee-board {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.ticket-assignee-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.ticket-assignee-groups {
  display: grid;
  gap: 8px;
}

.ticket-flow-role-list {
  display: grid;
  gap: 8px;
}

.ticket-flow-role-item {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.ticket-assignee-group {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.ticket-assignee-select {
  width: 100%;
}

.ticket-quick-item :deep(.el-input__wrapper),
.ticket-assignee-select :deep(.el-input__wrapper) {
  background: #f7faff;
}

.ticket-quick-item :deep(.el-input__wrapper),
.ticket-quick-item :deep(.el-select__wrapper) {
  background: #f7f8fa;
  border-color: #dfe3ea;
  box-shadow: none;
}

.ticket-quick-item :deep(.el-select__selected-item),
.ticket-quick-item :deep(.el-input__inner) {
  color: #3f4b5b;
  font-weight: 600;
}

.quick-priority-low :deep(.el-select__selected-item),
.quick-priority-low :deep(.el-input__inner) {
  color: #a8924f;
}

.quick-priority-mid :deep(.el-select__selected-item),
.quick-priority-mid :deep(.el-input__inner) {
  color: #bc8440;
}

.quick-priority-high :deep(.el-select__selected-item),
.quick-priority-high :deep(.el-input__inner) {
  color: #cc7448;
}

.quick-priority-urgent :deep(.el-select__selected-item),
.quick-priority-urgent :deep(.el-input__inner) {
  color: #c96969;
}

:deep(.quick-select-popper .el-select-dropdown__item.is-selected),
:deep(.assignee-select-popper .el-select-dropdown__item.is-selected) {
  color: #5d83d5;
  background: #f2f7ff;
  font-weight: 600;
}

.ticket-assignee-select :deep(.el-tag) {
  background: #edf4ff;
  border-color: #c9dcff;
  color: #2f61d0;
}

.status-overdue-tag {
  margin-left: 6px;
}

.status-overdue-tag-inline {
  margin-left: 0;
  flex-shrink: 0;
}

.related-status-wrap {
  display: inline-flex;
  align-items: center;
}

.ticket-assignee-position {
  color: #909399;
  font-size: 12px;
}

.ticket-assignee-members {
  color: #303133;
  line-height: 1.5;
}

.ticket-description-block {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
  min-height: 0;
}

.ticket-description-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.ticket-description-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.ticket-description-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.description-font-size-select {
  width: 92px;
}

.description-color-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.description-color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #d1d8e6;
  cursor: pointer;
  padding: 0;
}

.description-color-dot.active {
  outline: 2px solid #7aa2ff;
  outline-offset: 1px;
}

.ticket-description-editor {
  min-height: 180px;
  padding: 10px 12px;
  border: 1px solid #d8e4f6;
  border-radius: 8px;
  background: #fff;
  line-height: 1.75;
  font-size: 14px;
  outline: none;
}

.ticket-description-content {
  color: #606266;
  line-height: 1.75;
  font-size: 14px;
  min-height: 180px;
  padding: 10px 12px;
  border: 1px solid #eef2f8;
  border-radius: 8px;
  background: #fcfdff;
}

.ticket-description-empty {
  color: #9aa4b2;
}

.rich-text-content :deep(p) {
  margin: 0 0 8px;
}

.rich-text-content :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text-content :deep(ul),
.rich-text-content :deep(ol) {
  margin: 6px 0 8px 20px;
}

.ticket-description-editor :deep(ul),
.ticket-description-editor :deep(ol) {
  margin: 6px 0 8px 20px;
}

.rich-text-content :deep(strong) {
  font-weight: 700;
}

.rich-text-content :deep(blockquote),
.ticket-description-editor :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 10px;
  border-left: 3px solid #c8d7f2;
  color: #5b6575;
  background: #f7f9fd;
}

.ticket-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ticket-section-card {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
  box-shadow: none;
}

.ticket-section-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2d3d;
  margin-bottom: 10px;
}

.ticket-comments-wrap,
.ticket-history-wrap {
  margin-top: 2px;
}

.ticket-activity-wrap {
  padding: 0;
}

.ticket-activity-head {
  margin-bottom: 10px;
}

.ticket-comments-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ticket-comments-list {
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}

.ticket-comments-list :deep(.el-timeline-item) {
  padding-bottom: 10px;
}

.ticket-comments-list :deep(.el-timeline-item__node) {
  width: 8px;
  height: 8px;
  left: 0;
  background-color: #d7e3f5;
  border: 1px solid #cbd9ef;
}

.ticket-comments-list :deep(.el-timeline-item__tail) {
  left: 3px;
  border-left: 1px solid #e8eef8;
}

.ticket-comments-list :deep(.el-timeline-item__wrapper) {
  padding-left: 20px;
}

.ticket-comment-composer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding-top: 8px;
  border-top: 1px solid #eef1f6;
  background: #fff;
}

.comment-composer-input.compact :deep(.el-textarea__inner) {
  min-height: 34px !important;
  line-height: 1.35;
  padding-top: 7px;
  padding-bottom: 7px;
}

.ticket-history-panel {
  max-height: 520px;
  overflow-y: auto;
  padding-right: 4px;
}

.ticket-history-panel :deep(.el-timeline-item__node) {
  width: 8px;
  height: 8px;
  left: 0;
  background-color: #e3e8f2;
  border: 1px solid #d7deea;
}

.ticket-history-panel :deep(.el-timeline-item__tail) {
  left: 3px;
  border-left: 1px solid #eef2f8;
}

.ticket-history-panel :deep(.el-timeline-item__wrapper) {
  padding-left: 20px;
}

.ticket-detail-edit-form {
  margin-bottom: 0;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  color: #606266;
  background: #fff;
  cursor: pointer;
}

.hidden-file-input {
  display: none;
}

.attachment-tip {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}

.attachment-error-tip {
  margin-top: 6px;
  color: #f56c6c;
  font-size: 12px;
  background: #fff2f0;
  border: 1px solid #fbc4c4;
  border-radius: 6px;
  padding: 6px 8px;
  width: fit-content;
  max-width: 100%;
}

.ticket-attachments-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ticket-attachments-title {
  font-weight: 600;
}

.ticket-attachments-title-wrap {
  min-width: 0;
}

.ticket-upload-btn {
  height: auto;
  padding: 6px 12px;
  border-radius: 8px;
  border-color: #c8dcff;
  background: #f3f8ff;
  color: #2f5fb3;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.2;
}

.ticket-upload-btn:hover {
  border-color: #9fc1ff;
  background: #eaf3ff;
}

.upload-btn-main {
  font-size: 12px;
  font-weight: 700;
}

.upload-btn-sub {
  font-size: 11px;
  color: #6f8bbd;
}

.attachment-empty-inline {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px dashed #dbe6f5;
  border-radius: 8px;
  color: #8a95a6;
  font-size: 12px;
  background: #fbfdff;
}

.attachment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.attachment-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}

.attachment-image,
.attachment-video {
  width: 100%;
  border-radius: 6px;
  max-height: 120px;
  object-fit: cover;
}

.attachment-image.previewable {
  cursor: zoom-in;
}

.attachment-caption {
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-remove {
  margin-top: 4px;
  padding: 0;
}

.image-preview-wrap {
  display: flex;
  justify-content: center;
  max-height: 78vh;
  overflow: auto;
}

.image-preview-large {
  max-width: 100%;
  max-height: 76vh;
  object-fit: contain;
  border-radius: 8px;
}

.clickable-ticket-table :deep(.el-table__row) {
  cursor: pointer;
}

.dashboard-main-table :deep(.el-table__cell) {
  font-size: 13px;
}

.dashboard-title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  position: relative;
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
  font-size: 11px;
  font-weight: 700;
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
  min-width: 28px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
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
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-ticket-id {
  color: #909399;
  font-weight: 600;
  margin-right: 6px;
  cursor: copy;
  transition: color 0.15s ease;
}

.dashboard-ticket-id:hover {
  color: #409eff;
}

.dashboard-task-relation {
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
}

.dashboard-priority-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
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

.dashboard-owner-avatar {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #eef3ff;
  color: #3154d6;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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
  font-size: 12px;
}

.dashboard-deadline-hint.normal {
  color: #909399;
}

.dashboard-deadline-hint.soon {
  color: #e6a23c;
  font-weight: 600;
}

.dashboard-deadline-hint.overdue {
  color: #f56c6c;
  font-weight: 600;
}

.dashboard-deadline-hint.neutral {
  color: #909399;
}

.console-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.console-gateway-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 12px 14px;
  background: var(--el-bg-color-overlay, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
}

.console-gateway-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
}

.console-gateway-select {
  width: 220px;
  max-width: 100%;
  flex: 0 0 auto;
}

.console-db-entry-card,
.console-hotreload-entry-card {
  cursor: pointer;
}

.console-db-entry-card:hover,
.console-hotreload-entry-card:hover {
  border-color: #e6a23c;
}

.console-hotreload-entry-button {
  border-color: #e6a23c;
  color: #e6a23c;
  background: transparent;
}

.console-hotreload-entry-button:hover,
.console-hotreload-entry-button:focus {
  border-color: #e6a23c;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.12);
}

.console-hotreload-entry-button:active {
  border-color: #cf9236;
  color: #cf9236;
  background: rgba(230, 162, 60, 0.2);
}

.console-db-entry-button {
  border-color: #14b8a6;
  color: #14b8a6;
  background: transparent;
}

.console-db-entry-button:hover,
.console-db-entry-button:focus {
  border-color: #14b8a6;
  background: #14b8a6;
  color: #fff;
}

.console-db-entry-button:active {
  border-color: #0d8b7d;
  background: #0d8b7d;
  color: #fff;
}

.console-hotreload-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.console-hotreload-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.console-hotreload-heading {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.console-hotreload-note {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.console-hotreload-file-input-hidden {
  display: none;
}

.console-hotreload-main {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 14px;
  min-height: 640px;
}

@media (max-width: 960px) {
  .console-hotreload-main {
    grid-template-columns: 1fr;
  }
}

.console-hotreload-aside {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.console-hotreload-aside-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #606266;
}

.console-hotreload-scroll {
  flex: 1;
  min-height: 360px;
}

.console-hotreload-file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}

.console-hotreload-file-item:hover {
  border-color: #dcdfe6;
}

.console-hotreload-file-item.active {
  border-color: #409eff;
  background: #ecf5ff;
}

.console-hotreload-file-name {
  word-break: break-all;
}

.console-hotreload-file-size {
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
  margin-left: 8px;
}

.console-hotreload-mini-hint {
  font-size: 11px;
  color: #909399;
  margin-top: 6px;
}

.console-hotreload-panels {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.console-hotreload-panel {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.console-hotreload-panel-server {
  flex: 1;
  min-height: 320px;
}

.console-hotreload-panel-local {
  flex: 1;
  min-height: 280px;
}

.console-hotreload-panel-head {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.console-hotreload-panel-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.console-hotreload-picked-name {
  margin: 0 0 6px;
  font-size: 12px;
  color: #606266;
}

.console-hotreload-local-list {
  max-height: 180px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 8px;
  padding: 6px;
  background: #fafafa;
}

.console-hotreload-local-item {
  align-items: flex-start;
  gap: 10px;
}

.console-hotreload-local-item-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.console-hotreload-local-remove {
  font-size: 12px;
}

.console-hotreload-textarea-wrap {
  min-height: 320px;
}

.console-hotreload-textarea :deep(textarea) {
  min-height: 300px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.hotreload-diff-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  /* 首次打开未设窗体高度时，保证有一块可见滚动区 */
  min-height: 240px;
}

.hotreload-diff-scroll-wrap {
  flex: 1;
  min-height: 0;
}

.hotreload-diff-dialog .hotreload-diff-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin: 0 0 12px;
  flex-shrink: 0;
  font-size: 12px;
  color: #606266;
}

/* Element Plus 不同版本 class 可能在外层或 .el-dialog 本体，两套选择器都保留 */
:deep(.hotreload-diff-dialog .el-dialog, .el-dialog.hotreload-diff-dialog) {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 980px;
  min-height: 420px;
  max-width: 97vw;
  max-height: 92vh;
}

:deep(
  .hotreload-diff-dialog .el-dialog__header,
  .el-dialog.hotreload-diff-dialog .el-dialog__header
) {
  flex-shrink: 0;
}

:deep(
  .hotreload-diff-dialog .el-dialog__body,
  .el-dialog.hotreload-diff-dialog .el-dialog__body
) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 12px;
}

:deep(.hotreload-diff-scrollbar.el-scrollbar) {
  height: 100%;
}

:deep(.hotreload-diff-scrollbar .el-scrollbar__wrap) {
  max-height: none !important;
  height: 100%;
}

.hotreload-diff-dialog .hotreload-diff-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hotreload-diff-dialog .hotreload-diff-legend-item.muted {
  color: #909399;
}

.hotreload-diff-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #dcdfe6;
}

.hotreload-diff-swatch--remove {
  background: #fde2e2;
}

.hotreload-diff-swatch--add {
  background: #d8f3dc;
}

.hotreload-diff-swatch--change {
  background: #fef3c7;
}

.hotreload-split-table {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.hotreload-split-thead {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  font-weight: 600;
  font-size: 12px;
  color: #606266;
}

.hotreload-split-th {
  padding: 8px 12px;
}

.hotreload-split-th:first-child {
  border-right: 1px solid #ebeef5;
}

.hotreload-split-tbody {
  display: flex;
  flex-direction: column;
}

.hotreload-split-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #f0f2f5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.hotreload-split-row:last-child {
  border-bottom: none;
}

.hotreload-split-cell {
  padding: 4px 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.hotreload-split-cell--left {
  border-right: 1px solid #ebeef5;
}

.hotreload-split-row--equal {
  background: #fafafa;
}

.hotreload-split-row--change .hotreload-split-cell {
  background: #fffbeb;
}

.hotreload-split-row--remove .hotreload-split-cell--left {
  background: #fef2f2;
}

.hotreload-split-row--remove .hotreload-split-cell--right {
  background: #f9fafb;
  color: #a8abb2;
}

.hotreload-split-row--add .hotreload-split-cell--left {
  background: #f9fafb;
  color: #a8abb2;
}

.hotreload-split-row--add .hotreload-split-cell--right {
  background: #f0fdf4;
}

.console-db-explorer {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.console-db-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.console-db-back {
  font-size: 14px;
}

.console-db-heading {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.console-db-gateway-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #ecf5ff;
  color: #409eff;
}

.console-db-main {
  display: grid;
  grid-template-columns: minmax(0, 220px) minmax(0, 200px) minmax(0, 1fr) 112px;
  gap: 12px;
  align-items: stretch;
  min-height: 340px;
}

.console-db-panel {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  background: var(--el-bg-color, #fff);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.console-db-panel-title {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  background: #fafafa;
}

.console-db-scroll {
  flex: 1;
  min-height: 0;
}

.console-db-list-wrap {
  padding: 6px;
}

.console-db-list-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: #303133;
  transition: background 0.15s ease;
}

.console-db-list-item:hover {
  background: #f5f7fa;
}

.console-db-list-item.active {
  background: #ecf5ff;
  color: #409eff;
}

.console-db-item-name {
  font-weight: 600;
}

.console-db-item-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.console-db-mini-hint {
  font-size: 11px;
  color: #909399;
  padding: 0 10px 8px;
  margin: 0;
}

.console-db-field-wrap {
  padding: 8px 10px;
}

.console-db-field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed #ebeef5;
  font-size: 12px;
}

.console-db-field-name {
  font-size: 12px;
  color: #409eff;
}

.console-db-field-type {
  color: #909399;
  flex-shrink: 0;
}

.console-db-placeholder {
  font-size: 12px;
  color: #c0c4cc;
  padding: 16px 8px;
  text-align: center;
}

.console-db-workspace {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  background: #fafafa;
}

.console-db-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 6px;
}

.console-db-sql-block .console-db-sql-input :deep(textarea) {
  min-height: 140px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

.console-db-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.console-db-label-row .console-db-label {
  margin-bottom: 0;
}

.console-db-label-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.console-db-filter-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.console-db-filter-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  background: #fff;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.console-db-f-sel {
  width: 140px;
}

.console-db-op-sel {
  width: 118px;
}

.console-db-val-inp {
  flex: 1;
  min-width: 140px;
}

.console-db-no-val {
  flex: 1;
  min-width: 80px;
  color: #c0c4cc;
  font-size: 12px;
}

.console-db-cta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: flex-start;
  padding-top: 32px;
}

.console-db-alert {
  margin-top: 0;
}

.console-db-result-card {
  margin-top: 0;
}

.console-db-table {
  width: 100%;
}

.console-db-cell-expand-btn {
  margin-right: 6px;
  padding: 0;
  min-height: 20px;
}

.console-db-cell-preview {
  color: #606266;
  font-size: 12px;
}

.console-db-cell-json {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  white-space: pre;
  word-break: normal;
  font-size: 12px;
  line-height: 1.45;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

@media (max-width: 1100px) {
  .console-db-main {
    grid-template-columns: 1fr;
  }

  .console-db-cta {
    flex-direction: row;
    flex-wrap: wrap;
    padding-top: 0;
  }
}

.console-intro-card .console-intro-text {
  margin: 0 0 12px;
  color: #606266;
  line-height: 1.6;
  font-size: 13px;
}

.console-status-alert .console-hint {
  margin-top: 6px;
  line-height: 1.55;
  font-size: 13px;
  white-space: pre-wrap;
}

.console-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.console-tool-card .console-card-title {
  font-weight: 600;
}

.console-tool-card .console-card-desc {
  margin: 0 0 12px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}

.console-tool-card-wide {
  grid-column: 1 / -1;
}

.console-command-actions {
  margin-bottom: 10px;
}

.console-result :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

.wiki-card {
  min-height: 620px;
  padding-bottom: 8px;
}

.wiki-category-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.wiki-category-input {
  width: 100%;
}

.wiki-fab-create {
  position: fixed;
  right: 26px;
  bottom: 26px;
  z-index: 30;
  box-shadow: 0 10px 24px rgba(64, 158, 255, 0.28);
}

.wiki-editor-wrap {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
}

.wiki-editor-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
}

.wiki-editor-content {
  min-height: 280px;
  max-height: 480px;
  overflow: auto;
  padding: 10px;
  line-height: 1.6;
  outline: none;
  background: #fff;
}

.wiki-editor-content :deep(img),
.wiki-editor-content :deep(video) {
  max-width: 100%;
}

.wiki-attachment-list {
  width: 100%;
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.wiki-attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 6px 10px;
  background: #fff;
}

.wiki-detail-title {
  margin: 0 0 10px;
}

.wiki-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #606266;
  font-size: 13px;
}

.wiki-detail-content {
  line-height: 1.7;
  color: #303133;
}

.wiki-detail-content :deep(img),
.wiki-detail-content :deep(video) {
  max-width: 100%;
}

.topbar-notify-badge {
  margin-right: 8px;
}

.topbar-notify-btn {
  font-size: 18px;
  padding: 6px;
}

.notify-bell-icon {
  line-height: 1;
}

.project-hub-tickets-head {
  flex-wrap: wrap;
  gap: 8px;
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
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  color: #606266;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.project-view-icon-btn:hover {
  border-color: #9ec5ff;
  color: #409eff;
}

.project-view-icon-btn.active {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
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
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.project-kanban-column-head {
  font-size: 13px;
  font-weight: 600;
  padding: 8px 10px;
  border-bottom: 1px solid #ebeef5;
  background: #fff;
  border-radius: 8px 8px 0 0;
}

.project-kanban-cards {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-kanban-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 0;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.project-kanban-card:hover {
  border-color: #c6e2ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
}

.project-kanban-card-title {
  font-size: 13px;
  line-height: 1.45;
  color: #303133;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.project-kanban-card-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: #909399;
}

.project-kanban-priority {
  margin-left: auto;
  flex-shrink: 0;
}

.project-kanban-empty {
  padding: 8px 0;
}

.comment-mention-select {
  width: 100%;
}

.comment-line {
  line-height: 1.45;
}

.comment-item {
  padding: 0 0 2px;
}

.comment-text-html :deep(.mention-highlight) {
  color: #409eff;
  font-weight: 600;
}

.comment-mention-row {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.comment-mention-tag {
  border-color: #b3d8ff;
  color: #337ecc;
  background: #ecf5ff;
}

.comment-reply-list {
  margin-top: 6px;
  padding-left: 10px;
  border-left: 2px solid #ebeef5;
}

.comment-reply-item {
  font-size: 12px;
  color: #606266;
  line-height: 1.4;
  margin-bottom: 3px;
}

.comment-actions-row {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.14s ease;
}

.comment-item:hover .comment-actions-row,
.comment-item.active .comment-actions-row {
  opacity: 1;
}

.comment-time {
  font-size: 12px;
  color: #9aa4b2;
}

.comment-reply-trigger {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: #5b8cff;
  font-size: 12px;
  font-weight: 600;
}

.comment-reply-trigger:hover {
  color: #3375f5;
}

.comment-reply-editor {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px;
  border: 1px solid #e8edf5;
  border-radius: 8px;
  background: #fbfdff;
}

.comment-reply-mention {
  width: 220px;
}

.ticket-checklist-block {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}

.ticket-checklist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ticket-checklist-progress {
  font-size: 12px;
  color: #909399;
}

.ticket-checklist-add {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.ticket-checklist-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ticket-checklist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #f0f2f5;
  border-radius: 6px;
  padding: 6px 10px;
}

.ticket-checklist-item .done {
  text-decoration: line-through;
  color: #909399;
}

.ticket-watcher-line {
  margin-top: 8px;
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.ticket-watcher-title {
  color: #909399;
}

.ticket-related-board {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ticket-related-section {
  padding: 0;
}

.ticket-related-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  padding: 2px 0;
}

.ticket-related-head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.ticket-related-progress {
  font-size: 12px;
  color: #9aa4b2;
}

.ticket-related-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ticket-related-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 4px 2px;
  border-bottom: 1px solid #edf1f7;
}

.ticket-related-item:last-child {
  border-bottom: none;
}

.ticket-related-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #303133;
}

.ticket-link-btn {
  padding: 0;
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  justify-content: flex-start;
  overflow: hidden;
  text-align: left;
}

.ticket-link-btn :deep(.el-button__text) {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-related-link {
  padding: 0;
  max-width: calc(100% - 70px);
  justify-content: flex-start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

@media (max-width: 1280px) {
  .ticket-detail-layout {
    grid-template-columns: 1fr;
  }

  .ticket-detail-side {
    position: static;
    top: auto;
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }

  .ticket-related-board {
    gap: 8px;
  }
}

.notification-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}

.notification-feed-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-feed-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.notification-feed-item.unread {
  background: #f0f9ff;
  border-color: #b3d8ff;
}

.notification-feed-item:hover {
  border-color: #409eff;
}

.notification-feed-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.notification-feed-body {
  margin-top: 4px;
  font-size: 13px;
  color: #606266;
  line-height: 1.45;
}

.notification-feed-time {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.notification-feed-pagination {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
</style>
