<template>
  <div class="datasource-tab">
    <p v-if="datasources.length === 0" class="datasource-tab__empty">未配置数据源</p>
    <ul class="datasource-tab__list">
      <li v-for="d in datasources" :key="d.name" class="ds-row">
        <span class="ds-row__dot" :class="d.ok ? 'ds-row__dot--ok' : 'ds-row__dot--bad'" />
        <span class="ds-row__name">{{ dataSourceLabel(d.name) }}</span>
        <span v-if="d.cloud" class="ds-row__cloud">{{ d.cloud }}</span>
        <span class="ds-row__status" :class="d.ok ? 'ds-row__status--ok' : 'ds-row__status--bad'">
          {{ connectionStatusText(d.ok) }}
        </span>
        <span class="ds-row__time">{{ formatTime(d.checkedAt) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { Datasource } from '@/api/opsagent'
import { connectionStatusText, dataSourceLabel, formatTime } from '../logic'

defineProps<{ datasources: Datasource[] }>()
</script>

<style scoped>
.datasource-tab__empty {
    margin: 0;
    padding: 20px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}
.datasource-tab__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.ds-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.ds-row__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.ds-row__dot--ok {
    background: hsl(var(--severity-ok));
}
.ds-row__dot--bad {
    background: hsl(var(--destructive));
}
.ds-row__name {
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
}
.ds-row__cloud {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.ds-row__status {
    margin-left: auto;
    font-size: 12px;
    font-weight: 600;
}
.ds-row__status--ok {
    color: hsl(var(--severity-ok));
}
.ds-row__status--bad {
    color: hsl(var(--destructive));
}
.ds-row__time {
    font-size: 11px;
    color: hsl(var(--muted-foreground) / 0.8);
}
</style>