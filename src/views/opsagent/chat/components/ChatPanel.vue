<template>
  <div class="chat-panel">
    <div class="chat-panel__transcript" aria-live="polite">
      <p v-if="messages.length === 0" class="chat-panel__empty">
        描述您的排障问题（含服务名 + 时间窗 + 现象），如「order-service 近 1 小时错误率上升」。
      </p>

      <div v-for="(m, i) in messages" :key="i" class="msg" :class="`msg--${m.role}`">
        <div class="msg__bubble">{{ m.text }}</div>
      </div>

      <div v-if="diagnosis" class="report">
        <div class="report__header">
          <span class="report__title">根因结论</span>
          <span class="report__badges">
            <span v-if="diagnosis.degraded" class="badge badge--warning">降级</span>
            <span v-if="diagnosis.truncated" class="badge badge--warning">截断</span>
            <span v-if="degrade" class="badge" :class="`badge--${degrade.tone}`">
              {{ degrade.text }}
            </span>
          </span>
        </div>
        <p class="report__root-cause">{{ diagnosis.rootCause || '（无明确根因）' }}</p>
        <p class="report__meta">
          置信度 {{ Math.round(diagnosis.confidence * 100) }}% · 严重性 {{ diagnosis.severity }} · 风险 {{ riskLabel(diagnosis.riskLevel) }}
        </p>
        <ul v-if="diagnosis.conclusions.length" class="report__conclusions">
          <li v-for="(c, i) in diagnosis.conclusions" :key="i" class="conclusion">{{ c.text }}</li>
        </ul>
      </div>
    </div>

    <form class="chat-panel__composer" @submit.prevent="onSubmit">
      <input
        v-model="draft"
        type="text"
        class="chat-panel__input"
        placeholder="输入排障问题…"
        :disabled="busy"
      />
      <button type="submit" class="chat-panel__send" :disabled="busy || !draft.trim()">
        {{ busy ? '诊断中…' : '发送' }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Diagnosis, RiskLevel } from '@/api/opsagent'
import { degradeBadge } from '../logic'

/** 对话流单条消息 */
export interface ChatMessage {
    role: 'user' | 'assistant'
    text: string
}

const props = defineProps<{
    messages: ChatMessage[]
    diagnosis: Diagnosis | null
    /** degradeLevel（0 正常 / 1 模板 / 2 预置入口 / 3 明示降级） */
    degradeLevel: number
    busy: boolean
}>()

const emit = defineEmits<{ (e: 'submit', message: string): void }>()

const draft = ref('')

/** 降级徽标（0 = 无，返回 null） */
const degrade = computed(() => degradeBadge(props.degradeLevel))

function riskLabel(risk: RiskLevel): string {
    switch (risk) {
        case 'high':
            return '高危'
        case 'low':
            return '低危'
        default:
            return '只读'
    }
}

function onSubmit(): void {
    const text = draft.value.trim()
    if (!text || props.busy) return
    emit('submit', text)
    draft.value = ''
}
</script>

<style scoped>
.chat-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: hidden;
}
.chat-panel__transcript {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.chat-panel__empty {
    margin: auto 0;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}
.msg {
    display: flex;
}
.msg--user {
    justify-content: flex-end;
}
.msg--assistant {
    justify-content: flex-start;
}
.msg__bubble {
    max-width: 76%;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
}
.msg--user .msg__bubble {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
}
.msg--assistant .msg__bubble {
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
}
.report {
    padding: 14px;
    background: hsl(var(--card) / 0.7);
    border: 1px solid hsl(var(--border));
    border-radius: 10px;
}
.report__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
.report__title {
    font-size: 13px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
}
.report__badges {
    display: flex;
    gap: 6px;
}
.badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
}
.badge--warning {
    background: hsl(var(--severity-low) / 0.2);
    color: hsl(var(--severity-low));
}
.badge--danger {
    background: hsl(var(--destructive) / 0.2);
    color: hsl(var(--destructive));
}
.report__root-cause {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: hsl(var(--foreground));
    line-height: 1.5;
}
.report__meta {
    margin: 0 0 10px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.report__conclusions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.conclusion {
    font-size: 13px;
    color: hsl(var(--foreground) / 0.85);
    padding-left: 12px;
    border-left: 2px solid hsl(var(--primary));
}
.chat-panel__composer {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid hsl(var(--border));
}
.chat-panel__input {
    flex: 1;
    padding: 10px 12px;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
}
.chat-panel__input:focus {
    outline: none;
    border-color: hsl(var(--ring));
}
.chat-panel__send {
    padding: 10px 18px;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
}
.chat-panel__send:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>