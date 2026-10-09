// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DispositionStep } from '@/api/opsagent'
import DispositionList from './DispositionList.vue'

const DISPOSITION: DispositionStep[] = [
    { step: '扩容连接池', risk: 'low', action: '调整 maxPoolSize', executed: false },
    { step: '回滚最近变更', risk: 'high', action: '回滚 commit abc123', executed: false },
]

describe('DispositionList 处置预案（任务 5.4 AC#4，只读）', () => {
    it('空预案显示空态', () => {
        const w = mount(DispositionList, { props: { disposition: [] } })
        expect(w.find('.disposition-list__empty')!.text()).toBe('无处置预案')
    })

    it('逐条渲染 step + action 只读 + 风险档徽标（read/low/high）', () => {
        const w = mount(DispositionList, { props: { disposition: DISPOSITION } })
        const steps = w.findAll('.disposition-step')
        expect(steps).toHaveLength(2)
        expect(steps[0]!.text()).toContain('扩容连接池')
        expect(steps[0]!.text()).toContain('低危')
        expect(steps[1]!.text()).toContain('回滚最近变更')
        expect(steps[1]!.text()).toContain('高危')
        // 只读：不渲染任何执行按钮（Hard Rule）
        expect(w.findAll('button')).toHaveLength(0)
    })
})