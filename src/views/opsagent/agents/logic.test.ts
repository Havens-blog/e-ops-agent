import { describe, expect, it } from 'vitest'
import { agentRoleLabel, AGENT_ROLE_LABEL, agentStatusMeta, budgetUsagePercent, budgetUsageRatio } from './logic'

describe('Agent 角色标签（任务 5.6 AC Agent 管理）', () => {
    it('4 逻辑 Agent 中文名 + 未知兜底', () => {
        expect(AGENT_ROLE_LABEL).toEqual({
            coordinator: '编排',
            log_analyst: '日志分析',
            monitor: '监控',
            inspector: '诊断',
        })
        expect(agentRoleLabel('coordinator')).toBe('编排')
        expect(agentRoleLabel('unknown')).toBe('unknown')
    })
})

describe('Agent 状态', () => {
    it('ok/busy/error/未知 四态', () => {
        expect(agentStatusMeta('ok')).toEqual({ label: '正常', tone: 'success' })
        expect(agentStatusMeta('busy')).toEqual({ label: '繁忙', tone: 'warning' })
        expect(agentStatusMeta('error')).toEqual({ label: '异常', tone: 'danger' })
        expect(agentStatusMeta('weird')).toEqual({ label: 'weird', tone: 'info' })
    })
})

describe('LLM 预算用量', () => {
    it('使用率 0~1 夹取；budgetLimit≤0 兜底 0', () => {
        expect(budgetUsageRatio(40, 100)).toBe(0.4)
        expect(budgetUsageRatio(150, 100)).toBe(1)
        expect(budgetUsageRatio(-1, 100)).toBe(0)
        expect(budgetUsageRatio(10, 0)).toBe(0)
    })

    it('百分比文案', () => {
        expect(budgetUsagePercent(40, 100)).toBe('40%')
        expect(budgetUsagePercent(150, 100)).toBe('100%')
    })
})