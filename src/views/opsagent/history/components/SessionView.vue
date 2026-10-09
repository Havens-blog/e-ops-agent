<template>
  <div class="session-view">
    <div class="session-view__head">
      <span class="session-view__type">{{ SESSION_TYPE_LABEL[session.type] }}</span>
      <span class="session-view__status" :class="`session-view__status--${session.status}`">
        {{ SESSION_STATUS_LABEL[session.status] }}
      </span>
      <span class="session-view__time">{{ formatTime(session.createdAt) }}</span>
    </div>

    <p class="session-view__question">{{ session.query }}</p>

    <el-skeleton v-if="loading" :rows="6" animated />
    <div v-else-if="diagnosis" class="session-view__body">
      <RootCauseCard :diagnosis="diagnosis" />
      <div class="session-view__grid">
        <TraceView :trace="diagnosis.trace" />
        <div class="session-view__divider" />
        <EvidenceList :citations="diagnosis.citations" />
      </div>
    </div>
    <p v-else class="session-view__nodata">该会话暂无诊断内容（可能仍在运行或已失败）。</p>
  </div>
</template>

<script setup lang="ts">
import type { Diagnosis, SessionSummary } from '@/api/opsagent'
import { formatTime, SESSION_STATUS_LABEL, SESSION_TYPE_LABEL } from '../logic'
import EvidenceList from '../../diagnosis/components/EvidenceList.vue'
import RootCauseCard from '../../diagnosis/components/RootCauseCard.vue'
import TraceView from '../../diagnosis/components/TraceView.vue'

defineProps<{
    session: SessionSummary
    diagnosis: Diagnosis | null
    loading?: boolean
}>()
</script>

<style scoped>
.session-view__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.session-view__type {
    font-size: 11px;
    font-weight: 600;
    color: hsl(var(--primary));
}
.session-view__status {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
}
.session-view__status--done {
    background: hsl(var(--severity-ok) / 0.2);
    color: hsl(var(--severity-ok));
}
.session-view__status--running {
    background: hsl(var(--primary) / 0.15);
    color: hsl(var(--primary));
}
.session-view__status--failed {
    background: hsl(var(--destructive) / 0.2);
    color: hsl(var(--destructive));
}
.session-view__time {
    margin-left: auto;
    font-size: 11px;
    color: hsl(var(--muted-foreground));
}
.session-view__question {
    margin: 0 0 14px;
    padding: 12px 14px;
    font-size: 14px;
    color: hsl(var(--foreground));
    background: hsl(var(--accent));
    border-radius: 8px;
    line-height: 1.5;
}
.session-view__body {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.session-view__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
}
.session-view__nodata {
    margin: 0;
    padding: 16px;
    text-align: center;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
}
</style>