<template>
  <div class="thinking-block">
    <p class="thinking-block__title">编排进度</p>
    <ol class="thinking-block__list">
      <li
        v-for="stage in stages"
        :key="stage.key"
        class="thinking-step"
        :class="{ 'thinking-step--done': !!stage.step }"
      >
        <span class="thinking-step__dot" aria-hidden="true" />
        <div class="thinking-step__body">
          <span class="thinking-step__label">{{ stage.label }}</span>
          <span v-if="stage.step" class="thinking-step__summary">{{ stage.step.summary }}</span>
          <span v-else class="thinking-step__summary thinking-step__summary--pending">未执行</span>
        </div>
        <span v-if="stage.step" class="thinking-step__meta">
          {{ stage.step.agent }} · {{ stage.step.durationMs }}ms
        </span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TraceStep } from '@/api/opsagent'
import { buildThinkingStages } from '../logic'

const props = defineProps<{ trace: TraceStep[] }>()

/** 4 步编排进度（意图识别→查询→诊断→报告），由 trace 派生 */
const stages = computed(() => buildThinkingStages(props.trace))
</script>

<style scoped>
.thinking-block__title {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.thinking-block__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.thinking-step {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    color: hsl(var(--muted-foreground));
}
.thinking-step__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: hsl(var(--border));
}
.thinking-step--done {
    color: hsl(var(--foreground));
}
.thinking-step--done .thinking-step__dot {
    background: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.2);
}
.thinking-step__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.thinking-step__label {
    font-size: 14px;
    font-weight: 500;
}
.thinking-step__summary {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.thinking-step__summary--pending {
    font-style: italic;
}
.thinking-step__meta {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 11px;
    color: hsl(var(--muted-foreground) / 0.8);
    font-variant-numeric: tabular-nums;
}
</style>