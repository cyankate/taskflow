<template>
  <div class="ticket-time-slot-wrap">
    <div class="ticket-time-slot-group">
      <span class="ticket-time-slot-tag">开始</span>
      <el-date-picker
        v-model="startDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="日期"
        clearable
        class="ticket-time-date-picker"
      />
      <el-select v-model="startPeriod" placeholder="时段" clearable class="ticket-time-period-select">
        <el-option v-for="item in TICKET_TIME_PERIOD_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
    </div>
    <div class="ticket-time-slot-group">
      <span class="ticket-time-slot-tag">截止</span>
      <el-date-picker
        v-model="endDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="日期"
        clearable
        class="ticket-time-date-picker"
      />
      <el-select v-model="endPeriod" placeholder="时段" clearable class="ticket-time-period-select">
        <el-option v-for="item in TICKET_TIME_PERIOD_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
    </div>
  </div>
</template>

<script setup>
import { TICKET_TIME_PERIOD_OPTIONS } from "../../composables/taskflow/ticketTimeSlot";

const startDate = defineModel("startDate", { type: String, default: "" });
const startPeriod = defineModel("startPeriod", { type: String, default: "" });
const endDate = defineModel("endDate", { type: String, default: "" });
const endPeriod = defineModel("endPeriod", { type: String, default: "" });
</script>

<style scoped>
.ticket-time-slot-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.ticket-time-slot-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ticket-time-slot-tag {
  width: 32px;
  flex-shrink: 0;
  font-size: var(--tf-font-caption);
  color: #64748b;
}

.ticket-time-date-picker {
  width: 148px;
}

.ticket-time-period-select {
  width: 96px;
}
</style>
