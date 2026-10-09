<template>
  <div class="disposition-list">
    <p class="disposition-list__title">处置预案</p>
    <p v-if="disposition.length === 0" class="disposition-list__empty">无处置预案</p>
    <ul v-else class="disposition-list__list">
      <li v-for="(d, i) in disposition" :key="i" class="disposition-step">
        <span class="disposition-step__order">{{ i + 1 }}</span>
        <div class="disposition-step__body">
          <span class="disposition-step__step">{{ d.step }}</span>
          <span class="disposition-step__action">{{ d.action }}</span>
        </div>
        <span class="disposition-step__risk" :class="`disposition-step__risk--${RISK_LEVEL_META[d.risk].tone}`">
          {{ RISK_LEVEL_META[d.risk].label }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { DispositionStep } from '@/api/opsagent'
import { RISK_LEVEL_META } from '../logic'

defineProps<{ disposition: DispositionStep[] }>()
</script>

<style scoped>
.disposition-list__title {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.disposition-list__empty {
    margin: 0;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
}
.disposition-list__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.disposition-step {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.disposition-step__order {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.disposition-step__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
}
.disposition-step__step {
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
}
.disposition-step__action {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.disposition-step__risk {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
}
.disposition-step__risk--info {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}
.disposition-step__risk--warning {
    background: hsl(var(--severity-low) / 0.2);
    color: hsl(var(--severity-low));
}
.disposition-step__risk--danger {
    background: hsl(var(--destructive) / 0.2);
    color: hsl(var(--destructive));
}
</style>