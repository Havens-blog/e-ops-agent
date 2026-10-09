<template>
  <div class="budget-gauge">
    <p class="budget-gauge__title">LLM 预算用量</p>
    <div class="budget-gauge__row">
      <span class="budget-gauge__percent" :class="{ 'budget-gauge__percent--exceeded': budget.exceeded }">
        {{ budgetUsagePercent(budget.calls, budget.budgetLimit) }}
      </span>
      <span class="budget-gauge__calls">{{ budget.calls }} / {{ budget.budgetLimit }} 次</span>
    </div>
    <div class="budget-gauge__bar">
      <div
        class="budget-gauge__fill"
        :class="{ 'budget-gauge__fill--exceeded': budget.exceeded }"
        :style="{ width: `${budgetUsageRatio(budget.calls, budget.budgetLimit) * 100}%` }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LLMBudgetStat } from '@/api/opsagent'
import { budgetUsagePercent, budgetUsageRatio } from '../logic'

defineProps<{ budget: LLMBudgetStat }>()
</script>

<style scoped>
.budget-gauge__title {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.budget-gauge__row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 10px;
}
.budget-gauge__percent {
    font-size: 24px;
    font-weight: 700;
    color: hsl(var(--primary));
    font-variant-numeric: tabular-nums;
}
.budget-gauge__percent--exceeded {
    color: hsl(var(--destructive));
}
.budget-gauge__calls {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.budget-gauge__bar {
    height: 8px;
    background: hsl(var(--muted));
    border-radius: 4px;
    overflow: hidden;
}
.budget-gauge__fill {
    height: 100%;
    background: hsl(var(--primary));
    border-radius: 4px;
    transition: width 0.3s;
}
.budget-gauge__fill--exceeded {
    background: hsl(var(--destructive));
}
</style>