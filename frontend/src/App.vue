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
            placeholder="搜索标题、描述、模块、工单号"
            clearable
            class="global-search-input"
            @keyup.enter="runTopbarSearch"
            @clear="runTopbarSearch"
          >
            <template #append>
              <el-button @click="runTopbarSearch">搜索</el-button>
            </template>
          </el-input>
          <div class="topbar-create-pair">
            <el-button type="primary" plain @click="createQuickTicket('需求单')">创建任务</el-button>
            <el-button type="danger" plain @click="createQuickTicket('BUG单')">创建BUG</el-button>
          </div>
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
            <span>项目</span>
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
          <DashboardPage />
          <UsersPage />
          <ProjectsPage />

          <ProjectHubPage />

          <WikiPage />

          <ConsolePage />
          </div>

          <TicketDetailPage v-else key="content-detail" />
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
        <el-form-item label="描述">
          <div class="ticket-dialog-editor-wrap">
            <div class="ticket-dialog-editor-toolbar">
              <el-button size="small" text @click="applyTicketDialogCommand('bold')">加粗</el-button>
              <el-button size="small" text @click="applyTicketDialogCommand('insertOrderedList')">有序列表</el-button>
              <el-button size="small" text @click="applyTicketDialogCommand('insertUnorderedList')">无序列表</el-button>
              <el-button size="small" text @click="insertTicketDialogLink">链接</el-button>
              <el-button size="small" text @click="applyTicketDialogCommand('removeFormat')">清除格式</el-button>
            </div>
            <div
              ref="ticketDialogEditorRef"
              class="ticket-dialog-editor-content rich-text-content"
              contenteditable="true"
              @input="onTicketDialogEditorInput"
            ></div>
          </div>
        </el-form-item>
        <el-form-item label="模块">
          <el-select v-model="ticketDialog.form.module" placeholder="请选择模块" style="width: 100%">
            <el-option v-for="item in TICKET_MODULE_OPTIONS" :key="`ticket-module-${item}`" :label="item" :value="item" />
          </el-select>
        </el-form-item>
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
          <el-select v-model="ticketDialog.form.priority" class="w140 ml8" :disabled="ticketDialog.form.id && !canEditTicketPriority(ticketDialog.form)">
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
        <el-form-item label="附件">
          <label class="upload-btn">
            添加附件
            <input type="file" multiple accept="image/*,video/*" class="hidden-file-input" @change="onTicketDialogAttachmentChange" />
          </label>
          <span class="attachment-tip">支持图片、视频，单文件不超过 20MB</span>
          <div v-if="ticketDialogAttachmentError" class="attachment-error-tip">{{ ticketDialogAttachmentError }}</div>
          <div v-if="(ticketDialog.form.attachments || []).length > 0" class="wiki-attachment-list">
            <div v-for="(item, idx) in ticketDialog.form.attachments" :key="`${item.url}-${idx}`" class="wiki-attachment-item">
              <a :href="item.url" target="_blank" rel="noreferrer">{{ item.name || `附件${idx + 1}` }}</a>
              <el-button link type="danger" @click="removeTicketDialogAttachment(idx)">删除</el-button>
            </div>
          </div>
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
              <el-button size="small" text :type="wikiToolbarState.bold ? 'primary' : undefined" @click="applyWikiEditorCommand('bold')">
                加粗
              </el-button>
              <el-button
                size="small"
                text
                :type="wikiToolbarState.strike ? 'primary' : undefined"
                @click="applyWikiEditorCommand('strikeThrough')"
              >
                划线
              </el-button>
              <el-button
                size="small"
                text
                :type="wikiToolbarState.orderedList ? 'primary' : undefined"
                @click="applyWikiEditorCommand('insertOrderedList')"
              >
                有序列表
              </el-button>
              <el-button
                size="small"
                text
                :type="wikiToolbarState.unorderedList ? 'primary' : undefined"
                @click="applyWikiEditorCommand('insertUnorderedList')"
              >
                无序列表
              </el-button>
              <el-select :model-value="wikiToolbarState.fontSize" size="small" class="wiki-font-size-select" @change="onWikiFontSizeChange">
                <el-option v-for="item in DESCRIPTION_FONT_SIZES" :key="`wiki-font-${item}`" :label="`${item}px`" :value="item" />
              </el-select>
              <el-button
                size="small"
                text
                :type="wikiToolbarState.blockquote ? 'primary' : undefined"
                @click="toggleWikiEditorBlockquote"
              >
                引用块
              </el-button>
              <el-button size="small" text :type="wikiToolbarState.link ? 'primary' : undefined" @click="insertWikiEditorLink">链接</el-button>
              <div class="wiki-editor-color-palette">
                <button
                  v-for="item in WIKI_EDITOR_COLORS"
                  :key="`wiki-color-${item.value}`"
                  type="button"
                  class="wiki-editor-color-dot"
                  :class="{ active: wikiToolbarState.color === item.value.toLowerCase() }"
                  :style="{ backgroundColor: item.value }"
                  :title="item.label"
                  @click="onWikiEditorColorChange(item.value)"
                ></button>
              </div>
              <el-button size="small" text @click="applyWikiEditorCommand('removeFormat')">清除格式</el-button>
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
            <div
              ref="wikiEditorRef"
              class="wiki-editor-content"
              contenteditable="true"
              @input="
                onWikiEditorInput();
                syncWikiToolbarState();
              "
            ></div>
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
import { provide } from "vue";
import { ElMessage } from "element-plus";
import { useTaskflowApp } from "./composables/useTaskflowApp";
import { useDashboardPageState } from "./composables/taskflow/pages/useDashboardPageState";
import { useProjectHubPageState } from "./composables/taskflow/pages/useProjectHubPageState";
import { useWikiPageState } from "./composables/taskflow/pages/useWikiPageState";
import { useTicketDetailPageState } from "./composables/taskflow/pages/useTicketDetailPageState";
import { useEditorSelectionSync } from "./composables/taskflow/useEditorSelectionSync";
import DashboardPage from "./components/pages/DashboardPage.vue";
import UsersPage from "./components/pages/UsersPage.vue";
import ProjectsPage from "./components/pages/ProjectsPage.vue";
import ProjectHubPage from "./components/pages/ProjectHubPage.vue";
import WikiPage from "./components/pages/WikiPage.vue";
import ConsolePage from "./components/pages/ConsolePage.vue";
import TicketDetailPage from "./components/pages/TicketDetailPage.vue";

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
  projectHubFilterExpanded,
  projectHubTicketFilters,
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
  imagePreview,
  wikiCategories,
  wikiArticles,
  wikiFilter,
  wikiPage,
  wikiPageSize,
  wikiEditorRef,
  wikiDialog,
  wikiAttachmentError,
  ticketDialogAttachmentError,
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
  openWikiDetail: openWikiDetailRaw,
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
  saveTicketAssigneeQuick,
  runTicketFlowAction,
  onDetailProjectChange,
  onTicketDialogAttachmentChange,
  removeTicketDialogAttachment,
  onDetailAttachmentChange,
  removeDetailAttachment,
  addComment,
  toggleTicketFollow,
  addCommentReply,
  createSubTaskFromDetail,
  createBugFromDetail,
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

