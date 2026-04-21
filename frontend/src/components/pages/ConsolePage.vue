<template>
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
        <el-button
          type="primary"
          size="small"
          :disabled="!String(hotReload.serverContent || '').trim() && !String(hotReload.localPickedText || '').trim()"
          @click="openHotReloadDiff"
        >
          对比高亮
        </el-button>
        <el-tag v-if="hotReloadDiffers" type="warning" size="small" effect="plain">与服务器内容不一致</el-tag>
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
</template>

<script setup>
import { inject } from "vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("ConsolePage requires appCtx");
}

const {
  activeTab,
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
} = appCtx;
</script>

<style scoped>
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

@media (max-width: 960px) {
  .console-hotreload-main {
    grid-template-columns: 1fr;
  }
}
</style>
