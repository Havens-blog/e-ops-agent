<template>
  <div class="intent-correction">
    <p v-if="candidates.length" class="intent-correction__label">可能的意图（点击一键纠正）</p>
    <ul v-if="candidates.length" class="intent-correction__list">
      <li v-for="(c, i) in candidates" :key="i" class="candidate">
        <button type="button" class="candidate__btn" :disabled="busy" @click="onPick(c)">
          <span class="candidate__type">{{ intentLabel(c.type) }}</span>
          <span class="candidate__service">{{ c.params.serviceName || '未指定服务' }}</span>
          <span class="candidate__conf">{{ Math.round(c.confidence * 100) }}%</span>
        </button>
      </li>
    </ul>

    <div class="intent-correction__message">
      <input
        v-model="message"
        type="text"
        class="intent-correction__input"
        :placeholder="candidates.length ? '或补充说明纠正，如「我要查资产」' : '请补充说明您的排障目标'"
        :disabled="busy"
        @keyup.enter="onSubmitMessage"
      />
      <button
        type="button"
        class="intent-correction__send"
        :disabled="busy || !message.trim()"
        @click="onSubmitMessage"
      >
        纠正
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DiagnoseParams, IntentCandidate, IntentType } from '@/api/opsagent'

const props = defineProps<{
    candidates: IntentCandidate[]
    busy?: boolean
}>()

const emit = defineEmits<{
    (e: 'correct', targetIntent: IntentType, params: DiagnoseParams): void
    (e: 'correctMessage', message: string): void
}>()

const message = ref('')

/** 意图类型用户侧文案 */
function intentLabel(type: IntentType): string {
    switch (type) {
        case 'diagnose':
            return '排障诊断'
        case 'resource':
            return '资源查询'
        case 'out_of_scope':
            return '超出范围'
    }
}

function onPick(c: IntentCandidate): void {
    emit('correct', c.type, c.params)
}

function onSubmitMessage(): void {
    const text = message.value.trim()
    if (!text || props.busy) return
    emit('correctMessage', text)
    message.value = ''
}
</script>

<style scoped>
.intent-correction__label {
    margin: 0 0 8px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
}
.intent-correction__list {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.candidate__btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
}
.candidate__btn:hover:not(:disabled) {
    border-color: hsl(var(--primary));
    background: hsl(var(--accent) / 0.8);
}
.candidate__btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
.candidate__type {
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--primary));
}
.candidate__service {
    font-size: 13px;
}
.candidate__conf {
    margin-left: auto;
    font-size: 11px;
    color: hsl(var(--muted-foreground));
}
.intent-correction__message {
    display: flex;
    gap: 8px;
}
.intent-correction__input {
    flex: 1;
    padding: 8px 10px;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
}
.intent-correction__input:focus {
    outline: none;
    border-color: hsl(var(--ring));
}
.intent-correction__send {
    padding: 8px 14px;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
}
.intent-correction__send:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>