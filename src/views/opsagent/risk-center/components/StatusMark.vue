<template>
  <div class="status-mark">
    <button
      v-for="a in actions"
      :key="a.status"
      type="button"
      class="status-mark__btn"
      :disabled="busy"
      @click="emit('mark', a.status)"
    >
      {{ a.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RiskEntryStatus } from '@/api/opsagent'
import { markableActions } from '../logic'

const props = defineProps<{
    status: RiskEntryStatus
    busy?: boolean
}>()

const emit = defineEmits<{ (e: 'mark', status: 'viewed' | 'done'): void }>()

/** 可用的状态标记动作（done 时为空 → 不渲染按钮） */
const actions = computed(() => markableActions(props.status))
</script>

<style scoped>
.status-mark {
    display: flex;
    gap: 6px;
}
.status-mark__btn {
    padding: 4px 10px;
    font-size: 12px;
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    cursor: pointer;
}
.status-mark__btn:hover:not(:disabled) {
    border-color: hsl(var(--primary));
}
.status-mark__btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
</style>