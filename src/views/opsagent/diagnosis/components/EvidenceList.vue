<template>
  <div class="evidence-list">
    <p class="evidence-list__title">证据清单</p>
    <p v-if="citations.length === 0" class="evidence-list__empty">无数据源引用</p>
    <ul v-else class="evidence-list__list">
      <li
        v-for="(c, i) in citations"
        :key="`${c.sourceKey}-${i}`"
        class="evidence-item"
      >
        <span
          class="evidence-item__badge"
          :style="{ borderColor: sourceTypeMeta(c.sourceType).colorVar, color: sourceTypeMeta(c.sourceType).colorVar }"
        >
          {{ sourceTypeMeta(c.sourceType).label }}
        </span>
        <div class="evidence-item__body">
          <span class="evidence-item__key">{{ c.sourceKey }}</span>
          <span class="evidence-item__snippet">{{ c.snippet }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { Citation } from '@/api/opsagent'
import { sourceTypeMeta } from '../../evidence'

defineProps<{ citations: Citation[] }>()
</script>

<style scoped>
.evidence-list__title {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.evidence-list__empty {
    margin: 0;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
}
.evidence-list__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.evidence-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.evidence-item__badge {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border: 1px solid;
    border-radius: 4px;
}
.evidence-item__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.evidence-item__key {
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
    word-break: break-all;
}
.evidence-item__snippet {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
</style>