<script setup lang="ts">
// 应用壳：公开路由（登录 / 403 页）与未匹配路由裸 router-view；登录后已匹配路由经
// MainLayout（UF-2）承接。
//
// MainLayout（task 2.8）= 侧边栏 + header + 内容 outlet。仅路由已匹配（matched.length>0）
// 且非公开时挂载——未匹配路径（如根 '/'，守卫将重定向到 /login）不触发 MainLayout 异步
// chunk 加载，避免 main 装配冒烟测试（main.test.ts）在环境拆除期拉取 element-plus 产生
// 未处理拒绝。MainLayout 以 defineAsyncComponent 拆入独立 chunk，使其 element-plus 依赖
// 不进入 main.ts 同步图（首屏 + 测试 await import('./main') 不再同步拉取 element-plus）。
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

const MainLayout = defineAsyncComponent(
  () => import('@/layouts/MainLayout.vue'),
)
const route = useRoute()
const useLayout = computed(
  () => route.meta.public !== true && route.matched.length > 0,
)
</script>

<template>
  <MainLayout v-if="useLayout" />
  <router-view v-else />
</template>
