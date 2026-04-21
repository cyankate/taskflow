<template>
  <section v-show="activeTab === 'wiki'">
    <el-card class="wiki-card">
      <template #header>
        <div class="wiki-card-head">
          <div class="dashboard-panel-title">Wiki</div>
          <div class="wiki-card-head-actions">
            <el-button v-if="wikiViewMode === 'detail'" size="small" plain @click="backToWikiList">返回列表</el-button>
            <el-button type="primary" size="small" :disabled="wikiDetailEditing" @click="openWikiDialog()">新建文章</el-button>
          </div>
        </div>
      </template>
      <template v-if="wikiViewMode === 'list'">
        <div class="wiki-category-bar">
          <el-button size="small" :type="!wikiFilter.category_id ? 'primary' : 'default'" @click="setWikiCategoryFilter(null)">全部</el-button>
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
        <el-table :data="pagedWikiArticles" stripe class="clickable-ticket-table" @row-click="openWikiDetailPageByRow">
          <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
          <el-table-column prop="category_name" label="专栏" width="140" />
          <el-table-column prop="updater_name" label="更新人" width="120" />
          <el-table-column label="更新时间" width="180">
            <template #default="scope">{{ formatDynamicTime(scope.row.updated_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220">
            <template #default="scope">
              <el-button link type="primary" @click.stop="openWikiDetailEditPage(scope.row)">编辑</el-button>
              <el-button link type="success" @click.stop="openWikiDetailPage(scope.row)">查看</el-button>
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
          <el-pagination background layout="total, prev, pager, next" :total="wikiArticles.length" :page-size="wikiPageSize" v-model:current-page="wikiPage" />
        </div>
      </template>
      <template v-else>
        <div class="wiki-detail-page">
          <div class="wiki-detail-head">
            <h2 class="wiki-detail-title">{{ wikiDetail.article.title || "-" }}</h2>
            <div class="wiki-detail-head-actions">
              <template v-if="wikiDetailEditing">
                <el-button size="small" @click="cancelWikiDetailEdit">取消</el-button>
                <el-button size="small" type="primary" @click="saveWikiDetailPage">保存内容</el-button>
              </template>
              <el-button v-else size="small" type="primary" plain @click="startWikiDetailEdit">编辑内容</el-button>
            </div>
          </div>
          <div class="wiki-detail-meta">
            <el-tag effect="plain">{{ wikiDetail.article.category_name || "未分类" }}</el-tag>
            <span>创建人：{{ wikiDetail.article.creator_name || "-" }}</span>
            <span>更新人：{{ wikiDetail.article.updater_name || "-" }}</span>
            <span>更新时间：{{ formatDynamicTime(wikiDetail.article.updated_at) || "-" }}</span>
          </div>
          <el-divider />
          <div v-if="wikiDetailEditing" class="wiki-editor-wrap">
            <div class="wiki-editor-toolbar">
              <el-button size="small" text :type="wikiToolbarState.bold ? 'primary' : undefined" @click="applyWikiEditorCommand('bold')">加粗</el-button>
              <el-button size="small" text :type="wikiToolbarState.strike ? 'primary' : undefined" @click="applyWikiEditorCommand('strikeThrough')">划线</el-button>
              <el-button size="small" text :type="wikiToolbarState.orderedList ? 'primary' : undefined" @click="applyWikiEditorCommand('insertOrderedList')">有序列表</el-button>
              <el-button size="small" text :type="wikiToolbarState.unorderedList ? 'primary' : undefined" @click="applyWikiEditorCommand('insertUnorderedList')">无序列表</el-button>
              <el-select :model-value="wikiToolbarState.fontSize" size="small" class="wiki-font-size-select" @change="onWikiFontSizeChange">
                <el-option v-for="item in DESCRIPTION_FONT_SIZES" :key="`wiki-detail-font-${item}`" :label="`${item}px`" :value="item" />
              </el-select>
              <el-button size="small" text :type="wikiToolbarState.blockquote ? 'primary' : undefined" @click="toggleWikiEditorBlockquote">引用块</el-button>
              <el-button size="small" text :type="wikiToolbarState.link ? 'primary' : undefined" @click="insertWikiEditorLink">链接</el-button>
              <div class="wiki-editor-color-palette">
                <button
                  v-for="item in WIKI_EDITOR_COLORS"
                  :key="`wiki-detail-color-${item.value}`"
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
                <input type="file" accept="image/*" class="hidden-file-input" @change="(event) => insertWikiMedia(event, 'image')" />
              </label>
              <label class="upload-btn">
                插入视频
                <input type="file" accept="video/*" class="hidden-file-input" @change="(event) => insertWikiMedia(event, 'video')" />
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
          <div v-else class="wiki-detail-content rich-text-content" v-html="wikiDetail.article.content || ''"></div>
          <el-divider />
          <div class="wiki-detail-attachments" :class="getWikiAttachmentSectionClass(wikiDetail.article.attachments)">
            <div class="wiki-detail-attachments-head">
              <div class="ticket-attachments-title">附件</div>
              <span v-if="getWikiAttachmentCount(wikiDetail.article.attachments) > 0" class="wiki-detail-attachments-count">
                {{ getWikiAttachmentCount(wikiDetail.article.attachments) }} 个
              </span>
            </div>
            <div v-if="getWikiAttachmentCount(wikiDetail.article.attachments) > 0" class="wiki-attachment-list wiki-detail-attachment-list">
              <div v-for="(item, idx) in wikiDetail.article.attachments" :key="`${item.url}-${idx}`" class="wiki-attachment-item">
                <a :href="item.url" target="_blank" rel="noreferrer">{{ item.name || `附件${idx + 1}` }}</a>
              </div>
            </div>
            <div v-else class="wiki-detail-attachment-empty">当前文章没有附件</div>
          </div>
        </div>
      </template>
    </el-card>
  </section>
