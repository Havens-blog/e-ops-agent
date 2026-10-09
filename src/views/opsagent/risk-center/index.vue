<template>
  <div class="opsagent-page">
    <PageContainer title="风险中心">
      <template #filters>
        <FilterBar @search="onSearch" @reset="onReset" />
      </template>

      <StatCards :stats="stats" />

      <div class="risk-center__table">
        <RiskTable
          :items="items"
          :busy="marking || loading"
          @mark="onMark"
          @batch="onBatch"
          @open-detail="onOpenDetail"
        />
      </div>

      <template #footer>
        <el-pagination
          v-model:current-page="page"
          :page-size="limit"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="onPageChange"
        />
      </template>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
import PageContainer from '@/components/PageContainer/index.vue'
import {
    batchRiskStatusApi,
    OpsagentRequestError,
    riskCenterApi,
    updateRiskStatusApi,
    type RiskEntry,
    type RiskListParams,
    type RiskStats,
} from '@/api/opsagent'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import FilterBar, { type RiskFilter } from './components/FilterBar.vue'
import RiskTable from './components/RiskTable.vue'
import StatCards from './components/StatCards.vue'
import { batchOutcome } from './logic'

const router = useRouter()

const loading = ref(false)
const marking = ref(false)
const filters = ref<RiskFilter>({ serviceName: '', status: '', severity: '', timeRange: null })
const page = ref(1)
const limit = ref(20)
const items = ref<RiskEntry[]>([])
const total = ref(0)
const stats = ref<RiskStats>({ pendingView: 0, todayNew: 0, highRisk: 0 })

function buildParams(): RiskListParams {
    const p: RiskListParams = { page: page.value, limit: limit.value }
    if (filters.value.serviceName) p.serviceName = filters.value.serviceName
    if (filters.value.status) p.status = filters.value.status
    if (filters.value.severity) p.severity = filters.value.severity
    if (filters.value.timeRange) {
        p.startTime = filters.value.timeRange[0]
        p.endTime = filters.value.timeRange[1]
    }
    return p
}

async function load(): Promise<void> {
    loading.value = true
    try {
        const data = await riskCenterApi(buildParams())
        items.value = data.items
        total.value = data.total
        stats.value = data.stats
    } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : '加载失败')
    } finally {
        loading.value = false
    }
}

function onSearch(f: RiskFilter): void {
    filters.value = f
    page.value = 1
    load()
}

function onReset(): void {
    filters.value = { serviceName: '', status: '', severity: '', timeRange: null }
    page.value = 1
    load()
}

function onPageChange(p: number): void {
    page.value = p
    load()
}

/** 单个标记：CAS 冲突 409 → 提示已被更新 + 刷新最新状态 */
async function onMark(entry: RiskEntry, status: 'viewed' | 'done'): Promise<void> {
    marking.value = true
    try {
        await updateRiskStatusApi(entry.id, { status, expectedVersion: entry.version })
        await load()
    } catch (err) {
        if (err instanceof OpsagentRequestError && err.code === 'ERR_CONFLICT') {
            ElMessage.warning('已被其他值班更新，已刷新最新状态')
            await load()
        } else {
            ElMessage.error(err instanceof Error ? err.message : '标记失败')
        }
    } finally {
        marking.value = false
    }
}

/** 批量标记：逐条 CAS，冲突/不存在回显失败清单（重试 = 刷新后重新勾选） */
async function onBatch(status: 'viewed' | 'done', entries: RiskEntry[]): Promise<void> {
    if (entries.length === 0) return
    marking.value = true
    try {
        const result = await batchRiskStatusApi({
            status,
            items: entries.map((e) => ({ id: e.id, expectedVersion: e.version })),
        })
        const outcome = batchOutcome(result)
        if (outcome.conflict > 0 || outcome.notFound > 0) {
            await ElMessageBox.alert(
                `成功 ${outcome.success} 项；冲突 ${outcome.conflict} 项（已被其他值班更新）、不存在 ${outcome.notFound} 项。已刷新最新状态，可重新勾选重试。`,
                '批量标记部分失败',
                { type: 'warning' },
            )
        } else {
            ElMessage.success(`已标记 ${outcome.success} 项`)
        }
        await load()
    } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : '批量标记失败')
    } finally {
        marking.value = false
    }
}

/** 点入诊断详情并携带 riskEntryId，触发「待查看→已查看」自动流转 */
function onOpenDetail(entry: RiskEntry): void {
    router.push({ path: `/opsagent/diagnosis/${entry.diagnosisId}`, query: { riskEntryId: entry.id } })
}

onMounted(load)
</script>

<style scoped>
.risk-center__table {
    margin-top: 16px;
}
</style>