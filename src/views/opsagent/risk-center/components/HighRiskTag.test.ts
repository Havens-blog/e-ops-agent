// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Severity } from '@/api/opsagent'
import HighRiskTag from './HighRiskTag.vue'

describe('HighRiskTag 高危标记（任务 5.3 AC 高危仅展示）', () => {
    it('P0/P1 渲染「待人工确认」，P2/P3 不渲染', () => {
        for (const s of ['P0', 'P1'] as Severity[]) {
            const w = mount(HighRiskTag, { props: { severity: s } })
            expect(w.text()).toBe('待人工确认')
        }
        for (const s of ['P2', 'P3'] as Severity[]) {
            const w = mount(HighRiskTag, { props: { severity: s } })
            expect(w.find('.high-risk-tag').exists()).toBe(false)
        }
    })
})