const TICKET_MODULE_OPTIONS = ["数值", "业务功能", "系统构建", "工具开发", "美术资源", "界面优化", "战斗"];
const {
  DESCRIPTION_COLORS,
  DESCRIPTION_FONT_SIZES,
  FONT_SIZE_COMMAND_MAP,
  FONT_SIZE_COMMAND_REVERSE_MAP,
  descriptionEditorRef,
  ticketDialogEditorRef,
  descriptionToolbarState,
  onTicketDialogEditorInput,
  applyTicketDialogCommand,
  insertTicketDialogLink,
  renderDescriptionHtml,
  normalizeColorValue,
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
} = useTicketDetailPageState({
  ticketDialog,
  ticketDetail,
  meta,
  user,
  activeTab,
  onDetailProjectChange,
  runTicketFlowAction,
  saveTicketDescription,
  ElMessage,
});

const {
  dashboardDynamicsOnlyMine,
  dashboardQuickFilterMode,
  dashboardRiskFilterMode,
  dashboardActiveFilterLabel,
  dashboardVisibleDynamics,
  dashboardDynamicsEmptyText,
  filteredDashboardTasks,
  filteredDashboardBugs,
  sortedPagedDashboardTasks,
  sortedPagedDashboardBugs,
  dashboardScopeLabel,
  dashboardTotalTickets,
  dashboardPendingCount,
  dashboardCompletedCount,
  dashboardVisibleTicketCount,
  dashboardOverdueCount,
  dashboardDueSoon24hCount,
  dashboardTaskEmptyText,
  dashboardBugEmptyText,
  dashboardStatusRows,
  onDashboardTaskSortChange,
  onDashboardBugSortChange,
  onDashboardStatusRowClick,
  clearDashboardStatusFilter,
  onDashboardKpiFilterClick,
  onDashboardRiskFilterClick,
  onDashboardVisibleKpiClick,
  dashboardStatusRowClassName,
  isChildTask,
  getTaskRelationRole,
  getTaskRelationText,
  getDashboardStatusTagType,
  getDashboardPriorityDotClass,
  getDashboardOwnerName,
  onDashboardViewModeChange,
  resetDashboardFiltersAndSort,
} = useDashboardPageState({
  dashboard,
  dashboardViewMode,
  dashboardTasks,
  dashboardBugs,
  dashboardTaskPage,
  dashboardTaskPageSize,
  dashboardBugPage,
  dashboardBugPageSize,
  user,
  isTicketOverdue,
  isTicketDueWithin24h,
});
const {
  onProjectHubViewModeChange,
  onProjectHubFilterChange,
  toggleProjectHubFilters,
  resetProjectHubFilters,
  onProjectHubRowAction,
  projectHubFiltersActive,
  onAnalyticsRangeChange,
  onAnalyticsWorkloadGroupChange,
  onAnalyticsDensityMemberChange,
  getRiskTagType,
  getDensityCellStyle,
  getDensityTooltip,
} = useProjectHubPageState({
  projectHubTicketViewMode,
  projectHubFilterExpanded,
  projectHubTicketFilters,
  projectHubTicketTypeMode,
  ticketPage,
  openTicketDialog,
  openTicketDetail,
  removeTicket,
  setAnalyticsRangeDays,
  setAnalyticsWorkloadGroup,
  setAnalyticsDensityMember,
  densityMaxOverlap,
});
const WIKI_EDITOR_COLORS = [
  { label: "默认", value: "#303133" },
  { label: "红色", value: "#e53935" },
  { label: "橙色", value: "#fb8c00" },
  { label: "绿色", value: "#43a047" },
  { label: "蓝色", value: "#1e88e5" },
  { label: "紫色", value: "#8e24aa" },
];
const {
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
} = useWikiPageState({
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
});

