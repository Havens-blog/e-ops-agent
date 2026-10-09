<template>
  <div class="opsagent-page">
    <PageContainer title="历史回溯">
      <template #filters>
        <SearchBar :default-range="defaultRange" @search="onSearch" @reset="onReset" />
      </template>

      <div class="history-layout">
        <div class="history-layout__list">
          <SessionList
            :sessions="items"
            :selected-id="selectedSession?.id"
            @select="onSelect"
          />
        </div>
        <div v-if="selectedSession" class="history-layout__view">
          <SessionView
            :session="selectedSession"
            :diagnosis="selectedDiagnosis"
            :loading="loadingDiagnosis"
          />
        </div>
      </div>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
import PageContainer from '@/components/PageContainer/index.vue'
import {
    getDiagnosisApi,
    historyApi,
    type Diagnosis,
    type HistoryParams,
    type SessionSummary,
} from '@/api/opsagent'
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import SearchBar, { type HistoryFilter } from './components/SearchBar.vue'
import SessionList from './components/SessionList.vue'
import SessionView from './components/SessionView.vue'
import { defaultTimeWindow, isTimeWindowValid } from './logic'

const items = ref<SessionSummary[]>([])
const filters = ref<HistoryFilter>({ serviceName: '', timeRange: null })
const page = ref(1)
const loadingList = ref(false)

const selectedSession = ref<SessionSummary | null>(null)
const selectedDiagnosis = ref<Diagnosis | null>(null)
const loadingDiagnosis = ref(false)

/** 默认时间窗 now-24h（page-map Query Parameters） */
const defaultRange = ref<[string, string]>(defaultTimeWindow())

function buildParams(): HistoryParams {
    const p: HistoryParams = { page: page.value, limit: 20 }
    if (filters.value.serviceName) p.serviceName = filters.value.serviceName
    if (filters.value.timeRange) {
        p.startTime = filters.value.timeRange[0]
        p.endTime = filters.value.timeRange[1]
    }
    return p
}

async function load(): Promise<void> {
    loadingList.value = true
    try {
        const data = await historyApi(buildParams())
        items.value = data.items
    } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : '检索失败')
    } finally {
        loadingList.value = false
    }
}

/** 检索：时间窗 ≤24h，超出提示缩小范围（Hard Rule 跨租户由服务端 404 兜底） */
function onSearch(f: HistoryFilter): void {
    if (f.timeRange && !isTimeWindowValid(f.timeRange[0], f.timeRange[1])) {
        ElMessage.warning('时间窗不得超过 24 小时，请缩小范围')
        return
    }
    filters.value = f
    page.value = 1
    load()
}

function onReset(): void {
    filters.value = { serviceName: '', timeRange: defaultRange.value }
    page.value = 1
    load()
}

async function onSelect(session: SessionSummary): Promise<void> {
    selectedSession.value = session
    selectedDiagnosis.value = null
    if (!session.diagnosisId) return
    loadingDiagnosis.value = true
    try {
        selectedDiagnosis.value = await getDiagnosisApi(session.diagnosisId)
    } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : '加载会话详情失败')
    } finally {
        loadingDiagnosis.value = false
    }
}

onMounted(load)
</script>

<style scoped>
.history-layout {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}
.history-layout__list {
    width: 380px;
    flex-shrink: 0;
}
.history-layout__view {
    flex: 1;
    min-width: 0;
}
</style>