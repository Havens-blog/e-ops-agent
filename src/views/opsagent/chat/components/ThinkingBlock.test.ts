// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { TraceStep } from '@/api/opsagent'
import ThinkingBlock from './ThinkingBlock.vue'

function mountBlock(trace: TraceStep[]) {
    return mount(ThinkingBlock, { props: { trace } })
}

describe('ThinkingBlock 编排进度（任务 5.2 AC#2）', () => {
    it('恒定渲染 4 阶段（意图识别→查询→诊断→报告），无 trace 时均「未执行」', () => {
        const w = mountBlock([])
        const steps = w.findAll('.thinking-step')
        expect(steps).toHaveLength(4)
        expect(steps[0]!.text()).toContain('意图识别')
        expect(steps[3]!.text()).toContain('报告')
        expect(steps.every((s) => s.text().includes('未执行'))).toBe(true)
        expect(w.findAll('.thinking-step--done')).toHaveLength(0)
    })

    it('trace 命中的阶段显示 summary 与耗时，并标 done', () => {
        const w = mountBlock([
            { step: 1, agent: 'coordinator', action: 'intent', durationMs: 12, summary: '识别为排障' },
            { step: 3, agent: 'inspector', action: 'report', durationMs: 9, summary: '生成报告' },
        ])
        const steps = w.findAll('.thinking-step')
        // 阶段 1（意图识别）命中 → done + summary + agent/耗时
        expect(steps[0]!.text()).toContain('识别为排障')
        expect(steps[0]!.text()).toContain('coordinator')
        expect(steps[0]!.text()).toContain('12ms')
        // 阶段 2/3 未命中 → 仍 pending
        expect(steps[1]!.text()).toContain('未执行')
        expect(steps[2]!.text()).toContain('未执行')
        // 阶段 4 命中
        expect(steps[3]!.text()).toContain('生成报告')
        expect(w.findAll('.thinking-step--done')).toHaveLength(2)
    })
})