provide("appCtx", {
  activeTab,
  user,
  users,
  projects,
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
  onDashboardVisibleKpiClick,
  dashboardVisibleTicketCount,
  dashboardStatusRows,
  dashboardStatusRowClassName,
  onDashboardStatusRowClick,
  dashboardRiskFilterMode,
  onDashboardRiskFilterClick,
  dashboardOverdueCount,
  dashboardDueSoon24hCount,
  openUserDialog,
  removeUser,
  openProjectDialog,
  setDefaultProject,
  removeProject,
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
  projectHubTicketTypeMode,
  resetProjectHubFilters,
  pagedTickets,
  onProjectHubRowAction,
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
  wikiViewMode,
  backToWikiList,
  wikiDetailEditing,
  openWikiDialog,
  wikiFilter,
  setWikiCategoryFilter,
  wikiCategories,
  pagedWikiArticles,
  openWikiDetailPageByRow,
  openWikiDetailEditPage,
  openWikiDetailPage,
  removeWikiArticle,
  wikiArticles,
  wikiPageSize,
  wikiPage,
  wikiDetail,
  cancelWikiDetailEdit,
  saveWikiDetailPage,
  startWikiDetailEdit,
  wikiToolbarState,
  applyWikiEditorCommand,
  onWikiFontSizeChange,
  DESCRIPTION_FONT_SIZES,
  toggleWikiEditorBlockquote,
  insertWikiEditorLink,
  WIKI_EDITOR_COLORS,
  onWikiEditorColorChange,
  insertWikiMedia,
  wikiEditorRef,
  onWikiEditorInput,
  syncWikiToolbarState,
  getWikiAttachmentSectionClass,
  getWikiAttachmentCount,
  selectedGatewayId,
  consoleStatus,
  consoleForms,
  consoleSubView,
  dbExplorer,
  filterOperators,
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
  ticketDetail,
  closeTicketDetail,
  createSubTaskFromDetail,
  createBugFromDetail,
  toggleTicketFollow,
  saveTicketDetailEdit,
  descriptionToolbarState,
  applyDescriptionCommand,
  toggleDescriptionBlockquote,
  onDescriptionFontSizeChange,
  DESCRIPTION_COLORS,
  onDescriptionColorChange,
  insertDescriptionLink,
  clearDescriptionFormatting,
  cancelDescriptionEdit,
  submitDescriptionEdit,
  startDescriptionEdit,
  descriptionEditorRef,
  onDescriptionEditorInput,
  syncDescriptionToolbarState,
  renderDescriptionHtml,
  getExecutorCandidates,
  taskTicketOptions,
  onDetailProjectChange,
  canEditTicketPriority,
  ticketAttachmentError,
  ticketDetailAttachments,
  onDetailAttachmentChange,
  isImageAttachment,
  openImagePreview,
  isVideoAttachment,
  removeDetailAttachment,
  isReplyEditorOpen,
  commentContentWithMentionsHtml,
  mentionDisplayNames,
  toggleReplyEditor,
  getCommentReplies,
  onReplyMentionIdsChange,
  addCommentReply,
  expandCommentComposer,
  maybeCollapseCommentComposer,
  onCommentMentionIdsChange,
  addComment,
  onTicketFlowAction,
  getPriorityToneClass,
  saveTicketQuickEdit,
  detailCreatorName,
  saveTicketAssigneeQuick,
});

