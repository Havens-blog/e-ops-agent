<script setup lang="ts">
/**
 * 403 页（router 守卫链 ③ 裁剪不通过的目标页，tech-design §Architecture 守卫链）。
 *
 * 文案出口走 2.5 文案契约 `forbidden`（逐字渲染「无权限执行该操作」，Hard Rule：零二次映射）。
 * 与请求层 403（forbidden kind → 原地 toast）同口径同契约 key，区别仅在呈现位置：
 * - 请求层 403：当前页 toast（不跳转，tech-design §Error Handling）；
 * - 守卫 403：URL 直入越权页 → 跳本页（承接 Story 3 / Story 5）。
 *
 * 返回导航：回工作台（守卫放行后可到达的默认页）。
 */
import { useRouter } from 'vue-router'
import CopyContractText from '@/components/CopyContractText.vue'

const router = useRouter()
</script>

<template>
  <section class="forbidden-page" role="alert" aria-live="polite">
    <CopyContractText code="forbidden" tag="p" />
    <el-button type="primary" plain @click="router.push('/workbench')">返回工作台</el-button>
  </section>
</template>
