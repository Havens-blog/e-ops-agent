// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/api/opsagent'
import SessionList from './SessionList.vue'

const SESSIONS: SessionSummary[] = [
    { id: 's1', type: 'chat', query: 'order-service 错误率上升', serviceName: 'order-service', status: 'done', diagnosisId: 'd1', createdAt: '2026-10-08T10:00:00Z' },
    { id: 's2', type: 'alert', query: 'CPU 告警', serviceName: 'gateway', status: 'running', createdAt: '2026-10-08T11:00:00Z' },
]

describe('SessionList 会话列表（任务 5.5 AC 摘要）', () => {
    it('空列表显示空态', () => {
        const w = mount(SessionList, { props: { sessions: [] } })
        expect(w.find('.session-list__empty')!.text()).toBe('暂无会话记录')
    })

    it('渲染摘要：类型/服务名/状态/提问/时间', () => {
        const w = mount(SessionList, { props: { sessions: SESSIONS } })
        const items = w.findAll('.session-item')
        expect(items).toHaveLength(2)
        expect(items[0]!.find('.session-item__type')!.text()).toBe('对话')
        expect(items[0]!.find('.session-item__service')!.text()).toBe('order-service')
        expect(items[0]!.find('.session-item__status')!.text()).toBe('已完成')
        expect(items[0]!.find('.session-item__query')!.text()).toBe('order-service 错误率上升')
        expect(items[1]!.find('.session-item__status')!.text()).toBe('运行中')
    })

    it('点击会话上抛 select，且标注 active', async () => {
        const w = mount(SessionList, { props: { sessions: SESSIONS, selectedId: 's2' } })
        expect(w.findAll('.session-item')[1]!.classes()).toContain('session-item--active')
        await w.findAll('.session-item')[0]!.trigger('click')
        expect(w.emitted('select')).toBeTruthy()
        expect(w.emitted('select')![0]![0]).toEqual(SESSIONS[0])
    })
})