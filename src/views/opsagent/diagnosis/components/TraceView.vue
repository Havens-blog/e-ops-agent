<template>
  <div class="trace-view">
    <p class="trace-view__title">编排调用链</p>
    <p v-if="trace.length === 0" class="trace-view__empty">无调用链记录</p>
    <ol v-else class="trace-view__list">
      <li v-for="t in trace" :key="t.step" class="trace-step">
        <span class="trace-step__index">{{ t.step }}</span>
        <div class="trace-step__body">
          <span class="trace-step__head">
            <span class="trace-step__agent">{{ agentLabel(t.agent) }}</span>
            <span class="trace-step__action">{{ actionLabel(t.action) }}</span>
            <span v-if="t.source" class="trace-step__source">{{ t.source }}</span>
          </span>
          <span class="trace-step__summary">{{ t.summary }}</span>
        </div>
        <span class="trace-step__meta">
          <span v-if="t.degradeLevel && t.degradeLevel > 0" class="trace-step__degrade">L{{ t.degradeLevel }}</span>
          {{ t.durationMs }}ms
        </span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import type { TraceStep } from '@/api/opsagent'
import { actionLabel, agentLabel } from '../logic'

defineProps<{ trace: TraceStep[] }>()
</script>

<style scoped>
.trace-view__title {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.trace-view__empty {
    margin: 0;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
}
.trace-view__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.trace-step {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
}
.trace-step__index {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.trace-step__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}
.trace-step__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.trace-step__agent {
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--primary));
}
.trace-step__action {
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
}
.trace-step__source {
    font-size: 11px;
    color: hsl(var(--muted-foreground));
}
.trace-step__summary {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.trace-step__meta {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: hsl(var(--muted-foreground) / 0.8);
    font-variant-numeric: tabular-nums;
}
.trace-step__degrade {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    background: hsl(var(--severity-low) / 0.2);
    color: hsl(var(--severity-low));
}
</style>