<template>
  <div class="search-bar">
    <el-input
      v-model="serviceName"
      class="search-bar__field"
      placeholder="服务名"
      clearable
      @keyup.enter="onSearch"
    />
    <el-date-picker
      v-model="timeRange"
      class="search-bar__field search-bar__field--wide"
      type="datetimerange"
      start-placeholder="开始时间"
      end-placeholder="结束时间"
      value-format="YYYY-MM-DDTHH:mm:ssZ"
      clearable
    />
    <div class="search-bar__actions">
      <el-button type="primary" @click="onSearch">检索</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { defaultTimeWindow } from '../logic'

/** 检索参数（父级负责校验 ≤24h 并转 API query） */
export interface HistoryFilter {
    serviceName: string
    /** [startTime, endTime]（RFC3339） */
    timeRange: [string, string] | null
}

const props = defineProps<{
    /** 默认时间窗（父级注入，通常 now-24h） */
    defaultRange?: [string, string]
}>()

const emit = defineEmits<{
    (e: 'search', filters: HistoryFilter): void
    (e: 'reset'): void
}>()

const serviceName = ref('')
const timeRange = ref<[string, string] | null>(props.defaultRange ?? null)

function current(): HistoryFilter {
    return { serviceName: serviceName.value.trim(), timeRange: timeRange.value }
}

function onSearch(): void {
    emit('search', current())
}

function onReset(): void {
    serviceName.value = ''
    timeRange.value = props.defaultRange ?? defaultTimeWindow()
    emit('reset')
}
</script>

<style scoped>
.search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.search-bar__field {
    width: 180px;
}
.search-bar__field--wide {
    width: 360px;
}
.search-bar__actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
}
</style>