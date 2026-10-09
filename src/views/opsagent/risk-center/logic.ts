/**
 * 风险中心页纯展示逻辑（任务 5.3）。
 *
 * 无 Vue / DOM 运行时依赖，可被 node 环境单测直接导入（同 cert 领域
 * format.ts 约定）。依据：docs/features/haven-opsagent/design/api-handbook.md
 * §3/§4/§5 + page-map.md「风险中心」Page Sections。
 *
 * 职责：severity/状态徽标、高危判定（severity P0|P1）、可标记动作、批量结果归并。
 */

import type { BatchStatusResult, RiskEntryStatus, Severity } from '@/api/opsagent'

export type RiskBadgeTone = 'danger' | 'warning' | 'info' | 'success'

// ==================== severity 徽标 ====================

/** severity 徽标（P0/P1/P2/P3 + 色阶） */
export const SEVERITY_META: Record<Severity, { label: string; tone: RiskBadgeTone }> = {
    P0: { label: 'P0 紧急', tone: 'danger' },
    P1: { label: 'P1 高危', tone: 'warning' },
    P2: { label: 'P2 中危', tone: 'info' },
    P3: { label: 'P3 低危', tone: 'success' },
}

// ==================== 状态徽标 ====================

/** 风险条目状态用户侧文案 */
export const RISK_STATUS_LABEL: Record<RiskEntryStatus, string> = {
    pending_view: '待查看',
    viewed: '已查看',
    done: '已处理',
}

// ==================== 高危判定（severity P0|P1）====================

/**
 * 高危判定：severity ∈ {P0, P1}（tech-design RiskStats.highRisk 同口径）。
 * 高危条目录「待人工确认」标记，不渲染确认/执行控件（P1 无执行后端）。
 */
export function isHighRisk(severity: Severity): boolean {
    return severity === 'P0' || severity === 'P1'
}

// ==================== 可标记动作 ====================

export interface MarkAction {
    status: Exclude<RiskEntryStatus, 'pending_view'>
    label: string
}

/**
 * 条目可用的状态标记动作：done 无；viewed 仅可标记 done；
 * pending_view 可标记 viewed/done（待查看→已查看通常经详情页自动流转，不主动调）。
 */
export function markableActions(status: RiskEntryStatus): MarkAction[] {
    if (status === 'done') return []
    if (status === 'viewed') return [{ status: 'done', label: '标记已处理' }]
    return [
        { status: 'viewed', label: '标记已查看' },
        { status: 'done', label: '标记已处理' },
    ]
}

// ==================== 时间展示 ====================

/** RFC3339 时间格式化（跨页共享，见 ../format） */
export { formatTime } from '../format'

// ==================== 批量结果归并 ====================

export interface BatchOutcome {
    /** 成功条数 */
    success: number
    /** CAS 冲突条数（reasonCode=conflict） */
    conflict: number
    /** 不存在/跨租户条数（reasonCode=not_found） */
    notFound: number
    /** 失败条目 ID（供逐条重试） */
    failedIds: string[]
}

/** 批量标记结果归并（逐条 CAS，冲突不静默覆盖） */
export function batchOutcome(result: BatchStatusResult): BatchOutcome {
    const conflict = result.failed.filter((f) => f.reasonCode === 'conflict').length
    const notFound = result.failed.filter((f) => f.reasonCode === 'not_found').length
    return {
        success: result.succeeded.length,
        conflict,
        notFound,
        failedIds: result.failed.map((f) => f.id),
    }
}