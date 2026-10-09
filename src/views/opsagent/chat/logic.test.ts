import { describe, expect, it } from 'vitest'
import type { ChatData, TraceStep } from '@/api/opsagent'
import {
    buildThinkingStages,
    chatTypeLabel,
    degradeBadge,
    hasDiagnosisReport,
    resolveCitation,
    SOURCE_TYPE_META,
    sourceTypeMeta,
} from './logic'

function chat(over: Partial<ChatData>): ChatData {
    return {
        sessionId: 's1',
        diagnosis: null,
        report: '',
        type: 'report',
        needsClarify: false,
        candidates: [],
        degradeLevel: 0,
        presets: [],
        ...over,
    }
}

describe('chat 响应 type 判别（任务 5.2 AC#4）', () => {
    it('各 type 用户侧徽标文案', () => {
        expect(chatTypeLabel('report')).toBe('诊断报告')
        expect(chatTypeLabel('preset_entries')).toBe('预置查询')
        expect(chatTypeLabel('guided')).toBe('超能力引导')
        expect(chatTypeLabel('clarify')).toBe('待澄清')
        expect(chatTypeLabel('degraded_notice')).toBe('降级模式')
    })

    it('仅 type=report 且 diagnosis 非空视为携带报告正文', () => {
        expect(hasDiagnosisReport(chat({ type: 'report', diagnosis: { report: true } as never }))).toBe(true)
        expect(hasDiagnosisReport(chat({ type: 'clarify', needsClarify: true }))).toBe(false)
        expect(hasDiagnosisReport(chat({ type: 'preset_entries', degradeLevel: 2 }))).toBe(false)
        expect(hasDiagnosisReport(chat({ type: 'report', diagnosis: null }))).toBe(false)
    })
})

describe('降级徽标（api-handbook degradeLevel）', () => {
    it('0=正常无徽标；1/2/3 对应模板/预置入口/明示降级', () => {
        expect(degradeBadge(0)).toBeNull()
        expect(degradeBadge(1)).toEqual({ text: '模板降级', tone: 'warning' })
        expect(degradeBadge(2)).toEqual({ text: '预置查询入口', tone: 'warning' })
        expect(degradeBadge(3)).toEqual({ text: '降级模式', tone: 'danger' })
    })
})

describe('证据 source_type → agent 角色着色（任务 5.2 AC#3）', () => {
    it('四类 source_type 均有 label+agent+颜色变量', () => {
        expect(Object.keys(SOURCE_TYPE_META).sort()).toEqual(['alert', 'asset', 'log', 'metric'])
        for (const m of Object.values(SOURCE_TYPE_META)) {
            expect(m.label).toBeTruthy()
            expect(m.agent).toBeTruthy()
            expect(m.colorVar).toMatch(/^var\(--agent-/)
        }
    })

    it('未知 source_type 走兜底元数据（不吞数据）', () => {
        const m = sourceTypeMeta('unknown')
        expect(m.label).toBe('unknown')
        expect(m.colorVar).toBe('var(--agent-coord)')
    })
})

describe('4 步编排进度派生（意图识别→查询→诊断→报告）', () => {
    it('空 trace 派生 4 阶段且均未执行', () => {
        const stages = buildThinkingStages([])
        expect(stages.map((s) => s.key)).toEqual(['intent', 'query', 'diagnose', 'report'])
        expect(stages.every((s) => !s.step)).toBe(true)
    })

    it('trace 步骤按 action 映射到阶段（首个命中优先）', () => {
        const trace: TraceStep[] = [
            { step: 1, agent: 'coordinator', action: 'intent', durationMs: 10, summary: '识别为排障' },
            { step: 2, agent: 'log_analyst', action: 'query', durationMs: 20, summary: '查询日志' },
            { step: 4, agent: 'inspector', action: 'report', durationMs: 15, summary: '生成报告' },
            { step: 3, agent: 'inspector', action: 'report', durationMs: 5, summary: '重复报告步骤' },
        ]
        const stages = buildThinkingStages(trace)
        expect(stages.find((s) => s.key === 'intent')?.step?.summary).toBe('识别为排障')
        expect(stages.find((s) => s.key === 'query')?.step?.summary).toBe('查询日志')
        expect(stages.find((s) => s.key === 'diagnose')?.step).toBeUndefined()
        // report 阶段取首个命中（step=4 在 step=3 前）
        expect(stages.find((s) => s.key === 'report')?.step?.step).toBe(4)
    })
})

describe('引用回指解析', () => {
    it('sourceKey 命中返回引用条目，未命中返回 undefined', () => {
        const citations = [{ sourceKey: 'log-0' }, { sourceKey: 'metric-1' }]
        expect(resolveCitation('metric-1', citations)?.sourceKey).toBe('metric-1')
        expect(resolveCitation('nope', citations)).toBeUndefined()
    })
})