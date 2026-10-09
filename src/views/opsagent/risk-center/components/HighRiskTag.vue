<template>
  <span v-if="high" class="high-risk-tag" role="status">待人工确认</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Severity } from '@/api/opsagent'
import { isHighRisk } from '../logic'

const props = defineProps<{ severity: Severity }>()

/** 高危（severity P0|P1）→ 纯展示「待人工确认」，不渲染确认/执行控件 */
const high = computed(() => isHighRisk(props.severity))
</script>

<style scoped>
.high-risk-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    background: hsl(var(--destructive) / 0.15);
    color: hsl(var(--destructive));
    white-space: nowrap;
}
</style>