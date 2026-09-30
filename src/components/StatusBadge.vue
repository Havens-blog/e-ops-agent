<script setup lang="ts">
// StatusBadge 共享组件（4.1，tech-design 三共享组件之一）：7 个列表页共用的状态徽章。
// 口径来源：
// - docs/features/platform-console/ui/ui-design.md §状态徽章映射（三态视觉 + 软着色规则）
// - docs/features/platform-console/design/tech-design.md §Data Models User.status 归一
// 三态：启用（accent-green 16% 底）/ 禁用（tag-bg + text-regular）/ 锁定（color-warning 16% 底）。
// 软着色 = 语义色 16% 透明底 + 语义色文字（浅色主题经 color-mix 加深保 AA），不硬编码色值。
// Parity G-9：eiam 锁定态无数据源，「锁定」按词表占位、缺数据降级为禁用态展示。
// Hard Rule：success/warning 语义色仅用于状态/结果反馈；danger 保留给删除/危险操作。
import { computed } from 'vue'
import {
  STATUS_VOCAB,
  rawToDisplayStatus,
  toDisplayStatus,
  normalizeStatus,
  type DisplayStatus,
} from '@/utils/statusMap'

const props = defineProps<{
  /**
   * 状态值。接受三种输入：
   * - eiam 原值（'active' / 'disable' / 未知串）→ 经 normalizeStatus + toDisplayStatus 归一；
   * - 已归一值（'active' / 'disable' / 'unknown'）→ 同上路径；
   * - 展示态 'locked'（G-9 占位态，eiam 暂无数据源；显式传入即渲染锁定徽章）。
   */
  status: string
  /** icon-only 场景：仅渲染圆点 + aria-label（无可见文字），用于紧凑列表列 */
  iconOnly?: boolean
  /** 可见尺寸：sm = 12px 文本（紧凑表格列），md = 14px 文本（默认） */
  size?: 'sm' | 'md'
}>()

const display = computed<DisplayStatus>(() => {
  // 'locked' 为 G-9 占位态，显式传入即锁定（eiam 暂无锁定数据源，归一路径不产出）
  if (props.status === 'locked') return 'locked'
  // 'active' / 'disable' 走 normalize 路径（未知串归一 'unknown' → 降级禁用）
  if (props.status === 'active' || props.status === 'disable') {
    return toDisplayStatus(normalizeStatus(props.status))
  }
  // 已归一 'unknown' 或任意未知串 → 降级禁用（G-9：缺数据降级禁用态展示，不崩）
  if (props.status === 'unknown') return 'disabled'
  return rawToDisplayStatus(props.status)
})

const vocab = computed(() => STATUS_VOCAB[display.value])

const label = computed(() => vocab.value.label)
const tone = computed(() => vocab.value.tone)
</script>

<template>
  <span
    class="status-badge"
    :class="[`status-badge--${tone}`, `status-badge--${size ?? 'md'}`]"
    :aria-label="iconOnly ? label : undefined"
    :role="iconOnly ? 'img' : undefined"
  >
    <span v-if="iconOnly" class="status-badge__dot" aria-hidden="true" />
    <template v-else>{{ label }}</template>
  </span>
</template>

<style scoped lang="scss">
// 软着色：语义色 16% 透明底 + 语义色文字，全部经 CSS 变量，不硬编码色值。
// 浅色主题文字经 color-mix 加深保 AA（ui-design §状态徽章映射 实测对比度）。
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px; // 统一 8px 圆角（ui-design §组件规范）
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;

  &--md {
    padding: 2px 10px; // px-2.5 ≈ 10px
    font-size: 14px;
  }

  &--sm {
    padding: 1px 8px;
    font-size: 12px;
  }

  // 启用：accent-green 16% 底 + accent-green 文字（浅色 color-mix 72% 黑加深）
  &--success {
    background-color: color-mix(in srgb, var(--accent-green) 16%, transparent);
    color: var(--accent-green);
  }

  // 锁定：color-warning 16% 底 + color-warning 文字（浅色 color-mix 60% 黑加深）
  &--warning {
    background-color: color-mix(in srgb, var(--color-warning) 16%, transparent);
    color: var(--color-warning);
  }

  // 禁用：tag-bg 底 + text-regular 文字（中性，不用 danger）
  &--neutral {
    background-color: var(--tag-bg);
    color: var(--text-regular);
  }

  &__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: currentColor; // 继承语义色文字色，不硬编码
  }
}

// 浅色主题文字加深（保 AA）：深色默认主题 accent-green/color-warning 直接用足够对比度，
// 浅色主题（:root.light）文字色经 color-mix 混黑加深。
:global(:root.light) {
  .status-badge--success {
    color: color-mix(in srgb, var(--accent-green) 72%, black);
  }

  .status-badge--warning {
    color: color-mix(in srgb, var(--color-warning) 60%, black);
  }
  // neutral（tag-bg + text-regular）浅色主题对比度 11.0:1，无需加深
}
</style>
