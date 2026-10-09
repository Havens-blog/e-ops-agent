<template>
  <div class="task-queue">
    <p class="task-queue__title">排查队列</p>
    <div class="task-queue__metrics">
      <div class="metric">
        <span class="metric__value">{{ queue.depth }}</span>
        <span class="metric__label">深度 / 容量 {{ queue.capacity }}</span>
      </div>
      <div class="metric">
        <span class="metric__value">{{ queue.inflight }}</span>
        <span class="metric__label">在途 / 并发 {{ queue.concurrency }}</span>
      </div>
      <div class="metric">
        <span class="metric__value">{{ queue.overflowTotal }}</span>
        <span class="metric__label">溢出总量</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueueStat } from '@/api/opsagent'

defineProps<{ queue: QueueStat }>()
</script>

<style scoped>
.task-queue__title {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.task-queue__metrics {
    display: flex;
    gap: 18px;
}
.metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.metric__value {
    font-size: 18px;
    font-weight: 700;
    color: hsl(var(--foreground));
    font-variant-numeric: tabular-nums;
}
.metric__label {
    font-size: 11px;
    color: hsl(var(--muted-foreground));
}
</style>