</template>

<script setup>
import { inject } from "vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("WikiPage requires appCtx");
}

const {
  activeTab,
  wikiViewMode,
  backToWikiList,
  wikiDetailEditing,
  openWikiDialog,
  wikiFilter,
  setWikiCategoryFilter,
  wikiCategories,
  pagedWikiArticles,
  openWikiDetailPageByRow,
  formatDynamicTime,
  openWikiDetailEditPage,
  openWikiDetailPage,
  removeWikiArticle,
  user,
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
} = appCtx;
</script>

<style scoped>
.wiki-card {
  min-height: 620px;
  padding-bottom: 8px;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  box-shadow: none;
  background: #ffffff;
}

.wiki-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wiki-card-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.wiki-category-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.wiki-editor-wrap {
  width: 100%;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}

.wiki-editor-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #edf0f2;
  background: #f9fafb;
  flex-wrap: wrap;
  align-items: center;
}

.wiki-editor-toolbar .upload-btn {
  height: 24px;
  padding: 0 10px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  border-color: #e6e8ec;
  color: #475569;
  background: #ffffff;
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
  border: 1px solid #e6e8ec;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.wiki-editor-color-dot:hover {
  border-color: #d4d9e1;
}

.wiki-editor-color-dot.active {
  border-color: #bfdbfe;
  box-shadow: 0 0 0 2px rgba(191, 219, 254, 0.5);
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
  border: 1px solid #e6e8ec;
  border-radius: 6px;
  padding: 6px 10px;
  background: #fff;
}

.wiki-detail-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wiki-detail-title {
  margin: 0 0 10px;
}

.wiki-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.wiki-detail-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.wiki-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #606266;
  font-size: 13px;
}

.wiki-detail-attachments {
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  background: #ffffff;
  padding: 8px 10px;
}

.wiki-detail-attachments.is-empty {
  padding: 6px 10px;
}

.wiki-detail-attachments-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wiki-detail-attachments-count {
  font-size: 12px;
  color: #909399;
}

.wiki-detail-attachment-list {
  margin-top: 6px;
}

.wiki-detail-attachment-empty {
  margin-top: 4px;
  font-size: 12px;
  color: #a0a7b4;
}

.wiki-detail-attachments :deep(.ticket-attachments-title) {
  font-weight: 600;
  font-size: 13px;
}

.wiki-detail-attachments .wiki-attachment-item {
  padding: 5px 8px;
  border-radius: 6px;
}

.wiki-detail-attachments.is-few .wiki-detail-attachment-list {
  grid-template-columns: 1fr;
  gap: 5px;
}

.wiki-detail-attachments.is-medium .wiki-detail-attachment-list {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.wiki-detail-attachments.is-many .wiki-detail-attachment-list {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  max-height: 188px;
  overflow: auto;
  padding-right: 4px;
}

.wiki-detail-content {
  min-height: 420px;
  line-height: 1.7;
  color: #303133;
}

.wiki-detail-content :deep(img),
.wiki-detail-content :deep(video) {
  max-width: 100%;
}
</style>
