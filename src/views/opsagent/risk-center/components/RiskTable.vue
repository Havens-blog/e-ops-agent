<template>
  <div class="risk-table">
    <div class="risk-table__toolbar">
      <span class="risk-table__selected">已选 {{ selected.length }} 项</span>
      <div class="risk-table__batch">
        <el-button size="small" :disabled="busy || selected.length === 0" @click="emit('batch', 'viewed', selected)">
          批量标记已查看
        </el-button>
        <el-button type="primary" size="small" :disabled="busy || selected.length === 0" @click="emit('batch', 'done', selected)">
          批量标记已处理
        </el-button>
      </div>
    </div>

    <el-table :data="items" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="44" />
      <el-table-column label="服务" min-width="140">
        <template #default="{ row }">
          <span class="risk-table__service">{{ row.serviceName }}</span>
        </template>
      </el-table-column>
      <el-table-column label="严重性" width="110">
        <template #default="{ row }">
          <span class="sev-badge" :class="`sev-badge--${sevMeta(row.severity).tone}`">
            {{ sevMeta(row.severity).label }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          {{ statusText(row.status) }}
        </template>
      </el-table-column>
      <el-table-column label="高危" width="110">
        <template #default="{ row }">
          <HighRiskTag :severity="row.severity" />
        </template>
      </el-table-column>
      <el-table-column label="时间" width="150">
        <template #default="{ row }">
          {{ formatTime(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="200">
        <template #default="{ row }">
          <div class="risk-table__actions">
            <StatusMark :status="row.status" :busy="busy" @mark="(s) => emit('mark', row, s)" />
            <el-button size="small" link type="primary" @click="emit('openDetail', row)">详情</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { RiskEntry, RiskEntryStatus, Severity } from '@/api/opsagent'
import { formatTime, RISK_STATUS_LABEL, SEVERITY_META } from '../logic'
import HighRiskTag from './HighRiskTag.vue'
import StatusMark from './StatusMark.vue'

defineProps<{
    items: RiskEntry[]
    busy?: boolean
}>()

const emit = defineEmits<{
    (e: 'mark', entry: RiskEntry, status: 'viewed' | 'done'): void
    (e: 'batch', status: 'viewed' | 'done', entries: RiskEntry[]): void
    (e: 'openDetail', entry: RiskEntry): void
}>()

const selected = ref<RiskEntry[]>([])

function onSelectionChange(rows: RiskEntry[]): void {
    selected.value = rows
}

/** el-table 插槽行类型为 any，经具名助手收窄为 domain 类型 */
function sevMeta(severity: Severity): { label: string; tone: string } {
    return SEVERITY_META[severity]
}

function statusText(status: RiskEntryStatus): string {
    return RISK_STATUS_LABEL[status]
}
</script>

<style scoped>
.risk-table__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}
.risk-table__selected {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.risk-table__batch {
    display: flex;
    gap: 8px;
}
.risk-table__service {
    font-weight: 600;
    color: hsl(var(--foreground));
}
.risk-table__actions {
    display: flex;
    align-items: center;
    gap: 6px;
}
.sev-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
}
.sev-badge--danger {
    background: hsl(var(--destructive) / 0.15);
    color: hsl(var(--destructive));
}
.sev-badge--warning {
    background: hsl(var(--severity-low) / 0.15);
    color: hsl(var(--severity-low));
}
.sev-badge--info {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}
.sev-badge--success {
    background: hsl(var(--severity-ok) / 0.15);
    color: hsl(var(--severity-ok));
}
</style>