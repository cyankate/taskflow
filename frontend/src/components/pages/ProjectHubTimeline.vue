<template>
  <div class="hub-timeline">
    <div class="hub-timeline-toolbar">
      <div class="hub-timeline-summary">
        <span>已排期 {{ model.summary.scheduled }} / {{ model.summary.total }}</span>
        <span v-if="model.summary.hiddenScheduled">较早排期 {{ model.summary.hiddenScheduled }} 条未显示</span>
        <span v-if="model.summary.unscheduled">未排期 {{ model.summary.unscheduled }}</span>
        <span>跨今日 {{ model.summary.spanningToday }}</span>
      </div>
      <span class="hub-timeline-range">{{ model.rangeLabel }}</span>
      <el-button size="small" @click="scrollToToday">定位今天</el-button>
      <div class="hub-timeline-legend">
        <span class="hub-timeline-legend-item"><i class="tone active" />进行中</span>
        <span class="hub-timeline-legend-item"><i class="tone overdue" />逾期</span>
        <span class="hub-timeline-legend-item"><i class="tone done" />已完成</span>
        <span class="hub-timeline-legend-item"><i class="tone open" />未设截止</span>
      </div>
    </div>

    <div v-if="!model.summary.scheduled && !model.unscheduled.length" class="hub-timeline-empty-wrap">
      <el-empty description="当前筛选下暂无工单" :image-size="72" />
    </div>

    <div v-else ref="scrollRef" class="hub-timeline-scroll">
      <div class="hub-timeline-grid" :style="{ minWidth: `${model.axisMinWidth}px` }">
        <div class="hub-timeline-header">
          <div class="hub-timeline-label-col">工单</div>
          <div class="hub-timeline-axis">
            <div
              v-for="(band, idx) in model.weekendBands"
              :key="`weekend-${idx}`"
              class="hub-timeline-weekend-band"
              :style="{ left: `${band.left}%`, width: `${band.width}%` }"
            />
            <div
              v-for="(line, idx) in model.dayGridLines"
              :key="`grid-${idx}`"
              class="hub-timeline-day-grid"
              :class="{ weekend: line.weekend }"
              :style="{ left: `${line.left}%` }"
            />
            <div
              v-for="tick in model.ticks"
              :key="tick.date"
              class="hub-timeline-tick"
              :class="{ weekend: tick.weekend, major: tick.isMajor }"
              :style="{ left: `${tick.left}%` }"
            >
              {{ tick.label }}
            </div>
            <div class="hub-timeline-today-line" :style="{ left: `${model.todayPct}%` }" title="今天" />
          </div>
        </div>

        <template v-for="(section, sIdx) in model.sections" :key="`section-${sIdx}`">
          <div v-if="section.type === 'group'" class="hub-timeline-group-head">
            {{ section.label }}
          </div>
          <div
            v-for="row in section.rows"
            :key="`row-${row.ticket.id}`"
            class="hub-timeline-row"
            @click="handleTicketRowClick(row.ticket)"
          >
            <div class="hub-timeline-label-col hub-timeline-row-label" :title="row.label">
              <span class="hub-timeline-row-title">{{ row.label }}</span>
              <span class="hub-timeline-row-meta">{{ row.dateRangeText }} · {{ row.status }} · {{ row.owner }}</span>
            </div>
            <div class="hub-timeline-axis hub-timeline-axis-row">
              <div
                v-for="(band, idx) in model.weekendBands"
                :key="`row-weekend-${row.ticket.id}-${idx}`"
                class="hub-timeline-weekend-band"
                :style="{ left: `${band.left}%`, width: `${band.width}%` }"
              />
              <div
                v-for="(line, idx) in model.dayGridLines"
                :key="`row-grid-${row.ticket.id}-${idx}`"
                class="hub-timeline-day-grid"
                :class="{ weekend: line.weekend }"
                :style="{ left: `${line.left}%` }"
              />
              <div class="hub-timeline-today-line" :style="{ left: `${model.todayPct}%` }" />
              <div
                v-if="row.bar"
                class="hub-timeline-bar"
                :class="[
                  `is-${row.bar.tone}`,
                  { 'is-open': row.bar.openEnded, 'is-milestone': row.bar.milestone },
                ]"
                :style="{ left: `${row.bar.left}%`, width: `${row.bar.width}%` }"
                :title="row.tooltip"
              >
                <span v-if="row.bar.showEdgeLabels" class="hub-timeline-bar-edge hub-timeline-bar-edge-start">
                  {{ row.bar.startLabel }}
                </span>
                <span class="hub-timeline-bar-text">#{{ row.ticket.id }}</span>
                <span v-if="row.bar.showEdgeLabels && !row.bar.sameDay" class="hub-timeline-bar-edge hub-timeline-bar-edge-end">
                  {{ row.bar.endLabel }}
                </span>
                <span v-else-if="row.bar.showEdgeLabels && row.bar.sameDay" class="hub-timeline-bar-edge hub-timeline-bar-edge-end is-same-day">
                  当日
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="model.unscheduled.length" class="hub-timeline-unscheduled">
      <div class="hub-timeline-unscheduled-title">未设置开始/截止（{{ model.unscheduled.length }}）</div>
      <div class="hub-timeline-unscheduled-list">
        <button
          v-for="ticket in model.unscheduled"
          :key="`unscheduled-${ticket.id}`"
          type="button"
          class="hub-timeline-unscheduled-chip"
          @click="handleTicketRowClick(ticket)"
        >
          #{{ ticket.id }} {{ ticket.title }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onMounted, ref, unref, watch } from "vue";
