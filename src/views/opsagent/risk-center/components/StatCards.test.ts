// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { RiskStats } from '@/api/opsagent'
import StatCards from './StatCards.vue'

describe('StatCards 统计卡（任务 5.3 AC 统计卡）', () => {
    it('渲染三卡：待处理/今日新增/高危，取值来自 stats 聚合', () => {
        const stats: RiskStats = { pendingView: 7, todayNew: 3, highRisk: 2 }
        const w = mount(StatCards, { props: { stats } })
        const cards = w.findAll('.stat-card')
        expect(cards).toHaveLength(3)
        expect(cards[0]!.find('.stat-card__label')!.text()).toBe('待处理')
        expect(cards[0]!.find('.stat-card__value')!.text()).toBe('7')
        expect(cards[1]!.find('.stat-card__value')!.text()).toBe('3')
        expect(cards[2]!.find('.stat-card__label')!.text()).toBe('高危')
        expect(cards[2]!.find('.stat-card__value')!.text()).toBe('2')
    })
})