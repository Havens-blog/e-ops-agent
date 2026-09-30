<script setup lang="ts">
// 契约渲染组件（2.5，tech-design 三共享组件之一）：全部文案出口统一经此渲染。
// - 已知契约 key → 逐字渲染契约文案（占位符 {X}/{n}/{m}/{name} 经 params 插值）；
// - 未知 code（eiam 返回原文 / ApiError.message）→ 纯文本渲染原文，不做任何变换；
// - Hard Rule：eiam 返回内容一律纯文本/组件化渲染，禁用 v-html —— 本组件仅用 {{ }} 插值（Vue 默认转义）；
// - 字段级错误接线：表单将输入控件 aria-describedby 指向本组件渲染节点 id（attrs 透传），错误文案就近输出。
import { computed } from 'vue'
import { contractText, formatContractText, type ContractParams } from '@/utils/copyContract'

const props = defineProps<{
  /** 契约 key（如 session.expired）或原文文案（如 ApiError.message） */
  code: string
  /** 占位符插值参数（仅对契约文案生效；原文不插值） */
  params?: ContractParams
  /** 渲染标签，默认 span（字段错误就近输出常用 p） */
  tag?: string
}>()

const text = computed(() => {
  const contract = contractText(props.code)
  // 未知 code：eiam 原文原样渲染（纯文本，不插值、不改写）
  if (contract === null) return props.code
  return formatContractText(contract, props.params)
})
</script>

<template>
  <component :is="tag ?? 'span'" class="copy-contract-text">{{ text }}</component>
</template>
