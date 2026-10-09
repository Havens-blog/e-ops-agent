// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { AgentStat } from '@/api/opsagent'
import AgentCard from './AgentCard.vue'

const AGENT: AgentStat = { name: 'log_analyst', status: 'ok', tasksTotal: 42, tasksFailed: 3, avgDurationMs: 120 }

describe('AgentCard（任务 5.6 AC Agent 管理）', () => {
    it('渲染角色名 + 状态 + 三项指标', () => {
        const w = mount(AgentCard, { props: { agent: AGENT } })
        expect(w.find('.agent-card__name')!.text()).toBe('日志分析')
        expect(w.find('.agent-card__status')!.text()).toBe('正常')
        const metrics = w.findAll('.metric__value')
        expect(metrics[0]!.text()).toBe('42')
        expect(metrics[1]!.text()).toBe('3')
        expect(metrics[2]!.text()).toBe('120ms')
    })
})