// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { LLMBudgetStat } from '@/api/opsagent'
import BudgetGauge from './BudgetGauge.vue'

describe('BudgetGauge LLM 预算用量（任务 5.6 AC）', () => {
    it('渲染用量百分比 + calls/limit', () => {
        const budget: LLMBudgetStat = { windowStart: '', calls: 40, budgetLimit: 100, exceeded: false }
        const w = mount(BudgetGauge, { props: { budget } })
        expect(w.find('.budget-gauge__percent')!.text()).toBe('40%')
        expect(w.find('.budget-gauge__calls')!.text()).toContain('40 / 100')
        expect(w.find('.budget-gauge__fill')!.attributes('style')).toContain('width: 40%')
    })

    it('超预算时百分比标红', () => {
        const budget: LLMBudgetStat = { windowStart: '', calls: 120, budgetLimit: 100, exceeded: true }
        const w = mount(BudgetGauge, { props: { budget } })
        expect(w.find('.budget-gauge__percent')!.classes()).toContain('budget-gauge__percent--exceeded')
    })
})