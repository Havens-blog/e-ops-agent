import { describe, expect, it } from 'vitest'
import { batchOutcome, formatTime, isHighRisk, markableActions, RISK_STATUS_LABEL, SEVERITY_META } from './logic'

describe('severity 徽标（任务 5.3）', () => {
    it('P0-P3 全量中文徽标 + 色阶', () => {
        expect(SEVERITY_META.P0).toEqual({ label: 'P0 紧急', tone: 'danger' })
        expect(SEVERITY_META.P1).toEqual({ label: 'P1 高危', tone: 'warning' })
        expect(SEVERITY_META.P2).toEqual({ label: 'P2 中危', tone: 'info' })
        expect(SEVERITY_META.P3).toEqual({ label: 'P3 低危', tone: 'success' })
    })
})

describe('状态徽标', () => {
    it('pending_view/viewed/done 中文文案', () => {
        expect(RISK_STATUS_LABEL).toEqual({
            pending_view: '待查看',
            viewed: '已查看',
            done: '已处理',
        })
    })
})

describe('高危判定（severity P0|P1，同 RiskStats.highRisk 口径）', () => {
    it('P0/P1 为高危，P2/P3 非高危', () => {
        expect(isHighRisk('P0')).toBe(true)
        expect(isHighRisk('P1')).toBe(true)
        expect(isHighRisk('P2')).toBe(false)
        expect(isHighRisk('P3')).toBe(false)
    })
})

describe('可标记动作（任务 5.3 AC 单条标记）', () => {
    it('pending_view 可标记已查看/已处理；viewed 仅可标记已处理；done 无动作', () => {
        expect(markableActions('pending_view')).toEqual([
            { status: 'viewed', label: '标记已查看' },
            { status: 'done', label: '标记已处理' },
        ])
        expect(markableActions('viewed')).toEqual([{ status: 'done', label: '标记已处理' }])
        expect(markableActions('done')).toEqual([])
    })
})

describe('批量结果归并（任务 5.3 AC 批量冲突回显）', () => {
    it('按 reasonCode 归并成功/冲突/不存在，并导出失败 ID', () => {
        const outcome = batchOutcome({
            succeeded: [{ id: 'a', version: 3 }, { id: 'b', version: 2 }],
            failed: [
                { id: 'c', reason: '冲突', reasonCode: 'conflict', currentVersion: 5 },
                { id: 'd', reason: '不存在', reasonCode: 'not_found' },
                { id: 'e', reason: '冲突', reasonCode: 'conflict', currentVersion: 3 },
            ],
        })
        expect(outcome).toEqual({
            success: 2,
            conflict: 2,
            notFound: 1,
            failedIds: ['c', 'd', 'e'],
        })
    })
})

describe('时间展示', () => {
    it('RFC3339 截断为 YYYY-MM-DD HH:mm；空值回退占位', () => {
        expect(formatTime('2026-10-08T15:04:05+08:00')).toBe('2026-10-08 15:04')
        expect(formatTime('')).toBe('—')
    })
})