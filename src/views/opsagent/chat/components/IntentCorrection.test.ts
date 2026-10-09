// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { IntentCandidate } from '@/api/opsagent'
import IntentCorrection from './IntentCorrection.vue'

const CANDIDATES: IntentCandidate[] = [
    {
        type: 'diagnose',
        confidence: 0.82,
        params: { serviceName: 'order-service', timeframe: { startTime: '', endTime: '' } },
    },
    {
        type: 'resource',
        confidence: 0.15,
        params: { serviceName: 'order-ecs-01', timeframe: { startTime: '', endTime: '' } },
    },
]

function mountCorrection(over: { candidates?: IntentCandidate[]; busy?: boolean } = {}) {
    return mount(IntentCorrection, {
        props: { candidates: over.candidates ?? CANDIDATES, busy: over.busy ?? false },
    })
}

describe('IntentCorrection 澄清纠正（任务 5.2 AC#5）', () => {
    it('渲染候选意图按钮：类型 + 服务名 + 置信度百分比', () => {
        const w = mountCorrection()
        const btns = w.findAll('.candidate__btn')
        expect(btns).toHaveLength(2)
        expect(btns[0]!.text()).toContain('排障诊断')
        expect(btns[0]!.text()).toContain('order-service')
        expect(btns[0]!.text()).toContain('82%')
    })

    it('点击候选意图上抛 correct（targetIntent + 原 params，无需重提完整问句）', async () => {
        const w = mountCorrection()
        await w.findAll('.candidate__btn')[0]!.trigger('click')
        const emitted = w.emitted('correct')
        expect(emitted).toBeTruthy()
        expect(emitted![0]).toEqual(['diagnose', CANDIDATES[0]!.params])
    })

    it('自然语言纠正：输入 + 点击「纠正」上抛 correctMessage', async () => {
        const w = mountCorrection()
        await w.find('.intent-correction__input')!.setValue('不对，我要查资产')
        await w.find('.intent-correction__send')!.trigger('click')
        expect(w.emitted('correctMessage')).toEqual([['不对，我要查资产']])
    })

    it('busy 时禁用候选与纠正按钮', () => {
        const w = mountCorrection({ busy: true })
        expect(w.find('.candidate__btn')!.attributes('disabled')).toBeDefined()
        expect(w.find('.intent-correction__send')!.attributes('disabled')).toBeDefined()
    })
})