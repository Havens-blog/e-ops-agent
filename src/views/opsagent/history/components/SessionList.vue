<template>
  <div class="session-list">
    <p v-if="sessions.length === 0" class="session-list__empty">暂无会话记录</p>
    <ul class="session-list__list">
      <li
        v-for="s in sessions"
        :key="s.id"
        class="session-item"
        :class="{ 'session-item--active': s.id === selectedId }"
        @click="emit('select', s)"
      >
        <div class="session-item__head">
          <span class="session-item__type">{{ SESSION_TYPE_LABEL[s.type] }}</span>
          <span class="session-item__service">{{ s.serviceName || '未指定服务' }}</span>
          <span class="session-item__status" :class="`session-item__status--${s.status}`">
            {{ SESSION_STATUS_LABEL[s.status] }}
          </span>
        </div>
        <p class="session-item__query">{{ s.query }}</p>
        <span class="session-item__time">{{ formatTime(s.createdAt) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { SessionSummary } from '@/api/opsagent'
import { formatTime, SESSION_STATUS_LABEL, SESSION_TYPE_LABEL } from '../logic'

defineProps<{
    sessions: SessionSummary[]
    selectedId?: string
}>()

const emit = defineEmits<{ (e: 'select', session: SessionSummary): void }>()
</script>

<style scoped>
.session-list__empty {
    margin: 0;
    padding: 20px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}
.session-list__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.session-item {
    padding: 12px 14px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color 0.15s;
}
.session-item:hover {
    border-color: hsl(var(--primary));
}
.session-item--active {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.08);
}
.session-item__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}
.session-item__type {
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--primary));
}
.session-item__service {
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--foreground));
}
.session-item__status {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
}
.session-item__status--done {
    background: hsl(var(--severity-ok) / 0.2);
    color: hsl(var(--severity-ok));
}
.session-item__status--running {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}
.session-item__status--failed {
    background: hsl(var(--destructive) / 0.2);
    color: hsl(var(--destructive));
}
.session-item__query {
    margin: 0 0 6px;
    font-size: 13px;
    color: hsl(var(--foreground) / 0.85);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.session-item__time {
    font-size: 11px;
    color: hsl(var(--muted-foreground));
}
</style>