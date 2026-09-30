<script setup lang="ts">
// 角色详情（UF-8 子页）—— 占位视图，由 task 5.1 实现。
// 路由 /roles/:id；返回导航回 /roles。
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <section class="page-role-detail">
    <el-button text @click="router.push('/roles')">← 返回角色列表</el-button>
    <h2>角色详情</h2>
    <p class="placeholder">角色详情（UF-8 子页）待 task 5.1 实现。</p>
  </section>
</template>
