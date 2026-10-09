<template>
  <div class="agent-card">
    <div class="agent-card__head">
      <span class="agent-card__dot" :class="`agent-card__dot--${status.tone}`" aria-hidden="true" />
      <span class="agent-card__name">{{ agentRoleLabel(agent.name) }}</span>
      <span class="agent-card__status" :class="`agent-card__status--${status.tone}`">{{ status.label }}</span>
    </div>
    <div class="agent-card__metrics">
      <div class="metric">
        <span class="metric__value">{{ agent.tasksTotal }}</span>
        <span class="metric__label">总任务</span>
      </div>
      <div class="metric">
        <span class="metric__value">{{ agent.tasksFailed }}</span>
        <span class="metric__label">失败</span>
      </div>
      <div class="metric">
        <span class="metric__value">{{ agent.avgDurationMs }}ms</span>
        <span class="metric__label">平均耗时</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentStat } from '@/api/opsagent'
import { agentRoleLabel, agentStatusMeta } from '../logic'

const props = defineProps<{ agent: AgentStat }>()

const status = computed(() => agentStatusMeta(props.agent.status))
</script>

<style scoped>
.agent-card {
    padding: 14px 16px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.agent-card__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.agent-card__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.agent-card__dot--success {
    background: hsl(var(--severity-ok));
}
.agent-card__dot--warning {
    background: hsl(var(--severity-low));
}
.agent-card__dot--danger {
    background: hsl(var(--destructive));
}
.agent-card__dot--info {
    background: hsl(var(--muted-foreground));
}
.agent-card__name {
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
}
.agent-card__status {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
}
.agent-card__status--success {
    background: hsl(var(--severity-ok) / 0.2);
    color: hsl(var(--severity-ok));
}
.agent-card__status--warning {
    background: hsl(var(--severity-low) / 0.2);
    color: hsl(var(--severity-low));
}
.agent-card__status--danger {
    background: hsl(var(--destructive) / 0.2);
    color: hsl(var(--destructive));
}
.agent-card__status--info {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
}
.agent-card__metrics {
    display: flex;
    gap: 18px;
}
.metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.metric__value {
    font-size: 16px;
    font-weight: 700;
    color: hsl(var(--foreground));
    font-variant-numeric: tabular-nums;
}
.metric__label {
    font-size: 11px;
    color: hsl(var(--muted-foreground));
}
</style>