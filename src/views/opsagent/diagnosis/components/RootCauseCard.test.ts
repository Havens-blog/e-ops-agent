// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Diagnosis } from '@/api/opsagent'
import RootCauseCard from './RootCauseCard.vue'

const DIAGNOSIS: Diagnosis = {
    id: 'd1',
    sessionId: 's1',
    tenant: 't1',
    rootCause: 'order-service 数据库连接池耗尽',
    confidence: 0.87,
    severity: 'P1',
    riskLevel: 'high',
    conclusions: [{ text: '连接池配置偏小', citation: ['metric-p99'] }],
    disposition: [],
    citations: [],
    degraded: false,
    truncated: true,
    trace: [],
}

describe('RootCauseCard 根因结论（任务 5.4 AC#1）', () => {
    it('主视觉根因 + 置信度 + 严重性/风险档/截断徽标', () => {
        const w = mount(RootCauseCard, { props: { diagnosis: DIAGNOSIS } })
        expect(w.find('.root-cause-card__cause')!.text()).toBe('order-service 数据库连接池耗尽')
        expect(w.find('.root-cause-card__confidence')!.text()).toContain('87%')
        expect(w.text()).toContain('严重性 P1')
        expect(w.text()).toContain('高危')
        expect(w.text()).toContain('截断')
    })

    it('结论列表渲染', () => {
        const w = mount(RootCauseCard, { props: { diagnosis: DIAGNOSIS } })
        expect(w.find('.conclusion')!.text()).toContain('连接池配置偏小')
    })
})