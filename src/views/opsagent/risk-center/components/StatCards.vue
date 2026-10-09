<template>
  <div class="stat-cards">
    <div class="stat-card">
      <span class="stat-card__label">待处理</span>
      <span class="stat-card__value stat-card__value--accent">{{ stats.pendingView }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-card__label">今日新增</span>
      <span class="stat-card__value">{{ stats.todayNew }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-card__label">高危</span>
      <span class="stat-card__value stat-card__value--danger">{{ stats.highRisk }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RiskStats } from '@/api/opsagent'

defineProps<{ stats: RiskStats }>()
</script>

<style scoped>
.stat-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
}
.stat-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.stat-card__label {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.stat-card__value {
    font-size: 26px;
    font-weight: 700;
    color: hsl(var(--foreground));
    font-variant-numeric: tabular-nums;
}
.stat-card__value--accent {
    color: hsl(var(--primary));
}
.stat-card__value--danger {
    color: hsl(var(--destructive));
}
</style>