import { buildProjectHubTimelineModel } from "../../composables/taskflow/useProjectHubTimeline";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("ProjectHubTimeline requires appCtx");
}

const {
  projectHubFilteredTickets,
  projectHubRoleKey,
  users,
  handleTicketRowClick,
  isTicketOverdue,
} = appCtx;

const scrollRef = ref(null);

const model = computed(() =>
  buildProjectHubTimelineModel({
    tickets: unref(projectHubFilteredTickets) || [],
    users: unref(users) || [],
    roleKey: unref(projectHubRoleKey) || null,
    isOverdue: isTicketOverdue,
  }),
);

function scrollToToday() {
  const el = scrollRef.value;
  if (!el) return;
  const trackWidth = Math.max(el.scrollWidth - el.clientWidth, 0);
  const target = (model.value.todayPct / 100) * el.scrollWidth - el.clientWidth / 2;
  el.scrollLeft = Math.max(0, Math.min(target, trackWidth));
}

watch(
  () => model.value.rangeLabel,
  () => {
    nextTick(() => scrollToToday());
  },
);

onMounted(() => {
  nextTick(() => scrollToToday());
});
</script>

<style scoped>
.hub-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.hub-timeline-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 8px 10px;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  background: #f8fafc;
}

.hub-timeline-summary {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: var(--tf-font-caption);
  color: #64748b;
}

.hub-timeline-range {
  font-size: var(--tf-font-caption);
  color: #475569;
}

.hub-timeline-legend {
  margin-left: auto;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: var(--tf-font-caption);
  color: #64748b;
}

.hub-timeline-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hub-timeline-legend-item i {
  width: 14px;
  height: 8px;
  border-radius: 3px;
  display: inline-block;
}

.hub-timeline-legend-item i.tone.active {
  background: #3b82f6;
}

.hub-timeline-legend-item i.tone.overdue {
  background: #ef4444;
}

.hub-timeline-legend-item i.tone.done {
  background: #94a3b8;
}

.hub-timeline-legend-item i.tone.open {
  background: #93c5fd;
  border: 1px dashed #3b82f6;
}

.hub-timeline-scroll {
  flex: 1;
  overflow: auto;
  border: 1px solid #e6e8ec;
  border-radius: 8px;
  background: #fff;
  min-height: min(calc(100vh - 320px), 720px);
  max-height: min(calc(100vh - 280px), 820px);
  height: min(calc(100vh - 280px), 820px);
}

