<template>
  <div class="root-cause-card">
    <div class="root-cause-card__head">
      <span class="root-cause-card__title">根因结论</span>
      <span class="root-cause-card__badges">
        <span class="chip">严重性 {{ diagnosis.severity }}</span>
        <span class="chip" :class="`chip--${RISK_LEVEL_META[diagnosis.riskLevel].tone}`">
          {{ RISK_LEVEL_META[diagnosis.riskLevel].label }}
        </span>
        <span v-if="diagnosis.degraded" class="chip chip--warning">降级</span>
        <span v-if="diagnosis.truncated" class="chip chip--warning">截断</span>
      </span>
    </div>
    <p class="root-cause-card__cause">{{ diagnosis.rootCause || '（无明确根因结论）' }}</p>
    <p class="root-cause-card__confidence">置信度 {{ formatConfidence(diagnosis.confidence) }}</p>

    <ul v-if="diagnosis.conclusions.length" class="root-cause-card__conclusions">
      <li v-for="(c, i) in diagnosis.conclusions" :key="i" class="conclusion">
        {{ c.text }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { Diagnosis } from '@/api/opsagent'
import { formatConfidence, RISK_LEVEL_META } from '../logic'

defineProps<{ diagnosis: Diagnosis }>()
</script>

<style scoped>
.root-cause-card {
    padding: 16px 18px;
    background: linear-gradient(135deg, hsl(var(--card)), hsl(var(--card) / 0.6));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.root-cause-card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
}
.root-cause-card__title {
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
}
.root-cause-card__badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.chip {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
}
.chip--warning {
    background: hsl(var(--severity-low) / 0.2);
    color: hsl(var(--severity-low));
}
.chip--danger {
    background: hsl(var(--destructive) / 0.2);
    color: hsl(var(--destructive));
}
.chip--info {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}
.root-cause-card__cause {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: hsl(var(--foreground));
    line-height: 1.5;
}
.root-cause-card__confidence {
    margin: 0 0 12px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.root-cause-card__conclusions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.conclusion {
    font-size: 13px;
    color: hsl(var(--foreground) / 0.85);
    padding-left: 12px;
    border-left: 2px solid hsl(var(--primary));
}
</style>