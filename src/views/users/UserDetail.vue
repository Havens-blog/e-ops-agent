<script setup lang="ts">
// 用户详情（UF-4 子页）—— 占位视图，由 task 4.2 实现。
// 路由 /users/:id；返回导航回 /users。
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <section class="page-user-detail">
    <el-button text @click="router.push('/users')">← 返回用户列表</el-button>
    <h2>用户详情</h2>
    <p class="placeholder">用户详情（UF-4 子页）待 task 4.2 实现。</p>
  </section>
</template>
