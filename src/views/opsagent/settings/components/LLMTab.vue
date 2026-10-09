<template>
  <div class="llm-tab">
    <ul class="llm-tab__list">
      <li v-for="row in rows" :key="row.name" class="provider-row">
        <label class="provider-row__default">
          <input
            v-model="defaultName"
            type="radio"
            name="llm-default"
            :value="row.name"
            :disabled="!editable || busy"
          />
          <span class="provider-row__name">{{ providerLabel(row.name) }}</span>
        </label>
        <span class="provider-row__masked">{{ row.keyMasked || '未配置 Key' }}</span>
        <input
          v-model="row.model"
          type="text"
          class="provider-row__model"
          :placeholder="'模型'"
          :disabled="!editable || busy"
        />
        <input
          v-model="row.apiKey"
          type="password"
          class="provider-row__key"
          :placeholder="row.keyMasked ? '输入新 Key 覆盖（留空保持原 Key）' : '输入 API Key'"
          :disabled="!editable || busy"
        />
      </li>
    </ul>
    <div class="llm-tab__actions">
      <button type="button" class="btn" :disabled="!editable || busy" @click="onSave">保存</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { LLMProviderConfig, LLMProviderInput } from '@/api/opsagent'
import { providerLabel } from '../logic'

const props = defineProps<{
    providers: LLMProviderConfig[]
    editable?: boolean
    busy?: boolean
}>()

const emit = defineEmits<{ (e: 'save', providers: LLMProviderInput[]): void }>()

interface Row {
    name: string
    default: boolean
    model: string
    keyMasked?: string
    apiKey: string
}

/** 本地可编辑副本（不可变原则：不直接改 props） */
const rows = ref<Row[]>(props.providers.map((p) => ({
    name: p.name,
    default: p.default,
    model: p.model,
    keyMasked: p.keyMasked,
    apiKey: '',
})))

/** 默认提供商（单选） */
const defaultName = ref(props.providers.find((p) => p.default)?.name ?? '')

function onSave(): void {
    const out: LLMProviderInput[] = rows.value.map((r) => ({
        name: r.name,
        default: r.name === defaultName.value,
        model: r.model,
        apiKey: r.apiKey,
    }))
    emit('save', out)
}
</script>

<style scoped>
.llm-tab__list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.provider-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    flex-wrap: wrap;
}
.provider-row__default {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 120px;
    cursor: pointer;
}
.provider-row__name {
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
}
.provider-row__masked {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    font-family: monospace;
}
.provider-row__model,
.provider-row__key {
    padding: 6px 10px;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
}
.provider-row__model {
    width: 140px;
}
.provider-row__key {
    flex: 1;
    min-width: 200px;
}
.llm-tab__actions {
    display: flex;
    justify-content: flex-end;
}
.btn {
    padding: 8px 16px;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
}
.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>