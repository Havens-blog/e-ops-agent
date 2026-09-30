import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

// 路由懒加载基建（2.1 交付，配置项就绪、不含业务实现）：
// 业务路由一律以 `() => import('@/views/...')` 动态导入登记，
// 由 Vite 按路由级代码分割（11 页全懒加载，承接性能预算与 2.6 全局守卫）。
export const routes: RouteRecordRaw[] = []

export const router = createRouter({
  // BASE_URL 来自 vite base '/console/'，与 nginx 同域反代形态一致
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
