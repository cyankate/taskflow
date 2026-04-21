<template>
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
.toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
</style>
