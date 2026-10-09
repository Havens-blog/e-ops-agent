// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { RiskEntryStatus } from '@/api/opsagent'
import StatusMark from './StatusMark.vue'

function mountMark(status: RiskEntryStatus) {
    return mount(StatusMark, { props: { status, busy: false } })
}

describe('StatusMark 状态标记（任务 5.3 AC 单条标记）', () => {
    it('pending_view 渲染「已查看/已处理」两个动作，点击上抛 mark', async () => {
        const w = mountMark('pending_view')
        const btns = w.findAll('button')
        expect(btns).toHaveLength(2)
        expect(btns[0]!.text()).toContain('标记已查看')
        await btns[1]!.trigger('click')
        expect(w.emitted('mark')).toEqual([['done']])
    })

    it('viewed 仅渲染「标记已处理」', () => {
        const w = mountMark('viewed')
        const btns = w.findAll('button')
        expect(btns).toHaveLength(1)
        expect(btns[0]!.text()).toContain('标记已处理')
    })

    it('done 无动作（不渲染按钮）', () => {
        const w = mountMark('done')
        expect(w.findAll('button')).toHaveLength(0)
    })
})