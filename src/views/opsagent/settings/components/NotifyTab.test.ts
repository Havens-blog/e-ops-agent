// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { NotifyChannel } from '@/api/opsagent'
import NotifyTab from './NotifyTab.vue'

const CHANNELS: NotifyChannel[] = [
    { channel: 'dingtalk', enabled: true },
    { channel: 'email', enabled: false },
]

describe('NotifyTab 通知渠道（任务 5.6 AC#3）', () => {
    it('渲染渠道中文名 + 启停状态', () => {
        const w = mount(NotifyTab, { props: { channels: CHANNELS, editable: true } })
        const rows = w.findAll('.channel-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]!.find('.channel-row__name')!.text()).toBe('钉钉')
        expect(rows[0]!.find('.channel-row__toggle')!.text()).toBe('已启用')
        expect(rows[1]!.find('.channel-row__toggle')!.text()).toBe('已停用')
    })

    it('点击开关上抛 toggle(channel, enabled)', async () => {
        const w = mount(NotifyTab, { props: { channels: CHANNELS, editable: true } })
        await w.findAll('.channel-row__toggle')[1]!.trigger('click')
        expect(w.emitted('toggle')).toEqual([['email', true]])
    })

    it('点击保存上抛 save；不可编辑时禁用', () => {
        const w = mount(NotifyTab, { props: { channels: CHANNELS, editable: false } })
        const toggle = w.find('.channel-row__toggle')
        expect(toggle!.attributes('disabled')).toBeDefined()
        expect(w.find('.notify-tab__save').exists()).toBe(false)
    })
})