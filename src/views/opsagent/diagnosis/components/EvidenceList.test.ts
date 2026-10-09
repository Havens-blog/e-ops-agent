// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Citation } from '@/api/opsagent'
import EvidenceList from './EvidenceList.vue'

describe('EvidenceList 证据清单（任务 5.4 AC#2）', () => {
    it('空引用显示空态', () => {
        const w = mount(EvidenceList, { props: { citations: [] } })
        expect(w.find('.evidence-list__empty')!.text()).toBe('无数据源引用')
    })

    it('按 source_type 渲染引用：徽标 label + sourceKey + snippet', () => {
        const citations: Citation[] = [
            { sourceType: 'metric', sourceKey: 'metric-p99', snippet: 'P99 延迟 2.3s' },
            { sourceType: 'log', sourceKey: 'order-service', snippet: '5xx 错误率上升' },
        ]
        const w = mount(EvidenceList, { props: { citations } })
        const items = w.findAll('.evidence-item')
        expect(items).toHaveLength(2)
        expect(items[0]!.find('.evidence-item__badge')!.text()).toBe('指标')
        expect(items[0]!.find('.evidence-item__key')!.text()).toBe('metric-p99')
        expect(items[1]!.find('.evidence-item__badge')!.text()).toBe('日志')
    })
})