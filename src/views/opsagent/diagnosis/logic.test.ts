import { describe, expect, it } from 'vitest'
import { actionLabel, agentLabel, AGENT_LABEL, formatConfidence, RISK_LEVEL_META, TRACE_ACTION_LABEL } from './logic'

describe('处置预案风险档徽标（任务 5.4 AC 处置预案风险档）', () => {
    it('read/low/high 全量中文 + 色阶', () => {
        expect(RISK_LEVEL_META).toEqual({
            read: { label: '只读', tone: 'info' },
            low: { label: '低危', tone: 'warning' },
            high: { label: '高危', tone: 'danger' },
        })
    })
})

describe('编排调用链标签', () => {
    it('action 中文标签全覆盖 + 未知兜底原样', () => {
        expect(TRACE_ACTION_LABEL.diagnose).toBe('诊断')
        expect(TRACE_ACTION_LABEL.notify).toBe('通知')
        expect(actionLabel('query')).toBe('查询')
        expect(actionLabel('custom')).toBe('custom')
    })

    it('agent 中文标签全覆盖 + 未知兜底原样', () => {
        expect(AGENT_LABEL.log_analyst).toBe('日志分析')
        expect(agentLabel('coordinator')).toBe('编排')
        expect(agentLabel('unknown')).toBe('unknown')
    })
})

describe('置信度格式化', () => {
    it('0~1 → 百分比', () => {
        expect(formatConfidence(0.877)).toBe('88%')
        expect(formatConfidence(0)).toBe('0%')
    })
})