<template>
  <div class="preset-tab">
    <p v-if="presets.length === 0" class="preset-tab__empty">暂无预置查询条目</p>
    <ul v-else class="preset-tab__list">
      <li v-for="(p, i) in rows" :key="i" class="preset-row">
        <input v-model="p.label" type="text" class="preset-row__label" placeholder="展示名" :disabled="!editable || busy" />
        <input v-model="p.params.serviceName" type="text" class="preset-row__service" placeholder="serviceName" :disabled="!editable || busy" />
        <button type="button" class="preset-row__remove" :disabled="!editable || busy" @click="remove(i)">移除</button>
      </li>
    </ul>
    <div class="preset-tab__actions">
      <button type="button" class="btn btn--ghost" :disabled="!editable || busy" @click="add">新增</button>
      <button type="button" class="btn" :disabled="!editable || busy" @click="onSave">保存</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { PresetQuery } from '@/api/opsagent'
import { validatePreset } from '../logic'

const props = defineProps<{
    presets: PresetQuery[]
    editable?: boolean
    busy?: boolean
    /** 校验错误回调（上抛给页面提示，如「缺少 serviceName」） */
    onInvalid?: (msg: string) => void
}>()

const emit = defineEmits<{ (e: 'save', presets: PresetQuery[]): void }>()

/** 本地可编辑副本（不可变原则） */
const rows = ref<PresetQuery[]>(props.presets.map((p) => ({
    ...p,
    params: { ...p.params, timeframe: { ...p.params.timeframe } },
})))

function add(): void {
    rows.value.push({
        id: '',
        label: '',
        params: { serviceName: '', timeframe: { startTime: '', endTime: '' } },
    })
}

function remove(i: number): void {
    rows.value.splice(i, 1)
}

function onSave(): void {
    const out = rows.value.map((p) => ({ ...p, params: { ...p.params } }))
    const bad = out.find((p) => validatePreset(p) !== null)
    if (bad) {
        props.onInvalid?.(validatePreset(bad) ?? '预置查询校验失败')
        return
    }
    emit('save', out)
}
</script>

<style scoped>
.preset-tab__empty {
    margin: 0;
    padding: 16px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}
.preset-tab__list {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.preset-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
}
.preset-row__label {
    width: 200px;
    padding: 6px 10px;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
}
.preset-row__service {
    flex: 1;
    padding: 6px 10px;
    background: hsl(var(--input));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
}
.preset-row__remove {
    padding: 6px 10px;
    font-size: 12px;
    background: hsl(var(--destructive) / 0.15);
    color: hsl(var(--destructive));
    border: 1px solid hsl(var(--destructive));
    border-radius: 6px;
    cursor: pointer;
}
.preset-row__remove:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.preset-tab__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
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
.btn--ghost {
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
}
.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>