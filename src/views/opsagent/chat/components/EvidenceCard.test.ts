// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Citation } from '@/api/opsagent'
import EvidenceCard from './EvidenceCard.vue'

const CITATIONS: Citation[] = [
    { sourceType: 'log', sourceKey: 'order-service', snippet: '错误率 5xx 上升' },
    { sourceType: 'metric', sourceKey: 'p99-latency', snippet: 'P99 延迟 2.3s' },
    { sourceType: 'asset', sourceKey: 'order-ecs-01', snippet: '主机实例' },
    { sourceType: 'alert', sourceKey: 'alert-cpu-01', snippet: 'CPU 告警' },
]

describe('EvidenceCard 证据卡（任务 5.2 AC#3）', () => {
    it('无引用时显示空态', () => {
        const w = mount(EvidenceCard, { props: { citations: [] } })
        expect(w.find('.evidence-card__empty')!.text()).toBe('无数据源引用')
        expect(w.findAll('.evidence-item')).toHaveLength(0)
    })

    it('按 source_type 渲染引用（徽标 label + sourceKey + snippet + agent）', () => {
        const w = mount(EvidenceCard, { props: { citations: CITATIONS } })
        const items = w.findAll('.evidence-item')
        expect(items).toHaveLength(4)
        // log 类型 → 「日志」徽标 + LogAnalyst
        const first = items[0]!
        expect(first.find('.evidence-item__badge')!.text()).toBe('日志')
        expect(first.find('.evidence-item__key')!.text()).toBe('order-service')
        expect(first.find('.evidence-item__snippet')!.text()).toBe('错误率 5xx 上升')
        expect(first.find('.evidence-item__agent')!.text()).toBe('LogAnalyst')
        // metric → 「指标」+ Monitor
        expect(items[1]!.find('.evidence-item__badge')!.text()).toBe('指标')
        expect(items[1]!.find('.evidence-item__agent')!.text()).toBe('Monitor')
    })

    it('未知 source_type 回退为原始文本徽标（不吞数据）', () => {
        const w = mount(EvidenceCard, {
            props: { citations: [{ sourceType: 'trace' as never, sourceKey: 'k', snippet: 's' }] },
        })
        expect(w.find('.evidence-item__badge')!.text()).toBe('trace')
    })
})