useEditorSelectionSync({
  syncDescriptionToolbarState,
  syncWikiToolbarState,
});
</script>

<style>
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
  justify-content: flex-start;
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
  flex-wrap: nowrap;
  flex-shrink: 0;
  margin-left: auto;
  gap: 24px;
}

.topbar-create-pair {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
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

.global-search-input :deep(.el-input__inner::placeholder),
.global-search-input :deep(input::placeholder) {
  font-size: 12px;
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

  .topbar-middle {
    margin-left: 0;
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

.rich-text-content :deep(strong) {
  font-weight: 700;
}

.rich-text-content :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 10px;
  border-left: 3px solid #c8d7f2;
  color: #5b6575;
  background: #f7f9fd;
}

.status-overdue-tag {
  margin-left: 6px;
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

.wiki-category-input {
  width: 100%;
}

.wiki-editor-wrap {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
}

.ticket-dialog-editor-wrap {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
}

.ticket-dialog-editor-toolbar {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
  flex-wrap: wrap;
}

.ticket-dialog-editor-content {
  min-height: 180px;
  max-height: 360px;
  overflow: auto;
  padding: 10px;
  line-height: 1.6;
  outline: none;
  background: #fff;
}

.wiki-editor-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
  flex-wrap: wrap;
  align-items: center;
}

.wiki-editor-toolbar .upload-btn {
  height: 24px;
  padding: 0 10px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  border-color: #dcdfe6;
  color: #606266;
}

.wiki-font-size-select {
  width: 92px;
}

.wiki-editor-content {
  min-height: 340px;
  max-height: 560px;
  overflow: auto;
  padding: 10px;
  line-height: 1.6;
  outline: none;
  background: #fff;
}

.wiki-editor-color-palette {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
}

.wiki-editor-color-dot {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.wiki-editor-color-dot:hover {
  transform: translateY(-1px);
}

.wiki-editor-color-dot.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.25);
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
