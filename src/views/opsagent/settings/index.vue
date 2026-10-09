<template>
  <div class="opsagent-page">
    <PageContainer title="系统配置">
      <div v-if="error" class="settings__error">{{ error }}</div>
      <el-skeleton v-else-if="loading" :rows="10" animated />
      <template v-else-if="settings">
        <div class="settings__tabs">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            type="button"
            class="tab-btn"
            :class="{ 'tab-btn--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="settings__panel">
          <DatasourceTab v-if="activeTab === 'datasource'" :datasources="settings.datasources" />
          <LLMTab
            v-else-if="activeTab === 'llm'"
            :providers="settings.llmProviders"
            :editable="isAdmin"
            :busy="busy"
            @save="onSaveLLM"
          />
          <NotifyTab
            v-else-if="activeTab === 'notify'"
            :channels="notifyChannels"
            :editable="isAdmin"
            :busy="busy"
            @toggle="onToggleChannel"
            @save="onSaveNotify"
          />
          <SecurityTab v-else-if="activeTab === 'security'" :whitelist="settings.riskWhitelist" />
          <PresetTab
            v-else-if="activeTab === 'preset'"
            :presets="settings.presetQueries"
            :editable="isAdmin"
            :busy="busy"
            :on-invalid="(m) => ElMessage.warning(m)"
            @save="onSavePreset"
          />
        </div>
      </template>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
import PageContainer from '@/components/PageContainer/index.vue'
import {
    getSettingsApi,
    putSettingsApi,
    type LLMProviderInput,
    type NotifyChannel,
    type PresetQuery,
    type SettingsData,
} from '@/api/opsagent'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import DatasourceTab from './components/DatasourceTab.vue'
import LLMTab from './components/LLMTab.vue'
import NotifyTab from './components/NotifyTab.vue'
import PresetTab from './components/PresetTab.vue'
import SecurityTab from './components/SecurityTab.vue'

const TABS = [
    { key: 'datasource', label: '数据源配置' },
    { key: 'llm', label: 'LLM 模型' },
    { key: 'notify', label: '通知渠道' },
    { key: 'security', label: '安全与租户' },
    { key: 'preset', label: '预置查询' },
] as const

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

const settings = ref<SettingsData | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const activeTab = ref<(typeof TABS)[number]['key']>('datasource')

/** 通知渠道本地工作副本（NotifyTab 为「父级持有状态」的分立式交互） */
const notifyChannels = ref<NotifyChannel[]>([])

async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
        const data = await getSettingsApi()
        settings.value = data
        notifyChannels.value = data.notifyChannels.map((c) => ({ ...c }))
    } catch (err) {
        error.value = err instanceof Error ? err.message : '加载失败'
    } finally {
        loading.value = false
    }
}

function onToggleChannel(channel: string, enabled: boolean): void {
    const next = notifyChannels.value.map((c) => (c.channel === channel ? { ...c, enabled } : c))
    notifyChannels.value = next
}

async function onSaveNotify(): Promise<void> {
    await save({ notifyChannels: notifyChannels.value })
}

async function onSaveLLM(providers: LLMProviderInput[]): Promise<void> {
    await save({ llmProviders: providers })
}

async function onSavePreset(presets: PresetQuery[]): Promise<void> {
    await save({ presetQueries: presets })
}

async function save(update: Parameters<typeof putSettingsApi>[0]): Promise<void> {
    busy.value = true
    try {
        await putSettingsApi(update)
        ElMessage.success('已保存')
        await load()
    } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : '保存失败')
    } finally {
        busy.value = false
    }
}

onMounted(load)
</script>

<style scoped>
.settings__error {
    padding: 24px;
    text-align: center;
    color: hsl(var(--destructive));
}
.settings__tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
}
.tab-btn {
    padding: 8px 14px;
    font-size: 13px;
    background: transparent;
    color: hsl(var(--muted-foreground));
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
}
.tab-btn--active {
    color: hsl(var(--primary));
    border-bottom-color: hsl(var(--primary));
    font-weight: 600;
}
.settings__panel {
    padding: 4px 2px;
}
</style>