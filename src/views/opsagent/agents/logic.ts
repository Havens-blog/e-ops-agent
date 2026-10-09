/**
 * Agent 管理页纯展示逻辑（任务 5.6）。
 *
 * 无 Vue / DOM 运行时依赖，可被 node 环境单测直接导入。依据：
 * docs/features/haven-opsagent/design/api-handbook.md §10 + page-map.md「Agent 管理」。
 */

// ==================== Agent 角色标签 ====================

/** 4 逻辑 Agent 角色中文名（coordinator/log_analyst/monitor/inspector） */
export const AGENT_ROLE_LABEL: Record<string, string> = {
    coordinator: '编排',
    log_analyst: '日志分析',
    monitor: '监控',
    inspector: '诊断',
}

export function agentRoleLabel(name: string): string {
    return AGENT_ROLE_LABEL[name] ?? name
}

// ==================== Agent 状态 ====================

export type AgentTone = 'success' | 'warning' | 'danger' | 'info'

export interface AgentStatusMeta {
    label: string
    tone: AgentTone
}

/** agent.status → 中文 + 色阶（ok/正常，其余原样兜底） */
export function agentStatusMeta(status: string): AgentStatusMeta {
    if (status === 'ok') return { label: '正常', tone: 'success' }
    if (status === 'busy') return { label: '繁忙', tone: 'warning' }
    if (status === 'error' || status === 'failed') return { label: '异常', tone: 'danger' }
    return { label: status, tone: 'info' }
}

// ==================== LLM 预算用量 ====================

/** 预算使用率 0~1（budgetLimit=0 时兜底 0，避免除零） */
export function budgetUsageRatio(calls: number, budgetLimit: number): number {
    if (budgetLimit <= 0) return 0
    const r = calls / budgetLimit
    return r < 0 ? 0 : r > 1 ? 1 : r
}

/** 预算使用率 → 百分比文案 */
export function budgetUsagePercent(calls: number, budgetLimit: number): string {
    return `${Math.round(budgetUsageRatio(calls, budgetLimit) * 100)}%`
}