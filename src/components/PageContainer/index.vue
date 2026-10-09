<template>
  <div class="page-container">
    <header v-if="hasHeaderChrome()" class="page-container__header">
      <slot name="header">
        <h2 v-if="title" class="page-container__title">{{ title }}</h2>
        <div v-if="$slots.actions" class="page-container__actions">
          <slot name="actions" />
        </div>
      </slot>
    </header>

    <div v-if="$slots.filters" class="page-container__filters">
      <slot name="filters" />
    </div>

    <div v-if="hasChrome()" class="page-container__body">
      <slot />
    </div>
    <slot v-else />

    <footer v-if="$slots.footer" class="page-container__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { useSlots } from 'vue'

/**
 * PageContainer 标准页面骨架（2.0，向后兼容 v1 空壳）。
 *
 * 四段式页面骨架：页头（title prop 快捷方式 + #actions 操作区，可被 #header
 * 整体覆盖）/ #filters 筛选区（放置 FilterBar）/ 默认插槽内容区 / #footer
 * 底部分页区（sticky 固定于滚动容器底部，如 el-pagination）。间距与滚动统一
 * 由组件承载：根节点即滚动容器（沿用 v1 的 overflow-y），各骨架区块自带
 * 统一内边距，body 内容区自动撑满使 footer 贴底。
 *
 * 向后兼容：不传任何新 prop/slot 时不渲染任何骨架区块，默认插槽直出于容器根，
 * DOM 与 v1 空壳（仅 default slot + 样式壳）完全一致，现有 29 个使用方零改动。
 * v1 使用方若写了 title= 原生属性，2.0 定义 title prop 后该透传语义转为组件
 * prop 并渲染页头，属兼容性增强而非破坏。
 */

interface Props {
  /** 页面标题（#header 插槽的快捷方式；传入即启用页头区并渲染为 h2 标题） */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
})

defineSlots<{
  /** 页头区覆盖插槽（整体替换默认的 title + actions 结构，用于自定义复杂页头） */
  header?: () => unknown
  /** 页头右侧操作区（按钮组等；仅未覆盖 #header 时渲染） */
  actions?: () => unknown
  /** 筛选区（放置 FilterBar 或自定义筛选表单，位于页头与内容区之间） */
  filters?: () => unknown
  /** 页面内容区（v1 唯一插槽：未启用任何骨架区块时直出于容器根，行为与 v1 完全一致） */
  default?: () => unknown
  /** 底部分页区（sticky 固定于滚动容器底部，如 el-pagination） */
  footer?: () => unknown
}>()

const slots = useSlots()

/**
 * 页头区是否启用：title prop 快捷方式 / #header 覆盖插槽 / #actions 操作插槽
 * 任一存在即渲染页头（在模板渲染期求值，保证 prop 变化即时生效）。
 */
function hasHeaderChrome(): boolean {
  return Boolean(props.title || slots.header || slots.actions)
}

/**
 * 2.0 标准骨架是否启用（任一骨架区块存在即启用，默认插槽改由 body 承载）；
 * 未启用时保持 v1 空壳行为：默认插槽直出，不产生任何额外 DOM。
 */
function hasChrome(): boolean {
  return Boolean(hasHeaderChrome() || slots.filters || slots.footer)
}
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-base);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;

  // ---- 2.0 标准骨架���块（仅在实际启用时渲染，v1 模式下 DOM 与 v1 完全一致）----

  &__header {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 16px;
    padding: 16px 20px;
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    // 仅 #actions 无标题时也保持右置
    margin-left: auto;
  }

  &__filters {
    flex-shrink: 0;
    padding: 0 20px 16px;
  }

  &__body {
    // 内容不足一屏时撑满剩余空间，使 footer 贴底
    flex: 1 1 auto;
    padding: 0 20px 24px;
  }

  &__footer {
    position: sticky;
    bottom: 0;
    z-index: 100;
    flex-shrink: 0;
    padding: 12px 20px;
    background: var(--bg-elevated);
    border-top: 1px solid var(--border-subtle);
  }
}
</style>
