// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { TraceStep } from '@/api/opsagent'
import TraceView from './TraceView.vue'

describe('TraceView 编排调用链（任务 5.4 AC#3）', () => {
    it('空 trace 显示空态', () => {
        const w = mount(TraceView, { props: { trace: [] } })
        expect(w.find('.trace-view__empty')!.text()).toBe('无调用链记录')
    })

    it('逐步骤展示 agent/action/source/耗时，降级级别徽标', () => {
        const trace: TraceStep[] = [
            { step: 1, agent: 'coordinator', action: 'intent', durationMs: 5, summary: '识别意图' },
            { step: 2, agent: 'log_analyst', action: 'query', source: 'logquery', durationMs: 120, summary: '查询日志', degradeLevel: 2 },
        ]
        const w = mount(TraceView, { props: { trace } })
        const steps = w.findAll('.trace-step')
        expect(steps).toHaveLength(2)
        expect(steps[0]!.text()).toContain('编排')
        expect(steps[0]!.text()).toContain('意图识别')
        expect(steps[0]!.text()).toContain('5ms')
        expect(steps[1]!.text()).toContain('日志分析')
        expect(steps[1]!.text()).toContain('logquery')
        expect(steps[1]!.text()).toContain('120ms')
        expect(steps[1]!.text()).toContain('L2')
    })
})