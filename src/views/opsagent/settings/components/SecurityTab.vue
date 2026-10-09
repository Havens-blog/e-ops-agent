<template>
  <div class="security-tab">
    <div class="security-tab__notes">
      <p class="note">租户边界强制注入（硬约束，不可配置关闭）</p>
      <p class="note">高危档不允许入白名单（服务端整体拒绝）</p>
      <p class="note note--accent">底座契约已冻结（M1）</p>
    </div>

    <p class="security-tab__title">风险白名单</p>
    <p v-if="whitelist.length === 0" class="security-tab__empty">暂无白名单条目</p>
    <ul v-else class="security-tab__list">
      <li v-for="w in whitelist" :key="w.tool" class="wl-row">
        <span class="wl-row__tool">{{ w.tool }}</span>
        <span class="wl-row__risk" :class="`wl-row__risk--${RISK_LEVEL_META[w.riskLevel].tone}`">
          {{ RISK_LEVEL_META[w.riskLevel].label }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { RiskWhitelistEntry } from '@/api/opsagent'
import { RISK_LEVEL_META } from '../logic'

defineProps<{ whitelist: RiskWhitelistEntry[] }>()
</script>

<style scoped>
.security-tab__notes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
}
.note {
    margin: 0;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.note--accent {
    color: hsl(var(--primary));
}
.security-tab__title {
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: hsl(var(--muted-foreground) / 0.7);
}
.security-tab__empty {
    margin: 0;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
}
.security-tab__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.wl-row__tool {
    font-size: 14px;
    color: hsl(var(--foreground));
}
.wl-row__risk {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
}
.wl-row__risk--info {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}
.wl-row__risk--warning {
    background: hsl(var(--severity-low) / 0.2);
    color: hsl(var(--severity-low));
}
.wl-row__risk--danger {
    background: hsl(var(--destructive) / 0.2);
    color: hsl(var(--destructive));
}
</style>