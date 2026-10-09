<template>
  <div class="notify-tab">
    <p v-if="channels.length === 0" class="notify-tab__empty">未配置通知渠道</p>
    <ul class="notify-tab__list">
      <li v-for="c in channels" :key="c.channel" class="channel-row">
        <span class="channel-row__name">{{ notifyChannelLabel(c.channel) }}</span>
        <button
          type="button"
          class="channel-row__toggle"
          :class="{ 'channel-row__toggle--on': c.enabled }"
          :disabled="!editable"
          :aria-pressed="c.enabled"
          @click="emit('toggle', c.channel, !c.enabled)"
        >
          {{ c.enabled ? '已启用' : '已停用' }}
        </button>
      </li>
    </ul>
    <button
      v-if="editable"
      type="button"
      class="notify-tab__save"
      :disabled="busy"
      @click="emit('save')"
    >
      保存渠道配置
    </button>
  </div>
</template>

<script setup lang="ts">
import type { NotifyChannel } from '@/api/opsagent'
import { notifyChannelLabel } from '../logic'

defineProps<{
    channels: NotifyChannel[]
    editable?: boolean
    busy?: boolean
}>()

const emit = defineEmits<{
    (e: 'toggle', channel: string, enabled: boolean): void
    (e: 'save'): void
}>()
</script>

<style scoped>
.notify-tab__empty {
    margin: 0;
    padding: 20px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}
.notify-tab__list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.channel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.channel-row__name {
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
}
.channel-row__toggle {
    margin-left: auto;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    cursor: pointer;
}
.channel-row__toggle--on {
    background: hsl(var(--severity-ok) / 0.2);
    color: hsl(var(--severity-ok));
    border-color: hsl(var(--severity-ok));
}
.channel-row__toggle:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
.notify-tab__save {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 6px;
    cursor: pointer;
}
.notify-tab__save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>