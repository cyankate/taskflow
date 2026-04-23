<template>
  <section class="ticket-detail-page">
    <div class="ticket-detail-head">
      <h3 class="ticket-detail-title">
        <span
          class="ticket-type-art"
          :class="ticketDetail.ticket.ticket_type === 'BUG单' ? 'bug' : 'demand'"
          @click.stop="copyTicketId(ticketDetail.ticket.id)"
        >
          <span>{{ ticketDetail.ticket.ticket_type || "需求单" }}</span>
          <span class="ticket-type-art-sep">-</span>
          <span class="ticket-type-art-id">
            {{ ticketDetail.ticket.id || "-" }}
          </span>
        </span>
        <span class="ticket-title-text">{{ ticketDetail.ticket.title }}</span>
      </h3>
      <div class="ticket-detail-actions">
        <el-button size="small" plain @click="closeTicketDetail">返回列表</el-button>
        <el-button
          v-if="ticketDetail.ticket.ticket_type !== 'BUG单'"
          size="small"
          plain
          type="primary"
          class="ticket-create-action-btn ticket-create-action-btn-subtask"
          @click="createSubTaskFromDetail"
        >
          新建子任务
        </el-button>
        <el-button
          v-if="ticketDetail.ticket.ticket_type !== 'BUG单'"
          size="small"
          plain
          type="primary"
          class="ticket-create-action-btn ticket-create-action-btn-bug"
          @click="createBugFromDetail"
        >
          新建BUG
        </el-button>
        <el-button size="small" type="primary" plain @click="toggleTicketFollow">
          {{ ticketDetail.ticket.is_following ? "取消关注" : "关注工单" }}
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
            <el-select v-model="ticketDetail.editForm.priority" class="w140 ml8" :disabled="!canEditTicketPriority(ticketDetail.ticket)">
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
        <div
          v-if="
            (ticketDetail.ticket.available_actions || []).includes('start') ||
            (ticketDetail.ticket.available_actions || []).includes('submit') ||
            (ticketDetail.ticket.available_actions || []).includes('approve') ||
            (ticketDetail.ticket.available_actions || []).includes('reject') ||
            (ticketDetail.ticket.available_actions || []).includes('reopen')
          "
          class="detail-side-block ticket-flow-actions"
        >
          <div class="ticket-flow-actions-row">
            <el-button
              v-if="(ticketDetail.ticket.available_actions || []).includes('start')"
              size="default"
              type="primary"
              plain
              @click="onTicketFlowAction('start')"
            >
              开始
            </el-button>
            <el-button
              v-if="(ticketDetail.ticket.available_actions || []).includes('submit')"
              size="default"
              type="success"
              plain
              @click="onTicketFlowAction('submit')"
            >
              提交
            </el-button>
            <el-button
              v-if="(ticketDetail.ticket.available_actions || []).includes('approve')"
              size="default"
              type="success"
              plain
              @click="onTicketFlowAction('approve')"
            >
              通过
            </el-button>
            <el-button
              v-if="(ticketDetail.ticket.available_actions || []).includes('reject')"
              size="default"
              type="danger"
              plain
              @click="onTicketFlowAction('reject')"
            >
              驳回
            </el-button>
            <el-button
              v-if="(ticketDetail.ticket.available_actions || []).includes('reopen')"
              size="default"
              type="warning"
              plain
              @click="onTicketFlowAction('reopen')"
            >
              重开
            </el-button>
          </div>
        </div>
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
                :class="['ticket-quick-item', 'ticket-quick-priority', getPriorityToneClass(ticketDetail.quickForm.priority)]"
                :disabled="!canEditTicketPriority(ticketDetail.ticket)"
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
            <el-descriptions-item label="ID">#{{ ticketDetail.ticket.id || "-" }}</el-descriptions-item>
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
              <el-select
                v-model="ticketDetail.quickForm.executor_id"
                size="small"
                clearable
                filterable
                class="ticket-role-select"
                popper-class="role-select-popper"
                placeholder="请选择执行人"
                @change="saveTicketAssigneeQuick"
              >
                <el-option
                  v-for="item in getExecutorCandidates(ticketDetail.ticket.ticket_type, ticketDetail.ticket.sub_type)"
                  :key="`detail-executor-${item.id}`"
                  :label="item.display_name || item.username"
                  :value="item.id"
                />
              </el-select>
            </div>
            <div class="ticket-flow-role-item">
              <span class="ticket-assignee-position">策划</span>
              <el-select
                v-model="ticketDetail.quickForm.planner_id"
                size="small"
                clearable
                filterable
                class="ticket-role-select"
                popper-class="role-select-popper"
                placeholder="请选择策划"
                @change="saveTicketAssigneeQuick"
              >
                <el-option
                  v-for="item in users.filter((x) => x.position === '策划')"
                  :key="`detail-planner-${item.id}`"
                  :label="item.display_name || item.username"
                  :value="item.id"
                />
              </el-select>
            </div>
            <div class="ticket-flow-role-item">
              <span class="ticket-assignee-position">测试</span>
              <el-select
                v-model="ticketDetail.quickForm.tester_id"
                size="small"
                clearable
                filterable
                class="ticket-role-select"
                popper-class="role-select-popper"
                placeholder="请选择测试"
                @change="saveTicketAssigneeQuick"
              >
                <el-option
                  v-for="item in users.filter((x) => x.position === '测试')"
                  :key="`detail-tester-${item.id}`"
                  :label="item.display_name || item.username"
                  :value="item.id"
                />
              </el-select>
            </div>
            <div class="ticket-flow-role-item">
              <span class="ticket-assignee-position">当前处理人</span>
              <div class="ticket-current-owner-wrap">
                <el-tag
                  v-if="ticketDetail.ticket.current_owner_name"
                  size="small"
                  effect="light"
                  class="ticket-current-owner-tag"
                >
                  {{ ticketDetail.ticket.current_owner_name }}
                </el-tag>
                <span v-else class="ticket-assignee-members">-</span>
              </div>
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
</template>