.hub-timeline-grid {
  min-width: 100%;
}

.hub-timeline-header,
.hub-timeline-row {
  display: grid;
  grid-template-columns: 220px minmax(640px, 1fr);
  border-bottom: 1px solid #edf0f2;
}

.hub-timeline-header {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #f9fafb;
}

.hub-timeline-label-col {
  padding: 8px 10px;
  border-right: 1px solid #edf0f2;
  font-size: var(--tf-font-caption);
  color: #64748b;
  font-weight: 500;
}

.hub-timeline-axis {
  position: relative;
  min-height: 36px;
}

.hub-timeline-axis-row {
  min-height: 36px;
}

.hub-timeline-tick {
  position: absolute;
  top: 6px;
  transform: translateX(0);
  padding-left: 4px;
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  z-index: 1;
}

.hub-timeline-tick.major {
  font-weight: 600;
  color: #64748b;
}

.hub-timeline-tick.weekend {
  color: #cbd5e1;
}

.hub-timeline-weekend-band {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #f8fafc;
  pointer-events: none;
}

.hub-timeline-day-grid {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: #e8ecf1;
  pointer-events: none;
  z-index: 0;
}

.hub-timeline-day-grid.weekend {
  background: #e2e8f0;
}

.hub-timeline-today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #f56c6c;
  opacity: 0.85;
  pointer-events: none;
  z-index: 2;
}

.hub-timeline-group-head {
  padding: 6px 12px;
  font-size: var(--tf-font-body);
  font-weight: 500;
  color: #334155;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.hub-timeline-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.hub-timeline-row:hover {
  background: #f8fbff;
}

.hub-timeline-row-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hub-timeline-row-title {
  font-size: var(--tf-font-body);
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-timeline-row-meta {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-timeline-bar {
  position: absolute;
  top: 50%;
  height: 20px;
  margin-top: -10px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 4px;
  min-width: 20px;
  z-index: 2;
  box-sizing: border-box;
  overflow: visible;
}

.hub-timeline-bar-edge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 2px rgba(15, 23, 42, 0.35);
  white-space: nowrap;
}

.hub-timeline-bar-edge-start {
  margin-right: auto;
}

.hub-timeline-bar-edge-end {
  margin-left: auto;
}

.hub-timeline-bar-edge-end.is-same-day {
  font-weight: 500;
  opacity: 0.92;
}

.hub-timeline-bar.is-active {
  background: rgba(59, 130, 246, 0.82);
  border: 1px solid rgba(37, 99, 235, 0.5);
}

.hub-timeline-bar.is-overdue {
  background: rgba(239, 68, 68, 0.82);
  border: 1px solid rgba(185, 28, 28, 0.55);
}

.hub-timeline-bar.is-done {
  background: rgba(148, 163, 184, 0.75);
  border: 1px solid rgba(100, 116, 139, 0.45);
}

.hub-timeline-bar.is-open {
  background: rgba(147, 197, 253, 0.55);
  border: 1px dashed rgba(37, 99, 235, 0.65);
}

.hub-timeline-bar.is-milestone {
  height: 14px;
  margin-top: -7px;
  border-radius: 999px;
  min-width: 10px;
}

.hub-timeline-bar-text {
  font-size: 11px;
  color: #fff;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 0 1 auto;
  max-width: 42%;
}

.hub-timeline-unscheduled {
  padding: 10px 12px;
  border: 1px dashed #dbe2ea;
  border-radius: 8px;
  background: #fafbfc;
}

.hub-timeline-unscheduled-title {
  font-size: var(--tf-font-caption);
  color: #64748b;
  margin-bottom: 8px;
}

.hub-timeline-unscheduled-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hub-timeline-unscheduled-chip {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: var(--tf-font-caption);
  color: #475569;
  cursor: pointer;
}

.hub-timeline-unscheduled-chip:hover {
  border-color: #93c5fd;
  color: #2563eb;
}

.hub-timeline-empty-wrap {
  padding: 24px 0;
}
</style>
