<template>
  <div class="load-chart">
    <p class="load-chart__title">负载历史（最近 1h）</p>
    <p v-if="loadHistory.length === 0" class="load-chart__empty">暂无负载记录</p>
    <div v-else class="load-chart__bars">
      <div
        v-for="(p, i) in loadHistory"
        :key="p.ts || i"
        class="load-chart__bar"
        :style="{ height: barHeight(p.depth) }"
        :title="`${formatTime(p.ts)} 深度 ${p.depth}`"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LoadPoint } from '@/api/opsagent'

defineProps<{ loadHistory: LoadPoint[] }>()

/** 深度 → 条高（归一化到最大 96px，最小 4px） */
function barHeight(depth: number): string {
    const h = Math.max(4, Math.min(96, depth * 4))
    return `${h}px`
}

function formatTime(ts: number): string {
    if (!ts) return '—'
    return new Date(ts).toISOString().slice(11, 16)
}
</script>

<style scoped>
.load-chart__title {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.load-chart__empty {
    margin: 0;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
}
.load-chart__bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 96px;
}
.load-chart__bar {
    flex: 1;
    min-width: 3px;
    background: hsl(var(--primary) / 0.7);
    border-radius: 2px 2px 0 0;
}
</style>