<script setup>
import { inject } from "vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("TicketDetailPage requires appCtx");
}

const {
  ticketDetail,
  copyTicketId,
  closeTicketDetail,
  createSubTaskFromDetail,
  createBugFromDetail,
  toggleTicketFollow,
  saveTicketDetailEdit,
  descriptionToolbarState,
  applyDescriptionCommand,
  toggleDescriptionBlockquote,
  onDescriptionFontSizeChange,
  DESCRIPTION_FONT_SIZES,
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
  openTicketDetail,
  isTicketOverdue,
  meta,
  getExecutorCandidates,
  users,
  taskTicketOptions,
  onDetailProjectChange,
  projects,
  versions,
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
  formatDynamicTime,
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
} = appCtx;
</script>

<style scoped>
.ticket-detail-page {
  min-height: calc(100vh - 140px);
  padding: 8px 4px 24px;
  overflow: auto;
  --detail-side-top: 10px;
}

.ticket-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafd;
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

.ticket-type-art {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  height: 24px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 12px;
  letter-spacing: 0;
  font-weight: 700;
  border: 1px solid transparent;
  white-space: nowrap;
  cursor: copy;
}

.ticket-type-art-sep {
  opacity: 0.85;
}

.ticket-type-art-id {
  cursor: copy;
  padding: 0 1px;
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
  margin-top: 10px;
  align-items: stretch;
  min-height: calc(100vh - 240px);
}

.ticket-detail-main {
  min-width: 0;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5eaf2;
  border-radius: 10px;
  background: #ffffff;
  padding: 0 14px 14px;
}

