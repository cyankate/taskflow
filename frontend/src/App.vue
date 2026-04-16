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
            @keyup.enter="runGlobalSearch"
            @clear="runGlobalSearch"
          >
            <template #append>
              <el-button @click="runGlobalSearch">搜索</el-button>
            </template>
          </el-input>
          <el-button type="primary" plain @click="createQuickTicket('需求单')">创建任务</el-button>
          <el-button type="danger" plain @click="createQuickTicket('BUG单')">创建BUG</el-button>
        </div>

        <div class="topbar-right">
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
          <button class="side-nav-item" :class="{ active: activeTab === 'dashboard' }" @click="activeTab = 'dashboard'">
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
          <button class="side-nav-item" :class="{ active: activeTab === 'project_hub' }" @click="activeTab = 'project_hub'">
            <span class="side-nav-icon">◫</span>
            <span>项目栏</span>
          </button>
          <button class="side-nav-item" :class="{ active: activeTab === 'wiki' }" @click="activeTab = 'wiki'">
            <span class="side-nav-icon">▤</span>
            <span>Wiki</span>
          </button>
          <button
            v-if="user.is_admin"
            class="side-nav-item"
            :class="{ active: activeTab === 'projects' }"
            @click="activeTab = 'projects'"
          >
            <span class="side-nav-icon">◧</span>
            <span>项目管理</span>
          </button>
          <button
            v-if="user.is_admin"
            class="side-nav-item"
            :class="{ active: activeTab === 'users' }"
            @click="activeTab = 'users'"
          >
            <span class="side-nav-icon">◉</span>
            <span>用户管理</span>
          </button>
        </aside>

        <div class="main-content-area">
          <section v-show="activeTab === 'dashboard'">
          <div class="dashboard-grid">
            <div class="dashboard-column dashboard-left-column">
              <el-card class="dashboard-panel dashboard-task-card">
                <template #header><div class="dashboard-panel-title">我的任务</div></template>
                <el-table
                  :data="pagedDashboardTasks"
                  stripe
                  max-height="390"
                  class="clickable-ticket-table"
                  @row-click="handleTicketRowClick"
                >
                  <el-table-column prop="title" label="标题" show-overflow-tooltip />
                  <el-table-column prop="status" label="状态" width="120" />
                  <el-table-column prop="priority" label="优先级" width="100" />
                  <el-table-column label="截止时间" width="220">
                    <template #default="scope">{{ formatDynamicTime(scope.row.end_time) }}</template>
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
                <template #header><div class="dashboard-panel-title">我的待处理BUG</div></template>
                <el-table
                  :data="pagedDashboardBugs"
                  stripe
                  max-height="460"
                  class="clickable-ticket-table"
                  @row-click="handleTicketRowClick"
                >
                  <el-table-column prop="title" label="标题" show-overflow-tooltip />
                  <el-table-column prop="status" label="状态" width="120" />
                  <el-table-column prop="priority" label="优先级" width="100" />
                  <el-table-column label="截止时间" width="220">
                    <template #default="scope">{{ formatDynamicTime(scope.row.end_time) }}</template>
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
                    {{ (dashboard.by_status?.["处理中"] || 0) + (dashboard.by_status?.["待处理"] || 0) }}
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
              <el-card class="project-hub-stats-card">
                <template #header><div class="dashboard-panel-title">数据与报表</div></template>
                <el-descriptions border :column="3" class="stats-desc compact">
                  <el-descriptions-item label="工单总数">{{ projectHub.summary.total_tickets || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="进行中">{{ projectHub.summary.pending_tickets || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="已完成">{{ projectHub.summary.completed_tickets || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="BUG数">{{ projectHub.summary.bug_tickets || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="完成率">{{ stats.completion_rate || 0 }}%</el-descriptions-item>
                  <el-descriptions-item label="逾期">{{ stats.overdue_count || 0 }}</el-descriptions-item>
                </el-descriptions>
                <div class="stats-tables-compact">
                  <div class="stats-subsection">
                    <div class="stats-subtitle">岗位工作量</div>
                    <el-table :data="workloadRows" stripe size="small" max-height="140">
                      <el-table-column prop="position" label="岗位" width="120" />
                      <el-table-column prop="count" label="工单数" />
                    </el-table>
                  </div>
                  <div class="stats-subsection">
                    <div class="stats-subtitle">7天趋势</div>
                    <el-table :data="stats.trend || []" stripe size="small" max-height="140">
                      <el-table-column prop="date" label="日期" width="100" />
                      <el-table-column prop="updated_tickets" label="更新数" />
                    </el-table>
                  </div>
                </div>
              </el-card>

              <el-card class="project-hub-tickets-card">
                <template #header>
                  <div class="project-hub-card-head">
                    <span class="dashboard-panel-title">工单列表</span>
                    <span class="project-hub-muted">共 {{ tickets.length }} 条</span>
                  </div>
                </template>
                <div class="table-scroll-inner">
                  <el-table :data="pagedTickets" stripe class="clickable-ticket-table" @row-click="handleTicketRowClick">
                    <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
                    <el-table-column prop="ticket_type" label="类型" width="88" />
                    <el-table-column prop="status" label="状态" width="100" />
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
                <div class="project-hub-pagination">
                  <el-pagination
                    background
                    layout="total, sizes, prev, pager, next"
                    :total="tickets.length"
                    :page-sizes="[20, 30, 50, 100]"
                    v-model:page-size="ticketPageSize"
                    v-model:current-page="ticketPage"
                    @size-change="ticketPage = 1"
                  />
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
          <el-select v-model="ticketDialog.form.ticket_type" class="w140">
            <el-option v-for="item in meta.ticket_types" :key="item" :label="item" :value="item" />
          </el-select>
          <el-input v-model="ticketDialog.form.sub_type" placeholder="子类型" class="w140 ml8" />
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
          <el-select v-model="ticketDialog.form.status" class="w140 ml8">
            <el-option v-for="item in meta.ticket_status" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="ticketDialog.form.assignee_ids" multiple style="width: 100%">
            <el-option v-for="item in users" :key="item.id" :label="item.display_name" :value="item.id" />
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
        <el-button type="primary" @click="saveTicket">保存</el-button>
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

    <el-drawer v-model="ticketDetail.visible" title="工单详情" size="65%">
      <div class="ticket-detail-head">
        <h3 class="ticket-detail-title">{{ ticketDetail.ticket.title }}</h3>
        <div class="ticket-detail-actions">
          <el-button size="small" @click="ticketDetail.editing = !ticketDetail.editing">
            {{ ticketDetail.editing ? "取消编辑" : "编辑工单" }}
          </el-button>
          <el-button v-if="ticketDetail.editing" size="small" type="primary" @click="saveTicketDetailEdit">提交保存</el-button>
        </div>
      </div>
      <div class="ticket-detail-summary">
        <div class="ticket-detail-status-row">
          <el-tag class="mr8">{{ ticketDetail.ticket.status || "未知状态" }}</el-tag>
          <el-tag type="warning" class="mr8">{{ ticketDetail.ticket.priority || "未设置优先级" }}</el-tag>
          <el-tag type="info">{{ ticketDetail.ticket.ticket_type || "未设置类型" }}</el-tag>
        </div>
        <el-descriptions border :column="2" size="small" class="ticket-detail-descriptions">
          <el-descriptions-item label="工单ID">#{{ ticketDetail.ticket.id || "-" }}</el-descriptions-item>
          <el-descriptions-item label="所属模块">{{ ticketDetail.ticket.module || "-" }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ ticketDetail.ticket.version_name || "-" }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ detailCreatorName }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatDynamicTime(ticketDetail.ticket.start_time) || "-" }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{ formatDynamicTime(ticketDetail.ticket.end_time) || "-" }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDynamicTime(ticketDetail.ticket.created_at) || "-" }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDynamicTime(ticketDetail.ticket.updated_at) || "-" }}</el-descriptions-item>
        </el-descriptions>

        <div class="ticket-assignee-board">
          <div class="ticket-assignee-title">负责人（按岗位）</div>
          <div v-if="detailAssigneeGroups.length > 0" class="ticket-assignee-groups">
            <div v-for="group in detailAssigneeGroups" :key="group.position" class="ticket-assignee-group">
              <div class="ticket-assignee-position">{{ group.position }}</div>
              <div class="ticket-assignee-members">{{ group.members.join("、") }}</div>
            </div>
          </div>
          <el-empty v-else description="暂无负责人" :image-size="40" />
        </div>

        <div class="ticket-description-block">
          <div class="ticket-description-title">工单描述</div>
          <div class="ticket-description-content">{{ ticketDetail.ticket.description || "暂无描述" }}</div>
        </div>
      </div>
      <el-divider />

      <el-form v-if="ticketDetail.editing" :model="ticketDetail.editForm" label-width="90px" class="ticket-detail-edit-form">
        <el-form-item label="标题"><el-input v-model="ticketDetail.editForm.title" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="ticketDetail.editForm.description" type="textarea" /></el-form-item>
        <el-form-item label="模块"><el-input v-model="ticketDetail.editForm.module" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="ticketDetail.editForm.ticket_type" class="w140">
            <el-option v-for="item in meta.ticket_types" :key="item" :label="item" :value="item" />
          </el-select>
          <el-input v-model="ticketDetail.editForm.sub_type" placeholder="子类型" class="w140 ml8" />
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
          <el-select v-model="ticketDetail.editForm.status" class="w140 ml8">
            <el-option v-for="item in meta.ticket_status" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="ticketDetail.editForm.assignee_ids" multiple style="width: 100%">
            <el-option v-for="item in users" :key="item.id" :label="item.display_name" :value="item.id" />
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

      <div class="ticket-attachments">
        <div class="ticket-attachments-head">
          <div class="ticket-attachments-title">附件</div>
          <label class="upload-btn">
            上传并提交
            <input type="file" multiple accept="image/*,video/*" class="hidden-file-input" @change="onDetailAttachmentChange" />
          </label>
        </div>
        <div class="attachment-tip">支持图片和视频，可多选，单文件不超过 20MB</div>
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
        <el-empty v-else description="暂无附件" :image-size="56" />
      </div>

      <el-divider />
      <h4>评论</h4>
      <el-input v-model="ticketDetail.newComment" type="textarea" placeholder="输入评论，支持@成员文字约定" />
      <el-button class="mt8" type="primary" @click="addComment">提交评论</el-button>
      <el-timeline>
        <el-timeline-item v-for="c in ticketDetail.comments" :key="c.id" :timestamp="formatDynamicTime(c.created_at)">
          <strong>{{ c.user?.display_name }}：</strong>{{ c.content }}
        </el-timeline-item>
      </el-timeline>
      <h4>修改历史</h4>
      <el-timeline>
        <el-timeline-item v-for="h in ticketDetail.histories" :key="h.id" :timestamp="formatDynamicTime(h.created_at)">
          {{ h.summary }}（{{ h.editor?.display_name }}）
        </el-timeline-item>
      </el-timeline>
    </el-drawer>

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
  </div>
</template>

<script setup>
import { useTaskflowApp } from "./composables/useTaskflowApp";

const {
  token,
  user,
  activeTab,
  currentProjectId,
  currentVersionId,
  globalSearchKeyword,
  loginForm,
  users,
  projects,
  versions,
  tickets,
  dashboard,
  stats,
  notification,
  projectHub,
  versionForm,
  showVersionCreateForm,
  meta,
  userDialog,
  projectDialog,
  ticketDialog,
  ticketDetail,
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
  workloadRows,
  userInitial,
  ticketDetailAttachments,
  detailCreatorName,
  detailAssigneeGroups,
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
  isImageAttachment,
  isVideoAttachment,
  openImagePreview,
  doLogin,
  handleUserMenuCommand,
  onGlobalProjectChange,
  selectVersionByButton,
  runGlobalSearch,
  loadProjectHub,
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
  onDetailProjectChange,
  onDetailAttachmentChange,
  removeDetailAttachment,
  addComment,
} = useTaskflowApp();
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
  font-size: 22px;
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

.ticket-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.ticket-detail-title {
  margin: 0;
}

.ticket-detail-summary {
  display: grid;
  gap: 12px;
}

.ticket-detail-status-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ticket-detail-descriptions {
  background: #fff;
  border-radius: 8px;
}

.ticket-assignee-board {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafcff;
  padding: 10px;
}

.ticket-assignee-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.ticket-assignee-groups {
  display: grid;
  gap: 8px;
}

.ticket-assignee-group {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
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
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}

.ticket-description-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.ticket-description-content {
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ticket-detail-actions {
  display: flex;
  gap: 8px;
}

.ticket-detail-edit-form {
  margin-bottom: 12px;
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
  margin-top: 6px;
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ticket-attachments-title {
  font-weight: 600;
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
</style>
