<template>
  <div class="filter-bar">
    <el-input
      v-model="serviceName"
      class="filter-bar__field"
      placeholder="服务名"
      clearable
      @keyup.enter="onSearch"
    />
    <el-select v-model="status" class="filter-bar__field" placeholder="状态" clearable>
      <el-option v-for="(label, val) in STATUS_OPTIONS" :key="val" :label="label" :value="val" />
    </el-select>
    <el-select v-model="severity" class="filter-bar__field" placeholder="严重性" clearable>
      <el-option v-for="s in SEVERITY_OPTIONS" :key="s" :label="s" :value="s" />
    </el-select>
    <el-date-picker
      v-model="timeRange"
      class="filter-bar__field filter-bar__field--wide"
      type="datetimerange"
      start-placeholder="开始时间"
      end-placeholder="结束时间"
      value-format="YYYY-MM-DDTHH:mm:ssZ"
      clearable
    />
    <div class="filter-bar__actions">
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { RiskEntryStatus, Severity } from '@/api/opsagent'
import { RISK_STATUS_LABEL } from '../logic'

/** 筛选参数（父级负责转成 API query，空值不参与过滤） */
export interface RiskFilter {
    serviceName: string
    status: RiskEntryStatus | ''
    severity: Severity | ''
    /** [startTime, endTime]（RFC3339），空 = 不过滤 */
    timeRange: [string, string] | null
}

const emit = defineEmits<{
    (e: 'search', filters: RiskFilter): void
    (e: 'reset'): void
}>()

const STATUS_OPTIONS = RISK_STATUS_LABEL
const SEVERITY_OPTIONS: Severity[] = ['P0', 'P1', 'P2', 'P3']

const serviceName = ref('')
const status = ref<RiskEntryStatus | ''>('')
const severity = ref<Severity | ''>('')
const timeRange = ref<[string, string] | null>(null)

function current(): RiskFilter {
    return {
        serviceName: serviceName.value.trim(),
        status: status.value,
        severity: severity.value,
        timeRange: timeRange.value,
    }
}

function onSearch(): void {
    emit('search', current())
}

function onReset(): void {
    serviceName.value = ''
    status.value = ''
    severity.value = ''
    timeRange.value = null
    emit('reset')
}
</script>

<style scoped>
.filter-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.filter-bar__field {
    width: 160px;
}
.filter-bar__field--wide {
    width: 360px;
}
.filter-bar__actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
}
</style>