// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Diagnosis, SessionSummary } from '@/api/opsagent'
import SessionView from './SessionView.vue'

const SESSION: SessionSummary = {
    id: 's1',
    type: 'chat',
    query: 'order-service 错误率上升',
    serviceName: 'order-service',
    status: 'done',
    diagnosisId: 'd1',
    createdAt: '2026-10-08T10:00:00Z',
}

const DIAGNOSIS: Diagnosis = {
    id: 'd1',
    sessionId: 's1',
    tenant: 't1',
    rootCause: '连接池耗尽',
    confidence: 0.9,
    severity: 'P1',
    riskLevel: 'high',
    conclusions: [{ text: '结论一', citation: [] }],
    disposition: [],
    citations: [{ sourceType: 'metric', sourceKey: 'p99', snippet: '延迟 2.3s' }],
    degraded: false,
    truncated: false,
    trace: [{ step: 1, agent: 'coordinator', action: 'intent', durationMs: 5, summary: '识别' }],
}

describe('SessionView 会话详情（任务 5.5 AC 完整内容）', () => {
    it('展示提问 + 编排调用链 + 报告 + 数据源引用', () => {
        const w = mount(SessionView, { props: { session: SESSION, diagnosis: DIAGNOSIS, loading: false } })
        expect(w.find('.session-view__question')!.text()).toBe('order-service 错误率上升')
        // 报告（RootCauseCard）+ 调用链（TraceView）+ 引用（EvidenceList）
        expect(w.text()).toContain('连接池耗尽')
        expect(w.text()).toContain('编排调用链')
        expect(w.text()).toContain('证据清单')
    })

    it('无诊断内容时显示占位说明', () => {
        const w = mount(SessionView, { props: { session: SESSION, diagnosis: null, loading: false } })
        expect(w.find('.session-view__nodata')!.text()).toContain('暂无诊断内容')
    })
})