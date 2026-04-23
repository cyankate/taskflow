<template>
  <section v-if="user.is_admin" v-show="activeTab === 'users'" class="management-page">
    <div class="toolbar">
      <el-button type="primary" @click="openUserDialog()" :disabled="!user.is_admin">新增用户</el-button>
    </div>
    <el-table :data="users" stripe class="users-table">
      <el-table-column prop="username" label="账号" width="150" />
      <el-table-column prop="display_name" label="姓名" width="160" />
      <el-table-column prop="position" label="岗位" width="120" />
      <el-table-column label="管理员" width="100">
        <template #default="scope">{{ scope.row.is_admin ? "是" : "否" }}</template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="scope">
          <el-button link type="primary" class="management-action-btn" @click="openUserDialog(scope.row)" :disabled="!user.is_admin">编辑</el-button>
          <el-button link type="danger" class="management-action-btn" @click="removeUser(scope.row)" :disabled="!user.is_admin">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup>
import { inject } from "vue";

const appCtx = inject("appCtx");
if (!appCtx) {
  throw new Error("UsersPage requires appCtx");
}

const { user, activeTab, users, openUserDialog, removeUser } = appCtx;
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

.users-table :deep(.el-table__cell) {
  font-size: 12px;
  padding-top: 10px;
  padding-bottom: 10px;
}

.users-table :deep(.el-table__header .el-table__cell) {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  background: #f9fafb;
}

.management-action-btn {
  font-size: 11px;
}
</style>
