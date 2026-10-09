<template>
  <div class="opsagent-page">
    <PageContainer title="对话排障">
      <div class="chat-layout">
        <div class="chat-layout__main">
          <ChatPanel
            :messages="messages"
            :diagnosis="diagnosis"
            :degrade-level="degradeLevel"
            :busy="busy"
            @submit="onSubmit"
          />

          <!-- 澄清追问（type=clarify）：候选意图一键纠正 / 自然语言纠正 -->
          <div v-if="chatData?.type === 'clarify'" class="chat-layout__clarify">
            <IntentCorrection
              :candidates="chatData.candidates"
              :busy="busy"
              @correct="onCorrectIntent"
              @correct-message="onCorrectMessage"
            />
          </div>

          <!-- L2 预置查询目录（type=preset_entries）：点击确定性重入 -->
          <div v-if="chatData?.type === 'preset_entries'" class="chat-layout__presets">
            <p class="presets__label">预置查询</p>
            <button
              v-for="p in chatData.presets"
              :key="p.id"
              type="button"
              class="presets__item"
              :disabled="busy"
              @click="onPreset(p)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <!-- 报告侧栏：编排进度 + 证据卡 -->
        <aside v-if="diagnosis" class="chat-layout__aside">
          <ThinkingBlock :trace="diagnosis.trace" />
          <div class="chat-layout__divider" />
          <EvidenceCard :citations="diagnosis.citations" />
        </aside>
      </div>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
import PageContainer from '@/components/PageContainer/index.vue'
import {
    chatApi,
    correctApi,
    OpsagentRequestError,
    type ChatData,
    type DiagnoseParams,
    type IntentType,
    type PresetQuery,
} from '@/api/opsagent'
import { computed, ref } from 'vue'
import ChatPanel, { type ChatMessage } from './components/ChatPanel.vue'
import EvidenceCard from './components/EvidenceCard.vue'
import IntentCorrection from './components/IntentCorrection.vue'
import ThinkingBlock from './components/ThinkingBlock.vue'

const busy = ref(false)
const messages = ref<ChatMessage[]>([])
const chatData = ref<ChatData | null>(null)

const diagnosis = computed(() => chatData.value?.diagnosis ?? null)
const degradeLevel = computed(() => chatData.value?.degradeLevel ?? 0)

/** 落库失败（ERR_PERSIST_FAILED）仍携带可用 report，不应丢弃诊断正文 */
const CODE_PERSIST_FAILED = 'ERR_PERSIST_FAILED'

function applyChatData(data: ChatData): void {
    chatData.value = data
    if (data.report) {
        messages.value.push({ role: 'assistant', text: data.report })
    }
    if (data.status === 'running') {
        messages.value.push({ role: 'assistant', text: '诊断转入后台继续，请稍后从「历史回溯」查看结果。' })
    }
}

/** 统一错误收敛：persist-failed 保留正文，其余以文本入对话流 */
function onError(err: unknown): void {
    if (err instanceof OpsagentRequestError && err.code === CODE_PERSIST_FAILED && err.data) {
        applyChatData(err.data as ChatData)
        return
    }
    messages.value.push({ role: 'assistant', text: err instanceof Error ? `请求失败：${err.message}` : '请求失败' })
}

async function onSubmit(message: string): Promise<void> {
    messages.value.push({ role: 'user', text: message })
    busy.value = true
    try {
        applyChatData(await chatApi({ message }))
    } catch (err) {
        onError(err)
    } finally {
        busy.value = false
    }
}

async function onCorrectIntent(targetIntent: IntentType, params: DiagnoseParams): Promise<void> {
    if (!chatData.value?.sessionId) return
    busy.value = true
    try {
        applyChatData(await correctApi(chatData.value.sessionId, { targetIntent, params }))
    } catch (err) {
        onError(err)
    } finally {
        busy.value = false
    }
}

async function onCorrectMessage(message: string): Promise<void> {
    if (!chatData.value?.sessionId) return
    busy.value = true
    try {
        applyChatData(await correctApi(chatData.value.sessionId, { message }))
    } catch (err) {
        onError(err)
    } finally {
        busy.value = false
    }
}

/** L2 预置查询条目点击：以 diagnose + 完整 params 确定性重入（不调用 LLM） */
async function onPreset(preset: PresetQuery): Promise<void> {
    await onCorrectIntent('diagnose', preset.params)
}
</script>

<style scoped>
.chat-layout {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    min-height: 520px;
}
.chat-layout__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.chat-layout__aside {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.chat-layout__divider {
    height: 1px;
    background: hsl(var(--border));
}
.chat-layout__clarify {
    padding: 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.chat-layout__presets {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.presets__label {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
}
.presets__item {
    padding: 10px 14px;
    text-align: left;
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    cursor: pointer;
}
.presets__item:hover:not(:disabled) {
    border-color: hsl(var(--primary));
}
.presets__item:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
</style>