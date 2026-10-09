/**
 * 诊断详情页纯展示逻辑（任务 5.4）。
 *
 * 无 Vue / DOM 运行时依赖，可被 node 环境单测直接导入。依据：
 * docs/features/haven-opsagent/design/api-handbook.md §6 +
 * page-map.md「诊断详情」Page Sections（根因/证据/调用链/处置）。
 *
 * 职责：处置预案风险档徽标、编排调用链 action/agent 中文标签、置信度格式化。
 */

import type { RiskLevel } from '@/api/opsagent'

// ==================== 处置预案风险档徽标 ====================

export interface RiskLevelMeta {
    label: string
    tone: 'info' | 'warning' | 'danger'
}

/** 处置预案 risk 档徽标（read/low/high） */
export const RISK_LEVEL_META: Record<RiskLevel, RiskLevelMeta> = {
    read: { label: '只读', tone: 'info' },
    low: { label: '低危', tone: 'warning' },
    high: { label: '高危', tone: 'danger' },
}

// ==================== 编排调用链标签 ====================

/** 调用链步骤 action → 中文 */
export const TRACE_ACTION_LABEL: Record<string, string> = {
    intent: '意图识别',
    query: '查询',
    diagnose: '诊断',
    report: '报告',
    notify: '通知',
}

/** 调用链 agent → 中文角色名（4 逻辑 Agent） */
export const AGENT_LABEL: Record<string, string> = {
    coordinator: '编排',
    log_analyst: '日志分析',
    monitor: '监控',
    inspector: '诊断',
}

/** 未知 action/agent 兜底：原样返回（容错，不吞数据） */
export function actionLabel(action: string): string {
    return TRACE_ACTION_LABEL[action] ?? action
}

export function agentLabel(agent: string): string {
    return AGENT_LABEL[agent] ?? agent
}

// ==================== 置信度 ====================

/** 置信度 0~1 → 百分比文案 */
export function formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`
}