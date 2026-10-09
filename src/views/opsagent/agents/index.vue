<template>
  <div class="opsagent-page">
    <PageContainer title="Agent 管理">
      <div v-if="error" class="agents__error">{{ error }}</div>
      <el-skeleton v-else-if="loading" :rows="10" animated />
      <template v-else-if="data">
        <div class="agents__grid">
          <AgentCard v-for="a in data.agents" :key="a.name" :agent="a" />
        </div>
        <div class="agents__panels">
          <div class="panel">
            <TaskQueue :queue="data.queue" />
          </div>
          <div class="panel">
            <BudgetGauge :budget="data.llmBudget" />
          </div>
          <div class="panel panel--wide">
            <LoadChart :load-history="data.loadHistory" />
          </div>
        </div>
      </template>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
import PageContainer from '@/components/PageContainer/index.vue'
import { getObservabilityApi, type ObservabilityData } from '@/api/opsagent'
import { onMounted, ref } from 'vue'
import AgentCard from './components/AgentCard.vue'
import BudgetGauge from './components/BudgetGauge.vue'
import LoadChart from './components/LoadChart.vue'
import TaskQueue from './components/TaskQueue.vue'

const data = ref<ObservabilityData | null>(null)
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
        data.value = await getObservabilityApi()
    } catch (err) {
        error.value = err instanceof Error ? err.message : '加载失败'
    } finally {
        loading.value = false
    }
}

onMounted(load)
</script>

<style scoped>
.agents__error {
    padding: 24px;
    text-align: center;
    color: hsl(var(--destructive));
}
.agents__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
}
.agents__panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
.panel {
    padding: 16px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.panel--wide {
    grid-column: 1 / -1;
}
</style>