.ticket-detail-side {
  position: sticky;
  top: var(--detail-side-top);
  align-self: stretch;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.detail-stream-section {
  padding: 12px 0;
  border-bottom: 1px solid #e5eaf2;
}

.detail-stream-section:first-child {
  padding-top: 10px;
}

.detail-stream-section:last-child {
  border-bottom: none;
  padding-bottom: 4px;
}

.detail-side-block {
  padding: 0 0 12px;
  border-bottom: 1px solid #edf1f7;
}

.detail-side-block:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.ticket-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ticket-create-action-btn {
  --el-button-bg-color: #f4f8ff;
  --el-button-border-color: #c9dcff;
  --el-button-text-color: #356ebf;
  --el-button-hover-bg-color: #eaf3ff;
  --el-button-hover-border-color: #a9c8ff;
  --el-button-hover-text-color: #2f5ea8;
  --el-button-active-bg-color: #dfeeff;
  --el-button-active-border-color: #8eb5ff;
  --el-button-active-text-color: #294f8c;
}

.ticket-create-action-btn-bug {
  --el-button-bg-color: #fff6ec;
  --el-button-border-color: #ffd7ac;
  --el-button-text-color: #c5751f;
  --el-button-hover-bg-color: #ffefd9;
  --el-button-hover-border-color: #ffc585;
  --el-button-hover-text-color: #ad6518;
  --el-button-active-bg-color: #ffe6c5;
  --el-button-active-border-color: #ffb867;
  --el-button-active-text-color: #96550f;
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
  min-height: 340px;
  padding: 14px 16px;
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
  min-height: 340px;
  padding: 14px 16px;
  border: 1px solid #eef2f8;
  border-radius: 8px;
  background: #fcfdff;
}

.rich-text-content :deep(p) {
  margin: 0 0 8px;
}

.rich-text-content :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text-content :deep(ul),
.rich-text-content :deep(ol),
.ticket-description-editor :deep(ul),
.ticket-description-editor :deep(ol) {
  margin: 6px 0 8px 20px;
}

.rich-text-content :deep(blockquote),
.ticket-description-editor :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 10px;
  border-left: 3px solid #c8d7f2;
  color: #5b6575;
  background: #f7f9fd;
}

.ticket-related-board {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.ticket-related-link {
  padding: 0;
  max-width: calc(100% - 70px);
  justify-content: flex-start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.related-status-wrap {
  display: inline-flex;
  align-items: center;
}

.status-overdue-tag {
  margin-left: 6px;
}

.status-overdue-tag-inline {
  margin-left: 0;
  flex-shrink: 0;
}

.ticket-detail-edit-form {
  margin-bottom: 0;
}

.ticket-attachments-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ticket-attachments-title-wrap {
  min-width: 0;
}

.ticket-attachments-title {
  font-weight: 600;
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

.ticket-flow-actions-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

.ticket-quick-label {
  font-size: 12px;
  color: #7f8a9a;
}

.ticket-quick-status-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ticket-status-text {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  color: #4b5b71;
  font-weight: 600;
}

.ticket-quick-item {
  width: 100%;
}

.ticket-quick-priority {
  width: 112px;
}

.ticket-quick-item :deep(.el-input__wrapper),
.ticket-quick-item :deep(.el-select__wrapper) {
  background: #f7f8fa;
  border-color: #dfe3ea;
  box-shadow: none;
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
:deep(.role-select-popper .el-select-dropdown__item.is-selected) {
  color: #3a4a62;
  background: #edf1f6;
  font-weight: 500;
}

:deep(.role-select-popper .el-select-dropdown__item) {
  margin: 2px 6px;
  border-radius: 6px;
}

:deep(.role-select-popper .el-select-dropdown__item:hover) {
  background: #f3f5f8;
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

.ticket-assignee-title {
  font-weight: 600;
  margin-bottom: 8px;
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

.ticket-assignee-position {
  color: #909399;
  font-size: 12px;
}

.ticket-role-select {
  width: 100%;
}

.ticket-current-owner-wrap {
  min-height: 24px;
  display: flex;
  align-items: center;
}

.ticket-current-owner-tag {
  border-color: #d8e0eb;
  color: #3d4c63;
  background: #f6f8fb;
  font-weight: 500;
}

.ticket-assignee-members {
  color: #303133;
  line-height: 1.5;
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

@media (max-width: 1280px) {
  .ticket-detail-layout {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .ticket-detail-main {
    min-height: auto;
  }

  .ticket-detail-side {
    position: static;
    top: auto;
    min-height: auto;
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }

  .ticket-related-board {
    gap: 8px;
  }
}
</style>
