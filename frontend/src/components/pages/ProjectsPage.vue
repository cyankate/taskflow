<template>
  <section v-if="user.is_admin" v-show="activeTab === 'projects'" class="management-page">
    <div class="toolbar">
      <el-button type="primary" @click="openProjectDialog()" :disabled="!user.is_admin">新增项目</el-button>
    </div>
    <el-table :data="projects" stripe class="projects-table">
      <el-table-column prop="name" label="项目名" width="180" />
      <el-table-column prop="description" label="描述" />
      <el-table-column label="默认项目" width="120">
        <template #default="scope">{{ scope.row.is_default ? "是" : "否" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="260">
        <template #default="scope">
          <el-button link type="primary" class="management-action-btn" @click="openProjectDialog(scope.row)" :disabled="!user.is_admin">编辑</el-button>
          <el-button link type="warning" class="management-action-btn" @click="setDefaultProject(scope.row)" :disabled="!user.is_admin">设为默认</el-button>
          <el-button link type="danger" class="management-action-btn" @click="removeProject(scope.row)" :disabled="!user.is_admin">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup>
import { inject } from "vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("ProjectsPage requires appCtx");
}

const { user, activeTab, projects, openProjectDialog, setDefaultProject, removeProject } = appCtx;
</script>

<style scoped>
.management-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toolbar {
  display: flex;
  gap: 8px;
}

.projects-table :deep(.el-table__cell) {
  font-size: var(--tf-font-body);
  padding-top: var(--tf-table-cell-padding-y);
  padding-bottom: var(--tf-table-cell-padding-y);
}

.projects-table :deep(.el-table__header .el-table__cell) {
  font-size: var(--tf-font-subtitle);
  font-weight: var(--tf-font-medium);
  color: var(--tf-color-text-heading);
  background: var(--tf-color-table-header-bg);
}

.management-action-btn {
  font-size: var(--tf-font-caption);
}
</style>
