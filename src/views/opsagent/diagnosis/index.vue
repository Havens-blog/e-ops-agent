<template>
  <div class="opsagent-page">
    <PageContainer title="诊断详情">
      <div v-if="error" class="diagnosis__error">{{ error }}</div>
      <el-skeleton v-else-if="loading" :rows="8" animated />
      <div v-else-if="diagnosis" class="diagnosis-layout">
        <div class="diagnosis-layout__main">
          <RootCauseCard :diagnosis="diagnosis" />
          <EvidenceList :citations="diagnosis.citations" />
        </div>
        <aside class="diagnosis-layout__aside">
          <TraceView :trace="diagnosis.trace" />
          <div class="diagnosis-layout__divider" />
          <DispositionList :disposition="diagnosis.disposition" />
        </aside>
      </div>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
import PageContainer from '@/components/PageContainer/index.vue'
import { getDiagnosisApi, type Diagnosis } from '@/api/opsagent'
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DispositionList from './components/DispositionList.vue'
import EvidenceList from './components/EvidenceList.vue'
import RootCauseCard from './components/RootCauseCard.vue'
import TraceView from './components/TraceView.vue'

const route = useRoute()

const diagnosis = ref<Diagnosis | null>(null)
const loading = ref(true)
const error = ref('')

/**
 * 打开详情即触发自动已读：GET 携带 riskEntryId，后端惰性 CAS 完成
 * pending_view→viewed（api-handbook §6）；本页展示诊断、风险状态由风险中心
 * 返回时重新加载体现。
 */
async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
        const id = String(route.params.id)
        const riskEntryId = route.query.riskEntryId ? String(route.query.riskEntryId) : undefined
        diagnosis.value = await getDiagnosisApi(id, { riskEntryId })
    } catch (err) {
        error.value = err instanceof Error ? err.message : '加载失败'
        ElMessage.error(error.value)
    } finally {
        loading.value = false
    }
}

onMounted(load)
</script>

<style scoped>
.diagnosis__error {
    padding: 24px;
    text-align: center;
    color: hsl(var(--destructive));
}
.diagnosis-layout {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}
.diagnosis-layout__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.diagnosis-layout__aside {
    width: 360px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.diagnosis-layout__divider {
    height: 1px;
    background: hsl(var(--border));
}
</style>